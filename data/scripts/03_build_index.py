"""Join statements with the alias table and the ME index; count per institution.

Inputs:  raw/parlament/snme_list_raw.jsonl, derived/me_index.jsonl
Outputs (derived, contain no person names):
  stellungnahmen_index.jsonl   one row per alias-matched institutional Stellungnahme
  counts_institutions.csv      per canonical institution: all MEs vs health MEs
  counts_agents.csv            per simulator agent
  me_index.jsonl               rewritten with health_core / health_broad flags

Health definition (per ME):
  health_core  = issued by a health-only ministry (BMGFJ, BMG, BMGF), or Parlament topic
                 "Gesundheit", or (merged social+health ministry BMASGK/BMSGPK/BMASGPK and a
                 health keyword in title or tags), or (health keyword in title AND in eurovoc/SW)
  health_broad = health_core, or any ME of a ministry holding the health portfolio, or
                 social-insurance law (ASVG/GSVG/BSVG/B-KUVG, eurovoc "soziale Sicherheit")
"""
from __future__ import annotations

import csv
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # -I drops the script dir
from aliases import AGENT_OF, LABELS, is_institutional, match
from common import DERIVED, PARL, RAW, read_jsonl, write_jsonl

HEALTH_ONLY_MIN = {"BMG", "BMGF", "BMGFJ"}
MERGED_MIN = {"BMASGK", "BMSGPK", "BMASGPK"}
HEALTH_KW = re.compile(
    r"Gesundheit|Kranken|Ärzt|Arzt|ärztl|Medizin|Arznei|Apothek|Pflege|Patient|Primärversorg|Spital|"
    r"Epidemie|COVID|Impf|Hebamm|Sanität|Psychotherap|Psycholog|Zahnärzt|ELGA|Telematik|Suchtmittel|Sucht|Tabak|"
    r"Nichtraucher|Blut|Organtransplant|Fortpflanzung|Gentechnik|MTD|Rezept|Hospiz|Palliativ|Zielsteuerung|"
    r"KAKuG|Rettung|Lebensmittel|Gewebe|Pandemie|Seuche|Heilmittel|Medizinprodukt|Physiotherap|Kardiotechn|"
    r"Sanitäter|Ernährung|Drogen|Krebs|Diagnose|Therapie|Rehabilitation|Kur",
    re.I,
)
# portfolio items the health ministry held that are not health policy (animal welfare, family, youth)
NON_HEALTH = re.compile(r"Tierschutz|Tierärzt|Tierseuchen|Tiergesundheit|Kinderbetreuungsgeld|Familienlastenausgleich|"
                        r"Jugendschutz|Bundes-Jugendförderung|Mutterschutz|Väter-Karenz|Familienzeitbonus|Fleischuntersuchung|"
                        r"Futtermittel|Zoonose", re.I)
SV_KW = re.compile(r"\bASVG\b|\bGSVG\b|\bBSVG\b|B-KUVG|Sozialversicherung|soziale Sicherheit", re.I)


def health_flags(me):
    tags = me["topics"] + me["headwords"] + me["eurovoc"]
    title = me["title"] or ""
    kw_title = bool(HEALTH_KW.search(title))
    kw_tags = any(HEALTH_KW.search(t) for t in tags)
    reasons = []
    if me["ressort"] in HEALTH_ONLY_MIN:
        reasons.append("health_ministry")
    if "Gesundheit" in me["topics"]:
        reasons.append("topic_gesundheit")
    if me["ressort"] in MERGED_MIN and (kw_title or kw_tags):
        reasons.append("merged_ministry+keyword")
    if kw_title and kw_tags:
        reasons.append("keyword_title+tags")
    if NON_HEALTH.search(title) and not re.search(r"Ärztegesetz|Arzneimittelgesetz\b|Apotheken", title):
        reasons = []
    core = bool(reasons)
    broad = core or me["ressort"] in MERGED_MIN or bool(SV_KW.search(title)) or any(SV_KW.search(t) for t in tags)
    return core, broad, reasons


def main():
    mes = {}
    rows = []
    for me in read_jsonl(DERIVED / "me_index.jsonl"):
        core, broad, reasons = health_flags(me)
        me["health_core"], me["health_broad"], me["health_reason"] = core, broad, reasons
        me.pop("health", None)
        mes[(me["gp"], me["me_inr"])] = me
        rows.append(me)
    write_jsonl(DERIVED / "me_index.jsonl", rows)
    print(f"MEs: {len(rows)}, health_core {sum(r['health_core'] for r in rows)}, health_broad {sum(r['health_broad'] for r in rows)}")

    out = []
    n_total = n_inst_type = n_matched = 0
    for r in read_jsonl(RAW / "parlament" / "snme_list_raw.jsonl"):
        n_total += 1
        if r["submitter_type"] != "P":
            n_inst_type += 1
        if not is_institutional(r["submitter_raw"], r["submitter_type"]):
            continue
        primary, all_ids = match(r["submitter_raw"])
        if not primary:
            continue
        n_matched += 1
        me = mes.get((r["me_gp"], r["me_inr"]), {})
        out.append({
            "gp": r["gp"],
            "snme_inr": r["inr"],
            "citation": r["citation"],
            "date": r["date"],
            "institution_id": primary,
            "institution": LABELS[primary],
            "agent": AGENT_OF[primary],
            "co_institutions": [i for i in all_ids if i != primary],
            "me_gp": r["me_gp"],
            "me_inr": r["me_inr"],
            "me_citation": r["me_citation"],
            "me_title": me.get("title"),
            "me_ressort": me.get("ressort"),
            "health_core": me.get("health_core", False),
            "health_broad": me.get("health_broad", False),
            "url": f"{PARL}/gegenstand/{r['gp']}/SNME/{r['inr']}",
        })
    write_jsonl(DERIVED / "stellungnahmen_index.jsonl", out)
    print(f"statements: total {n_total}, TYP=I {n_inst_type}, alias-matched {n_matched}")

    # counts
    stat = defaultdict(lambda: {"all": 0, "core": 0, "broad": 0, "mes_all": set(), "mes_core": set(), "years": set()})
    for r in out:
        for key in (r["institution_id"], "AGENT:" + r["agent"]):
            s = stat[key]
            s["all"] += 1
            s["mes_all"].add((r["me_gp"], r["me_inr"]))
            s["years"].add(r["date"][-4:])
            if r["health_core"]:
                s["core"] += 1
                s["mes_core"].add((r["me_gp"], r["me_inr"]))
            if r["health_broad"]:
                s["broad"] += 1

    def row(key):
        s = stat[key]
        ys = sorted(s["years"])
        return [s["all"], s["core"], s["broad"], len(s["mes_all"]), len(s["mes_core"]), f"{ys[0]}-{ys[-1]}" if ys else ""]

    with open(DERIVED / "counts_institutions.csv", "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["institution_id", "institution", "agent", "n_all", "n_health_core", "n_health_broad",
                    "n_mes_all", "n_mes_health_core", "years"])
        for cid in sorted((k for k in stat if not k.startswith("AGENT:")), key=lambda k: -stat[k]["core"]):
            w.writerow([cid, LABELS[cid], AGENT_OF[cid]] + row(cid))
    agents = ["bmsgpk", "sv", "aerztekammer", "contract_physicians", "elective_physicians", "hospitals",
              "nursing", "patients", "laender", "bmf", "other"]
    with open(DERIVED / "counts_agents.csv", "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["agent", "n_all", "n_health_core", "n_health_broad", "n_mes_all", "n_mes_health_core", "years"])
        for a in agents:
            w.writerow([a] + (row("AGENT:" + a) if "AGENT:" + a in stat else [0, 0, 0, 0, 0, ""]))
    print(open(DERIVED / "counts_agents.csv").read())


if __name__ == "__main__":
    main()
