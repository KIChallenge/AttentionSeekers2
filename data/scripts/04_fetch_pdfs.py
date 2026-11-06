"""Download Stellungnahme PDFs for health MEs and mapped institutions.

For each row of derived/stellungnahmen_index.jsonl with health_core (or --broad):
fetch the SNME detail JSON (cache/snme_detail) for the PDF link, then the PDF into
raw/snme_pdf/{GP}/{SNME_INR}.pdf. Resumable; rows are processed in priority order
(simulator agents with few statements first) so a partial run covers the rare voices.

Options: --broad (health_broad instead of health_core), --limit N, --agents a,b
Writes raw/snme_pdf/manifest.jsonl (snme -> pdf path, all document links).
"""
from __future__ import annotations

import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # -I drops the script dir
from common import DERIVED, PARL, RAW, download, get_json, read_jsonl, write_jsonl

PDF_DIR = RAW / "snme_pdf"

# Non-agent institutions included for the corpus (others skipped to bound the crawl)
OTHER_KEEP = {"ak", "wko", "oegb", "iv", "rechnungshof", "apothekerkammer", "zahnaerztekammer", "pharma_industry",
              "union_health", "seniorenrat", "disability", "goeg", "volksanwaltschaft", "mtd_hebammen",
              "free_welfare", "care_providers", "gemeindebund", "staedtebund", "psych_professions"}


def main():
    broad = "--broad" in sys.argv
    limit = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else None
    agents = set(sys.argv[sys.argv.index("--agents") + 1].split(",")) if "--agents" in sys.argv else None
    flag = "health_broad" if broad else "health_core"
    rows = [r for r in read_jsonl(DERIVED / "stellungnahmen_index.jsonl") if r[flag]]
    rows = [r for r in rows if r["agent"] != "other" or r["institution_id"] in OTHER_KEEP]
    if agents:
        rows = [r for r in rows if r["agent"] in agents or r["institution_id"] in agents]
    freq = Counter(r["agent"] if r["agent"] != "other" else r["institution_id"] for r in rows)
    # agents before others; rarer first; newer first within
    rows.sort(key=lambda r: (r["agent"] == "other",
                             freq[r["agent"] if r["agent"] != "other" else r["institution_id"]],
                             -int(r["date"][-4:])))
    if limit:
        rows = rows[:limit]
    print(f"{len(rows)} statements to fetch ({flag})", flush=True)

    manifest = {}
    mf = PDF_DIR / "manifest.jsonl"
    if mf.exists():
        for m in read_jsonl(mf):
            manifest[(m["gp"], m["snme_inr"])] = m
    stats = Counter()
    for i, r in enumerate(rows):
        key = (r["gp"], r["snme_inr"])
        if key in manifest and (manifest[key].get("pdf") is None or (RAW / manifest[key]["pdf"]).exists()):
            stats["cached"] += 1
            continue
        d = get_json(f"{PARL}/gegenstand/{r['gp']}/SNME/{r['snme_inr']}?json=TRUE", subdir="snme_detail")
        c = (d or {}).get("content") or {}
        docs = []
        for g in c.get("documents") or []:
            for dd in g.get("documents") or []:
                docs.append({"title": g.get("title"), "link": dd.get("link"), "type": dd.get("type")})
        pdfs = [x for x in docs if (x["type"] or "").upper() == "PDF" and x["link"]]
        entry = {"gp": r["gp"], "snme_inr": r["snme_inr"], "documents": docs, "pdf": None}
        if pdfs:
            dest = PDF_DIR / r["gp"] / f"{r['snme_inr']}.pdf"
            if download(PARL + pdfs[0]["link"], dest):
                entry["pdf"] = str(dest.relative_to(RAW))
                stats["downloaded"] += 1
            else:
                stats["download_failed"] += 1
        else:
            stats["no_pdf"] += 1
        manifest[key] = entry
        if i % 50 == 0:
            write_jsonl(mf, manifest.values())
            print(i, dict(stats), flush=True)
    write_jsonl(mf, manifest.values())
    print("done", dict(stats))


if __name__ == "__main__":
    main()
