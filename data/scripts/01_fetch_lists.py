"""Fetch Parlament filter lists: 81 (Ministerialentwuerfe) and 142 (Stellungnahmen to MEs).

Outputs (data/raw/parlament, gitignored: submitter strings contain citizen names):
  me_list_raw.jsonl       one row per ME, GP XXIII..XXVIII
  snme_list_raw.jsonl     one row per Stellungnahme to an ME, GP XXIII..XXVIII (raw submitter text)
"""
from __future__ import annotations

import html
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # -I drops the script dir
from common import RAW, filter_list, write_jsonl

OUT = RAW / "parlament"
OUT.mkdir(parents=True, exist_ok=True)

GPS = ["XXIII", "XXIV", "XXV", "XXVI", "XXVII", "XXVIII"]


def rows_as_dicts(resp):
    names = []
    for i, h in enumerate(resp["header"]):
        names.append(h.get("feld_name") or h.get("label") or f"c{i}")
    # disambiguate duplicate labels
    seen = {}
    out_names = []
    for n in names:
        seen[n] = seen.get(n, 0) + 1
        out_names.append(n if seen[n] == 1 else f"{n}_{seen[n]}")
    return [dict(zip(out_names, r)) for r in resp["rows"]]


def main():
    refresh = "--refresh" in sys.argv
    me = filter_list(81, {"GP_CODE": GPS}, refresh=refresh)
    print("list 81:", me["count"], "rows; header:", [h.get("feld_name") or h.get("label") for h in me["header"]])
    me_rows = rows_as_dicts(me)
    write_jsonl(OUT / "me_list_raw.jsonl", me_rows)

    me_counts = {}
    for r in me_rows:
        me_counts.setdefault(r["GP_CODE"], {})[int(r["INR"])] = int(r["Stellungnahmen"] or 0)

    CAP = 95000
    sn_all = []
    truncated = []
    for gp in GPS:
        resp = filter_list(142, {"BEZUG_GP_CODE": [gp], "BEZUG_ITYP": ["ME"]}, refresh=refresh)
        print(f"list 142 {gp}: count={resp['count']} rows={len(resp['rows'])}")
        responses = [resp]
        if resp["count"] > len(resp["rows"]):
            # 100k row cap: split into batches of MEs whose statement counts sum below CAP
            responses = []
            batch, tot = [], 0
            big = []
            for inr, c in sorted(me_counts.get(gp, {}).items()):
                if c > CAP:
                    big.append(inr)
                    continue
                if tot + c > CAP and batch:
                    responses.append(filter_list(142, {"BEZUG_GP_CODE": [gp], "BEZUG_ITYP": ["ME"], "BEZUG_INR": batch}, refresh=refresh))
                    batch, tot = [], 0
                batch.append(inr)
                tot += c
            if batch:
                responses.append(filter_list(142, {"BEZUG_GP_CODE": [gp], "BEZUG_ITYP": ["ME"], "BEZUG_INR": batch}, refresh=refresh))
            for inr in big:
                for typ in ("I", "P"):
                    rr = filter_list(142, {"BEZUG_GP_CODE": [gp], "BEZUG_ITYP": ["ME"], "BEZUG_INR": [inr], "TYP": [typ]}, refresh=refresh)
                    if rr["count"] > len(rr["rows"]):
                        truncated.append((gp, inr, typ, rr["count"], len(rr["rows"])))
                    responses.append(rr)
            for rr in responses:
                if rr["count"] > len(rr["rows"]) and not any(t[3] == rr["count"] for t in truncated):
                    truncated.append((gp, "batch", "*", rr["count"], len(rr["rows"])))
            print(f"  split into {len(responses)} requests, rows={sum(len(x['rows']) for x in responses)}")
        seen = set()
        for resp in responses:
            for r in rows_as_dicts(resp):
                key = (r["GP_CODE"], r["ITYP"], r["INR"])
                if key in seen:
                    continue
                seen.add(key)
                a = r.get("Von") or ""
                m = re.search(r'href="([^"]+)"[^>]*>(.*?)</a>', a, re.S)
                txt = html.unescape(m.group(2)) if m else html.unescape(re.sub("<[^>]+>", "", a))
                link = m.group(1) if m else None
                cit = re.search(r"\(([^()]*?/SN-[^()]*?)\)\s*$", txt.strip())
                submitter = txt.strip()
                if cit:
                    submitter = submitter[: cit.start()].strip()
                sn_all.append({
                    "gp": r["GP_CODE"],
                    "ityp": r["ITYP"],
                    "inr": r["INR"],
                    "date": r["DATUM"],
                    "submitter_raw": submitter.replace("\xa0", " ").strip(),
                    "submitter_type": r.get("TYP"),
                    "citation": r.get("Nr"),
                    "me_gp": r["BEZUG_GP_CODE"],
                    "me_inr": int(r["BEZUG_INR"]) if r.get("BEZUG_INR") else None,
                    "me_ityp": r["BEZUG_ITYP"],
                    "me_citation": r.get("Zu"),
                    "endorsements": r.get("Unterstützungen"),
                    "url": link,
                })
    print("truncated responses (rows lost):", truncated)
    n = write_jsonl(OUT / "snme_list_raw.jsonl", sn_all)
    print("wrote", n, "statement rows")


if __name__ == "__main__":
    main()
