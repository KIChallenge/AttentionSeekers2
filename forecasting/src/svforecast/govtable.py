"""Dated table of Austrian federal governments and legislative periods, 2007 to 2026.

Institutions only (parties, ministries); no person names (CON-1/CON-2), so governments
are keyed by their start date.

Source for government start/end dates and party composition:
  Bundeskanzleramt, "Regierungen seit 1945",
  https://www.bundeskanzleramt.gv.at/bundeskanzleramt/geschichte/regierungen-seit-1945
  (fetched 2026-11-05).
One date is not on that page: the coalition ended on 2019-05-22 when the FPOe ministers
left and were replaced by non-party experts; the page lists the 2017 government until
2019-05-28 and the caretaker government from 2019-06-03. We code 2019-05-22 to 2020-01-07
as "caretaker" (no working coalition majority). The 2019-05-28 to 2019-06-03 interval was
an interim administration and is coded the same way.

Legislative periods (GP) come from the Parlament open data itself (GP_CODE on every
item), so the table below is only used for date-to-GP lookups on new descriptors.
"""

from __future__ import annotations

from dataclasses import dataclass

SOURCE_GOV = "https://www.bundeskanzleramt.gv.at/bundeskanzleramt/geschichte/regierungen-seit-1945"


@dataclass(frozen=True)
class Government:
    gov_id: str
    start: str  # ISO date, inclusive
    end: str  # ISO date, exclusive
    parties: tuple[str, ...]
    coalition: str  # coarse coalition type used as a forecasting feature
    note: str = ""


GOVERNMENTS: list[Government] = [
    Government("gov_2007-01-11", "2007-01-11", "2008-12-02", ("SPÖ", "ÖVP"), "spoe_oevp"),
    Government("gov_2008-12-02", "2008-12-02", "2013-12-16", ("SPÖ", "ÖVP"), "spoe_oevp"),
    Government("gov_2013-12-16", "2013-12-16", "2016-05-17", ("SPÖ", "ÖVP"), "spoe_oevp"),
    Government("gov_2016-05-17", "2016-05-17", "2017-12-18", ("SPÖ", "ÖVP"), "spoe_oevp",
               "snap election called May 2017; coalition formally in office until 2017-12-18"),
    Government("gov_2017-12-18", "2017-12-18", "2019-05-22", ("ÖVP", "FPÖ"), "oevp_fpoe"),
    Government("gov_2019-05-22", "2019-05-22", "2020-01-07", (), "caretaker",
               "coalition ended 2019-05-22; interim then expert caretaker government from 2019-06-03"),
    Government("gov_2020-01-07", "2020-01-07", "2021-10-11", ("ÖVP", "Grüne"), "oevp_gruene"),
    Government("gov_2021-10-11", "2021-10-11", "2021-12-06", ("ÖVP", "Grüne"), "oevp_gruene"),
    Government("gov_2021-12-06", "2021-12-06", "2025-01-10", ("ÖVP", "Grüne"), "oevp_gruene"),
    Government("gov_2025-01-10", "2025-01-10", "2025-03-03", ("ÖVP", "Grüne"), "oevp_gruene",
               "interim government after the 2024 election"),
    Government("gov_2025-03-03", "2025-03-03", "9999-12-31", ("ÖVP", "SPÖ", "NEOS"), "oevp_spoe_neos"),
]

# Legislative periods of the Nationalrat (constituent session dates), for lookups only.
GP_STARTS = [
    ("XXIII", "2006-10-30"), ("XXIV", "2008-10-28"), ("XXV", "2013-10-29"),
    ("XXVI", "2017-11-09"), ("XXVII", "2019-10-23"), ("XXVIII", "2024-10-24"),
]

# Health ministry lineage (Ressort codes as used in Parlament list 81).
HEALTH_MINISTRIES = {
    "BMGFJ": "Gesundheit, Familie und Jugend (2007-2008)",
    "BMG": "Gesundheit (2008-2016)",
    "BMGF": "Gesundheit und Frauen (2016-2017)",
    "BMASGK": "Arbeit, Soziales, Gesundheit und Konsumentenschutz (2018-2019)",
    "BMSGPK": "Soziales, Gesundheit, Pflege und Konsumentenschutz (2020-2025)",
    "BMASGPK": "Arbeit, Soziales, Gesundheit, Pflege und Konsumentenschutz (2025-)",
}
# Social ministries that held social-insurance law while health sat elsewhere.
SOCIAL_MINISTRIES = {"BMSK", "BMASK"}


def government_at(date_iso: str) -> Government:
    for g in GOVERNMENTS:
        if g.start <= date_iso < g.end:
            return g
    raise ValueError(f"no government for {date_iso}")


def gp_at(date_iso: str) -> str:
    cur = None
    for gp, start in GP_STARTS:
        if date_iso >= start:
            cur = gp
    if cur is None:
        raise ValueError(date_iso)
    return cur


def proposer_group(ressort: str | None) -> str:
    if ressort in HEALTH_MINISTRIES:
        return "health_ministry"
    if ressort in SOCIAL_MINISTRIES:
        return "social_ministry"
    if ressort == "BMF":
        return "finance_ministry"
    return "other_ministry"
