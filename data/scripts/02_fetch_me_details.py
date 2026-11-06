"""Fetch the detail JSON for every ME (GP XXIII..XXVIII) and derive the health flag.

Output: data/derived/me_index.jsonl, one row per ME with
  gp, me_inr, me_citation, title, ressort, ministry, einlangen, frist, n_statements,
  topics, headwords (Schlagworte), eurovoc, health (bool), health_reason
Join key for forecasting/: (gp, me_inr).
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # -I drops the script dir
from common import DERIVED, PARL, RAW, get_json, read_jsonl, write_jsonl

# Ressort codes of the health ministry over time (and its social-affairs merger periods)
HEALTH_RESSORTS = {"BMG", "BMGF", "BMGFJ", "BMASGK", "BMSGPK", "BMASGPK", "BMGSK"}
HEALTH_TOPICS = {"Gesundheit"}
HEALTH_EUROVOC = re.compile(
    r"Gesundheit|Krank|Arzt|ärzt|Medizin|Arznei|Pharma|Apothe|Pflege|Spital|Patient|Impf|"
    r"Epidemi|Seuche|Sozialversicherung|soziale Sicherheit|Psycho|Zahn|Hebamm|Rettung|"
    r"Lebensmittel|Drogen|Sucht|Tabak|Blut|Transplant|Gentechn|Fortpflanzung|Organ",
    re.I,
)
HEALTH_TITLE = re.compile(
    r"Gesundheit|Kranken|Ärzte|Arzt|Medizin|Arznei|Apothek|Pflege|Patient|Primärversorg|"
    r"ASVG|GSVG|BSVG|B-KUVG|Sozialversicherung|Epidemie|COVID|Impf|Hebamm|Sanität|"
    r"Psychotherap|Zahnärzt|ELGA|Telematik|Suchtmittel|Tabak|Blut|Organtransplant|"
    r"Fortpflanzung|Gentechnik|MTD|Rezept|Hospiz|Palliativ|Zielsteuerung|Krankenanstalt|KAKuG",
    re.I,
)


def bubbles(c, key):
    try:
        return [b["label"] for b in c[key]["data"]["bubbles"]]
    except (KeyError, TypeError):
        return []


def main():
    me_rows = list(read_jsonl(RAW / "parlament" / "me_list_raw.jsonl"))
    out = []
    for i, r in enumerate(sorted(me_rows, key=lambda r: (r["GP_CODE"], int(r["INR"])))):
        gp, inr = r["GP_CODE"], int(r["INR"])
        d = get_json(f"{PARL}/gegenstand/{gp}/ME/{inr}?json=TRUE", subdir="me_detail")
        c = (d or {}).get("content") or {}
        topics = bubbles(c, "topics")
        sw = bubbles(c, "headwords")
        ev = bubbles(c, "eurovoc")
        ressort = (r.get("MIN") or "").strip()
        reasons = []
        if ressort in HEALTH_RESSORTS:
            reasons.append("ressort")
        if HEALTH_TOPICS & set(topics):
            reasons.append("topic")
        if any(HEALTH_EUROVOC.search(x) for x in ev + sw):
            reasons.append("eurovoc_sw")
        if HEALTH_TITLE.search(r.get("Betreff") or ""):
            reasons.append("title")
        # health = issued by health ministry, or tagged Gesundheit, or (keyword in tags AND title)
        health = ("ressort" in reasons) or ("topic" in reasons) or (
            "eurovoc_sw" in reasons and "title" in reasons
        )
        docs = []
        for g in c.get("documents") or []:
            for dd in g.get("documents") or []:
                docs.append({"title": g.get("title"), "link": dd.get("link"), "type": dd.get("type")})
        out.append({
            "gp": gp,
            "me_inr": inr,
            "me_citation": r.get("Nr."),
            "title": r.get("Betreff"),
            "ressort": ressort,
            "ministry": r.get("Ministerium"),
            "einlangen": r.get("Einlangen"),
            "frist": r.get("Frist"),
            "doktyp": r.get("DOKTYP"),
            "n_statements_parl": r.get("Stellungnahmen"),
            "topics": topics,
            "headwords": sw,
            "eurovoc": ev,
            "health": health,
            "health_reason": reasons,
            "documents": docs,
            "url": f"{PARL}/gegenstand/{gp}/ME/{inr}",
            "detail_ok": bool(c),
        })
        if i % 100 == 0:
            print(i, gp, inr, flush=True)
    n = write_jsonl(DERIVED / "me_index.jsonl", out)
    print("wrote", n, "MEs;", sum(o["health"] for o in out), "health-related")


if __name__ == "__main__":
    main()
