"""Health-scope rule for Ministerialentwuerfe. Part of PREREGISTRATION.md (v1.0, amended by Deviation 1, 2026-11-05).

Rule v1.1. An ME is in scope when, on its title (with veterinary words removed first):
  - HEALTH_RE matches, or
  - SV_RE matches and the proposer is a health or social ministry, or
  - the proposer is a pure health ministry (BMGFJ, BMG, BMGF) and the title is not
    veterinary, food, gene-technology or family/youth law (NON_HEALTH_RE).
Pure veterinary and food-safety drafts are therefore out unless they also touch human health law
(e.g. "Tierarzneimittelgesetz; Arzneimittelgesetz" stays in because of the second law).
"""

from __future__ import annotations

import re

from .govtable import HEALTH_MINISTRIES, SOCIAL_MINISTRIES

HEALTH_RE = re.compile(
    r"gesundheit|kranken|ärzt|arzt|arznei|apothek|rezept|medizin|patient|spital|"
    r"(?<!rechts)pflege(?!geld)|epidemie|impf|covid|sucht|tabak|nichtraucher|transplant|blut|gewebe|"
    r"psycho|hebamme|\bmtd|sanitäter|kuranstalt|elga|telematik|e-card|hospiz|palliativ|"
    r"\bivf|fortpflanzung|primärversorgung|zielsteuerung|tuberkulose|strahlenschutz|"
    r"gukg|kakug|patvg|gbrg|dokug|dokugesetz|\bota-|kind-pass|musiktherap|bäderhygiene|gehaltskasse|"
    r"sanitätsrat|sozialrechts-änderung",
    re.I,
)
SV_RE = re.compile(
    r"sozialversicherung|\basvg\b|\bgsvg\b|\bbsvg\b|b-kuvg|krankenversicherung|"
    r"dachverband|hauptverband|notarversicherung|allgemeine[sn]? sozialversicherungsgesetz",
    re.I,
)
# Pure health ministries: everything is in scope except veterinary, food and family/youth law.
PURE_HEALTH = {"BMGFJ", "BMG", "BMGF"}
NON_HEALTH_RE = re.compile(
    r"\btier|veterinär|seuche|lebensmittel|lmsvg|bio-durchführung|tierischer|eu-qualitätsregelungen|"
    r"familienlasten|kinder- und jugendhilfe|gentechnik",
    re.I,
)
# Remove veterinary compounds before matching, so "Tierarzneimittel" or "Tierärztegesetz" do not hit.
VET_STRIP_RE = re.compile(r"\btier\w*|veterinär\w*", re.I)


def scope_reasons(title: str, description: str, topics: list[str], ressort: str | None) -> list[str]:
    """Rule v1.1 (Deviation 1 in PREREGISTRATION.md): match on the TITLE only.

    v1.0 also matched the long description and THEMEN == "Gesundheit". The THEMEN value does not
    exist (the real label is "Gesundheit und Ernaehrung", which also covers food and veterinary
    law), so that clause never fired; the description clause pulled in tax, labour and pension
    omnibus drafts that merely list a health statute among dozens of amended laws.
    description and topics are kept in the signature for provenance only.
    """
    text = VET_STRIP_RE.sub(" ", title or "")
    reasons = []
    if HEALTH_RE.search(text):
        reasons.append("health_term")
    if SV_RE.search(text) and (ressort in HEALTH_MINISTRIES or ressort in SOCIAL_MINISTRIES):
        reasons.append("social_insurance_term")
    if ressort in PURE_HEALTH and not NON_HEALTH_RE.search(title or ""):
        reasons.append("pure_health_ministry")
    return reasons
