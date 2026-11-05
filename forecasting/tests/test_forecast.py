from svforecast.forecast import category, forecast_a, pool_for, status_quo
from svforecast.govtable import government_at
from svforecast.stats import jeffreys, wilson


def ep(i, date, outcome, pg="health_ministry", coal="spoe_oevp", censored=False):
    from svforecast.registry import add_days
    return {"episode_id": f"E{i}", "first_draft_date": date, "knowable_date": add_days(date, 730),
            "outcome": outcome, "proposer_group": pg, "coalition": coal, "censored": censored, "three_class_ok": True}


def test_wilson_matches_addendum_example():
    lo, hi = wilson(4, 11)
    assert round(lo, 2) == 0.18 and round(hi, 2) == 0.61


def test_jeffreys_bounds():
    assert jeffreys(0, 10)[0] == 0.0 and jeffreys(10, 10)[1] == 1.0


def test_pool_is_time_respecting_and_leave_one_out():
    eps = [ep(1, "2010-01-01", "implemented"), ep(2, "2011-06-01", "lapsed"), ep(3, "2013-01-01", "implemented")]
    pool = pool_for(eps, "2013-01-01", exclude="E3")
    # E1 knowable 2011-12-31 (< t), E2 knowable 2013-05-31 (not yet), E3 excluded
    assert [e["episode_id"] for e in pool] == ["E1"]


def test_censored_never_in_pool():
    eps = [ep(1, "2010-01-01", "implemented", censored=True)]
    assert pool_for(eps, "2020-01-01") == []


def test_fallback_to_status_quo_when_sparse():
    eps = [ep(i, f"200{8 + i % 2}-01-01", "implemented" if i % 3 else "lapsed", coal="spoe_oevp") for i in range(12)]
    desc = {"proposer_group": "health_ministry", "coalition": "oevp_fpoe", "first_draft_date": "2018-01-01"}
    pool = pool_for(eps, desc["first_draft_date"])
    fa = forecast_a(desc, pool)
    assert fa.level == "proposer"
    assert abs(sum(fa.probs.values()) - 1) < 1e-9
    assert status_quo(desc, pool).n == 12


def test_category_mapping():
    assert category("superseded", "binary") == "not_enacted"
    assert category("partially_implemented", "three") == "partially_implemented"
    assert category("unknown", "binary") is None


def test_government_table():
    assert government_at("2018-09-14").coalition == "oevp_fpoe"
    assert government_at("2017-04-21").coalition == "spoe_oevp"
    assert government_at("2019-08-01").coalition == "caretaker"
