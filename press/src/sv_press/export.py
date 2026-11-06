"""Step 4: guard the rewrites and export DB sources/segments, stance rows and persona SFT rows.

Every stance text passes the person guard again (fail closed): a rewrite that triggers any name rule,
NER PER, quote, office noun or em dash, or that contains a name masked in its own source passage, is
dropped, never repaired. A final verify over everything aborts before writing if anything survives.

Outputs (press/derived/, gitignored except the summary and COUNTS.md):
  press_sources.jsonl    @sv/contracts Source rows, kind "press", personFiltered true
  press_segments.jsonl   one Segment per source: the institution-voice paraphrase
  press_stances.jsonl    {institution, date, topic, stance_text_de, stance, source_ref}
  persona_press_sft.jsonl, sft/<role>.{train,heldout}.jsonl, sft/backtest.bt_train.jsonl
                         chat rows in the models/ format {messages:[system,user,assistant], meta}
  press_masking_summary.json, COUNTS.md
"""
from __future__ import annotations

import collections
import json
from pathlib import Path

from . import guard
from .institutions import BY_KEY, INSTITUTIONS, TOPIC_LABEL

LICENCE = ("DVSV-Pressespiegel (SV-Box, vom Veranstalter als frei verwendbar freigegeben); "
           "institutionelle Paraphrase, personengefiltert, kein Zitat")
CORPUS_REVISION = "press-v1"
TIME_CUTOFF = "2023-01-01"        # models/configs/institutions.yaml splits.time_cutoff
BACKTEST_CUTOFF = "2018-09-14"    # SV-OG draft; backtest trains strictly before

FALLBACK_CARDS = {
    "industry_pharma": ("Sie vertreten die Pharmaindustrie und die Industrie. Sie fordern Versorgungssicherheit, "
                        "faire Preise und Erstattung für Arzneimittel, einen starken Produktionsstandort und "
                        "lehnen einseitige Preissenkungen und neue Abgaben ab."),
    "elective_physicians": ("Sie vertreten die Wahlärztinnen und Wahlärzte. Sie verteidigen die freie Arztwahl und "
                            "die Kostenerstattung und lehnen Verpflichtungen zur Kassenanbindung ab."),
}


def role_cards(repo: Path) -> dict[str, str]:
    """Reuse the persona track's system prompts so press rows can join the same adapters."""
    cards = {}
    y = repo / "models" / "configs" / "institutions.yaml"
    if y.exists():
        import yaml
        cfg = yaml.safe_load(y.read_text())
        cards = {k: v["role_card"].strip() for k, v in cfg.get("institutions", {}).items() if v.get("role_card")}
    for i in INSTITUTIONS:
        cards.setdefault(i.role, FALLBACK_CARDS.get(i.role, f"Sie vertreten {i.name_de} in der österreichischen "
                                                           "Gesundheitspolitik."))
    return cards


def sft_user(r: dict) -> str:
    lines = ["Öffentliche Debatte (Pressespiegel)",
             f"Thema: {TOPIC_LABEL.get(r['topic'], r['topic'])}: {r['about']}",
             f"Datum: {r['date']}"]
    lines.append("Formulieren Sie die öffentliche Position Ihrer Institution zu dieser Frage.")
    return "\n".join(lines)


def export(passages_path: Path, rewrites_path: Path, names_path: Path, out_dir: Path, repo: Path,
           log=print) -> dict:
    passages = {p["id"]: p for p in map(json.loads, open(passages_path))}
    names = json.loads(names_path.read_text())["per_passage"] if names_path.exists() else {}
    rewrites = [json.loads(x) for x in open(rewrites_path)] if rewrites_path.exists() else []
    stats = collections.Counter(rewrites=len(rewrites))
    rows = []
    for rw in rewrites:
        p, o = passages.get(rw["id"]), rw["out"]
        if not p:
            stats["orphan"] += 1
            continue
        if not o.get("relevant"):
            stats["not_relevant"] += 1
            continue
        txt = " ".join(str(o.get("stance_text_de", "")).split()).replace("\u2014", "-").replace("\u2013", "-")
        about = " ".join(str(o.get("about", "")).split()).replace("\u2014", "-").replace("\u2013", "-")
        if len(txt) < 30:
            stats["too_short"] += 1
            continue
        rows.append({"p": p, "o": o, "text": txt, "about": about})
    # guard: mask pass must change nothing, verify must find nothing, no source-masked name may reappear
    texts = [r["text"] for r in rows] + [r["about"] for r in rows]
    n = len(rows)
    masked, _, _ = guard.mask_many(texts) if texts else ([], 0, [])
    flagged = {i for i, (a, b) in enumerate(zip(texts, masked)) if a != b} | {i for i, _ in guard.verify(texts)}
    flagged |= {i for i, t in enumerate(texts) if guard.leaks_names(t, names.get(rows[i % n]["p"]["id"], []))}
    # a flagged short title is replaced by the fixed topic label (NER misfires on 4-word fragments);
    # a flagged stance text drops the whole row
    for i in sorted(x for x in flagged if x >= n):
        rows[i - n]["about"] = TOPIC_LABEL.get(rows[i - n]["o"].get("topic"), TOPIC_LABEL["sonstiges"])
        stats["about_replaced"] += 1
    bad = {i for i in flagged if i < n}
    stats["dropped_guard"] = len(bad)
    rows = [r for i, r in enumerate(rows) if i not in bad]
    guard.fail_closed([r["text"] for r in rows] + [r["about"] for r in rows], "press stance rows")

    cards = role_cards(repo)
    sources, segments, stances, sft = [], [], [], []
    for r in rows:
        p, o = r["p"], r["o"]
        inst = BY_KEY[p["inst"]]
        sid = p["id"]
        ref = {"pageId": p["page_id"], "pageNo": p["page_no"], "doc": p["doc"], "date": p["date"],
               "outlet": p["outlet"]}
        sources.append({
            "id": sid, "kind": "press",
            "institution": {"code": inst.code, "nameDe": inst.name_de, "glossEn": inst.gloss_en, "role": inst.role},
            "date": p["date"], "datePrecision": p["date_precision"], "outlet": p["outlet"],
            "title": r["about"] or TOPIC_LABEL.get(o["topic"]), "legalRef": None, "url": None,
            "licence": LICENCE, "personFiltered": True, "corpusRevision": CORPUS_REVISION,
            "topic": o["topic"], "stance": o["stance"], "sourceRef": ref})
        segments.append({"id": f"{sid}#0", "sourceId": sid, "ordinal": 0, "start": 0, "end": len(r["text"]),
                         "text": r["text"], "textEn": None})
        stances.append({"institution": inst.code, "role": inst.role, "date": p["date"], "topic": o["topic"],
                        "about": r["about"], "stance_text_de": r["text"], "stance": o["stance"],
                        "source_ref": {"source_id": sid, "page_id": p["page_id"], "date": p["date"],
                                       "outlet": p["outlet"]}})
        split = "train" if p["date"] < TIME_CUTOFF else "heldout"
        bt = "bt_train" if p["date"] < BACKTEST_CUTOFF else None
        sft.append({"messages": [{"role": "system", "content": cards[inst.role]},
                                 {"role": "user", "content": sft_user({**o, "about": r["about"], "date": p["date"]})},
                                 {"role": "assistant", "content": r["text"]}],
                    "meta": {"source_id": sid, "role": inst.role, "institution_id": inst.key, "date": p["date"],
                             "topic": o["topic"], "stance": o["stance"], "corpus": "press", "split": split, "bt": bt}})

    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "sft").mkdir(exist_ok=True)

    def dump(path: Path, rs):
        with open(path, "w") as f:
            for x in rs:
                f.write(json.dumps(x, ensure_ascii=False) + "\n")

    dump(out_dir / "press_sources.jsonl", sources)
    dump(out_dir / "press_segments.jsonl", segments)
    dump(out_dir / "press_stances.jsonl", stances)
    dump(out_dir / "persona_press_sft.jsonl", sft)
    files = collections.defaultdict(list)
    for x in sft:
        files[f"{x['meta']['role']}.{x['meta']['split']}.jsonl"].append(x)
        if x["meta"]["bt"]:
            files["backtest.bt_train.jsonl"].append(x)
    for old in (out_dir / "sft").glob("*.jsonl"):
        old.unlink()
    for name, rs in files.items():
        dump(out_dir / "sft" / name, rs)

    per = collections.defaultdict(collections.Counter)
    for s, x in zip(stances, sft):
        c = per[s["role"]]
        c["rows"] += 1
        c[s["stance"]] += 1
        c["pre_2018_09_14"] += 1 if x["meta"]["bt"] else 0
        c["train"] += 1 if x["meta"]["split"] == "train" else 0
        c["heldout"] += 1 if x["meta"]["split"] == "heldout" else 0
    stats["exported"] = len(rows)
    summary = {"leak_hits": 0, "personFiltered": True, "corpusRevision": CORPUS_REVISION, **stats,
               "per_role": {k: dict(v) for k, v in per.items()}}
    (out_dir / "press_masking_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1) + "\n")
    log(f"export: {len(rows)} rows -> {out_dir} ({dict(stats)})")
    return summary
