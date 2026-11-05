"""Step 1: find passages where an agent institution takes a health-policy position.

Per institution one FTS5 query (alias OR ... AND health topic), then per hit page: column reflow,
paragraphs, a window around every paragraph that names the institution next to a position marker
("fordert", "lehnt ab", "warnt", ...). Every window is dated by the earliest day-precise press review
the page appears in (pages.dup_of collapses identical reprints), and carries the outlet when the
clipping header names one. A bounded heap per (institution, year) keeps the best windows, so a
543 MB archive streams through in constant memory and every year stays represented.
"""
from __future__ import annotations

import collections
import hashlib
import heapq
import json
import re
import sqlite3
from datetime import date as _date
from pathlib import Path

from .institutions import INSTITUTIONS, POSITION, inst_query, topics_in
from .text import norm_key, outlet_of, paragraphs

WIN_MIN, WIN_MAX = 350, 1500


def open_ro(db_path: str | Path) -> sqlite3.Connection:
    p = Path(db_path).resolve()
    if not p.exists():
        raise SystemExit(f"press db not found: {p}")
    return sqlite3.connect(f"file:{p}?mode=ro", uri=True)


RANGE = re.compile(r"(\d{4})(\d{2})(\d{2})\s*-\s*(\d{4})(\d{2})(\d{2})")
DAY = re.compile(r"vom\s+\d{1,2}\.\d{1,2}\.\d{4}|\d{4}-\d{2}-\d{2}")


def precision_of(rel: str) -> str | None:
    """day / month / None (unusable). Range compilations are only as precise as their span."""
    m = RANGE.search(rel)
    if m:
        try:
            a = _date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
            b = _date(int(m.group(4)), int(m.group(5)), int(m.group(6)))
        except ValueError:
            return None
        span = (b - a).days
        return "day" if span <= 1 else ("month" if span <= 31 else None)
    return "day" if DAY.search(rel) else None


def page_dates(db: sqlite3.Connection) -> dict[int, tuple[str, str]]:
    """page id (first occurrence) -> (date, precision): the earliest day-precise appearance,
    else the earliest month-precise one. Pages that only live in long compilations get none."""
    best: dict[int, tuple[str, str]] = {}
    rank = {"day": 0, "month": 1}
    for pid, dup, d, rel in db.execute(
            "SELECT p.id, p.dup_of, d.doc_date, d.rel FROM pages p JOIN docs d ON d.id=p.doc_id "
            "WHERE d.doc_date IS NOT NULL"):
        prec = precision_of(rel)
        if prec is None:
            continue
        key = dup or pid
        cur = best.get(key)
        cand = (d, prec)
        if cur is None or (rank[prec], d) < (rank[cur[1]], cur[0]):
            best[key] = cand
    return best


def _window(paras: list[str], i: int, hit: re.Match) -> str:
    p = paras[i]
    if len(p) > WIN_MAX:
        # long unbroken block (OCR, no blank lines): cut at sentence ends around the alias
        a = max(0, hit.start() - WIN_MAX // 3)
        k = p.rfind(". ", 0, a)
        a = k + 2 if k >= 0 else 0
        b = p.find(". ", a + WIN_MAX - 300, a + WIN_MAX)
        return p[a: (b + 1 if b > 0 else a + WIN_MAX)].strip()
    out, lo, hi = [p], i, i
    while sum(map(len, out)) < WIN_MIN and (lo > 0 or hi < len(paras) - 1):
        if hi < len(paras) - 1 and len(paras[hi + 1]) + sum(map(len, out)) <= WIN_MAX:
            hi += 1
            out.append(paras[hi])
        elif lo > 0 and len(paras[lo - 1]) + sum(map(len, out)) <= WIN_MAX:
            lo -= 1
            out.insert(0, paras[lo])
        else:
            break
    return "\n\n".join(out)


def _score(inst, para: str, window: str, page_topics: dict) -> tuple[float, dict]:
    topics = topics_in(window)
    s = 0.0
    sent_hit = any(inst.rx.search(x) and POSITION.search(x) for x in re.split(r"(?<=[.!?])\s+", para))
    s += 3 if sent_hit else 1
    s += 2 * min(3, sum(topics.values()))
    if not topics and page_topics:
        s += 0.5
    return s, topics


def extract(db_path: str | Path, out: Path, per_year: int = 60, insts=None, log=print) -> dict:
    db = open_ro(db_path)
    insts = [i for i in INSTITUTIONS if not insts or i.key in insts]
    log("extract: dating pages ...")
    dates = page_dates(db)
    hits: dict[int, set[str]] = collections.defaultdict(set)
    fts_counts = {}
    for inst in insts:
        q = inst_query(inst)
        ids = [r[0] for r in db.execute("SELECT rowid FROM fts WHERE fts MATCH ?", (q,))]
        fts_counts[inst.key] = len(ids)
        for pid in ids:
            hits[pid].add(inst.key)
        log(f"  fts {inst.key:<4} {len(ids):>7} pages")
    by_key = {i.key: i for i in insts}
    heaps: dict[tuple[str, str], list] = collections.defaultdict(list)
    seen: set[bytes] = set()            # digests only: the real archive yields ~10^5 windows
    stats = collections.Counter()
    pids = sorted(hits)
    for n, pid in enumerate(pids, 1):
        row = db.execute("SELECT t.text, p.ocr, p.page_no, d.rel FROM page_text t JOIN pages p ON p.id=t.page_id "
                         "JOIN docs d ON d.id=p.doc_id WHERE t.page_id=?", (pid,)).fetchone()
        if not row or pid not in dates:
            stats["undated_or_missing"] += 1
            continue
        text, ocr, page_no, rel = row
        date, prec = dates[pid]
        outlet = outlet_of("\n".join(text.split("\n")[:6]))
        paras = paragraphs(text, layout=not ocr)
        page_topics = topics_in(" ".join(paras))
        for key in hits[pid]:
            inst = by_key[key]
            for i, para in enumerate(paras):
                m = inst.rx.search(para)
                if not m or not POSITION.search(para):
                    continue
                win = _window(paras, i, m)
                score, topics = _score(inst, para, win, page_topics)
                if inst.require_topic and not topics:
                    stats["no_topic"] += 1
                    continue
                k = hashlib.sha1(f"{key}\x00{norm_key(win)[:300]}".encode()).digest()[:12]
                if k in seen:
                    stats["exact_dup"] += 1
                    continue
                seen.add(k)
                stats["windows"] += 1
                tie = int(hashlib.sha1(f"{pid}:{i}:{key}".encode()).hexdigest()[:8], 16)
                item = (score, -tie, {
                    "inst": key, "page_id": pid, "page_no": page_no, "doc": rel, "date": date,
                    "date_precision": prec, "outlet": outlet, "ocr": bool(ocr), "para": i,
                    "topics": topics, "score": score, "text": win})
                h = heaps[(key, date[:4])]
                if len(h) < per_year:
                    heapq.heappush(h, item)
                elif item[:2] > h[0][:2]:
                    heapq.heapreplace(h, item)
        if n % 5000 == 0:
            log(f"  {n}/{len(pids)} pages, {stats['windows']} windows")
    out.parent.mkdir(parents=True, exist_ok=True)
    rows = sorted((x[2] for h in heaps.values() for x in h), key=lambda r: (r["inst"], r["date"], r["page_id"]))
    with open(out, "w") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    per_inst = collections.Counter(r["inst"] for r in rows)
    summary = {"fts_pages": fts_counts, "hit_pages": len(pids), "candidates": dict(per_inst), **stats}
    log(f"extract: {len(rows)} candidate windows -> {out}")
    return summary
