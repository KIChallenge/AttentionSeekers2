"""Step 2: dedup, select, and make passages person-free before any model sees them.

Order per passage (fail closed at every step):
  1. near-duplicate removal per institution (word 6-gram shingles, Jaccard >= 0.5, earliest date wins):
     the archive reprints the same agency text across outlets and days
  2. balanced selection: up to `cap` passages per institution, round robin over years, best score first
  3. quote removal: sentences with quotation marks, first-person speech or ", sagt der <office>" go
  4. office nouns ("Gesundheitsministerin", "Kammerpräsident") become the institution or [Funktion]
  5. person masking: spaCy PER + title + name-list + first-name rules mask the whole sentence as [...]
  6. the passage must still name the institution and keep >= 120 chars of unmasked text
The masked name strings are kept in the work dir (never in derived/) for the output leak check.
"""
from __future__ import annotations

import collections
import json
from pathlib import Path

from . import guard
from .institutions import BY_KEY
from .text import norm_key

MIN_KEEP = 120


def _shingles(t: str, n: int = 6) -> set[int]:
    w = norm_key(t).split()
    return {hash(" ".join(w[i:i + n])) for i in range(max(1, len(w) - n + 1))}


def dedup(rows: list[dict], thr: float = 0.5) -> tuple[list[dict], int]:
    kept, dropped = [], 0
    by_inst = collections.defaultdict(list)
    for r in rows:
        by_inst[r["inst"]].append(r)
    for rs in by_inst.values():
        rs.sort(key=lambda r: (r["date"], -r["score"]))
        index: dict[int, list[int]] = collections.defaultdict(list)
        sh_list: list[set[int]] = []
        for r in rs:
            sh = _shingles(r["text"])
            cand = collections.Counter(j for s in sh for j in index.get(s, ()))
            if any(c / max(1, min(len(sh), len(sh_list[j]))) >= thr for j, c in cand.items()):
                dropped += 1
                continue
            j = len(sh_list)
            sh_list.append(sh)
            for s in sh:
                index[s].append(j)
            kept.append(r)
    return kept, dropped


def select(rows: list[dict], cap: int) -> list[dict]:
    out = []
    by_inst = collections.defaultdict(lambda: collections.defaultdict(list))
    for r in rows:
        by_inst[r["inst"]][r["date"][:4]].append(r)
    for years in by_inst.values():
        for y in years.values():
            y.sort(key=lambda r: -r["score"])
        picked, order = [], sorted(years)
        while len(picked) < cap and any(years[y] for y in order):
            for y in order:
                if years[y] and len(picked) < cap:
                    picked.append(years[y].pop(0))
        out += picked
    return out


def strip_quotes(text: str) -> tuple[str, int]:
    paras_out, n = [], 0
    for para in text.split("\n\n"):
        keep = []
        for s in guard.sentences(para):
            if guard.is_quote(s):
                n += 1
                continue
            keep.append(guard.neutralise_offices(s))
        if keep:
            paras_out.append(" ".join(keep))
    return "\n\n".join(paras_out), n


def unmasked_len(t: str) -> int:
    return len(t.replace(guard.MASK, "").strip())


def clean(candidates: Path, out: Path, names_out: Path, cap: int = 250, log=print) -> dict:
    rows = [json.loads(x) for x in open(candidates)]
    stats = collections.Counter(candidates=len(rows))
    rows, d = dedup(rows)
    stats["near_dup_dropped"] = d
    rows = select(rows, cap)
    stats["selected"] = len(rows)
    texts, nq = [], 0
    for r in rows:
        t, q = strip_quotes(r["text"])
        nq += q
        texts.append(t)
    stats["quote_sentences_dropped"] = nq
    masked, n_masked, names = guard.mask_many(texts) if texts else ([], 0, [])
    stats["person_sentences_masked"] = n_masked
    kept, kept_names = [], {}
    for r, t, nm in zip(rows, masked, names):
        inst = BY_KEY[r["inst"]]
        if not inst.rx.search(t):
            stats["dropped_inst_masked_away"] += 1
            continue
        if unmasked_len(t) < MIN_KEEP:
            stats["dropped_too_short"] += 1
            continue
        pid = f"press-{r['page_id']}-{r['para']}-{r['inst']}"
        kept.append({**{k: r[k] for k in ("inst", "page_id", "page_no", "doc", "date", "date_precision", "outlet",
                                            "ocr", "topics", "score")}, "id": pid, "text": t})
        kept_names[pid] = nm
    # second pass: anything still person-like is dropped, not repaired
    bad = {i for i, _ in guard.verify([r["text"] for r in kept])}
    stats["dropped_verify"] = len(bad)
    kept = [r for i, r in enumerate(kept) if i not in bad]
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w") as f:
        for r in kept:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    all_names = sorted({n for v in kept_names.values() for n in v})
    names_out.write_text(json.dumps({"per_passage": {k: v for k, v in kept_names.items() if v},
                                     "all": all_names}, ensure_ascii=False))
    stats["passages"] = len(kept)
    stats["per_institution"] = dict(collections.Counter(r["inst"] for r in kept))
    log(f"clean: {len(kept)} passages ({stats['near_dup_dropped']} near dups, {nq} quote sentences, "
        f"{n_masked} person sentences masked)")
    return dict(stats)

