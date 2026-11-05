"""Held-out stance agreement: adapter vs prompted baseline, per institution.

For each held-out SFT row (statements dated after the time cutoff, never seen in training):
  reference = the institution's real paragraph
  adapter   = generation by the persona adapter (vLLM model=<role>, or an Azure fine-tuned deployment)
  baseline  = generation by the base model with the same role card + context (no adapter)
A judge model labels the stance of each text toward the draft provision on the engine's scale
(-2 strongly against .. +2 strongly for) plus the main demand. Metrics per role:
  exact   = share with judge(gen) == judge(ref)
  sign    = share with the same direction (against / neutral / for)
  within1 = share with |judge(gen) - judge(ref)| <= 1
  incharacter = mean P(role | gen) from the SetFit classifier (if the role is a classifier class)
Stance labels are LLM-derived (FR-C1 method note); spot-check out/eval/<run>/rows.jsonl by hand.

Endpoints (any OpenAI-compatible):
  --gen-base-url  default http://127.0.0.1:8000/v1 (scripts/serve_vllm.sh), key from GEN_API_KEY or "x"
  --base-model    model name of the prompted baseline on that endpoint (default Qwen/Qwen3-8B)
  --adapter-model template for the adapter name, default "{role}" (vLLM lora module); for Azure pass
                  the deployment name, e.g. "sv-all-ft" (joint model) and --gen-base-url for Azure v1
  judge: OPENAI_COMPATIBLE_BASE_URL / OPENAI_COMPATIBLE_API_KEY, --judge-model (default gpt-4.1)
Run:  uv run python -I scripts/eval_stance.py --n 40 --roles all
"""
from __future__ import annotations

import argparse
import collections
import concurrent.futures as cf
import json
import os
import re
import sys
import time
from pathlib import Path

MODELS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from institutions import INST  # noqa: E402

JUDGE = """Sie bewerten Stellungnahmen im österreichischen Begutachtungsverfahren.
Entwurf und Kontext:
{context}

Text einer Institution:
<<<
{text}
>>>
Bewerten Sie die Haltung des Textes zur betroffenen Regelung des Entwurfs auf der Skala
-2 (entschieden ablehnend), -1 (eher ablehnend / Änderung gefordert), 0 (neutral, rein technisch),
+1 (eher zustimmend mit Vorbehalten), +2 (klar zustimmend).
Antworten Sie als JSON: {{"stance": <int>, "demand": "<Hauptforderung in einem Satz>"}}"""


def sign(x):
    return (x > 0) - (x < 0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--roles", default="all", help="comma list or 'all' (roles with held-out rows)")
    ap.add_argument("--n", type=int, default=40, help="held-out rows per role")
    ap.add_argument("--gen-base-url", default="http://127.0.0.1:8000/v1")
    ap.add_argument("--base-model", default="Qwen/Qwen3-8B")
    ap.add_argument("--adapter-model", default="{role}")
    ap.add_argument("--judge-model", default=os.environ.get("JUDGE_MODEL", "gpt-4.1"))
    ap.add_argument("--judge-temperature", default=os.environ.get("JUDGE_TEMPERATURE", "0"),
                    help="'none' omits it (reasoning judges such as gpt-6-sol only accept the default)")
    ap.add_argument("--no-classifier", action="store_true")
    ap.add_argument("--workers", type=int, default=8)
    a = ap.parse_args()
    from openai import OpenAI

    gen = OpenAI(base_url=a.gen_base_url, api_key=os.environ.get("GEN_API_KEY", "x"))
    jb, jk = os.environ.get("OPENAI_COMPATIBLE_BASE_URL"), os.environ.get("OPENAI_COMPATIBLE_API_KEY")
    if not jb or not jk:
        raise SystemExit("judge endpoint missing: set OPENAI_COMPATIBLE_BASE_URL / OPENAI_COMPATIBLE_API_KEY")
    judge = OpenAI(base_url=jb, api_key=jk)
    scorer = None
    if not a.no_classifier:
        from persona_score import Scorer
        scorer = Scorer()

    roles = list(INST) if a.roles == "all" else a.roles.split(",")
    items = []
    for role in roles:
        p = MODELS / "data" / "sft" / f"{role}.heldout.jsonl"
        if p.exists():
            items += [(role, json.loads(l)) for l in list(open(p))[: a.n]]
    print(f"eval: {len(items)} held-out rows", flush=True)

    def chat(client, model, msgs, **kw):
        r = client.chat.completions.create(model=model, messages=msgs, max_tokens=600, temperature=0.3,
                                           extra_body={"chat_template_kwargs": {"enable_thinking": False}}, **kw)
        return re.sub(r"<think>.*?</think>", "", r.choices[0].message.content or "", flags=re.S).strip()

    def judge_one(context, text):
        kw = {} if a.judge_temperature == "none" else {"temperature": float(a.judge_temperature)}
        out = judge.chat.completions.create(model=a.judge_model, response_format={"type": "json_object"}, **kw,
                                            messages=[{"role": "user", "content": JUDGE.format(context=context, text=text)}])
        j = json.loads(out.choices[0].message.content)
        return max(-2, min(2, int(j["stance"]))), j.get("demand", "")

    def run(item):
        role, r = item
        msgs = r["messages"][:2]
        ctx = r["messages"][1]["content"]
        g_ad = chat(gen, a.adapter_model.format(role=role), msgs)
        g_bl = chat(gen, a.base_model, msgs)
        s_ref, d_ref = judge_one(ctx, r["messages"][2]["content"])
        s_ad, d_ad = judge_one(ctx, g_ad)
        s_bl, d_bl = judge_one(ctx, g_bl)
        return {"role": role, "id": r["meta"]["stellungnahme_id"], "seg": r["meta"]["seg"], "ref_stance": s_ref,
                "adapter_stance": s_ad, "baseline_stance": s_bl, "ref_demand": d_ref, "adapter_demand": d_ad,
                "baseline_demand": d_bl, "adapter_text": g_ad, "baseline_text": g_bl}

    rows = []
    with cf.ThreadPoolExecutor(a.workers) as ex:
        for f in cf.as_completed([ex.submit(run, it) for it in items]):
            try:
                rows.append(f.result())
            except Exception as e:  # noqa: BLE001
                print("  skip:", e.__class__.__name__, str(e)[:120], flush=True)
    # CON-1/CON-2: generations may hallucinate names; mask before anything is stored or shown
    import pii_guard
    for k in ("adapter_text", "baseline_text"):
        masked, _ = pii_guard.mask_many([x[k] for x in rows])
        for x, m in zip(rows, masked):
            x[k] = m
    if scorer:
        for k in ("adapter", "baseline"):
            probs = scorer.scores_many([x[f"{k}_text"] for x in rows])
            for x, p in zip(rows, probs):
                x[f"{k}_incharacter"] = p.get(x["role"])

    rep = {}
    by = collections.defaultdict(list)
    for x in rows:
        by[x["role"]].append(x)
    for role, xs in by.items():
        d = {"n": len(xs)}
        for k in ("adapter", "baseline"):
            d[k] = {"exact": sum(x[f"{k}_stance"] == x["ref_stance"] for x in xs) / len(xs),
                    "sign": sum(sign(x[f"{k}_stance"]) == sign(x["ref_stance"]) for x in xs) / len(xs),
                    "within1": sum(abs(x[f"{k}_stance"] - x["ref_stance"]) <= 1 for x in xs) / len(xs)}
            ic = [x[f"{k}_incharacter"] for x in xs if x.get(f"{k}_incharacter") is not None]
            d[k]["incharacter"] = sum(ic) / len(ic) if ic else None
        rep[role] = d
    run_dir = MODELS / "out" / "eval" / time.strftime("%Y%m%d-%H%M%S")
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "rows.jsonl").write_text("".join(json.dumps(x, ensure_ascii=False) + "\n" for x in rows))
    (run_dir / "report.json").write_text(json.dumps({"args": vars(a), "per_role": rep}, indent=1))
    print("| role | n | sign adapter | sign baseline | within1 adapter | within1 baseline | in-char adapter | in-char baseline |")
    print("|---|---:|---:|---:|---:|---:|---:|---:|")
    f = lambda v: "n/a" if v is None else f"{v:.2f}"  # noqa: E731
    for role, d in rep.items():
        print(f"| {role} | {d['n']} | {f(d['adapter']['sign'])} | {f(d['baseline']['sign'])} | {f(d['adapter']['within1'])} | "
              f"{f(d['baseline']['within1'])} | {f(d['adapter']['incharacter'])} | {f(d['baseline']['incharacter'])} |")
    print("written", run_dir)


if __name__ == "__main__":
    main()
