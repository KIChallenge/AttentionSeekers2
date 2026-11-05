"""Alias table: free-text "Stellungnahme von" -> canonical institution.

Each entry: (canonical_id, label, agent, regex). Matching is case-insensitive on
the submitter string with NBSP normalised. All matching entries are collected
(joint statements exist); the primary institution is the one whose match starts
earliest in the string. Rows that match nothing are NOT institutions of interest,
whatever their count (citizen mass submissions are filtered out this way, not by
frequency).

agent: one of the nine simulator agents, or "other" for relevant non-agent
institutions (AK, WKO, OeGB, IV, Rechnungshof, ...).

Agents:
  bmsgpk               Gesundheitsministerium (BMGFJ, BMG, BMGF, BMASGK, BMSGPK, BMASGPK)
  sv                   Sozialversicherung (Hauptverband/Dachverband and carriers)
  aerztekammer         OeAeK and Landesaerztekammern
  contract_physicians  Kassenaerzte: Bundeskurie niedergelassene Aerzte, Hausaerzte, Allgemeinmedizin, PVE
  elective_physicians  Wahlaerzte associations
  hospitals            hospital operators (Landesgesellschaften, Ordensspitaeler, Privatkrankenanstalten)
  nursing              nursing profession (OeGKV, BKKOe, Pflegedirektionen, Gesundheitsberufe-Gewerkschaft)
  patients             Patientenanwaltschaften, Selbsthilfe umbrella
  laender              the nine Laender governments (one id per Land)
  bmf                  Finanzministerium
"""
from __future__ import annotations

import re

_L = "Landesregierung"

ALIASES: list[tuple[str, str, str, str]] = [
    # ---- Health ministry (all names since 2007) ----
    ("bmsgpk", "Gesundheitsministerium (BMGFJ/BMG/BMGF/BMASGK/BMSGPK/BMASGPK)", "bmsgpk",
     r"\b(BM|Bundesministerium)\s*(f\.|für)\s*(Gesundheit|Arbeit,\s*Soziales,\s*Gesundheit|Soziales,\s*Gesundheit)"),
    ("bmsgpk", "Gesundheitsministerium (BMGFJ/BMG/BMGF/BMASGK/BMSGPK/BMASGPK)", "bmsgpk",
     r"\bBMG(FJ|F)?\b|\bBMASGK\b|\bBMSGPK\b|\bBMASGPK\b"),
    # ---- Finance ministry ----
    ("bmf", "Finanzministerium (BMF)", "bmf", r"\b(BM|Bundesministerium)\s*(f\.|für)\s*Finanzen|^BMF\b"),
    # ---- Social insurance ----
    ("sv_dachverband", "Hauptverband/Dachverband der Sozialversicherungsträger", "sv",
     r"(Haupt|Dach)verband der (österreichischen )?Sozialversicherung"),
    ("sv_oegk_gkk", "ÖGK und Gebiets-/Betriebskrankenkassen", "sv",
     r"Gebietskrankenkasse|Gesundheitskasse|\bÖGK\b|Betriebskrankenkasse|\bBKK\b|\bWGKK\b|\bOÖGKK\b"),
    ("sv_pva", "Pensionsversicherungsanstalt", "sv", r"Pensionsversicherungsanstalt"),
    ("sv_auva", "Allgemeine Unfallversicherungsanstalt", "sv", r"Allgemeine Unfallversicherungsanstalt|\bAUVA\b"),
    ("sv_svs", "SVS / SVA der gewerblichen Wirtschaft / SVB", "sv",
     r"Sozialversicherungsanstalt der (gewerblichen Wirtschaft|Bauern|Selbständigen)|\bSVS\b"),
    ("sv_bvaeb", "BVAEB / BVA / VAEB", "sv",
     r"Versicherungsanstalt (öffentlich Bediensteter|für Eisenbahnen)|\bBVAEB\b"),
    ("sv_other", "Sonstige SV-Träger (VA Notariat, KFA)", "sv",
     r"Versicherungsanstalt des österreichischen Notariates|Krankenfürsorgeanstalt"),
    # ---- Physicians ----
    ("contract_physicians", "Kassenärztliche Vertretungen (Bundeskurie niedergelassene Ärzte, Hausärzte, Allgemeinmedizin, PVE)",
     "contract_physicians",
     r"Kurie niedergelassene|Hausärzteverband|Gesellschaft für Allgemein|Allgemeinmedizin Österreich|\bJAMÖ\b|\bÖGAM\b|"
     r"\bTGAM\b|Forum Primärversorgung|\bOEFOP\b|Initiative für Allgemeinmedizin"),
    ("elective_physicians", "Wahlärzte-Vereinigungen", "elective_physicians", r"Wahl\s*ärzt|Wahlarzt|Privatärzt"),
    ("oeak", "Österreichische Ärztekammer", "aerztekammer", r"Österreichische Ärztekammer|Ärztekammer Österreich"),
    ("aek_land", "Landesärztekammern", "aerztekammer",
     r"Ärztekammer (für )?(Wien|Niederösterreich|Oberösterreich|Steiermark|Kärnten|Tirol|Salzburg|Vorarlberg|Burgenland)|"
     r"Die Ärztekammer Steiermark"),
    # ---- Hospitals ----
    ("hospitals_land", "Landes-Spitalsträger (KAGes, KABEG, Tirol Kliniken, SALK, NÖ LGA, OÖG/gespag, KRAGES, KHBG, WIGEV)",
     "hospitals",
     r"Krankenanstaltengesellschaft|Krankenanstalten-Gesellschaft|Krankenanstalten Gesellschaft|"
     r"Landeskrankenanstalten|Tirol Kliniken|\bTILAK\b|Landeskliniken|\bKAGes\b|\bKABEG\b|\bKRAGES\b|gespag|"
     r"Gesundheits- und Spitals-AG|Gesundheitsholding|Landesgesundheitsagentur|Krankenhaus-Betriebsges|"
     r"Krankenhausbetriebsgesellschaft|Wiener Gesundheitsverbund|Krankenanstaltenverbund|Krankenanstalten der Stadt Wien|"
     r"Krankenhaus der Stadt Linz|Kepler Universitätsklinikum|Landeskrankenhaus|Universitätskliniken Innsbruck"),
    ("hospitals_other", "Ordens- und Privatspitäler (konfessionelle Spitalserhalter, Privatkrankenanstalten)", "hospitals",
     r"Spitalserhalter|Konfessionelle Krankenanstalten|Privatkrankenanstalten|Barmherzige Brüder|Vinzenz Gruppe|"
     r"Elisabethinen|Klinikum Wels|Ordensspitäler|Krankenhaus Mittersill|Krankenhausträger"),
    # ---- Nursing ----
    ("nursing_oegkv", "Österreichischer Gesundheits- und Krankenpflegeverband (ÖGKV)", "nursing",
     r"Gesundheits- und Krankenpflegeverband|\bÖGKV\b"),
    ("nursing_other", "Sonstige Pflege-Berufsverbände (BKKÖ, Pflegekonferenz, Pflegedirektionen, Pflegewissenschaft)",
     "nursing",
     r"Kinderkrankenpflege|Pflegekonferenz|Pflegedirektor|Pflegemanagement Oberösterreich|Pflegewissenschaft|"
     r"Gesundheits- und Krankenpflegeberufe|Berufsverband.*Pflege"),
    ("nursing_union", "ÖGB-Fachgruppenvereinigung Gesundheits- und Sozialberufe", "nursing",
     r"(Fachgruppenvereinigung|FGV)\s*(f\.|für)?\s*(Gesundheits|für Gesundheits)|ARGE[- ]?FGV"),
    # ---- Patients ----
    ("patients_pa", "Patientenanwaltschaften (ARGE und Länder)", "patients",
     r"Patientenanw|Patient\*innen- und Pflegeanw|Patientinnen- und Patientenanw|Patientenvertretung|"
     r"Patienten- und Pflegeanw|Patientenanwält"),
    ("patients_selbsthilfe", "Selbsthilfe-Dachverbände", "patients",
     r"Bundesverband Selbsthilfe|ARGE Selbsthilfe|Arbeitsgemeinschaft Selbsthilfe|netzwerk selbsthilfe"),
    ("patients_vertretungsnetz", "VertretungsNetz (Patientenanwaltschaft Psychiatrie)", "patients", r"Vertretungsnetz"),
    # ---- Laender (one id per Land) ----
    ("land_wien", "Land Wien", "laender",
     r"Wiener " + _L + r"|Magistratsdirektion der Stadt Wien|^Land Wien|Stadt Wien.*Magistratsdirektion|^Magistrat der Stadt Wien"),
    ("land_noe", "Land Niederösterreich", "laender",
     r"(Niederösterreichischen|NÖ|N\.Ö\.|Nö\.) " + _L + r"|^Land Niederösterreich"),
    ("land_ooe", "Land Oberösterreich", "laender",
     r"(Oberösterreichischen|OÖ|Oö\.|O\.Ö\.) " + _L + r"|^Land Oberösterreich"),
    ("land_stmk", "Land Steiermark", "laender", r"Steiermärkischen " + _L + r"|^Land Steiermark"),
    ("land_ktn", "Land Kärnten", "laender", r"Kärntner " + _L + r"|^Land Kärnten"),
    ("land_sbg", "Land Salzburg", "laender", r"Salzburger " + _L + r"|^Land Salzburg"),
    ("land_tirol", "Land Tirol", "laender", r"Tiroler " + _L + r"|^Land Tirol"),
    ("land_vbg", "Land Vorarlberg", "laender", r"Vorarlberger " + _L + r"|^Land Vorarlberg"),
    ("land_bgld", "Land Burgenland", "laender", r"Burgenländischen " + _L + r"|^Land Burgenland"),
    ("laender_vst", "Verbindungsstelle der Bundesländer", "laender", r"Verbindungsstelle der Bundesländer|^Landeshauptleute|Landeshauptleutekonferenz"),
    # ---- Other relevant institutions ----
    ("ak", "Arbeiterkammer (BAK und Länderkammern)", "other",
     r"Bundesarbeitskammer|Bundeskammer für Arbeiter und Angestellte|Kammer für Arbeiter und Angestellte|"
     r"\bAK (Österreich|Wien|Niederösterreich|Oberösterreich|Steiermark|Kärnten|Salzburg|Tirol|Vorarlberg|Burgenland)\b|^AK\b"),
    ("wko", "Wirtschaftskammer (WKÖ und Landeskammern)", "other",
     r"Wirtschaftskammer|\bWKÖ\b|Fachverband der (Gesundheitsbetriebe|Pharma)"),
    ("oegb", "Österreichischer Gewerkschaftsbund", "other", r"Gewerkschaftsbund|Gewerkschaftbund|^ÖGB\b"),
    ("union_health", "Gewerkschaften vida / younion / GPA", "other",
     r"Gewerkschaft vida|\bvida\b|younion|Gewerkschaft der Gemeindebediensteten|Gewerkschaft der Privatangestellten|\bGPA\b"),
    ("iv", "Industriellenvereinigung", "other", r"Industriellen\s*Vereinigung|Industriellenvereinigung"),
    ("rechnungshof", "Rechnungshof", "other", r"Rechnungshof"),
    ("gemeindebund", "Österreichischer Gemeindebund", "other", r"Gemeindebund"),
    ("staedtebund", "Österreichischer Städtebund", "other", r"Städtebund"),
    ("seniorenrat", "Österreichischer Seniorenrat", "other", r"Seniorenrat|Bundesaltenrat"),
    ("apothekerkammer", "Österreichische Apothekerkammer", "other", r"Apothekerkammer"),
    ("zahnaerztekammer", "Österreichische Zahnärztekammer", "other", r"Zahnärztekammer"),
    ("pharma_industry", "Pharmaindustrie (Pharmig, FOPI, Generikaverband)", "other",
     r"Pharmig|\bFOPI\b|forschenden pharmazeutischen|Generikaverband"),
    ("disability", "Behindertenrat / ÖAR / KOBV", "other",
     r"Behindertenrat|Arbeitsgemeinschaft für Rehabilitation|\bÖAR\b|Behindertenverb|\bKOBV\b"),
    ("goeg", "Gesundheit Österreich GmbH", "other", r"Gesundheit Österreich GmbH|\bGÖG\b"),
    ("volksanwaltschaft", "Volksanwaltschaft", "other", r"Volksanwaltschaft"),
    ("mtd_hebammen", "Gesundheitsberufe (MTD-Austria, Hebammengremium, Physio Austria, Ergotherapie)", "other",
     r"medizinisch-technischen Dienste|MTD-Austria|Hebammen|Physio Austria|Ergotherapie Austria|biomed austria|"
     r"Logopäd|Diätolog|Orthoptist|Radiologietechnolog"),
    ("psych_professions", "Psychotherapie- und Psychologenverbände (ÖBVP, BÖP)", "other",
     r"Bundesverband für Psychotherapie|\bÖBVP\b|Berufsverband Österreichischer Psycholog|\bBÖP\b"),
    ("free_welfare", "Freie Wohlfahrt (Caritas, Diakonie, Hilfswerk, Volkshilfe, Rotes Kreuz, Samariterbund)", "other",
     r"Caritas|Diakonie|Hilfswerk|Volkshilfe|Rotes Kreuz|Samariter"),
    ("care_providers", "Pflegeheim- und Sozialträgerverbände (Lebenswelt Heim, Sozialwirtschaft)", "other",
     r"Lebenswelt\s*Heim|Sozialwirtschaft Österreich|Alten- und Pflegeheime|Hospiz Österreich|"
     r"Berufsvereinigung von Arbeitgebern für Gesundheits"),
    ("vki", "Verein für Konsumenteninformation", "other", r"Konsumenteninformation"),
    ("ages", "AGES", "other", r"Agentur für Gesundheit und Ernährungssicherheit|\bAGES\b"),
    ("meduni", "Medizinische Universitäten", "other", r"Medizinische Universität|Medizinischen Universität"),
    ("lwk", "Landwirtschaftskammer Österreich", "other", r"Landwirtschaftskammer|Präsidentenkonferenz der L"),
    ("bka_vd", "Bundeskanzleramt-Verfassungsdienst", "other", r"Bundeskanzleramt.*Verfassungsdienst"),
    ("datenschutz", "Datenschutzbehörde / Datenschutzrat", "other", r"Datenschutzbehörde|Datenschutzrat|Datenschutzkommission"),
]

_COMPILED = [(cid, label, agent, re.compile(rx, re.I)) for cid, label, agent, rx in ALIASES]
LABELS = {cid: label for cid, label, _, _ in ALIASES}
AGENT_OF = {cid: agent for cid, _, agent, _ in ALIASES}

# Specific sub-organisations that win over their parent when both match
PRIORITY = {"nursing_union", "union_health", "contract_physicians", "elective_physicians", "patients_pa"}

# Exclusions: matched text that is not the institution (e.g. a school-board or a vet chamber)
_EXCLUDE = re.compile(r"Tierärzt|Landesschulrat|Landesverwaltungsgericht|Schulärzt", re.I)


def normalise(raw: str) -> str:
    return re.sub(r"\s+", " ", (raw or "").replace("\xa0", " ")).strip()


def match(raw: str):
    """Return (primary_id, [all ids]) or (None, [])."""
    s = normalise(raw)
    if not s or _EXCLUDE.search(s):
        return None, []
    hits = {}
    for cid, _, _, rx in _COMPILED:
        m = rx.search(s)
        if m and (cid not in hits or m.start() < hits[cid]):
            hits[cid] = m.start()
    if not hits:
        return None, []
    ordered = sorted(hits, key=lambda c: (c not in PRIORITY, hits[c]))
    return ordered[0], ordered


def is_institutional(raw: str, typ: str | None) -> bool:
    """TYP 'I' rows are institutional submissions. TYP 'P' rows are accepted only when the
    string has no 'Surname, Firstname' / 'Name; Org' structure (e.g. a misfiled association)."""
    if typ != "P":
        return True
    return not re.search(r"[,;*]", normalise(raw))
