"""CON-1/CON-2 guard for every training row (fail closed).

Re-runs the data track's person-name rules on any text that goes into a training or eval file:
spaCy de_core_news_lg PER entities (with the data track's false-positive filter), title rule,
"Surname, Firstname" lists, first-name list, "e.h." signature marks. A hit masks the whole sentence
as "[...]" (same procedure as data/scripts/05_extract_clean.py). After masking, `verify()` rescans;
callers must abort without writing if anything survives.

The rules are imported read-only from data/scripts/05_extract_clean.py so there is one source of truth.
If that import fails the guard raises: no rules, no output.
"""
from __future__ import annotations

import importlib.util
import re
import sys
from functools import lru_cache
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DATA_SCRIPTS = REPO / "data" / "scripts"
MASK = "[...]"
EH = re.compile(r"\be\.\s?h\.")


@lru_cache(maxsize=1)
def rules():
    path = DATA_SCRIPTS / "05_extract_clean.py"
    if not path.exists():
        raise SystemExit(f"pii_guard: rule source missing ({path}); refusing to continue")
    sys.path.insert(0, str(DATA_SCRIPTS))
    try:
        spec = importlib.util.spec_from_file_location("extract_rules", path)
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
    finally:
        sys.path.remove(str(DATA_SCRIPTS))
    for name in ("title_hit", "FIRST_NAME_RULE", "NAME_LIST", "sentences", "is_person_entity", "PER_ALLOW", "load_nlp"):
        if not hasattr(m, name):
            raise SystemExit(f"pii_guard: rule {name} missing in {path}; refusing to continue")
    return m


@lru_cache(maxsize=1)
def nlp():
    return rules().load_nlp()


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
    return [(e.start_char, e.end_char) for e in doc.ents
            if e.label_ == "PER" and not m.PER_ALLOW.match(e.text.strip()) and m.is_person_entity(e.text)]


def mask_many(texts: list[str], batch_size: int = 128, n_process: int = 4) -> tuple[list[str], int]:
    """Sentence-mask every text. Returns (masked_texts, n_sentences_masked)."""
    m = rules()
    out, n_masked = [], 0
    docs = nlp().pipe(texts, batch_size=batch_size, n_process=n_process)
    for text, doc in zip(texts, docs):
        spans = _per_spans(doc)
        paras_out = []
        base = 0
        for para in text.split("\n\n"):
            p_start = text.find(para, base)
            base = p_start + len(para)
            out_s, pos = [], 0
            for s in m.sentences(para):
                a = para.find(s, pos)
                b = a + len(s)
                pos = b
                ga, gb = p_start + a, p_start + b
                hit = any(x < gb and y > ga for x, y in spans) or rule_hit(s)
                if hit:
                    n_masked += 1
                    if not (out_s and out_s[-1] == MASK):
                        out_s.append(MASK)
                else:
                    out_s.append(s)
            paras_out.append(" ".join(out_s).strip())
        out.append("\n\n".join(p for p in paras_out if p))
    return out, n_masked


def verify(texts: list[str], n_process: int = 4) -> list[tuple[int, str, str]]:
    """Rescan; returns [(index, kind, snippet)] for anything that still looks like a person name."""
    m = rules()
    bad = []
    for i, (t, doc) in enumerate(zip(texts, nlp().pipe(texts, batch_size=128, n_process=n_process))):
        if _per_spans(doc):
            bad.append((i, "ner", t[:80]))
            continue
        for para in t.split("\n\n"):
            for s in m.sentences(para):
                k = rule_hit(s)
                if k:
                    bad.append((i, k, s[:80]))
                    break
    return bad


def masked_fraction(text: str) -> float:
    return text.count(MASK) * 40 / max(len(text), 1)  # a masked sentence is ~40 chars on average


def fail_closed(texts: list[str], what: str) -> None:
    bad = verify(texts)
    if bad:
        # print kinds and row indices only, never the matched text
        kinds = {}
        for _, k, _ in bad:
            kinds[k] = kinds.get(k, 0) + 1
        raise SystemExit(f"pii_guard FAIL on {what}: {len(bad)} rows still hit {kinds}; nothing written")
