"""CLI: forecast a new draft from its descriptor.

  uv run svforecast forecast --descriptor draft.json [--k 8] [--target binary|three]
  uv run svforecast forecast --proposer health_ministry --coalition oevp_spoe_neos --date 2026-11-01
  uv run svforecast fixture XXVI-ME-75

Descriptor JSON needs first_draft_date (ISO), and either proposer_group or ressort (e.g. "BMASGPK");
coalition is derived from the date when absent. Output: class base rate with Jeffreys and Wilson
90 percent intervals and the n behind it, the status-quo rate, and k weighted analogs.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict

from .forecast import analogs, forecast_a, forecast_b, load_episodes, pool_for, status_quo
from .govtable import government_at, proposer_group


def complete(desc: dict) -> dict:
    d = dict(desc)
    if "proposer_group" not in d:
        d["proposer_group"] = proposer_group(d.get("ressort"))
    if "coalition" not in d:
        d["coalition"] = government_at(d["first_draft_date"]).coalition
    return d


def run_forecast(desc: dict, k: int = 8, target: str = "binary", exclude: str | None = None) -> dict:
    desc = complete(desc)
    eps = load_episodes()
    pool = pool_for(eps, desc["first_draft_date"], exclude=exclude)
    fa = forecast_a(desc, pool, target)
    out = {
        "descriptor": {k2: desc[k2] for k2 in ("first_draft_date", "proposer_group", "coalition")},
        "pool_size": len(pool),
        "forecast_A": asdict(fa),
        "forecast_B": asdict(forecast_b(desc, pool, target)),
        "status_quo": asdict(status_quo(desc, pool, target)),
        "analogs": analogs(desc, pool, k),
        "note": "Historical base rate over comparable first drafts, not a verdict. Reference-class counts only, no trained model.",
    }
    r = next(x for x in fa.rates if x.category in ("enacted", "implemented"))
    out["sentence"] = (f"Drafts in this reference class ({fa.level}) were enacted within 24 months in "
                       f"{r.k:.0f} of {r.n:.0f} comparable cases (90% Jeffreys interval "
                       f"{100*r.jeffreys90[0]:.0f} to {100*r.jeffreys90[1]:.0f}%)." if target == "binary" else
                       f"Implemented as drafted in {r.k:.0f} of {r.n:.0f} comparable cases ({fa.level}).")
    if fa.small_n_warning:
        out["warning"] = f"small n ({fa.n:.0f} < 5): do not read the rate as a probability"
    elif fa.wide_interval_warning:
        out["warning"] = "90% interval wider than 40 points: treat as weak evidence"
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(prog="svforecast")
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("forecast")
    f.add_argument("--descriptor")
    f.add_argument("--proposer")
    f.add_argument("--ressort")
    f.add_argument("--coalition")
    f.add_argument("--date")
    f.add_argument("--k", type=int, default=8)
    f.add_argument("--target", choices=["binary", "three"], default="binary")
    x = sub.add_parser("fixture")
    x.add_argument("case_id")
    x.add_argument("--target", choices=["binary", "three"], default="binary")
    a = ap.parse_args(argv)
    if a.cmd == "forecast":
        desc = json.load(open(a.descriptor)) if a.descriptor else {}
        if a.date:
            desc["first_draft_date"] = a.date
        if a.proposer:
            desc["proposer_group"] = a.proposer
        if a.ressort:
            desc["ressort"] = a.ressort
        if a.coalition:
            desc["coalition"] = a.coalition
        if "first_draft_date" not in desc:
            ap.error("need first_draft_date (--date or descriptor)")
        res = run_forecast(desc, a.k, a.target)
    else:
        ep = next(e for e in load_episodes() if a.case_id in e["members"])
        res = run_forecast(ep, 8, a.target, exclude=ep["episode_id"])
        res["fixture"] = {"episode_id": ep["episode_id"], "title": ep["title"], "actual_outcome": ep["outcome"]}
    json.dump(res, sys.stdout, indent=1, ensure_ascii=False)
    print()


if __name__ == "__main__":
    main()
