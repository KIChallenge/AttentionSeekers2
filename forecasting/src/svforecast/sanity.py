"""Sanity checks of the two handoff numbers.

  python -m svforecast.sanity     # writes data/sanity.json and prints a summary

1. "About 97% of tabled government bills pass": list 101, DOKTYP RV, per GP. Passed = STATUS 5.
   Not passed = STATUS 2 (died in committee), 3, 4 (other disposition). Open GP XXVIII is
   reported separately because its STATUS 2 rows are still pending, not dead.
2. "30 to 60 real negotiation episodes": counted from data/episodes.jsonl under several
   explicit definitions (see README).
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

from . import http
from .registry import BILL_DOKTYP

ROOT = Path(__file__).resolve().parents[2]
CLOSED = ["XX", "XXI", "XXII", "XXIII", "XXIV", "XXV", "XXVI", "XXVII"]


def rv_pass_rates():
    out = {}
    tot = Counter()
    tot_h = Counter()
    for gp in CLOSED + ["XXVIII"]:
        rows = http.parl_list(101, {"GP_CODE": [gp], "DOKTYP": BILL_DOKTYP})["rows"]
        rv = [r for r in rows if r[11] == "RV"]
        c = Counter(r[10] for r in rv)
        health = [r for r in rv if "Gesundheit" in (r[22] or "")]
        ch = Counter(r[10] for r in health)
        out[gp] = {"rv_status": dict(c), "health_rv_status": dict(ch)}
        if gp in CLOSED:
            tot.update(c)
            if gp in ("XXIV", "XXV", "XXVI", "XXVII"):
                tot_h.update(ch)

    def rate(c):
        passed = c.get("5", 0)
        den = passed + c.get("2", 0) + c.get("3", 0) + c.get("4", 0)
        return {"passed": passed, "not_passed": den - passed, "rate": passed / den if den else None}

    out["closed_GP_XX_XXVII"] = rate(tot)
    out["closed_GP_XXIII_XXVII"] = rate(sum((Counter(out[g]["rv_status"]) for g in CLOSED[3:]), Counter()))
    out["health_tagged_GP_XXIV_XXVII"] = rate(tot_h)
    return out


def episode_counts():
    eps = [json.loads(l) for l in (ROOT / "data" / "episodes.jsonl").read_text().splitlines()]
    lab = [e for e in eps if not e["censored"]]
    enacted = [e for e in lab if e["outcome"] in ("implemented", "partially_implemented")]
    contested_vote = [e for e in enacted if e.get("vote_text") and "Dagegen" in (e["vote_text"] or "")]
    many_sn = [e for e in lab if (e["n_stellungnahmen"] or 0) >= 50]
    core = [e for e in lab if e["proposer_group"] == "health_ministry" or "sozialversicherung" in e["title"].lower()]
    return {
        "episodes_total": len(eps),
        "episodes_labelled_uncensored": len(lab),
        "label_distribution": dict(Counter(e["outcome"] for e in lab)),
        "not_enacted_or_modified": sum(e["outcome"] != "implemented" for e in lab),
        "enacted_with_any_vote_against": len(contested_vote),
        "with_50_or_more_stellungnahmen": len(many_sn),
        "contested_proxy_vote_against_and_ge_50_sn": sum(1 for e in contested_vote if (e["n_stellungnahmen"] or 0) >= 50),
        "health_ministry_or_sv_titled": len(core),
    }


def main():
    res = {"rv_pass_rates": rv_pass_rates()}
    if (ROOT / "data" / "episodes.jsonl").exists():
        res["episode_counts"] = episode_counts()
    (ROOT / "data" / "sanity.json").write_text(json.dumps(res, indent=1, ensure_ascii=False))
    print(json.dumps({k: v for k, v in res["rv_pass_rates"].items() if not k.startswith("X")}, indent=1))
    print(json.dumps(res.get("episode_counts"), indent=1))


if __name__ == "__main__":
    main()
