"""Page text normalisation: pdftotext -layout column reflow, OCR cleanup, hyphenation, outlets."""
from __future__ import annotations

import re
import unicodedata

LIGATURES = {"\ufb00": "ff", "\ufb01": "fi", "\ufb02": "fl", "\ufb03": "ffi", "\ufb04": "ffl", "\u00ad": "",
             "\u2014": "-", "\u2013": "-", "\u2015": "-", "\u2012": "-", "\u00a0": " ", "\u2009": " ", "\u202f": " ",
             "\u200b": "", "\ufeff": ""}
_LIG_RX = re.compile("|".join(map(re.escape, LIGATURES)))
CTRL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")


def normalise_chars(t: str) -> str:
    t = unicodedata.normalize("NFC", t.replace("\x0c", "\n"))
    t = _LIG_RX.sub(lambda m: LIGATURES[m.group(0)], t)
    return CTRL.sub(" ", t)


def reflow_columns(page: str, min_gutter: int = 2, max_occ: float = 0.04) -> str:
    """pdftotext -layout puts newspaper columns side by side on one line. Find vertical gutters and
    read column by column. A gutter is a run of >= 2 character positions that is blank on almost
    every line that has text on both sides of it (prose has single spaces, so a shared double blank
    across several such lines is a column boundary, not a word gap)."""
    lines = page.split("\n")
    nonempty = [ln for ln in lines if ln.strip()]
    if len(nonempty) < 6:
        return page
    width = max(len(ln) for ln in nonempty)
    if width < 60:
        return page
    span = [0] * width
    occ = [0] * width
    for ln in nonempty:
        first = len(ln) - len(ln.lstrip())
        last = len(ln.rstrip()) - 1
        for i in range(first + 1, last):
            span[i] += 1
            if ln[i] != " ":
                occ[i] += 1
    need = max(2, int(0.08 * len(nonempty)))
    gut = [span[i] >= need and occ[i] <= max_occ * span[i] for i in range(width)]
    cuts, run = [], 0
    for i in range(width):
        if gut[i]:
            run += 1
        else:
            if run >= min_gutter:
                cuts.append(i - run // 2 - 1)
            run = 0
    # a column must be at least 15 characters wide
    edges = [0] + cuts + [width]
    cuts = [c for j, c in enumerate(cuts) if c - edges[j] >= 15 and edges[j + 2] - c >= 15]
    if not cuts:
        return page
    bounds = [0] + [c + 1 for c in cuts] + [width + 1]
    cols = []
    for a, b in zip(bounds, bounds[1:]):
        cols.append("\n".join(ln[a:b].rstrip() for ln in lines))
    return "\n\n".join(cols)


HYPHEN_KEEP = re.compile(r"^(und|oder|bzw|sowie|als|bis|wie)\b")


def join_lines(block: str) -> str:
    """Join one paragraph's lines, repairing line-end hyphenation ("Gesund-\\nheit" -> "Gesundheit",
    but "Ärzte-\\nund" and "Kassen-\\nReform" keep their hyphen)."""
    out = ""
    for ln in (x.strip() for x in block.split("\n")):
        if not ln:
            continue
        if not out:
            out = ln
        elif re.search(r"[A-Za-zäöüßÄÖÜ]-$", out) and ln[:1].islower() and not HYPHEN_KEEP.match(ln):
            out = out[:-1] + ln
        else:
            out += " " + ln
    return re.sub(r"[ \t]{2,}", " ", out).strip()


PAGE_FURNITURE = re.compile(r"^\s*(Seite\s+\d+(\s*(von|/)\s*\d+)?|\d{1,3}|-\s*\d+\s*-|Pressespiegel\b.*|"
                            r"Copyright\b.*|©.*|Alle Rechte vorbehalten.*|www\.[\w.-]+\s*|"
                            r".{0,60}\b\d{1,2}\.\s?\d{1,2}\.\s?\d{4}\b.{0,12}(Seite|S\.)\s*\d+.*)\s*$", re.I)
# OCR junk: lines that are mostly non-letters
def _junk(ln: str) -> bool:
    s = ln.strip()
    if not s:
        return False
    letters = sum(ch.isalpha() for ch in s)
    return len(s) >= 3 and letters / len(s) < 0.45


def paragraphs(page_text: str, layout: bool = True) -> list[str]:
    t = normalise_chars(page_text)
    if layout:
        t = reflow_columns(t)
    lines = [ln for ln in t.split("\n") if not PAGE_FURNITURE.match(ln) and not _junk(ln)]
    blocks, cur = [], []
    for ln in lines:
        if ln.strip():
            cur.append(ln)
        elif cur:
            blocks.append("\n".join(cur))
            cur = []
    if cur:
        blocks.append("\n".join(cur))
    out = [join_lines(b) for b in blocks]
    return [p for p in out if len(p) >= 20]


OUTLETS = [
    ("Der Standard", r"\bDer\s+Standard\b|\bderStandard\b"), ("Die Presse", r"\bDie\s+Presse\b|\bDiePresse\b"),
    ("Kurier", r"\bKurier\b"), ("Kronen Zeitung", r"\bKronen\s*Zeitung\b|\bKrone\b"),
    ("Salzburger Nachrichten", r"\bSalzburger\s+Nachrichten\b"), ("Kleine Zeitung", r"\bKleine\s+Zeitung\b"),
    ("Oberösterreichische Nachrichten", r"\bOberösterreichische\s+Nachrichten\b|\bOÖN\b"),
    ("Tiroler Tageszeitung", r"\bTiroler\s+Tageszeitung\b"), ("Vorarlberger Nachrichten", r"\bVorarlberger\s+Nachrichten\b"),
    ("Wiener Zeitung", r"\bWiener\s+Zeitung\b"), ("profil", r"\bprofil\b"), ("Heute", r"^\s*Heute\b"),
    ("Österreich", r"^\s*Österreich\s*$|\boe24\b"), ("NÖN", r"\bNÖN\b|Niederösterreichische\s+Nachrichten"),
    ("Falter", r"\bFalter\b"), ("Wirtschaftsblatt", r"\bWirtschaftsBlatt\b|\bWirtschaftsblatt\b"),
    ("Medical Tribune", r"\bMedical\s+Tribune\b"), ("Ärzte Woche", r"\bÄrzte\s*Woche\b"),
    ("Österreichische Ärztezeitung", r"\bÄrztezeitung\b|\bÄrzte\s+Zeitung\b"), ("Ärzte Krone", r"\bÄrzte\s*Krone\b"),
    ("APA-OTS", r"\bOTS\b|\bAPA-OTS\b"), ("APA", r"\bAPA\b"), ("ORF", r"\bORF\b"),
    ("Neue Vorarlberger Tageszeitung", r"\bNeue\s+Vorarlberger\b"), ("Bezirksblätter", r"\bBezirksbl[äa]tter\b"),
    ("Format", r"^\s*Format\b"), ("trend", r"^\s*trend\b"), ("News", r"^\s*News\b"),
    ("Clinicum", r"\bClinicum\b"), ("Relatus", r"\bRelatus\b"), ("medinlive", r"\bmedinlive\b"),
]
_OUTLET_RX = [(n, re.compile(rx, re.M)) for n, rx in OUTLETS]


def outlet_of(header: str) -> str | None:
    """Outlet named in a clipping header (first lines of the page). Earliest match wins."""
    best = None
    for name, rx in _OUTLET_RX:
        m = rx.search(header)
        if m and (best is None or m.start() < best[0]):
            best = (m.start(), name)
    return best[1] if best else None


def norm_key(t: str) -> str:
    t = unicodedata.normalize("NFKD", t.lower())
    t = "".join(ch for ch in t if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", " ", t).strip()
