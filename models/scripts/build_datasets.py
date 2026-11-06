"""Build persona training sets from the masked Stellungnahmen (never from raw PDFs).

Inputs (read-only, data track):  data/derived/stellungnahmen_segments.jsonl, stellungnahmen.jsonl
Outputs (models/data/):
  sft/<role>.<split>.jsonl          chat rows {messages:[system,user,assistant], meta}
  sft/all.<split>.jsonl             all institutions together (Azure single-model variant)
  classifier/paragraphs.jsonl       {text (institution names masked), role, split, ...}
  backtest/sft.bt_train.jsonl       everything dated before the SV-OG draft (2018-09-14)
  backtest/sft.bt_eval.jsonl        the statements on the SV-OG draft itself (XXVI 75/ME)
  stats.json                        rows per role and split, guard counts
Splits: train = date < time_cutoff, heldout = date >= time_cutoff (configs/institutions.yaml).

CON-1/CON-2: every user and assistant text passes pii_guard (sentence masking with the data track's
rules), is re-verified, rows that still hit are dropped, and a final verify over everything that is
written aborts the run (exit != 0, nothing written) if any person-name pattern survives.

Run:  uv run python -I scripts/build_datasets.py
"""
from __future__ import annotations

import collections
import hashlib
import json
import re
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pii_guard  # noqa: E402
from institutions import CFG, INST, mask_institutions, role_of  # noqa: E402

MODELS = Path(__file__).resolve().parents[1]
REPO = MODELS.parent
DERIVED = REPO / "data" / "derived"
OUT = MODELS / "data"

BOILER = re.compile(
    r"(bedank\w* sich|dank\w* für die (Übermittlung|Möglichkeit|Gelegenheit)|Übermittlung des Entwurf|"
    r"(elektronisch|per E-Mail|in elektronischer Form) (an|übermittelt)|Präsidium des Nationalrat|"
    r"begutachtung@|zur Kenntnis (genommen|gebracht)|keine (weiteren )?(Bemerkungen|Einwände|Anmerkungen)|"
    r"wie folgt Stellung|nimmt .{0,60}wie folgt|Gelegenheit zur Stellungnahme|"
    r"beehrt sich|Mit freundlichen|Hochachtungsvoll|GZ\s|Geschäftszahl|Sachbearbeit)", re.I)
# pdftotext word-order scramble (rare): capitalised function words mid-sentence, l/I confusions
GARBLE_ART = re.compile(r"[a-zäöüß] (Die|Der|Das|Es|Wir|Mit|Im|Zu|Dem|Den|Des|Eine|Ein|Zur|Zum|Bei|Für|Nach) [a-zäöüßA-ZÄÖÜ]")
GARBLE_CHR = re.compile(r"[a-zäöü]I[a-zäöü]{2}|\bl[A-ZÄÖÜ]|\bln[a-z]")
POSITION = re.compile(
    r"(\bfordert\b|\bgefordert\b|\bfordern\b|\bablehn\w*|\blehnt\b|\babgelehnt\b|\bbegrüß\w*|\bunterstütz\w*|"
    r"\bersucht\b|\bersuchen\b|\bangeregt\b|\bregt\b.{0,40}\ban\b|\bspricht sich\b|\bsprechen uns\b|"
    r"\bkritisch\b|\bbedenklich\b|\bBedenken\b|\bnicht nachvollziehbar\b|\bunverzichtbar\b|\bsollte\b|\bsollten\b|"
    r"\bmuss\b|\bmüssen\b|\bist (daher )?(zu )?streichen\b|\bwird (daher )?vorgeschlagen\b|\bschlagen\b.{0,30}\bvor\b|"
    r"\bnicht akzeptabel\b|\bentschieden\b|\bunzulässig\b|\bverfassungswidrig\b|\bMehrkosten\b|\bKostenersatz\b|"
    r"\bBedeckung\b|\bKonsultationsmechanismus\b|\bkeinesfalls\b|\bjedenfalls\b|\bdringend\b)", re.I)
LETTERS = re.compile(r"[A-Za-zÄÖÜäöüß]")


def read_jsonl(p: Path):
    with open(p) as f:
        for line in f:
            if line.strip():
                yield json.loads(line)


def usable(t: str) -> bool:
    if not (200 <= len(t) <= 4000):
        return False
    if len(LETTERS.findall(t)) / len(t) < 0.6:
        return False
    if pii_guard.masked_fraction(t) > 0.25:
        return False
    if len(GARBLE_ART.findall(t)) >= 2 or len(GARBLE_CHR.findall(t)) >= 2:
        return False
    return True


def merge_continuations(segs: list[dict]) -> list[dict]:
    """Rejoin paragraphs split at page breaks: next starts lowercase and previous lacks end punctuation."""
    out = []
    for s in segs:
        t = s["text"].strip()
        if out and t[:1].islower() and not out[-1]["text"].rstrip().endswith((".", "!", "?", ":", ";")):
            prev = out[-1]
            out[-1] = {**prev, "text": prev["text"].rstrip() + " " + t,
                       "provisions": list(prev.get("provisions") or []) + list(s.get("provisions") or [])}
            continue
        out.append(dict(s))
    return out


def trim(t: str, n: int = 2500) -> str:
    if len(t) <= n:
        return t
    cut = t[:n]
    k = max(cut.rfind(". "), cut.rfind(".\n"))
    return cut[: k + 1] if k > n // 2 else cut


def user_prompt(st: dict, seg: dict, heading: str | None) -> str:
    lines = [f"Ministerialentwurf: {st['me_title']} ({st['me_citation']}, {st['gp']}. GP)",
             f"Begutachtungsverfahren, Datum Ihrer Stellungnahme: {st['date']}"]
    if seg.get("provisions"):
        lines.append("Betroffene Bestimmungen: " + ", ".join(dict.fromkeys(seg["provisions"]))[:300])
    if heading:
        lines.append(f"Abschnitt: {heading}")
    lines.append("Formulieren Sie die Position und die Forderung Ihrer Institution zu diesem Punkt.")
    return "\n".join(lines)


def split_of(date: str) -> str:
    return "train" if date < CFG["splits"]["time_cutoff"] else "heldout"


def main():
    statements = {r["id"]: r for r in read_jsonl(DERIVED / "stellungnahmen.jsonl")}
    by_st = collections.defaultdict(list)
    for s in read_jsonl(DERIVED / "stellungnahmen_segments.jsonl"):
        by_st[s["stellungnahme_id"]].append(s)
    bt_gp, bt_me = CFG["splits"]["backtest_me"]
    bt_cut = CFG["splits"]["backtest_cutoff"]

    sft, cls = [], []
    seen_sft, cls_hash_roles = set(), collections.defaultdict(set)
    skipped = collections.Counter()
    for sid, segs in by_st.items():
        st = statements.get(sid)
        if not st:
            skipped["no_statement_row"] += 1
            continue
        role = role_of(st)
        if not role:
            skipped["unmapped_institution"] += 1
            continue
        if st.get("needs_ocr"):
            skipped["needs_ocr"] += 1
            continue
        segs = merge_continuations(sorted(segs, key=lambda s: s["seg"]))
        cands = []
        heading = None
        for s in segs:
            t = s["text"].strip()
            if len(t) < 120 and (s.get("references_provision") or t.lower().startswith(("zu ", "ad ", "zum ", "zur "))):
                heading = t
                continue
            if not usable(t) or BOILER.search(t[:300]):
                continue
            score = len(POSITION.findall(t))
            cands.append((score, s, heading, t))
        base = {"stellungnahme_id": sid, "role": role, "institution_id": st["institution_id"], "date": st["date"],
                "gp": st["gp"], "me_inr": st["me_inr"], "me_citation": st["me_citation"], "url": st["url"],
                "split": split_of(st["date"]),
                "bt": "bt_eval" if (st["gp"], st["me_inr"]) == (bt_gp, bt_me) else ("bt_train" if st["date"] < bt_cut else None)}
        # classifier: every usable paragraph (cap 8 per statement so long letters do not dominate)
        for score, s, heading, t in sorted(cands, key=lambda x: -x[0])[:8]:
            ct = mask_institutions(trim(t, 1500))
            h = hashlib.sha1(re.sub(r"\W+", "", ct.lower()).encode()).hexdigest()
            cls_hash_roles[h].add(role)
            cls.append({**base, "seg": s["seg"], "text": ct, "position_markers": score, "_h": h})
        # SFT: paragraphs that carry a position, top 4 per statement
        for score, s, heading, t in sorted([c for c in cands if c[0] >= 1], key=lambda x: -x[0])[:4]:
            h = hashlib.sha1((role + re.sub(r"\W+", "", t.lower())).encode()).hexdigest()
            if h in seen_sft:
                skipped["sft_duplicate"] += 1
                continue
            seen_sft.add(h)
            sft.append({**base, "seg": s["seg"], "user": user_prompt(st, s, heading), "assistant": trim(t),
                        "position_markers": score})

    # same paragraph text under two roles (joint statements, copy-paste between Länder etc.) -> ambiguous label
    n0 = len(cls)
    seen = set()
    cls2 = []
    for r in cls:
        if len(cls_hash_roles[r["_h"]]) > 1 or r["_h"] in seen:
            continue
        seen.add(r["_h"])
        cls2.append(r)
    skipped["cls_dup_or_ambiguous"] = n0 - len(cls2)
    cls = cls2

    # ---------------- CON-1/CON-2 guard, fail closed
    print(f"guard: masking {len(sft)} SFT rows and {len(cls)} classifier rows", flush=True)
    guard = collections.Counter()
    for rows, fields in ((sft, ("user", "assistant")), (cls, ("text",))):
        for f in fields:
            masked, n = pii_guard.mask_many([r[f] for r in rows])
            guard[f"masked_sentences_{f}"] += n
            for r, m in zip(rows, masked):
                r[f] = m
    keep_sft, keep_cls = [], []
    for rows, fields, keep in ((sft, ("user", "assistant"), keep_sft), (cls, ("text",), keep_cls)):
        bad_idx = set()
        for f in fields:
            bad_idx |= {i for i, _, _ in pii_guard.verify([r[f] for r in rows])}
        for i, r in enumerate(rows):
            if i in bad_idx:
                guard["rows_dropped_after_verify"] += 1
            elif all(usable(r[f]) or f == "user" for f in fields):
                keep.append(r)
            else:
                guard["rows_dropped_too_masked"] += 1
    sft, cls = keep_sft, keep_cls
    pii_guard.fail_closed([r["user"] for r in sft] + [r["assistant"] for r in sft] + [r["text"] for r in cls],
                          "final training rows")
    print("guard: clean", dict(guard), flush=True)

    # ---------------- write
    tmp = OUT.with_name("data.tmp")
    if tmp.exists():
        shutil.rmtree(tmp)
    for d in ("sft", "classifier", "backtest"):
        (tmp / d).mkdir(parents=True)

    def chat(r):
        meta = {k: r[k] for k in ("stellungnahme_id", "role", "institution_id", "date", "gp", "me_inr", "me_citation",
                                  "url", "seg", "split", "bt", "position_markers")}
        return {"messages": [{"role": "system", "content": INST[r["role"]]["role_card"].strip()},
                             {"role": "user", "content": r["user"]},
                             {"role": "assistant", "content": r["assistant"]}], "meta": meta}

    files = collections.defaultdict(list)
    for r in sft:
        files[f"sft/{r['role']}.{r['split']}.jsonl"].append(chat(r))
        files[f"sft/all.{r['split']}.jsonl"].append(chat(r))
        if r["bt"]:
            files[f"backtest/sft.{r['bt']}.jsonl"].append(chat(r))
    for r in cls:
        r.pop("_h", None)
        files["classifier/paragraphs.jsonl"].append(r)
    for name, rows in files.items():
        with open(tmp / name, "w") as f:
            for r in rows:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")

    stats = {"source_statements": len(statements), "skipped": dict(skipped), "guard": dict(guard),
             "time_cutoff": CFG["splits"]["time_cutoff"], "backtest_cutoff": bt_cut, "per_role": {}}
    th = CFG["thresholds"]
    for role in INST:
        s_tr = [r for r in sft if r["role"] == role and r["split"] == "train"]
        stats["per_role"][role] = {
            "sft_train": len(s_tr),
            "sft_heldout": sum(1 for r in sft if r["role"] == role and r["split"] == "heldout"),
            "sft_bt_train": sum(1 for r in sft if r["role"] == role and r["bt"] == "bt_train"),
            "sft_bt_eval": sum(1 for r in sft if r["role"] == role and r["bt"] == "bt_eval"),
            "statements_train": len({r["stellungnahme_id"] for r in s_tr}),
            "cls_train": sum(1 for r in cls if r["role"] == role and r["split"] == "train"),
            "cls_heldout": sum(1 for r in cls if r["role"] == role and r["split"] == "heldout"),
        }
        p = stats["per_role"][role]
        p["adapter_eligible"] = (p["sft_train"] >= th["adapter_min_train"] and p["statements_train"] >= th["adapter_min_statements"]
                                 and p["sft_heldout"] >= th.get("adapter_min_heldout", 1))
    (tmp / "stats.json").write_text(json.dumps(stats, indent=1, ensure_ascii=False))
    # replace only what this script owns; data/dpo and data/azure (other scripts) are kept
    OUT.mkdir(exist_ok=True)
    for d in ("sft", "classifier", "backtest"):
        if (OUT / d).exists():
            shutil.rmtree(OUT / d)
        (tmp / d).rename(OUT / d)
    (tmp / "stats.json").replace(OUT / "stats.json")
    shutil.rmtree(tmp)
    print(json.dumps(stats["per_role"], indent=1))


if __name__ == "__main__":
    main()
