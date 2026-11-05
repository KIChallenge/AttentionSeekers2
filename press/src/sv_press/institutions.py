"""Agent institutions: alias table, FTS5 queries, topic keywords, position markers.

Codes and roles follow packages/contracts/src/catalog.ts (AGENT_CATALOG) and the Role enum in
primitives.ts. Wahlärzte have a role but no catalog entry; they get code "WA".

FTS terms are matched by the archive's `unicode61 remove_diacritics 2` tokenizer, so umlauts and
case do not matter there, and hyphenated compounds split into tokens ("Ärztekammer-Präsident" is
two tokens). The regexes re-find the alias inside the page text to cut the passage window.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Inst:
    key: str
    code: str
    role: str
    name_de: str
    gloss_en: str
    fts: tuple[str, ...]                 # FTS5 terms (prefix* allowed, "phrases" allowed)
    alias: str                           # regex (case-insensitive) locating the institution in text
    require_topic: bool = True           # broad aliases need a health topic in the window
    extra_topic_fts: tuple[str, ...] = field(default_factory=tuple)

    @property
    def rx(self) -> re.Pattern:
        return re.compile(self.alias, re.I)


INSTITUTIONS: list[Inst] = [
    Inst("sv", "SV", "social_insurance", "Sozialversicherung", "Social insurance (Dachverband, ÖGK)",
         ("Sozialversicherung*", "Dachverband*", "Hauptverband*", "ÖGK", "Gesundheitskasse*", "Gebietskrankenkasse*",
          "GKK", "Krankenkasse*", "AUVA", "SVS", "BVAEB", "Sozialversicherungsträger*"),
         r"\b(Sozialversicherung\w*|Dachverband\w*|Hauptverband\w*|ÖGK|Österreichische\w* Gesundheitskasse|"
         r"Gesundheitskasse\w*|Gebietskrankenkasse\w*|\w*GKK|Krankenkasse\w*|AUVA|SVS|BVAEB|Kassen)\b"),
    Inst("gm", "GM", "ministry_health", "Gesundheitsministerium", "Federal Ministry of Health",
         ("Gesundheitsministerium", "Gesundheitsministeriums", "Sozialministerium", "Sozialministeriums",
          "BMSGPK", "BMASGK", "BMGF", "BMG", "Gesundheitsressort*", "Gesundheitsminister*", "Sozialminister*"),
         r"\b(Gesundheitsministeri\w*|Sozialministeri\w*|BMSGPK|BMASGK|BMASGPK|BMGF|BMG|Gesundheitsressort\w*|"
         r"Gesundheitsminister\w*|Sozialminister\w*)\b"),
    Inst("aek", "ÄK", "medical_chamber", "Ärztekammer", "Medical Chamber",
         ("Ärztekammer*", "ÖÄK", "Kurie", "Kurienobmann", "Bundeskurie", "Ärztevertreter*", "Standesvertretung*"),
         r"\b(Ärztekammer\w*|ÖÄK|\w*[Kk]urie\w*|Ärztevertret\w*|Standesvertret\w*)\b"),
    Inst("va", "VÄ", "contract_physicians", "Vertragsärzt:innen", "Contracted physicians",
         ("Kassenarzt", "Kassenärzte*", "Kassenärztin*", "Vertragsarzt", "Vertragsärzte*", "Vertragsärztin*",
          "Hausärzteverband", "Allgemeinmediziner*", "\"niedergelassene Ärzte\"", "\"niedergelassenen Ärzte\""),
         r"\b(Kassen(?:arzt|ärzt\w*)|Vertrags(?:arzt|ärzt\w*)|Hausärzteverband|Allgemeinmediziner\w*|"
         r"niedergelassene\w* (?:Ärzt\w*|Kurie))\b"),
    Inst("wa", "WA", "elective_physicians", "Wahlärzt:innen", "Elective (out-of-network) physicians",
         ("Wahlarzt", "Wahlärzte*", "Wahlärztin*", "Wahlarztpraxis", "Wahlarztpraxen"),
         r"\b(Wahl(?:arzt\w*|ärzt\w*))\b", require_topic=False),
    Inst("ka", "KA", "hospitals", "Krankenanstalten", "Hospital operators",
         ("Spitalsträger*", "Spitalserhalter*", "Spitalsbetreiber*", "Krankenanstaltenverbund", "KAV",
          "Gesundheitsverbund", "KAGes", "\"Tirol Kliniken\"", "gespag", "Landesgesundheitsagentur", "Landeskliniken*",
          "SALK", "KABEG", "Ordensspitäler*", "\"Vinzenz Gruppe\"", "Spitalsholding"),
         r"\b(Spitals(?:träger|erhalter|betreiber|holding)\w*|Krankenanstaltenverbund\w*|KAV|Gesundheitsverbund\w*|"
         r"KAGes|Tirol Kliniken|gespag|Landesgesundheitsagentur|Landeskliniken\w*|SALK|KABEG|Ordensspit\w*|"
         r"Vinzenz Gruppe)\b"),
    Inst("pf", "PF", "nursing", "Pflegevertretung", "Nursing representation",
         ("ÖGKV", "Pflegeverband", "Krankenpflegeverband", "\"Berufsverband Pflege\"", "Pflegegewerkschaft",
          "Hilfswerk", "Volkshilfe", "Caritas", "Diakonie", "Pflegevertret*", "Pflegeberufe*"),
         r"\b(ÖGKV|\w*[Pp]flegeverband\w*|Berufsverband Pflege|Pflegegewerkschaft|Hilfswerk\w*|Volkshilfe|Caritas|"
         r"Diakonie|Pflegevertret\w*|Pflegeberufe\w*)\b"),
    Inst("pv", "PV", "patients", "Patientenvertretung", "Patient advocacy",
         ("Patientenanwaltschaft*", "Patientenanwalt", "Patientenanwältin", "Patientenanwälte",
          "Patientenombudsmann", "Patientenombudsfrau", "Patientenvertretung*", "Selbsthilfe*"),
         r"\b(Patientenanw\w*|Patientenombuds\w*|Patientenvertret\w*|Selbsthilfe\w*)\b", require_topic=False),
    Inst("bl", "BL", "laender", "Bundesländer", "Federal states (Länder)",
         ("Länder", "Bundesländer", "Landesregierung*", "Landeshauptleutekonferenz", "Landesgesundheitsreferent*",
          "Landesgesundheitsfonds", "Gesundheitsreferent*"),
         r"\b(Länder|Bundesländer\w*|Landesregierung\w*|Landeshauptleutekonferenz|Landesgesundheitsreferent\w*|"
         r"Landesgesundheitsfonds|Gesundheitsreferent\w*)\b"),
    Inst("fm", "FM", "ministry_finance", "Finanzministerium", "Federal Ministry of Finance",
         ("Finanzministerium", "Finanzministeriums", "BMF", "Finanzminister*", "Finanzressort*"),
         r"\b(Finanzministeri\w*|BMF|Finanzminister\w*|Finanzressort\w*)\b"),
    Inst("abk", "AK", "chamber_labour", "Arbeiterkammer", "Chamber of Labour",
         ("Arbeiterkammer*", "Bundesarbeitskammer", "AK"),
         r"\b(Arbeiterkammer\w*|Bundesarbeitskammer|AK)\b"),
    Inst("wk", "WK", "chamber_commerce", "Wirtschaftskammer", "Chamber of Commerce",
         ("Wirtschaftskammer*", "WKÖ", "WKO"),
         r"\b(Wirtschaftskammer\w*|WKÖ|WKO)\b"),
    Inst("ip", "IP", "industry_pharma", "Industrie/Pharma", "Industry and pharma",
         ("Pharmig", "Pharmaindustrie", "Pharmawirtschaft", "Pharmaunternehmen", "Pharmakonzern*",
          "Industriellenvereinigung", "FOPI", "Generikaverband", "Pharmabranche"),
         r"\b(Pharmig|Pharma(?:industrie|wirtschaft|unternehmen|konzern\w*|branche)|Industriellenvereinigung|FOPI|"
         r"Generikaverband)\b"),
]
BY_KEY = {i.key: i for i in INSTITUTIONS}
BY_ROLE = {i.role: i for i in INSTITUTIONS}

# --------------------------------------------------------------------------- topics

TOPICS: dict[str, tuple[str, tuple[str, ...], str]] = {
    # key: (label, fts terms, regex)
    "wartezeiten": ("Wartezeiten", ("Wartezeit*", "Wartelist*", "Termingarantie", "Facharzttermin*"),
                    r"Wartezeit|Warteliste|Termingarantie|Facharzttermin|Terminservice"),
    "kassenstellen": ("Kassenstellen und Ärztemangel",
                      ("Kassenstelle*", "Kassenvertrag*", "Kassenplanstelle*", "Ärztemangel", "Landarzt*", "Planstelle*",
                       "Stellenplan*"),
                      r"Kassenstelle|Kassenvertr|Kassenplanstelle|Ärztemangel|Landarzt|Landärzt|Planstelle|Stellenplan|"
                      r"unbesetzt"),
    "primaerversorgung": ("Primärversorgung", ("Primärversorgung*", "PVE", "PHC", "Gruppenpraxis*",
                                               "Hausarztmedizin", "Primärversorgungszentr*"),
                          r"Primärversorgung|\bPVE\b|\bPHC\b|Gruppenpraxis|Hausarztmedizin|Ärztezentr"),
    "telemedizin": ("Telemedizin und Digitalisierung",
                    ("Telemedizin*", "ELGA", "\"e-card\"", "Digitalisierung*", "1450", "Rezept*",
                     "Gesundheitsakte*", "Telefonberatung"),
                    r"Telemedizin|ELGA|e-card|E-Card|Digitalisierung|\b1450\b|e-Rezept|E-Rezept|Gesundheitsakte|"
                    r"Telefonberatung|Videosprechstunde"),
    "finanzierung": ("Finanzierung", ("Finanzierung*", "Selbstbehalt*", "Kassendefizit*", "Defizit*", "Beitrag*",
                                      "Beiträge*", "Honorar*", "Gesundheitsreform*", "Zielsteuerung*", "Finanzausgleich*",
                                      "Kostendämpfung*", "Kassenreform*", "Kassenfusion*", "Leistungsharmonisierung*",
                                      "Patientenmilliarde"),
                     r"Finanzierung|Selbstbehalt|Defizit|Beitr(ag|äge)|Honorar|Gesundheitsreform|Zielsteuerung|"
                     r"Finanzausgleich|Kostendämpfung|Kassenreform|Kassenfusion|Leistungsharmonisierung|"
                     r"Patientenmilliarde|Budget|Kosten"),
    "pflege": ("Pflege", ("Pflege*", "Pflegegeld*", "Pflegekräfte*", "Pflegereform*", "Pflegeregress*",
                          "\"24-Stunden-Betreuung\"", "Pflegeheim*"),
               r"Pflege|24-Stunden-Betreuung|Betreuungskräfte"),
    "spitalsplanung": ("Spitalsplanung", ("Spitalsreform*", "Spitalsplanung*", "Strukturplan*", "ÖSG", "RSG",
                                          "Spitalsambulanz*", "Ambulanz*", "Bettenabbau", "Spitalsschließung*",
                                          "Spitäler*", "Spital", "Krankenhaus*"),
                       r"Spital|Krankenh|Strukturplan|\bÖSG\b|\bRSG\b|Ambulanz|Bettenabbau|Klinik"),
    "medikamente": ("Medikamente", ("Medikament*", "Arzneimittel*", "Generika*", "Heilmittel*", "Rezeptgebühr*",
                                    "Lieferengp*"),
                    r"Medikament|Arzneimittel|Generika|Heilmittel|Rezeptgebühr|Lieferengp"),
    "wahlarzt": ("Wahlärzte und Kostenerstattung", ("Wahlarzt*", "Wahlärzt*", "Kostenerstattung*",
                                                     "Zweiklassenmedizin"),
                 r"Wahlarzt|Wahlärzt|Kostenerstattung|Zweiklassenmedizin|Zwei-Klassen-Medizin"),
}
TOPIC_RX = {k: re.compile(v[2], re.I) for k, v in TOPICS.items()}
TOPIC_KEYS = list(TOPICS) + ["sonstiges"]
TOPIC_LABEL = {k: v[0] for k, v in TOPICS.items()} | {"sonstiges": "Sonstige Gesundheitspolitik"}

POSITION = re.compile(
    r"\b(fordert\w*|fordern|Forderung\w*|verlang\w*|kritisier\w*|Kritik|lehnt\w*|lehnen|ablehn\w*|Ablehnung|warn\w*|"
    r"wehr(?:t|en) sich|befürcht\w*|"
    r"begrüß\w*|pocht|pochen|dräng\w*|plädier\w*|spricht sich|sprechen sich|setzt sich|setzen sich|tritt\w* .{0,20}ein|"
    r"befürwort\w*|unterstütz\w*|bekräftig\w*|appellier\w*|mahn\w*|beklag\w*|schlägt\w* .{0,30}vor|Vorschlag\w*|"
    r"Position|Stellungnahme|zeigt sich|zeigen sich|will|wollen|ortet|bestehen auf|besteht auf|"
    r"Nein zu|Ja zu)\b",
    re.I,
)


def fts_or(terms) -> str:
    return " OR ".join(terms)


def inst_query(inst: Inst) -> str:
    """Institution AND (any health topic). Wahlärzte and patient advocacy are rare enough that the
    alias alone is the query; the topic is scored later."""
    q = f"({fts_or(inst.fts)})"
    if inst.require_topic:
        q += " AND (" + fts_or(t for v in TOPICS.values() for t in v[1]) + ")"
    return q


def topics_in(text: str) -> dict[str, int]:
    return {k: len(rx.findall(text)) for k, rx in TOPIC_RX.items() if rx.search(text)}
