"""Build the per-agent / per-institution counts table (markdown) from derived outputs.

Writes derived/COUNTS.md. Columns: statements on all MEs (GP XXIII-XXVIII), on health_core MEs,
distinct health MEs, PDFs downloaded, texts extracted with >= 500 clean chars, needs_ocr.
"""
from __future__ import annotations

import collections
import csv
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # -I drops the script dir
from aliases import AGENT_OF, LABELS
from common import DERIVED, RAW, read_jsonl

AGENTS = ["bmsgpk", "sv", "aerztekammer", "contract_physicians", "elective_physicians", "hospitals", "nursing",
          "patients", "laender", "bmf"]


def main():
    idx = list(read_jsonl(DERIVED / "stellungnahmen_index.jsonl"))
    texts = {r["id"]: r for r in read_jsonl(DERIVED / "stellungnahmen.jsonl")} if (DERIVED / "stellungnahmen.jsonl").exists() else {}
    man = {(m["gp"], m["snme_inr"]): m for m in read_jsonl(RAW / "snme_pdf" / "manifest.jsonl")} \
        if (RAW / "snme_pdf" / "manifest.jsonl").exists() else {}
    agg = collections.defaultdict(lambda: collections.Counter())
    mes = collections.defaultdict(set)
    for r in idx:
        sid = f"{r['gp']}/SNME/{r['snme_inr']}"
        for key in (r["institution_id"], "AGENT:" + r["agent"]):
            a = agg[key]
            a["all"] += 1
            if r["health_core"]:
                a["health"] += 1
                mes[key].add((r["me_gp"], r["me_inr"]))
                m = man.get((r["gp"], r["snme_inr"]))
                if m and m.get("pdf"):
                    a["pdf"] += 1
                t = texts.get(sid)
                if t:
                    if t["n_chars"] >= 500:
                        a["text"] += 1
                    if t["needs_ocr"]:
                        a["ocr"] += 1

    def row(name, key):
        a = agg[key]
        return f"| {name} | {a['all']} | {a['health']} | {len(mes[key])} | {a['pdf']} | {a['text']} | {a['ocr']} |"

    hdr = ("| Institution | SN all MEs | SN health MEs | health MEs | PDFs | texts (>=500 chars) | needs OCR |\n"
           "|---|---:|---:|---:|---:|---:|---:|")
    out = ["# Stellungnahmen counts", "",
           "GP XXIII to XXVIII (2006-10 to 2026-11). Health MEs = `health_core` flag in `me_index.jsonl`.", "",
           "## Per simulator agent", "", hdr]
    for ag in AGENTS + ["other"]:
        out.append(row(f"**{ag}**", "AGENT:" + ag))
    out += ["", "## Per canonical institution (sorted by health-ME statements)", "", hdr]
    for cid in sorted((k for k in agg if not k.startswith("AGENT:")), key=lambda k: -agg[k]["health"]):
        out.append(row(f"{LABELS[cid]} (`{cid}`, {AGENT_OF[cid]})", cid))
    zero = [c for c in LABELS if c not in agg]
    if zero:
        out += ["", "Aliases with zero matches: " + ", ".join(f"`{c}`" for c in zero)]
    (DERIVED / "COUNTS.md").write_text("\n".join(out) + "\n")
    print("\n".join(out[:20]))


if __name__ == "__main__":
    main()
