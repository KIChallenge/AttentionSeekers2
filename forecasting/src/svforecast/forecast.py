"""Baseline reference-class forecaster (PREREGISTRATION.md sections 4 to 7).

No parameter here is fitted to outcomes: class order, n_min, the Jeffreys 0.5 prior, the
analog weights and the 6-year half-life are fixed in the preregistration.
"""

from __future__ import annotations

import datetime as dt
import json
from dataclasses import dataclass, field
from pathlib import Path

from .stats import jeffreys, wilson

ROOT = Path(__file__).resolve().parents[2]
EPISODES = ROOT / "data" / "episodes.jsonl"
N_MIN = 5
PRIOR = 0.5
HALF_LIFE_YEARS = 6.0

ENACTED = {"implemented", "partially_implemented"}
NOT_ENACTED = {"lapsed", "rejected", "superseded"}
TARGETS = {
    "binary": ["enacted", "not_enacted"],
    "three": ["implemented", "partially_implemented", "not_implemented"],
}


def category(outcome: str, target: str) -> str | None:
    if outcome not in ENACTED | NOT_ENACTED:
        return None
    if target == "binary":
        return "enacted" if outcome in ENACTED else "not_enacted"
    return outcome if outcome in ENACTED else "not_implemented"


def load_episodes(path: Path = EPISODES) -> list[dict]:
    return [json.loads(l) for l in path.read_text().splitlines() if l.strip()]


def pool_for(episodes: list[dict], t: str, exclude: str | None = None) -> list[dict]:
    """Time-respecting pool: labelled, uncensored, knowable strictly before t, not the target."""
    return [e for e in episodes if not e["censored"] and e["outcome"] in ENACTED | NOT_ENACTED
            and e["knowable_date"] < t and e["episode_id"] != exclude]


@dataclass
class ClassRate:
    category: str
    k: float
    n: float
    p: float
    jeffreys90: tuple[float, float]
    wilson90: tuple[float, float]


@dataclass
class Forecast:
    method: str
    level: str
    n: float
    probs: dict[str, float]
    rates: list[ClassRate] = field(default_factory=list)
    small_n_warning: bool = False
    wide_interval_warning: bool = False


def _counts(members, target, weights=None):
    cats = TARGETS[target]
    c = {k: 0.0 for k in cats}
    n = 0.0
    for i, e in enumerate(members):
        cat = category(e["outcome"], target)
        if cat is None or (target == "three" and not e.get("three_class_ok", True)):
            continue
        w = 1.0 if weights is None else weights[i]
        c[cat] += w
        n += w
    return c, n


def _forecast_from_counts(method, level, c, n, target):
    cats = TARGETS[target]
    K = len(cats)
    probs = {k: (c[k] + PRIOR) / (n + PRIOR * K) for k in cats}
    rates = [ClassRate(k, c[k], n, probs[k], jeffreys(c[k], n) if n else (0, 1), wilson(c[k], n)) for k in cats]
    wide = any(r.jeffreys90[1] - r.jeffreys90[0] > 0.40 for r in rates)
    return Forecast(method, level, n, probs, rates, small_n_warning=n < N_MIN, wide_interval_warning=wide)


def forecast_a(desc: dict, pool: list[dict], target: str = "binary") -> Forecast:
    levels = [
        ("proposer+coalition", lambda e: e["proposer_group"] == desc["proposer_group"] and e["coalition"] == desc["coalition"]),
        ("coalition", lambda e: e["coalition"] == desc["coalition"]),
        ("proposer", lambda e: e["proposer_group"] == desc["proposer_group"]),
        ("all", lambda e: True),
    ]
    for name, pred in levels:
        members = [e for e in pool if pred(e)]
        c, n = _counts(members, target)
        if n >= N_MIN or name == "all":
            return _forecast_from_counts("A", name, c, n, target)
    raise AssertionError


def status_quo(desc: dict, pool: list[dict], target: str = "binary") -> Forecast:
    c, n = _counts(pool, target)
    return _forecast_from_counts("status_quo", "all", c, n, target)


def years_between(a: str, b: str) -> float:
    return abs((dt.date.fromisoformat(a) - dt.date.fromisoformat(b)).days) / 365.25


def analog_weight(desc: dict, e: dict) -> float:
    s = 1 + (e["proposer_group"] == desc["proposer_group"]) + (e["coalition"] == desc["coalition"])
    return s * 0.5 ** (years_between(desc["first_draft_date"], e["first_draft_date"]) / HALF_LIFE_YEARS)


def forecast_b(desc: dict, pool: list[dict], target: str = "binary") -> Forecast:
    w = [analog_weight(desc, e) for e in pool]
    c, n = _counts(pool, target, w)
    f = _forecast_from_counts("B", "weighted_analogs", c, n, target)
    f.n = len(pool)
    return f


def analogs(desc: dict, pool: list[dict], k: int = 8) -> list[dict]:
    ranked = sorted(pool, key=lambda e: -analog_weight(desc, e))[:k]
    return [{"episode_id": e["episode_id"], "title": e["title"], "first_draft_date": e["first_draft_date"],
             "proposer_group": e["proposer_group"], "coalition": e["coalition"], "outcome": e["outcome"],
             "weight": round(analog_weight(desc, e), 3)} for e in ranked]
