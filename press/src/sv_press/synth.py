"""Synthetic press archive with the real presse.db schema, for tests and dry runs.

All statements are invented. Persons are invented (FAKE_SURNAMES) so the tests can prove that no
masked name and no direct quote survives into derived/. Pages mimic the real archive: one PDF per
day, pdftotext -layout two-column pages, an OCR page, a byte-identical duplicate page (dup_of), and
an article that is reprinted a few days later with a different header (near duplicate).
"""
from __future__ import annotations

import hashlib
import re
import sqlite3
import sys
from pathlib import Path

FAKE_SURNAMES = ["Quastenhuber", "Wimmerleitner", "Gruberbauer", "Pfefferkorn", "Kranawetter", "Brunnsteiner",
                 "Moosbrugger", "Zwickelsdorfer", "Haselsteiner-Fink", "Obermoser"]

SCHEMA = """
CREATE TABLE IF NOT EXISTS docs(
  id INTEGER PRIMARY KEY, rel TEXT UNIQUE, topic TEXT, doc_date TEXT,
  pages INTEGER, bytes INTEGER, mtime REAL, need_ocr INTEGER DEFAULT 0, err TEXT);
CREATE TABLE IF NOT EXISTS pages(
  id INTEGER PRIMARY KEY, doc_id INTEGER, page_no INTEGER, nchars INTEGER,
  ocr INTEGER DEFAULT 0, dup_of INTEGER, texthash TEXT);
CREATE TABLE IF NOT EXISTS page_text(page_id INTEGER PRIMARY KEY, text TEXT);
CREATE INDEX IF NOT EXISTS ix_pages_doc  ON pages(doc_id);
CREATE INDEX IF NOT EXISTS ix_pages_hash ON pages(texthash);
CREATE INDEX IF NOT EXISTS ix_docs_date  ON docs(doc_date);
CREATE VIRTUAL TABLE IF NOT EXISTS fts USING fts5(
  text, content='page_text', content_rowid='page_id',
  tokenize="unicode61 remove_diacritics 2");
"""

# (date, outlet, headline, body paragraphs). Body lines are wrapped by the layout helpers.
ARTICLES = [
    ("2009-03-12", "Der Standard", "Kassen im Minus",
     ["Die Wiener Gebietskrankenkasse fordert vom Bund einen Ausgleich für das Defizit von 120 Millionen Euro. "
      "Ohne zusätzliche Finanzierung müssten Leistungen gekürzt werden, heißt es aus der Kasse.",
      "Obmann Dr. Berthold Quastenhuber sagte: „Wir sperren keine Ambulanz zu, aber der Bund muss zahlen.“",
      "Das Finanzministerium lehnt eine Sonderfinanzierung ab und verweist auf die Selbstverwaltung der Kassen."]),
    ("2009-03-16", "Kurier", "Kassen im Minus",
     ["Die Wiener Gebietskrankenkasse fordert vom Bund einen Ausgleich für das Defizit von 120 Millionen Euro. "
      "Ohne zusätzliche Finanzierung müssten Leistungen gekürzt werden, heißt es aus der Kasse.",
      "Das Finanzministerium lehnt eine Sonderfinanzierung ab und verweist auf die Selbstverwaltung der Kassen."]),
    ("2010-06-02", "Die Presse", "Ärztekammer gegen Gruppenpraxen-Gesetz",
     ["Die Ärztekammer kritisiert den Entwurf zu den Gruppenpraxen scharf. Die Kammer verlangt, dass "
      "Anstellungen von Ärzten bei Ärzten erlaubt werden, sonst scheitere die Primärversorgung am Land.",
      "Präsidentin Gundula Moosbrugger-Fink meinte, man werde notfalls Kassenverträge kündigen.",
      "Die Sozialversicherung begrüßt dagegen die Pläne und sieht darin einen Schritt gegen lange Wartezeiten."]),
    ("2011-11-21", "Salzburger Nachrichten", "ELGA: Streit um Opt-out",
     ["Die Ärztekammer warnt vor ELGA. Die elektronische Gesundheitsakte gefährde das Arztgeheimnis, und der "
      "Aufwand in den Ordinationen sei nicht abgegolten. Die Kammer fordert ein Opt-in statt eines Opt-out.",
      "Die Patientenanwaltschaft unterstützt ELGA grundsätzlich, verlangt aber ein einfaches Widerspruchsrecht.",
      "\"Das ist ein Datenmonster\", sagte Ferdl Gruberbauer, Sprecher einer Ärzteinitiative."]),
    ("2012-07-05", "Kleine Zeitung", "Selbstbehalte",
     ["Die Arbeiterkammer lehnt neue Selbstbehalte ab. Selbstbehalte träfen vor allem chronisch Kranke und "
      "würden die Finanzierung nur scheinbar entlasten.",
      "Die Wirtschaftskammer fordert hingegen eine Senkung der Lohnnebenkosten und mehr Effizienz in der "
      "Verwaltung der Krankenkassen."]),
    ("2013-02-14", "Wiener Zeitung", "Gesundheitsreform beschlossen",
     ["Das Gesundheitsministerium will mit der Zielsteuerung die Ausgaben an das Wirtschaftswachstum binden. "
      "Bund, Länder und Sozialversicherung sollen gemeinsam planen.",
      "Die Länder bestehen auf ihrer Zuständigkeit für die Spitäler und verlangen, dass der Finanzausgleich "
      "die Kosten der Spitalsambulanzen abdeckt.",
      "Gesundheitsminister Mag. Leopoldine Pfefferkorn sprach von einem historischen Tag."]),
    ("2014-09-30", "Oberösterreichische Nachrichten", "Spitalsträger unter Druck",
     ["Die Spitalsträger warnen vor dem Ärztemangel in den Spitälern. Durch das neue Arbeitszeitgesetz fehlten "
      "Dienstposten, die Spitalsambulanzen seien überlastet.",
      "Die gespag fordert, dass Bagatellfälle in den niedergelassenen Bereich gelenkt werden."]),
    ("2015-07-08", "Kurier", "Zahnspange gratis",
     ["Die Sozialversicherung begrüßt die Gratis-Zahnspange, verlangt aber eine volle Finanzierung durch den Bund. "
      "Die Kassen dürften nicht auf den Kosten sitzen bleiben.",
      "Das Finanzministerium sagt eine Bedeckung von 80 Millionen Euro zu, lehnt aber weitere Mittel ab."]),
    ("2016-04-19", "Der Standard", "Primärversorgung: Hausärzte skeptisch",
     ["Die Kassenärzte lehnen das geplante Primärversorgungsgesetz in dieser Form ab. Sie befürchten, dass "
      "Einzelordinationen verdrängt werden, und fordern Gesamtverträge statt Einzelverträgen.",
      "Kurienobmann Hubsi Kranawetter drohte mit Protestmaßnahmen.",
      "Die Ärztekammer Wien verlangt eine Honorarreform für die Allgemeinmedizin."]),
    ("2017-05-03", "Die Presse", "Wahlärzte",
     ["Die Wahlärzte wehren sich gegen Pläne, die Kostenerstattung zu kürzen. Ihr Verband warnt vor einer "
      "Zweiklassenmedizin, wenn Patienten den Wahlarzt komplett selbst zahlen müssten.",
      "Die Gebietskrankenkasse verweist dagegen auf die Kassenstellen, die unbesetzt bleiben."]),
    ("2018-01-22", "profil", "Pflegeregress fällt",
     ["Die Länder fordern vom Bund den vollen Ersatz für den abgeschafften Pflegeregress. Die Kosten seien "
      "deutlich höher als die zugesagten 100 Millionen Euro.",
      "Das Finanzministerium hält die Schätzungen der Länder für überhöht und verlangt eine genaue Abrechnung.",
      "Die Volkshilfe begrüßt das Ende des Regresses und fordert mehr Pflegekräfte."]),
    ("2018-09-20", "Kronen Zeitung", "Kassenfusion",
     ["Die Arbeiterkammer kritisiert die Kassenfusion als Machtverschiebung zu den Arbeitgebern. Die "
      "Selbstverwaltung der Versicherten werde geschwächt.",
      "Die Wirtschaftskammer unterstützt die Reform und erwartet Einsparungen in der Verwaltung.",
      "Laut Ottokar Brunnsteiner, Chef der Gewerkschaft, ist die Patientenmilliarde eine Erfindung."]),
    ("2019-11-12", "Tiroler Tageszeitung", "Telemedizin",
     ["Die Ärztekammer zeigt sich offen für Telemedizin, verlangt aber eine eigene Honorierung der "
      "Videosprechstunde und klare Haftungsregeln.",
      "Die Gesundheitshotline 1450 soll laut Sozialversicherung ausgebaut werden, um Ambulanzen zu entlasten."]),
    ("2020-04-02", "APA-OTS", "Pharmig zu Lieferengpässen",
     ["Die Pharmig warnt vor Lieferengpässen bei Medikamenten und fordert eine Anpassung der Preisbildung "
      "für Generika, damit die Produktion in Europa wirtschaftlich bleibt.",
      "Die Industriellenvereinigung unterstützt die Forderung nach Standortförderung."]),
    ("2021-03-17", "Der Standard", "Wartezeiten auf MRT",
     ["Die Patientenanwaltschaft kritisiert lange Wartezeiten auf MRT-Termine. Sie fordert eine Termingarantie "
      "und eine transparente Warteliste für Kassenpatienten.",
      "Patientenanwalt Dr. Zacharias Zwickelsdorfer erklärte, die Lage sei untragbar.",
      "Die ÖGK verweist auf neue Verträge mit den Instituten, die die Wartezeiten senken sollen."]),
    ("2022-05-10", "Kurier", "Pflegereform",
     ["Der Pflegeverband ÖGKV begrüßt die Pflegereform, verlangt aber mehr Kompetenzen für diplomierte "
      "Pflegekräfte, etwa beim Verordnen von Pflegehilfsmitteln.",
      "Die Caritas warnt, dass die Reform die 24-Stunden-Betreuung nicht absichert."]),
    ("2023-11-28", "Salzburger Nachrichten", "Kassenstellen unbesetzt",
     ["Die ÖGK fordert mehr Flexibilität bei der Besetzung von Kassenstellen. Unbesetzte Kassenstellen in "
      "ländlichen Regionen sollen durch Primärversorgungszentren ersetzt werden.",
      "Die Ärztekammer lehnt eine Aufweichung des Stellenplans ab und verlangt höhere Honorare für Landärzte.",
      "Wir brauchen jetzt Lösungen und keine Studien."]),
    ("2024-01-15", "Die Presse", "Wahlarztpflicht?",
     ["Das Gesundheitsministerium will Wahlärzte zur Teilnahme an ELGA und an der e-card-Abrechnung verpflichten. "
      "Damit soll die Versorgungsplanung verbessert werden.",
      "Die Wahlärzte lehnen eine Pflicht zur Kassenanbindung ab und verweisen auf die freie Arztwahl.",
      "Sektionschef Mag. Engelbert Obermoser kündigte einen Entwurf für den Herbst an."]),
    ("2024-05-21", "Kleine Zeitung", "Spitalsplanung Steiermark",
     ["Die KAGes plant die Zusammenlegung zweier Spitalsstandorte. Die Spitalsträger verweisen auf den "
      "Personalmangel und fordern, die Spitalsambulanzen durch niedergelassene Angebote zu entlasten.",
      "Die Länder bestehen darauf, die Spitalsplanung im Regionalen Strukturplan selbst zu bestimmen."]),
    ("2025-06-11", "Wiener Zeitung", "Budget und Gesundheit",
     ["Das Finanzministerium verlangt von der Sozialversicherung einen Konsolidierungsbeitrag. Die "
      "Krankenversicherungsbeiträge der Pensionisten sollen steigen.",
      "Die Arbeiterkammer lehnt höhere Beiträge für Pensionisten ab und fordert eine Finanzierung über "
      "vermögensbezogene Steuern.",
      "Die Wirtschaftskammer begrüßt die Konsolidierung und verlangt eine Senkung der Lohnnebenkosten."]),
    ("2026-02-03", "Der Standard", "Telemedizin in der Primärversorgung",
     ["Die Sozialversicherung will Telemedizin als Kassenleistung ausbauen. Videosprechstunden sollen in der "
      "Primärversorgung regulär abgerechnet werden.",
      "Die Ärztekammer begrüßt das grundsätzlich, fordert aber, dass ärztliche Beratung nicht an Callcenter "
      "ausgelagert wird."]),
]


def _wrap(text: str, width: int) -> list[str]:
    words, lines, cur = text.split(), [], ""
    for w in words:
        if len(cur) + len(w) + 1 > width:
            # hyphenate long words at the column edge, like a newspaper does
            if len(w) > 9 and width - len(cur) - 1 > 5:
                k = width - len(cur) - 2
                lines.append((cur + " " + w[:k] + "-").strip())
                cur = w[k:]
                continue
            lines.append(cur)
            cur = w
        else:
            cur = (cur + " " + w).strip()
    if cur:
        lines.append(cur)
    return lines


def _single_column(paras: list[str]) -> list[str]:
    out = []
    for p in paras:
        out += _wrap(p, 78) + [""]
    return out


def _two_columns(left: list[str], right: list[str]) -> list[str]:
    a, b = _single_column_w(left, 44), _single_column_w(right, 44)
    n = max(len(a), len(b))
    a += [""] * (n - len(a))
    b += [""] * (n - len(b))
    return [f"{x:<48}{y}".rstrip() for x, y in zip(a, b)]


def _single_column_w(paras, w):
    out = []
    for p in paras:
        out += _wrap(p, w) + [""]
    return out


def page_text(date: str, outlet: str, headline: str, paras: list[str], layout: str) -> str:
    y, m, d = date.split("-")
    head = [f"{outlet}    {int(d)}.{int(m)}.{y}    Seite {int(d) % 9 + 1}", "", headline.upper(), ""]
    if layout == "two" and len(paras) >= 2:
        k = (len(paras) + 1) // 2
        body = _two_columns(paras[:k], paras[k:])
    else:
        body = _single_column(paras)
    return "\n".join(head + body + ["", "Pressespiegel des Dachverbandes"]) + "\n"


def _hash(t: str) -> str:
    return hashlib.sha1(re.sub(r"\s+", " ", t).strip().lower().encode()).hexdigest()


def build(path: Path) -> dict:
    path = Path(path)
    if path.exists():
        path.unlink()
    db = sqlite3.connect(path)
    db.executescript(SCHEMA)
    hashes: dict[str, int] = {}
    n_pages = 0

    def add_doc(rel, date, pages, ocr_pages=()):
        nonlocal n_pages
        cur = db.execute("INSERT INTO docs(rel,topic,doc_date,pages,bytes,mtime,need_ocr,err) VALUES(?,?,?,?,?,?,?,NULL)",
                         (rel, rel.split("/")[0], date, len(pages), 1000 * len(pages), 0.0, len(ocr_pages)))
        doc_id = cur.lastrowid
        for i, t in enumerate(pages, 1):
            h = _hash(t) if t.strip() else None
            dup = hashes.get(h) if h else None
            c = db.execute("INSERT INTO pages(doc_id,page_no,nchars,ocr,dup_of,texthash) VALUES(?,?,?,?,?,?)",
                           (doc_id, i, len(t.strip()), 1 if i in ocr_pages else 0, dup, h))
            pid = c.lastrowid
            n_pages += 1
            if dup is None:
                if h:
                    hashes[h] = pid
                db.execute("INSERT INTO page_text(page_id,text) VALUES(?,?)", (pid, t))
                db.execute("INSERT INTO fts(rowid,text) VALUES(?,?)", (pid, t))

    filler = ("Wetter: Sonnig bei 21 Grad. Börse: Leitindex leicht im Plus. Sport: Rapid gewinnt das Derby "
              "mit zwei zu eins vor ausverkauftem Haus.")
    for k, (date, outlet, headline, paras) in enumerate(ARTICLES):
        y, m, d = date.split("-")
        layout = "two" if k % 3 == 0 and k != 6 else "one"
        p1 = page_text(date, outlet, headline, paras, layout)
        if k == 6:  # OCR-like page: no layout, stray junk lines, broken hyphenation
            p1 = p1.replace("Spitäler", "Spi-\ntäler") + "\n|| ~~ ## ;;\n"
        pages = [page_text(date, "APA", "Kurzmeldungen", [filler], "one"), p1]
        add_doc(f"{y}/{m}/Pressespiegel vom {int(d)}.{int(m)}.{y}.pdf", date, pages,
                ocr_pages=(2,) if k == 6 else ())
    # a yearly compilation that repeats an earlier page byte-identically (dup_of) and a long range doc
    first = ARTICLES[2]
    add_doc("2010/Sammelband/20100101-20101231.pdf", "2010-01-01",
            [page_text(first[0], first[1], first[2], first[3], "two" if 2 % 3 == 0 else "one"),
             page_text("2010-12-30", "Kurier", "Jahresrückblick",
                       ["Die Ärztekammer fordert im Jahresrückblick erneut mehr Kassenstellen für die Primärversorgung."],
                       "one")])
    db.commit()
    n = db.execute("SELECT COUNT(*) FROM pages").fetchone()[0]
    db.close()
    return {"pages": n, "articles": len(ARTICLES)}


def main(argv=None):
    argv = argv if argv is not None else sys.argv[1:]
    out = Path(argv[0] if argv else "work/synthetic.db")
    out.parent.mkdir(parents=True, exist_ok=True)
    print("synthetic db:", out, build(out))


if __name__ == "__main__":
    main()
