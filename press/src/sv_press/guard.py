"""CON-1/CON-2 person guard for press text (fail closed).

The person-name rules are imported read-only from data/scripts/05_extract_clean.py (spaCy
de_core_news_lg PER with the data track's false-positive filter, title rule, "Surname, Firstname"
lists, first-name list), the same single source of truth that models/scripts/pii_guard.py uses.
If the rule file is missing, the guard raises: no rules, no output.

Press adds three things the Stellungnahmen did not need:
  * direct quotes (quotation marks, first-person speech) are dropped, never paraphrased in place
  * office nouns ("Gesundheitsministerin", "Kammerpräsident", "Obmann") point at one real person
    even without a name; they are rewritten to the institution or to "[Funktion]"
  * every name that was masked in a source passage is remembered (work dir only) so the output
    check can prove that none of them reappears in a rewrite
"""
from __future__ import annotations

import importlib.util
import os
import re
import sys
from functools import lru_cache
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
RULES = Path(os.environ.get("PRESS_RULES", REPO / "data" / "scripts" / "05_extract_clean.py"))
MASK = "[...]"
EH = re.compile(r"\be\.\s?h\.")


@lru_cache(maxsize=1)
def rules():
    if not RULES.exists():
        raise SystemExit(f"guard: rule source missing ({RULES}); refusing to continue")
    d = str(RULES.parent)
    sys.path.insert(0, d)
    try:
        spec = importlib.util.spec_from_file_location("press_extract_rules", RULES)
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
    finally:
        sys.path.remove(d)
    for name in ("title_hit", "FIRST_NAME_RULE", "NAME_LIST", "sentences", "is_person_entity", "PER_ALLOW", "load_nlp"):
        if not hasattr(m, name):
            raise SystemExit(f"guard: rule {name} missing in {RULES}; refusing to continue")
    return m


@lru_cache(maxsize=1)
def nlp():
    return rules().load_nlp()


def sentences(p: str) -> list[str]:
    return rules().sentences(p)


# --------------------------------------------------------------------------- quotes

QUOTE_SPAN = re.compile(r"[„“”\"»«›‹‚‘’]")
FIRST_PERSON = re.compile(r"\b(ich|mir|mich|meine?[mnrs]?|wir|uns|unsere?[mnrs]?)\b", re.I)
SPEECH_TAIL = re.compile(
    r",\s*(so|sagt|sagte|meint|meinte|betont|betonte|erklärt|erklärte|warnt|warnte|kritisiert|kritisierte|"
    r"fordert|forderte|ergänzt|ergänzte|bekräftigt|bekräftigte|stellt|stellte|hält|hielt)\b[^.]{0,80}$",
    re.I,
)


def is_quote(s: str) -> bool:
    """A sentence that carries someone's own words: quotation marks, first-person speech, or a
    trailing speech attribution to an office holder (", sagt der Kammerpräsident"). An attribution to
    an institution (", fordert die Ärztekammer") is indirect institutional speech and stays."""
    if QUOTE_SPAN.search(s) or FIRST_PERSON.search(s):
        return True
    tail = SPEECH_TAIL.search(s.rstrip(".!? "))
    return bool(tail and OFFICE.search(tail.group(0)))


# --------------------------------------------------------------------------- office nouns

_OFFICE = (r"minister(?:in|innen)?|staatssekretär(?:in)?|präsident(?:in|en)?|vizepräsident(?:in)?|"
           r"obmann|obfrau|obleute|chef(?:in)?|sprecher(?:in)?|generaldirektor(?:in)?|direktor(?:in)?|"
           r"vorsitzende[rn]?|landesrat|landesrätin|landeshauptmann|landeshauptfrau|landeshauptleute|"
           r"bürgermeister(?:in)?|anwalt|anwältin|ombudsmann|ombudsfrau|kanzler(?:in)?|primar(?:ius|ia)?|"
           r"geschäftsführer(?:in)?|vorstand|abgeordnete[rn]?|funktionär(?:in)?|vertreter(?:in)?")
OFFICE = re.compile(r"\b([A-ZÄÖÜ][a-zäöüß]*?(?:-|\b)?)?(" + _OFFICE + r")s?\b", re.I)

# office prefix -> institution phrase that replaces the whole office noun
OFFICE_PREFIX = [
    (re.compile(r"^gesundheits|^sozial", re.I), "Gesundheitsministerium"),
    (re.compile(r"^finanz", re.I), "Finanzministerium"),
    (re.compile(r"^(ärzte|aerzte)?kammer|^ärztekammer|^öäk|^ärztekammer-", re.I), "Ärztekammer"),
    (re.compile(r"^(haupt|dach)verband|^kassen|^ögk|^gkk|^krankenkassen|^sozialversicherungs", re.I),
     "Sozialversicherung"),
    (re.compile(r"^patienten", re.I), "Patientenanwaltschaft"),
    (re.compile(r"^(bundes)?kurie", re.I), "Ärztekammer-Kurie"),
    (re.compile(r"^(landes|landeshaupt)", re.I), "Land"),
    (re.compile(r"^(arbeiterkammer|ak-)", re.I), "Arbeiterkammer"),
    (re.compile(r"^(wirtschaftskammer|wkö|wko)", re.I), "Wirtschaftskammer"),
    (re.compile(r"^(pharmig|pharma|industrie)", re.I), "Pharmaindustrie"),
]
PERSON_PREFIX_IGNORE = re.compile(r"^(der|die|des|dem|den|ein|eine|einer|eines|frau|herr|herrn)\b", re.I)


def _office_sub(m: re.Match) -> str:
    prefix = (m.group(1) or "").strip("-")
    if prefix and not PERSON_PREFIX_IGNORE.match(prefix):
        for rx, inst in OFFICE_PREFIX:
            if rx.search(prefix):
                return inst
        return f"{prefix}-[Funktion]" if re.search(r"(verband|kammer|kasse|ministerium)$", prefix, re.I) else "[Funktion]"
    return (prefix + " " if prefix else "") + "[Funktion]"


def neutralise_offices(s: str) -> str:
    return OFFICE.sub(_office_sub, s)


def office_hit(s: str) -> bool:
    return bool(OFFICE.search(s))


# --------------------------------------------------------------------------- names

def rule_hit(s: str) -> str | None:
    m = rules()
    if m.title_hit(s):
        return "title"
    if m.NAME_LIST.search(s):
        return "name_list"
    if m.FIRST_NAME_RULE.search(s) or EH.search(s):
        return "first_name"
    return None


def _per_spans(doc):
    m = rules()
    return [(e.start_char, e.end_char, e.text) for e in doc.ents
            if e.label_ == "PER" and not m.PER_ALLOW.match(e.text.strip()) and m.is_person_entity(e.text)]


NAME_TOKEN = re.compile(r"[A-ZÄÖÜ][a-zäöüß]{2,}(?:-[A-ZÄÖÜ][a-zäöüß]+)?")


def _rule_names(s: str) -> list[str]:
    """Surface strings of rule hits, to remember which names were masked."""
    m = rules()
    out = []
    for rx in (m.TITLE_RULE, m.FIRST_NAME_RULE, m.NAME_LIST):
        for x in rx.finditer(s):
            out += [t for t in NAME_TOKEN.findall(x.group(0)) if not re.fullmatch(
                r"(Dr|Mag|Prof|Herr|Herrn|Frau|Präsident\w*|Direktor\w*|Obmann|Obfrau|Bundesminister\w*|Landesr\w*|"
                r"Landeshaupt\w*|Abgeordnete\w*|Sektionschef\w*|Bürgermeister\w*|Primar\w*|Prim|Hofr\w*|Vizepräsident\w*|"
                r"Generaldirektor\w*|Ing|Univ)", t)]
    return out


def mask_many(texts: list[str], n_process: int = 1) -> tuple[list[str], int, list[list[str]]]:
    """Sentence-mask every text (a person hit masks the whole sentence as [...]).
    Returns (masked_texts, n_sentences_masked, masked_name_strings_per_text)."""
    m = rules()
    out, n_masked, names = [], 0, []
    docs = nlp().pipe(texts, batch_size=64, n_process=n_process)
    for text, doc in zip(texts, docs):
        spans = _per_spans(doc)
        hit_names: list[str] = []
        paras_out = []
        base = 0
        for para in text.split("\n\n"):
            p_start = text.find(para, base)
            base = p_start + len(para)
            out_s, pos = [], 0
            for s in m.sentences(para):
                a = para.find(s, pos)
                b = a + len(s)
                pos = max(b, pos)
                ga, gb = p_start + a, p_start + b
                per = [t for x, y, t in spans if x < gb and y > ga]
                rk = rule_hit(s)
                if per or rk:
                    n_masked += 1
                    hit_names += [w for t in per for w in NAME_TOKEN.findall(t)] + (_rule_names(s) if rk else [])
                    if not (out_s and out_s[-1] == MASK):
                        out_s.append(MASK)
                else:
                    out_s.append(s)
            paras_out.append(" ".join(out_s).strip())
        out.append("\n\n".join(p for p in paras_out if p))
        names.append(sorted(set(hit_names)))
    return out, n_masked, names


def verify(texts: list[str]) -> list[tuple[int, str]]:
    """Rescan; returns [(index, kind)] for anything that still looks like a person, a quote or an office."""
    m = rules()
    bad = []
    for i, (t, doc) in enumerate(zip(texts, nlp().pipe(texts, batch_size=64))):
        if _per_spans(doc):
            bad.append((i, "ner"))
            continue
        if "\u2014" in t:
            bad.append((i, "em_dash"))
            continue
        for para in t.split("\n\n"):
            hit = None
            for s in m.sentences(para):
                hit = rule_hit(s) or ("quote" if is_quote(s) else None) or ("office" if office_hit(s) else None)
                if hit:
                    break
            if hit:
                bad.append((i, hit))
                break
    return bad


def leaks_names(text: str, names: list[str]) -> bool:
    low = text.lower()
    return any(re.search(r"\b" + re.escape(n.lower()) + r"\b", low) for n in names if len(n) >= 3)


def fail_closed(texts: list[str], what: str) -> None:
    bad = verify(texts)
    if bad:
        kinds = sorted({k for _, k in bad})
        raise SystemExit(f"guard: {len(bad)} {what} still contain {kinds} (rows {[i for i, _ in bad][:20]}); "
                         "nothing written")
