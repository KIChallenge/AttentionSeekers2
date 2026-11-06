"""press pipeline CLI.

  uv run python -I -m sv_press all --db /path/to/presse.db          # extract, clean, rewrite, export
  uv run python -I -m sv_press all --db work/synthetic.db --mock    # offline, no model calls
  uv run python -I -m sv_press synth work/synthetic.db              # build the synthetic test archive
  uv run python -I -m sv_press rewrite --dry                        # token and USD estimate only
Steps can be run one by one (extract, clean, rewrite, export); each reads the previous step's file in
--work. Work files contain press text and stay local (gitignored).
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from . import clean as clean_mod
from . import export as export_mod
from . import extract as extract_mod
from . import rewrite as rewrite_mod
from . import synth
from .guard import REPO
from .institutions import INSTITUTIONS

PRESS = Path(__file__).resolve().parents[2]


def _paths(a):
    work = Path(a.work)
    return {"cand": work / "candidates.jsonl", "pass": work / "passages.jsonl", "names": work / "masked_names.json",
            "rw": work / ("rewrites.mock.jsonl" if getattr(a, "mock", False) else "rewrites.jsonl"),
            "work": work, "out": Path(a.out)}


def counts_md(summary: dict, out: Path) -> None:
    ex = summary.get("extract", {})
    cl = summary.get("clean", {})
    exp = summary.get("export", {})
    lines = ["# Press archive counts", "",
             f"Database: `{summary.get('db_name')}`, run {summary.get('finished')}, model `{summary.get('model')}`.",
             "Only counts and metadata; no press text.", "",
             "| Institution | role | FTS pages | candidates | passages | rows | support | oppose | conditional | "
             "neutral | pre 2018-09-14 | train | heldout |",
             "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|"]
    for i in INSTITUTIONS:
        c = exp.get("per_role", {}).get(i.role, {})
        lines.append(f"| {i.name_de} ({i.code}) | {i.role} | {ex.get('fts_pages', {}).get(i.key, 0)} | "
                     f"{ex.get('candidates', {}).get(i.key, 0)} | {cl.get('per_institution', {}).get(i.key, 0)} | "
                     f"{c.get('rows', 0)} | {c.get('support', 0)} | {c.get('oppose', 0)} | {c.get('conditional', 0)} | "
                     f"{c.get('neutral', 0)} | {c.get('pre_2018_09_14', 0)} | {c.get('train', 0)} | "
                     f"{c.get('heldout', 0)} |")
    rw = summary.get("rewrite", {})
    lines += ["", "Pipeline: " + ", ".join(f"{k} {v}" for k, v in {
        "near duplicates dropped": cl.get("near_dup_dropped"), "quote sentences dropped": cl.get("quote_sentences_dropped"),
        "person sentences masked": cl.get("person_sentences_masked"), "not relevant": exp.get("not_relevant"),
        "dropped by output guard": exp.get("dropped_guard"), "titles replaced by topic label": exp.get("about_replaced"),
        "USD spent": rw.get("spent_usd"), "USD estimate": rw.get("estimate_usd")}.items() if v is not None) + "."]
    out.write_text("\n".join(lines) + "\n")


def main(argv=None):
    ap = argparse.ArgumentParser(prog="sv_press", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("step", choices=["all", "synth", "extract", "clean", "rewrite", "export"])
    ap.add_argument("path", nargs="?", help="synth: output db path")
    ap.add_argument("--db", help="presse.db (opened read-only)")
    ap.add_argument("--work", default=str(PRESS / "work"))
    ap.add_argument("--out", default=str(PRESS / "derived"))
    ap.add_argument("--per-year", type=int, default=60, help="extract: best windows kept per institution and year")
    ap.add_argument("--cap", type=int, default=200, help="clean: passages per institution sent to the model")
    ap.add_argument("--institutions", help="comma list of keys: " + ",".join(i.key for i in INSTITUTIONS))
    ap.add_argument("--model", default="gpt-6-sol")
    ap.add_argument("--budget", type=float, default=25.0, help="USD cap for the rewrite step (ledger across runs)")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--mock", action="store_true", help="offline rewrite stand-in (tests, dry runs)")
    ap.add_argument("--dry", action="store_true", help="rewrite: only count tokens and estimate USD")
    ap.add_argument("--yes", action="store_true", help="all: do not stop after the estimate")
    a = ap.parse_args(argv)
    P = _paths(a)
    P["work"].mkdir(parents=True, exist_ok=True)
    insts = set(a.institutions.split(",")) if a.institutions else None
    summ_p = P["work"] / "run_summary.json"
    summary = json.loads(summ_p.read_text()) if summ_p.exists() else {}

    def log(*x):
        print(*x, flush=True)

    if a.step == "synth":
        p = Path(a.path or P["work"] / "synthetic.db")
        p.parent.mkdir(parents=True, exist_ok=True)
        log("synthetic db:", p, synth.build(p))
        return
    if a.step in ("all", "extract"):
        if not a.db:
            ap.error("--db is required for extract")
        t = time.time()
        summary["extract"] = extract_mod.extract(a.db, P["cand"], per_year=a.per_year, insts=insts, log=log)
        summary["extract"]["seconds"] = round(time.time() - t, 1)
        summary["db_name"] = Path(a.db).name
    if a.step in ("all", "clean"):
        summary["clean"] = clean_mod.clean(P["cand"], P["pass"], P["names"], cap=a.cap, log=log)
    if a.step in ("all", "rewrite"):
        model = "mock" if a.mock else a.model
        gen = rewrite_mod.mock_generator() if a.mock else (None if a.dry else rewrite_mod.openai_generator(model, REPO))
        if a.step == "all" and not a.mock and not a.dry and not a.yes:
            est = rewrite_mod.rewrite(P["pass"], P["rw"], P["work"], model, a.budget, gen, dry=True, log=log)
            if est["estimate_usd"] > a.budget:
                log(f"estimate {est['estimate_usd']} USD exceeds budget {a.budget}; the run stops at the budget. "
                    "Re-run with --yes to proceed, or lower --cap.")
                summ_p.write_text(json.dumps(summary, ensure_ascii=False, indent=1))
                sys.exit(2)
        summary["rewrite"] = rewrite_mod.rewrite(P["pass"], P["rw"], P["work"], model, a.budget, gen,
                                                 workers=a.workers, dry=a.dry, log=log)
        summary["model"] = model
        if a.dry:
            summ_p.write_text(json.dumps(summary, ensure_ascii=False, indent=1))
            return
    if a.step in ("all", "export"):
        summary["export"] = export_mod.export(P["pass"], P["rw"], P["names"], P["out"], REPO, log=log)
        summary["finished"] = time.strftime("%Y-%m-%d %H:%M")
        counts_md(summary, P["out"] / "COUNTS.md")
    summ_p.write_text(json.dumps(summary, ensure_ascii=False, indent=1))


def main_all():
    main(["all", *sys.argv[1:]])


if __name__ == "__main__":
    main()
