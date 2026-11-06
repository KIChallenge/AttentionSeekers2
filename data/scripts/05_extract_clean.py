"""Extract text from Stellungnahme PDFs, strip letter furniture, mask person names, segment.

Phase 1 (extract): pdftotext (poppler) per PDF -> raw/snme_txt/{GP}/{INR}.txt; pypdf fallback.
  A PDF is flagged needs_ocr when it yields < 200 non-space chars per page (scans). No OCR is run.
Phase 2 (clean + mask): per statement
  - drop running headers/footers (lines repeated on >= 3 pages, page numbers)
  - drop letterhead/contact lines (Tel, Fax, E-Mail, DVR, GZ, Sachbearbeiter, URLs, IBAN, addresses)
  - drop salutations ("Sehr geehrte ...") and the closing/signature block (from "Mit freundlichen
    Gruessen" / "Hochachtungsvoll" / "Fuer den Praesidenten" etc. to the end when it sits in the
    last 35 percent of the text, otherwise just that paragraph)
  - person-name pass: spaCy de_core_news_lg NER (PER) plus title rules (Dr., Mag., Prof., Praesident,
    Direktorin, Herr, Frau, ... followed by a capitalised token) plus "Surname, Firstname" lists.
    Any hit masks the WHOLE sentence as "[...]". Masked counts are logged per statement.
Outputs:
  derived/stellungnahmen.jsonl           one row per statement (text = cleaned, masked)
  derived/stellungnahmen_segments.jsonl  one row per paragraph segment, with provision references
  derived/extraction_log.jsonl           per statement: pages, chars, needs_ocr, masked sentence counts
"""
from __future__ import annotations

import collections
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # -I drops the script dir
from common import DERIVED, RAW, read_jsonl, write_jsonl

TXT_DIR = RAW / "snme_txt"
PDF_DIR = RAW / "snme_pdf"
MASK = "[...]"

# --------------------------------------------------------------------------- phase 1


def extract(pdf: Path, out: Path) -> dict:
    if out.exists() and out.with_suffix(".meta.json").exists():
        return json.loads(out.with_suffix(".meta.json").read_text())
    out.parent.mkdir(parents=True, exist_ok=True)
    text, method = "", "pdftotext"
    try:
        text = subprocess.run(["pdftotext", "-enc", "UTF-8", str(pdf), "-"], capture_output=True,
                              timeout=180).stdout.decode("utf-8", "replace")
    except Exception:  # noqa: BLE001
        text = ""
    if not text.strip():
        try:
            from pypdf import PdfReader
            text = "\f".join((p.extract_text() or "") for p in PdfReader(str(pdf)).pages)
            method = "pypdf"
        except Exception:  # noqa: BLE001
            text, method = "", "failed"
    pages = max(1, text.count("\f") + (0 if text.endswith("\f") else 1))
    nchar = len(re.sub(r"\s", "", text))
    meta = {"pages": pages, "chars": nchar, "method": method, "needs_ocr": nchar / pages < 200}
    out.write_text(text)
    out.with_suffix(".meta.json").write_text(json.dumps(meta))
    return meta


# --------------------------------------------------------------------------- phase 2 helpers

CONTACT = re.compile(
    r"(\bTel(efon)?\.?\s*[:+0-9(]|^\s*[TFM]\s*:?\s*\+?\s*\(?\d|\bZl\.|\bAZ\b|Aktenzeichen|Öffentliche Verkehrsmittel|Buslinie|Straßenbahn|U-Bahn|Parteienverkehr|Amtsstunden|Bearb\.|\bFax\b|E-?Mail|e-mail|@|https?://|www\.|\bDVR\b|\bUID\b|\bIBAN\b|\bBIC\b|"
    r"\bGZ\b|Gesch(äfts|\.)\s*[Zz]ahl|Ihr Zeichen|Unser Zeichen|Ihre Zahl|Unsere Zahl|Sachbearbeiter|"
    r"Bearbeiter(in)?\b|Rückfragen|Durchwahl|\bDW\b|\bZVR\b|Postfach|\bA-\d{4}\b|^\s*\d{4}\s+[A-ZÄÖÜ][a-zäöü]+\s*$|"
    r"[A-ZÄÖÜ][a-zäöüß]+(straße|gasse|platz|ring|weg|kai|allee)\s+\d)",
    re.I,
)
SALUTATION = re.compile(r"^\s*(Sehr geehrte|Geehrte|Liebe |Werte )", re.I)
CLOSING = re.compile(
    r"^\s*(Mit (den )?(freundlichen|besten|vorzüglicher|kollegialen) Grüßen|Mit freundlichem Gruß|"
    r"Hochachtungsvoll|Freundliche Grüße|Beste Grüße|Für den Präsidenten|Für die Präsidentin|"
    r"Für den (General)?[Dd]irektor|Für die (Landes|Bundes)regierung|Für den Landeshauptmann|"
    r"Für die Landesregierung|Für den Bundesminister|Für die Bundesministerin|"
    r"Der Präsident\s*:?\s*$|Die Präsidentin\s*:?\s*$|Der Generaldirektor|Die Generaldirektorin|"
    r"Der Landesamtsdirektor|Die Landesamtsdirektorin|Elektronisch gefertigt|Amtssigniert|"
    r"Unterzeichner|Signaturwert|Hinweis: Dieses Dokument wurde amtssigniert)",
    re.I,
)
PAGE_NO = re.compile(r"^\s*(-\s*\d+\s*-|Seite\s+\d+(\s*(von|/)\s*\d+)?|\d+\s*(von|/)\s*\d+|\d{1,3})\s*$", re.I)

TITLE_RULE = re.compile(
    r"\b(Dr|Mag|Prof|DI|Dipl\.-Ing|Ing|MMag|DDr|Univ\.-Prof|Hon\.-Prof|MR|OMR|HR|Hofrat|Hofrätin|MBA|MSc|BA|"
    r"Präsident(in)?|Vizepräsident(in)?|Direktor(in)?|Generaldirektor(in)?|Obmann|Obfrau|"
    r"Bundesminister(in)?|Landesrat|Landesrätin|Landeshauptmann|Landeshauptfrau|Abgeordnete[rn]?|"
    r"Sektionschef(in)?|Bürgermeister(in)?|Primar(ius|ia)?|Prim|Herrn?|Frau)\.?\s+"
    r"(?:(?:Dr|Mag|Prof|DI|MMag|Univ\.-Prof|Ing)\.?\s*)*[A-ZÄÖÜ](?:[a-zäöüß]+|[A-ZÄÖÜ]{2,})(?:-[A-ZÄÖÜ][a-zäöüß]+)?"
)
# Capitalised word after a title that is a function/institution, not a surname
TITLE_FALSE = re.compile(
    r"\b(Präsident(in)?|Direktor(in)?|Herrn?|Frau)\.?\s+(Bundes|Landes|Präsident|Vize|General|Kammer|Amts|Abgeordnete|"
    r"Sektions|Minister|Vorsitzende|Rechnungshof|Nationalrat|Bundesrat|Volksanwalt|Österreich|Verfassungs|Ärzte|"
    r"Patient|Pflege|Haupt|Dachverband|der|des|dem|den|die)",
)
_TITLE_START = re.compile(
    r"\b(?=(Dr|Mag|Prof|DI|Dipl|Ing|MMag|DDr|Univ|Hon|MR|OMR|HR|Hofrat|Hofrätin|MBA|MSc|BA|Präsident|Vizepräsident|"
    r"Direktor|Generaldirektor|Obmann|Obfrau|Bundesminister|Landesrat|Landesrätin|Landeshauptmann|Landeshauptfrau|"
    r"Abgeordnete|Sektionschef|Bürgermeister|Primar|Prim|Herr|Frau)\b)")


def title_hit(s: str) -> bool:
    for t in _TITLE_START.finditer(s):
        if TITLE_RULE.match(s, t.start()) and not TITLE_FALSE.match(s, t.start()):
            return True
    return False


FIRST_NAMES = (
    "Adelheid|Adolf|Agnes|Alexander|Alexandra|Alfred|Alois|Andrea|Andreas|Angelika|Anita|Anna|Anton|Armin|Artur|Astrid|"
    "Barbara|Beate|Bernadette|Bernd|Bernhard|Birgit|Brigitte|Bruno|Carina|Carmen|Christa|Christian|Christiane|Christina|"
    "Christine|Christoph|Claudia|Cornelia|Daniel|Daniela|David|Dietmar|Dieter|Doris|Edith|Eduard|Elfriede|Elisabeth|"
    "Elke|Emil|Engelbert|Erich|Erika|Erna|Ernst|Erwin|Eva|Evelyn|Fabian|Felix|Ferdinand|Florian|Franz|Franziska|"
    "Friedrich|Fritz|Gabriele|Gabriela|Georg|Gerald|Gerda|Gerhard|Gernot|Gertraud|Gertrude|Gottfried|Gregor|Gudrun|"
    "Günter|Günther|Hannes|Hans|Harald|Heidemarie|Heidi|Heinrich|Heinz|Helga|Helmut|Helene|Herbert|Hermann|Hubert|"
    "Ilse|Ingeborg|Ingrid|Irene|Iris|Isabella|Jakob|Jan|Jasmin|Johann|Johanna|Johannes|Josef|Josefine|Judith|Julia|"
    "Jürgen|Karin|Karl|Katharina|Kathrin|Klaus|Konrad|Kurt|Leopold|Lisa|Lukas|Manfred|Manuel|Manuela|Margarete|"
    "Margareta|Margit|Maria|Marianne|Marion|Markus|Martin|Martina|Martha|Matthias|Max|Maximilian|Melanie|Michael|"
    "Michaela|Monika|Nicole|Norbert|Oliver|Otto|Ottilie|Patrick|Paul|Peter|Petra|Philipp|Rainer|Regina|Reinhard|"
    "Reinhold|Renate|Richard|Robert|Roland|Rosa|Rudolf|Sabine|Sandra|Silvia|Simone|Sonja|Stefan|Stefanie|Stephan|"
    "Susanne|Susi|Theresa|Thomas|Tobias|Ulrich|Ulrike|Ursula|Verena|Viktor|Viktoria|Walter|Werner|Wilhelm|"
    "Willibald|Wolfgang|Alexandra|Siegfried|Hildegard|Rupert|Bettina|Sebastian|Dominik|Elena|Sarah|Barbara"
)
FIRST_NAME_RULE = re.compile(r"\b(?:" + FIRST_NAMES + r")\s+(?:[A-ZÄÖÜ]\.\s*)?[A-ZÄÖÜ](?:[a-zäöüß]{2,}|[A-ZÄÖÜ]{2,})")
NAME_LIST = re.compile(r"\b[A-ZÄÖÜ][a-zäöüß]{2,},\s+[A-ZÄÖÜ][a-zäöüß]{2,}\s*(;|$|\n)")

# PER entities that are not persons (frequent false positives in legal German)
PER_ALLOW = re.compile(
    r"^(§|Abs|Art|Z|lit|ELGA|ASVG|GSVG|BSVG|B-KUVG|KAKuG|ÄrzteG|GuKG|AMG|EpiG|COVID|Covid|Hauptverband|"
    r"Dachverband|Bund|Länder|Land|Gemeinde|Rechnungshof|Ministerium|Bundesministerium|Novelle|Entwurf|"
    r"Gesetz|Verordnung|Regierungsvorlage|Begutachtung|Stellungnahme|Ärztekammer|Kammer|Kasse|Krankenkasse|"
    r"Primärversorgung|Gesundheit|Pflege|Patient|WKÖ|AK|ÖGB|IV|SV|ÖGK|PVA|AUVA|SVS|BVAEB|BMF|BMSGPK|BMG|"
    r"Zielsteuerung|e-card|E-Card|Wahlarzt|Wahlärzt|Kassenarzt|Vertragsarzt)",
    re.I,
)

NOUN_SUFFIX = re.compile(r"(ungen|ung|heit|keit|schaft|nisse|ionen|ion|ität|register|bereich|bereichs|praxen|gesetz|"
                         r"verträge|vertrag|ärzte|weise|maßnahmen|programmen|dienste|lehrgänge|personals|studiengänge|"
                         r"erzeugnis|stellen|nachweise|vorschlag|vorhaben|ausbildungen|trägern|tionen|sekret|anstalten|"
                         r"verband|fächern|waren|kathetern|methoden|ierte|iertes|liche|lichen|ches|tives|isch|ische)$", re.I)


def is_person_entity(t: str) -> bool:
    """Filter spaCy PER hits: multi-token names count; a single token counts only if it does not
    look like a German common noun (long compound or typical noun/adjective suffix)."""
    t = re.sub(r"\b(e\.h|Vgl|vgl|Lt|H)\b\.?", "", t).strip(" .,:;")
    toks = [x for x in t.split() if re.match(r"[A-ZÄÖÜ][a-zäöüß]", x)]
    if not toks:
        return False
    if len(toks) >= 2:
        return any(not NOUN_SUFFIX.search(x) for x in toks)
    w = toks[0]
    return len(w) <= 14 and not NOUN_SUFFIX.search(w) and "-" not in w


ABBREV = {"abs", "art", "z", "lit", "nr", "dr", "mag", "prof", "bzw", "vgl", "ua", "u.a", "zb", "z.b", "isd", "i.s.d",
          "idf", "i.d.f", "gem", "ggf", "ing", "dipl", "univ", "hon", "insb", "inkl", "s", "bd", "kap", "pkt", "rz",
          "ff", "f", "lt", "sog", "usw", "etc", "ca", "mio", "mrd", "tsd", "hrsg", "bgbl", "stf", "anm", "erl", "eb",
          "rv", "me", "d.b", "gp", "lfd", "vs", "v", "ao", "o", "bm", "zl", "zif", "ziff", "allg", "geb", "jedenf",
          "uä", "u.ä", "dgl", "evtl", "max", "min", "mind", "ds", "dh", "d.h", "i.v.m", "ivm", "zt", "z.t", "bspw",
          "abschn", "spk", "erläut", "u", "a", "b", "c", "d", "e", "i", "ii", "iii", "iv", "nö", "oö", "stmk"}
_CAND = re.compile(r"(?<=[.!?:;])\s+(?=[A-ZÄÖÜ\u201e\"(§])")


PROVISION = re.compile(
    r"(§§?\s*\d+[a-z]?(?:\s*(?:Abs\.|Absatz)\s*\d+[a-z]?)?(?:\s*(?:Z|Ziffer)\s*\d+[a-z]?)?(?:\s*lit\.\s*[a-z])?|"
    r"\bArt(?:\.|ikel)\s*\d+[a-z]?|\b(?:Z|Ziffer)\s*\d+[a-z]?(?=\s|\)|:|,)|\bAnlage\s+\d+)"
)


def split_pages(text: str):
    return text.split("\f")


def remove_running_lines(pages):
    cnt = collections.Counter()
    for p in pages:
        for ln in set(l.strip() for l in p.splitlines() if l.strip()):
            cnt[ln] += 1
    n = len(pages)
    rep = {ln for ln, c in cnt.items() if n >= 3 and c >= max(3, n // 2) and len(ln) < 160}
    out = []
    for p in pages:
        out.append("\n".join(l for l in p.splitlines() if l.strip() not in rep and not PAGE_NO.match(l)))
    return out, len(rep)


PARL_STAMP = re.compile(r"^\s*(.*Vollständigkeit des Inhaltes wird von der Parlamentsdirektion|Für die Richtigkeit|\d+/SN-\d+/ME\b.*GP\b|www\.parlament\.gv\.at\s*$|\d+\s+von\s+\d+\s*$)", re.I)
SIG_LINE = re.compile(r"^[A-ZÄÖÜ(][\w .,:;()/&\-\u2013]{0,70}$")


def strip_lines(lines):
    """Line-level removal of salutations, closing/signature blocks, contact and stamp lines.
    A closing in the last 35 percent of the document cuts everything after it; an earlier one
    (cover letter on page 1) drops the closing line plus up to 6 following short lines."""
    stats = collections.Counter()
    n = len(lines)
    out = []
    i = 0
    while i < n:
        ln = lines[i].strip()
        if not ln:
            out.append("")
            i += 1
            continue
        if PARL_STAMP.match(ln) or PAGE_NO.match(ln):
            stats["stamp_lines"] += 1
            i += 1
            continue
        if CLOSING.match(ln):
            if i >= int(n * 0.65):
                stats["closing_cut_lines"] += n - i
                break
            stats["closing_block_lines"] += 1
            i += 1
            k = 0
            while i < n and k < 6 and (not lines[i].strip() or SIG_LINE.match(lines[i].strip())) \
                    and not re.search(r"[.!?]$", lines[i].strip()):
                stats["closing_block_lines"] += 1
                i += 1
                k += 1
            out.append("")
            continue
        if SALUTATION.match(ln):
            stats["salutation_lines"] += 1
            # keep text after the salutation comma if the line continues
            rest = re.sub(r"^.*?(Herren|Damen|Kollegen|Kolleginnen|Frau [^,]*|Herr [^,]*)\s*[,!]\s*", "", ln, count=1)
            if rest and rest != ln:
                out.append(rest)
            out.append("")
            i += 1
            continue
        if len(ln) < 160 and CONTACT.search(ln):
            stats["contact_lines"] += 1
            i += 1
            continue
        out.append(ln)
        i += 1
    return out, stats


def to_paragraphs(lines):
    # join wrapped lines; paragraph break at blank line, after a short line ending a sentence,
    # or before a list item / heading
    paras, cur = [], []
    for ln in lines:
        s = ln.strip()
        if not s:
            if cur:
                paras.append(cur)
                cur = []
            continue
        if cur and (re.match(r"^(\d+(\.\d+)*\.?\s|[a-z]\)|\d+\)|[-\u2022\u25cf\u25aa*]\s|Zu |Ad |§|Art\.|Artikel|Z \d)", s)
                    or (re.search(r"[.:!?]$", cur[-1]) and len(cur[-1]) < 55)):
            paras.append(cur)
            cur = []
        cur.append(s)
    if cur:
        paras.append(cur)
    out = []
    for p in paras:
        t = ""
        for ln in p:
            if t.endswith("-") and ln[:1].islower():
                t = t[:-1] + ln
            else:
                t = (t + " " + ln) if t else ln
        # normalise U+2014 to an en dash (project rule: no em dash anywhere in derived files)
        out.append(re.sub(r"\s+", " ", t.replace("\u2014", "\u2013")).strip())
    return [p for p in out if p]


def sentences(p: str):
    """Split at . ! ? : ; followed by a capital, unless the token before the dot is an abbreviation
    or a number (e.g. "Abs. 2", "Z 3.", "1. Jänner")."""
    parts = _CAND.split(p)
    out = []
    for part in parts:
        if out:
            prev = out[-1]
            last = re.search(r"([\w.\-]+)[.]$", prev)
            if prev.endswith(".") and last and (last.group(1).lower().rstrip(".") in ABBREV
                                                 or re.fullmatch(r"[\d.]+", last.group(1))
                                                 or len(last.group(1)) == 1):
                out[-1] = prev + " " + part
                continue
        out.append(part)
    return [x for x in out if x.strip()]


def load_nlp():
    import spacy
    nlp = spacy.load("de_core_news_lg", exclude=["tagger", "morphologizer", "parser", "lemmatizer",
                                                  "attribute_ruler", "senter"])
    nlp.max_length = 3_000_000
    return nlp


# --------------------------------------------------------------------------- main


def main():
    idx = {(r["gp"], r["snme_inr"]): r for r in read_jsonl(DERIVED / "stellungnahmen_index.jsonl")}
    me = {(r["gp"], r["me_inr"]): r for r in read_jsonl(DERIVED / "me_index.jsonl")}
    manifest = list(read_jsonl(PDF_DIR / "manifest.jsonl"))
    todo = [m for m in manifest if m.get("pdf") and (m["gp"], m["snme_inr"]) in idx]
    print(f"phase 1: extracting {len(todo)} PDFs", flush=True)
    metas = {}
    for i, m in enumerate(todo):
        metas[(m["gp"], m["snme_inr"])] = extract(RAW / m["pdf"], TXT_DIR / m["gp"] / f"{m['snme_inr']}.txt")
        if i % 500 == 0:
            print("  ", i, flush=True)

    print("phase 2: cleaning + NER", flush=True)
    nlp = load_nlp()
    docs = []  # (key, paragraphs)
    logs = {}
    for key, meta in metas.items():
        raw = (TXT_DIR / key[0] / f"{key[1]}.txt").read_text()
        pages, n_rep = remove_running_lines(split_pages(raw))
        lines, st = strip_lines("\n\n".join(pages).splitlines())
        paras = to_paragraphs(lines)
        logs[key] = {"gp": key[0], "snme_inr": key[1], **meta, "running_lines_removed": n_rep, **st}
        docs.append((key, paras))

    per_ent = collections.Counter()
    out_rows, seg_rows = [], []
    tot = collections.Counter()
    # NER over all paragraphs, streamed
    flat = [(di, pi, p) for di, (_, paras) in enumerate(docs) for pi, p in enumerate(paras)]
    ents_by = collections.defaultdict(list)
    for (di, pi, _), d in zip(flat, nlp.pipe((p for _, _, p in flat), batch_size=256, n_process=4)):
        for e in d.ents:
            if e.label_ == "PER":
                ents_by[(di, pi)].append((e.start_char, e.end_char, e.text))
    for di, (key, paras) in enumerate(docs):
        r = idx[key]
        m = me.get((r["me_gp"], r["me_inr"]), {})
        c = collections.Counter()
        clean_paras = []
        for pi, p in enumerate(paras):
            ents = [e for e in ents_by.get((di, pi), []) if not PER_ALLOW.match(e[2].strip())
                    and is_person_entity(e[2])]
            out_s, pos = [], 0
            for s in sentences(p):
                start = p.find(s, pos)
                end = start + len(s)
                pos = end
                hit = None
                for (a, b, t) in ents:
                    if a < end and b > start:
                        hit = "ner"
                        per_ent[t] += 1
                        break
                if not hit:
                    if title_hit(s):
                        hit = "title"
                    elif NAME_LIST.search(s):
                        hit = "name_list"
                    elif FIRST_NAME_RULE.search(s) or re.search(r"\be\.\s?h\.", s):
                        hit = "first_name"
                c["sentences"] += 1
                if hit:
                    c["masked_" + hit] += 1
                    c["masked"] += 1
                    if out_s and out_s[-1] == MASK:
                        continue
                    out_s.append(MASK)
                else:
                    out_s.append(s)
            cp = " ".join(out_s).strip()
            if cp and cp != MASK:
                clean_paras.append(cp)
        text = "\n\n".join(clean_paras)
        logs[key].update({"sentences": c["sentences"], "masked": c["masked"], "masked_ner": c["masked_ner"],
                          "masked_title": c["masked_title"], "masked_name_list": c["masked_name_list"],
                          "masked_first_name": c["masked_first_name"], "clean_chars": len(text)})
        tot.update(c)
        # scans: the only text layer is the Parliament stamp/disclaimer, so judge on cleaned text
        logs[key]["needs_ocr"] = logs[key]["needs_ocr"] or len(text) < 150 * logs[key]["pages"]
        d, mo, y = r["date"].split(".")
        base = {"id": f"{r['gp']}/SNME/{r['snme_inr']}", "institution_id": r["institution_id"],
                "institution": r["institution"], "agent": r["agent"], "date": f"{y}-{mo}-{d}", "gp": r["me_gp"],
                "me_inr": r["me_inr"], "me_citation": r["me_citation"], "me_title": r["me_title"],
                "me_ressort": r["me_ressort"], "health_core": r["health_core"], "url": r["url"]}
        out_rows.append({**base, "citation": r["citation"], "pages": logs[key]["pages"],
                         "needs_ocr": logs[key]["needs_ocr"], "n_chars": len(text), "text": text})
        for si, p in enumerate(clean_paras):
            provs = sorted(set(re.sub(r"\s+", " ", x) for x in PROVISION.findall(p)))
            seg_rows.append({"stellungnahme_id": base["id"], "seg": si, "institution_id": base["institution_id"],
                             "agent": base["agent"], "date": base["date"], "gp": base["gp"], "me_inr": base["me_inr"],
                             "provisions": provs, "references_provision": bool(provs), "text": p})
    write_jsonl(DERIVED / "stellungnahmen.jsonl", out_rows)
    write_jsonl(DERIVED / "stellungnahmen_segments.jsonl", seg_rows)
    write_jsonl(DERIVED / "extraction_log.jsonl", logs.values())
    (DERIVED / "masking_summary.json").write_text(json.dumps({
        "statements": len(out_rows), "sentences": tot["sentences"], "masked": tot["masked"],
        "masked_ner": tot["masked_ner"], "masked_title": tot["masked_title"], "masked_name_list": tot["masked_name_list"],
        "masked_first_name": tot["masked_first_name"], "needs_ocr": sum(1 for l in logs.values() if l["needs_ocr"]), "segments": len(seg_rows),
        "segments_with_provision": sum(1 for s in seg_rows if s["references_provision"]),
    }, indent=1))
    # top PER strings go to raw/ (they are person names, never published)
    (RAW / "per_entities_top.json").write_text(json.dumps(per_ent.most_common(300), ensure_ascii=False, indent=0))
    print(json.loads((DERIVED / "masking_summary.json").read_text()))


if __name__ == "__main__":
    main()
