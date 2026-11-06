"""Persona v2 SFT sets: Stellungnahme rows + press-derived institution-voice rows, stance prefix first.

  uv run python -I scripts/build_v2_data.py [--label-only] [--workers 16]

1. Stance labels: every train row of data/sft/<role>.train.jsonl gets a judge label on the same scale as
   eval_stance.py (-2..+2), asked in batches of 8 paragraphs per call (same judge, gpt-6-sol). Labels are
   cached in data/v2/stance_labels.jsonl, keyed by a hash of context + paragraph, so a rerun is free.
   Press rows already carry a stance from the press pipeline (support / oppose / conditional / neutral).
2. Target = "Haltung: <label>. " + original paragraph, so the adapter commits to a direction before it
   picks the wording. The proxy strips the prefix again before returning text (and the eval judges the
   stripped text, so the prefix cannot leak the answer to the judge).
3. Press rows (press/derived/sft/<role>.train.jsonl, split=train only; held-out press rows are never read)
   are appended, dated before the 2023-01-01 cutoff only.
4. Dedupe on the normalised target paragraph (first occurrence wins), then the CON-1/CON-2 guard
   (pii_guard.mask_many + fail_closed) over every user and assistant text; the build aborts without
   writing if anything still hits.
Held-out SFT rows (data/sft/<role>.heldout.jsonl) are not touched: eval stays on the v1 split.
Output: data/v2/sft/<role>.{train,heldout}.jsonl (gitignored), data/v2/stats.json.
"""
from __future__ import annotations

import argparse
import collections
import concurrent.futures as cf
import hashlib
import json
import os
import re
import sys
from pathlib import Path

MODELS = Path(__file__).resolve().parents[1]
REPO = MODELS.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
import envfile  # noqa: E402

ROLES = ["patients", "ministry_finance", "chamber_commerce", "medical_chamber", "hospitals", "nursing",
         "chamber_labour", "social_insurance", "laender"]
SFT = MODELS / "data" / "sft"
PRESS = Path(os.environ.get("SV_PRESS_SFT", REPO / "press" / "derived" / "sft"))
OUT = MODELS / "data" / "v2"
CUTOFF = "2023-01-01"
LABEL = {-2: "ablehnend", -1: "eher ablehnend", 0: "neutral", 1: "zustimmend mit Vorbehalten", 2: "zustimmend"}
PRESS_STANCE = {"oppose": -2, "conditional": 1, "support": 2, "neutral": 0}
PREFIX_RE = re.compile(r"^\s*Haltung:\s*(ablehnend|eher ablehnend|neutral|zustimmend mit Vorbehalten|zustimmend)\.\s*")

BATCH_PROMPT = """Sie bewerten Stellungnahmen im österreichischen Begutachtungsverfahren.
Unten stehen {k} Absätze, jeweils mit dem Entwurf und Kontext, auf den sie sich beziehen.
Bewerten Sie für jeden Absatz die Haltung zur betroffenen Regelung des Entwurfs auf der Skala
-2 (entschieden ablehnend), -1 (eher ablehnend / Änderung gefordert), 0 (neutral, rein technisch),
+1 (eher zustimmend mit Vorbehalten), +2 (klar zustimmend).

{items}

Antworten Sie als JSON: {{"stances": [<int für Absatz 1>, <int für Absatz 2>, ...]}} mit genau {k} Werten."""


def key(ctx: str, text: str) -> str:
    return hashlib.sha256((ctx + "\n\x00\n" + text).encode()).hexdigest()[:20]


def norm(t: str) -> str:
    return re.sub(r"\W+", " ", t.lower()).strip()


def label_rows(pending: list[tuple[str, str, str]], workers: int, model: str) -> dict[str, int]:
    from openai import OpenAI
    envfile.load_env()
    client = OpenAI(base_url=os.environ["OPENAI_COMPATIBLE_BASE_URL"], api_key=os.environ["OPENAI_COMPATIBLE_API_KEY"])
    batches = [pending[i:i + 8] for i in range(0, len(pending), 8)]

    def one(batch):
        items = "\n\n".join(f"### Absatz {i + 1}\nKontext:\n{c}\nText:\n<<<\n{t}\n>>>" for i, (_, c, t) in enumerate(batch))
        for _ in range(3):
            try:
                r = client.chat.completions.create(model=model, response_format={"type": "json_object"}, messages=[
                    {"role": "user", "content": BATCH_PROMPT.format(k=len(batch), items=items)}])
                s = json.loads(r.choices[0].message.content)["stances"]
                if len(s) == len(batch):
                    return {k: max(-2, min(2, int(v))) for (k, _, _), v in zip(batch, s)}
            except Exception as e:  # noqa: BLE001
                print("  retry:", e.__class__.__name__, str(e)[:100], flush=True)
        return {}

    out: dict[str, int] = {}
    cache = OUT / "stance_labels.jsonl"
    with cf.ThreadPoolExecutor(workers) as ex, open(cache, "a") as fh:
        for n, f in enumerate(cf.as_completed([ex.submit(one, b) for b in batches]), 1):
            res = f.result()
            out.update(res)
            for k, v in res.items():
                fh.write(json.dumps({"key": k, "stance": v}) + "\n")
            fh.flush()
            if n % 20 == 0:
                print(f"  labelled batches {n}/{len(batches)}", flush=True)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--workers", type=int, default=16)
    ap.add_argument("--judge-model", default="gpt-6-sol")
    ap.add_argument("--label-only", action="store_true")
    a = ap.parse_args()
    (OUT / "sft").mkdir(parents=True, exist_ok=True)
    cache = OUT / "stance_labels.jsonl"
    labels = {}
    if cache.exists():
        labels = {j["key"]: j["stance"] for j in map(json.loads, open(cache))}
    sft = {r: [json.loads(l) for l in open(SFT / f"{r}.train.jsonl")] for r in ROLES}
    pending = []
    for r, rows in sft.items():
        for x in rows:
            ctx, txt = x["messages"][1]["content"], x["messages"][2]["content"]
            k = key(ctx, txt)
            if k not in labels:
                pending.append((k, ctx, txt))
    pending = list({p[0]: p for p in pending}.values())
    print(f"stance labels cached {len(labels)}, to label {len(pending)}", flush=True)
    if pending:
        labels.update(label_rows(pending, a.workers, a.judge_model))
    if a.label_only:
        return

    import pii_guard
    stats = {}
    for r in ROLES:
        rows, seen = [], set()
        c = collections.Counter()
        for x in sft[r]:
            ctx, txt = x["messages"][1]["content"], x["messages"][2]["content"]
            s = labels.get(key(ctx, txt))
            if s is None:
                c["unlabelled_dropped"] += 1
                continue
            if norm(txt) in seen:
                c["dup_dropped"] += 1
                continue
            seen.add(norm(txt))
            rows.append({"messages": [x["messages"][0], x["messages"][1],
                                      {"role": "assistant", "content": f"Haltung: {LABEL[s]}. {txt}"}],
                         "meta": {**x["meta"], "corpus": "stellungnahme", "stance": s}})
            c["stellungnahme"] += 1
        pp = PRESS / f"{r}.train.jsonl"
        for x in (json.loads(l) for l in open(pp)) if pp.exists() else []:
            m = x["meta"]
            if m.get("split") != "train" or m.get("date", "9999") >= CUTOFF or m.get("stance") not in PRESS_STANCE:
                c["press_skipped"] += 1
                continue
            txt = x["messages"][2]["content"]
            if norm(txt) in seen:
                c["dup_dropped"] += 1
                continue
            seen.add(norm(txt))
            s = PRESS_STANCE[m["stance"]]
            rows.append({"messages": [x["messages"][0], x["messages"][1],
                                      {"role": "assistant", "content": f"Haltung: {LABEL[s]}. {txt}"}],
                         "meta": {**m, "stance": s}})
            c["press"] += 1
        # CON-1/CON-2 guard over user and assistant turns, fail closed
        for i in (1, 2):
            masked, _ = pii_guard.mask_many([x["messages"][i]["content"] for x in rows])
            for x, t in zip(rows, masked):
                x["messages"][i]["content"] = t
        pii_guard.fail_closed([x["messages"][i]["content"] for x in rows for i in (1, 2)], f"v2 {r}")
        c["stance_dist"] = dict(collections.Counter(x["meta"]["stance"] for x in rows))
        stats[r] = dict(c, n_train=len(rows))
        (OUT / "sft" / f"{r}.train.jsonl").write_text("".join(json.dumps(x, ensure_ascii=False) + "\n" for x in rows))
        # held-out stays the v1 split, unchanged (eval reference); copied so the job sees the same pair of files
        (OUT / "sft" / f"{r}.heldout.jsonl").write_text((SFT / f"{r}.heldout.jsonl").read_text())
        print(r, stats[r], flush=True)
    (OUT / "stats.json").write_text(json.dumps(stats, indent=1) + "\n")


if __name__ == "__main__":
    main()
