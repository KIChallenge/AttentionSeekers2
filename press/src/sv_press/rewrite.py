"""Step 3: rewrite each person-free passage into the institution's own voice (structured output).

OpenAI-compatible chat completions (OPENAI_COMPATIBLE_BASE_URL / OPENAI_COMPATIBLE_API_KEY from the repo
.env, deployment `gpt-6-sol` by default) with a strict json_schema. Cost control:
  * every pending passage is token-estimated first; the estimate is printed before any call
  * a ledger (work/rewrite_ledger.json) accumulates real usage across runs; a call is only started
    if spent + in-flight reservations + its own estimate stay under the budget (default 25 USD)
  * results are cached per (model, prompt version, passage id, text); reruns are free and resume
  * passages are interleaved across institutions, so a budget stop leaves balanced coverage
Prices are configurable (PRESS_USD_PER_M_IN / PRESS_USD_PER_M_OUT); the defaults are deliberately
on the high side for an unlisted deployment.
"""
from __future__ import annotations

import collections
import concurrent.futures as cf
import hashlib
import json
import os
import re
import threading
from pathlib import Path

from .institutions import BY_KEY, POSITION, TOPIC_KEYS, TOPIC_LABEL

PROMPT_VERSION = "press-rewrite-v1"
USD_PER_M_IN = float(os.environ.get("PRESS_USD_PER_M_IN", "5.0"))
USD_PER_M_OUT = float(os.environ.get("PRESS_USD_PER_M_OUT", "20.0"))
CHARS_PER_TOKEN = 3.0      # German, conservative (real tokenizers give ~3.5 to 4)
EST_OUT_TOKENS = 300       # JSON answer; measured mean on gpt-6-sol is ~185 completion tokens

SYSTEM = (
    "Sie analysieren österreichische Gesundheitspolitik für einen Verhandlungssimulator, in dem nur "
    "Institutionen auftreten, niemals Personen. Sie erhalten einen anonymisierten Ausschnitt aus einem "
    "Pressespiegel und eine Institution. Halten Sie fest, welche Position diese Institution dort vertritt.\n"
    "Regeln:\n"
    "- relevant=false, wenn der Ausschnitt keine eigene Position dieser Institution enthält (nur Erwähnung, "
    "Position eines anderen Akteurs, reine Meldung).\n"
    "- stance_text_de: 1 bis 3 Sätze auf Deutsch, dritte Person, die Institution ist Subjekt "
    "(\"Die Ärztekammer fordert ...\"), Präsens, sinngemäß und in eigenen Worten.\n"
    "- Niemals Personen, Namen, Ämter oder Funktionen nennen (kein Präsident, Minister, Obmann, Sprecher, "
    "Direktor), keine wörtlichen Zitate, keine Anführungszeichen, keine Ich- oder Wir-Form.\n"
    "- Nur was der Ausschnitt belegt; keine Zahlen oder Begründungen erfinden. [...] sind entfernte Sätze, "
    "[Funktion] ist eine entfernte Amtsbezeichnung; ignorieren Sie beides.\n"
    "- about: die Maßnahme oder Streitfrage in 3 bis 8 Wörtern, ohne Personen.\n"
    "- stance zu about: support (dafür), oppose (dagegen), conditional (nur unter Bedingungen), "
    "neutral (abwägend oder unklar)."
)

SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "press_stance",
        "strict": True,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "required": ["relevant", "topic", "about", "stance", "stance_text_de"],
            "properties": {
                "relevant": {"type": "boolean"},
                "topic": {"type": "string", "enum": TOPIC_KEYS},
                "about": {"type": "string"},
                "stance": {"type": "string", "enum": ["support", "oppose", "conditional", "neutral"]},
                "stance_text_de": {"type": "string"},
            },
        },
    },
}


def user_msg(p: dict) -> str:
    inst = BY_KEY[p["inst"]]
    return (f"Institution: {inst.name_de} ({inst.gloss_en})\n"
            f"Datum: {p['date']}\nMedium: {p.get('outlet') or 'unbekannt'}\n"
            f"Themenhinweise: {', '.join(TOPIC_LABEL[t] for t in p.get('topics', {})) or 'keine'}\n\n"
            f"Ausschnitt:\n{p['text']}")


def estimate_tokens(p: dict) -> tuple[int, int]:
    return int((len(SYSTEM) + len(user_msg(p))) / CHARS_PER_TOKEN) + 20, EST_OUT_TOKENS


def usd(tin: int, tout: int) -> float:
    return tin / 1e6 * USD_PER_M_IN + tout / 1e6 * USD_PER_M_OUT


def cache_key(model: str, p: dict) -> str:
    return hashlib.sha1(f"{model}\x00{PROMPT_VERSION}\x00{p['id']}\x00{p['text']}".encode()).hexdigest()


def interleave(passages: list[dict]) -> list[dict]:
    by = collections.defaultdict(list)
    for p in sorted(passages, key=lambda p: -p.get("score", 0)):
        by[p["inst"]].append(p)
    out, queues = [], list(by.values())
    while any(queues):
        for q in queues:
            if q:
                out.append(q.pop(0))
    return out


# --------------------------------------------------------------------------- generators

def load_env(repo: Path) -> None:
    for env in (repo / ".env",):
        if not env.exists():
            continue
        for line in env.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def openai_generator(model: str, repo: Path):
    load_env(repo)
    base, key = os.environ.get("OPENAI_COMPATIBLE_BASE_URL"), os.environ.get("OPENAI_COMPATIBLE_API_KEY")
    if not base or not key:
        raise SystemExit("rewrite: OPENAI_COMPATIBLE_BASE_URL / OPENAI_COMPATIBLE_API_KEY not set (repo .env)")
    from openai import OpenAI
    client = OpenAI(base_url=base, api_key=key, max_retries=4, timeout=120)

    def gen(p: dict) -> tuple[dict, int, int]:
        resp = client.chat.completions.create(
            model=model, response_format=SCHEMA,
            messages=[{"role": "system", "content": SYSTEM}, {"role": "user", "content": user_msg(p)}])
        out = json.loads(resp.choices[0].message.content)
        u = resp.usage
        return out, (u.prompt_tokens if u else 0), (u.completion_tokens if u else 0)
    return gen


_NEG = re.compile(r"\b(lehn\w*|ablehn\w*|kritisier\w*|warn\w*|wehr\w*)\b", re.I)
_COND = re.compile(r"\b(aber|verlangt|fordert|nur wenn|unter der Bedingung)\b", re.I)


def mock_generator():
    """Offline stand-in for tests and dry runs: takes the first sentence where the institution
    takes a position, unchanged. Deliberately naive, so the export guard is exercised on raw text."""
    from . import guard

    def gen(p: dict) -> tuple[dict, int, int]:
        inst = BY_KEY[p["inst"]]
        sent = next((s for para in p["text"].split("\n\n") for s in guard.sentences(para)
                     if inst.rx.search(s) and POSITION.search(s) and guard.MASK not in s), None)
        if not sent:
            return {"relevant": False, "topic": "sonstiges", "about": "", "stance": "neutral",
                    "stance_text_de": ""}, 0, 0
        topic = max(p.get("topics") or {"sonstiges": 1}, key=lambda k: (p.get("topics") or {"sonstiges": 1})[k])
        stance = "oppose" if _NEG.search(sent) else ("conditional" if _COND.search(sent) else "support")
        return {"relevant": True, "topic": topic, "about": TOPIC_LABEL[topic], "stance": stance,
                "stance_text_de": sent.strip()}, 0, 0
    return gen


# --------------------------------------------------------------------------- run

def rewrite(passages_path: Path, out: Path, work: Path, model: str, budget: float, gen, workers: int = 6,
            dry: bool = False, log=print) -> dict:
    passages = interleave([json.loads(x) for x in open(passages_path)])
    cache = work / "cache" / "rewrite"
    cache.mkdir(parents=True, exist_ok=True)
    ledger_p = work / "rewrite_ledger.json"
    ledger = json.loads(ledger_p.read_text()) if ledger_p.exists() else {"spent_usd": 0.0, "calls": 0,
                                                                           "in_tokens": 0, "out_tokens": 0}
    pending, done = [], {}
    for p in passages:
        cp = cache / f"{cache_key(model, p)}.json"
        if cp.exists():
            done[p["id"]] = json.loads(cp.read_text())
        else:
            pending.append(p)
    est_in = sum(estimate_tokens(p)[0] for p in pending)
    est_out = sum(estimate_tokens(p)[1] for p in pending)
    est = usd(est_in, est_out)
    log(f"rewrite: {len(passages)} passages, {len(done)} cached, {len(pending)} to call; estimate "
        f"{est_in:,} in + {est_out:,} out tokens = {est:.2f} USD at {USD_PER_M_IN}/{USD_PER_M_OUT} USD per M; "
        f"spent so far {ledger['spent_usd']:.2f} of {budget:.2f} USD")
    summary = {"passages": len(passages), "cached": len(done), "pending": len(pending), "estimate_usd": round(est, 2),
               "est_in_tokens": est_in, "est_out_tokens": est_out, "budget_usd": budget}
    if dry:
        return summary

    lock = threading.Lock()
    state = {"reserved": 0.0, "stopped": 0, "errors": 0}

    def run(p):
        e = usd(*estimate_tokens(p))
        with lock:
            if ledger["spent_usd"] + state["reserved"] + e > budget:
                state["stopped"] += 1
                return None
            state["reserved"] += e
        try:
            o, tin, tout = gen(p)
        except Exception as ex:  # noqa: BLE001
            with lock:
                state["reserved"] -= e
                state["errors"] += 1
            log(f"  error {p['id']}: {ex.__class__.__name__}")
            return None
        c = usd(tin, tout)
        rec = {"out": o, "in_tokens": tin, "out_tokens": tout, "usd": c, "model": model, "prompt": PROMPT_VERSION}
        with lock:
            state["reserved"] -= e
            ledger["spent_usd"] += c
            ledger["calls"] += 1
            ledger["in_tokens"] += tin
            ledger["out_tokens"] += tout
            (cache / f"{cache_key(model, p)}.json").write_text(json.dumps(rec, ensure_ascii=False))
            if ledger["calls"] % 25 == 0:
                ledger_p.write_text(json.dumps(ledger))
                log(f"  {ledger['calls']} calls, {ledger['spent_usd']:.2f} USD spent")
        return p["id"], rec

    with cf.ThreadPoolExecutor(max(1, workers)) as ex:
        for r in ex.map(run, pending):
            if r:
                done[r[0]] = r[1]
    ledger_p.write_text(json.dumps(ledger))
    with open(out, "w") as f:
        for p in passages:
            if p["id"] in done:
                f.write(json.dumps({"id": p["id"], **done[p["id"]]}, ensure_ascii=False) + "\n")
    summary.update(written=len(done), budget_stopped=state["stopped"], errors=state["errors"],
                   spent_usd=round(ledger["spent_usd"], 4), calls_total=ledger["calls"])
    if state["stopped"]:
        log(f"rewrite: budget reached, {state['stopped']} passages left for a later run (raise --budget)")
    log(f"rewrite: {len(done)} rewrites -> {out}; spent {ledger['spent_usd']:.2f} USD total")
    return summary
