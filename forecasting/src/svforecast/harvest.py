"""Step 1: harvest the raw parliamentary record into the cache.

  python -m svforecast.harvest lists    # list 81 (all MEs) and list 101 per GP (bills)
  python -m svforecast.harvest me       # detail JSON for every ME with Einlangen >= 2008-01-01
  python -m svforecast.harvest bills    # detail JSON for every bill an in-scope ME links to
  python -m svforecast.harvest texts    # Gesetzestext HTML of ME and linked RV (for the diff rule)

All calls go through svforecast.http (cached, about 1 request per second).
"""

from __future__ import annotations

import sys

from . import http

GPS = ["XXIII", "XXIV", "XXV", "XXVI", "XXVII", "XXVIII"]
BILL_DOKTYP = ["RV", "A", "BUA", "GABR", "GABR13", "BRA", "RVS", "RVS15"]
START = "2008-01-01"


def lists():
    me = http.parl_list(81, {})
    print("list 81 rows:", len(me["rows"]))
    for gp in ["XX", "XXI", "XXII"] + GPS:
        d = http.parl_list(101, {"GP_CODE": [gp], "DOKTYP": BILL_DOKTYP})
        print("list 101", gp, d["count"], len(d["rows"]))


def me_rows():
    d = http.parl_list(81, {}, offline=False)
    return [r for r in d["rows"] if (r[10] or "") >= START]


def me_details():
    rows = me_rows()
    for i, r in enumerate(rows):
        http.parl_item(r[0], "ME", r[2])
        if i % 100 == 0:
            print(i, len(rows), r[0], r[2], flush=True)


def main():
    step = sys.argv[1] if len(sys.argv) > 1 else "lists"
    if step == "lists":
        lists()
    elif step == "me":
        me_details()
    else:
        raise SystemExit(f"unknown step {step}")


if __name__ == "__main__":
    main()
