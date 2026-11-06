"""DPO steadfastness pairs: chosen = holds the documented position under a counterargument,
rejected = concedes. Synthetic parts (counterargument, rejected, rebuttal) come from an
OpenAI-compatible endpoint; without OPENAI_COMPATIBLE_BASE_URL and OPENAI_COMPATIBLE_API_KEY the
script prints a notice and exits 0 without writing anything.

Pair layout (multi-turn):
  system  = role card
  user    = draft context (as in SFT)
  assistant = the institution's DOCUMENTED paragraph (real, masked)
  user    = counterargument by another actor (synthetic)
  chosen    = rebuttal that keeps the documented position (synthetic, constrained to the paragraph;
              --chosen verbatim uses a fixed lead-in + the documented demand instead, no generation)
  rejected  = concession that drops or waters down the position (synthetic)

Outputs (models/data/dpo/): <role>.<split>.trl.jsonl  {prompt, chosen, rejected} (TRL conversational)
                            all.<split>.azure.jsonl   {input:{messages}, preferred_output, non_preferred_output}
Every generated text passes pii_guard; rows that still hit are dropped; final verify fails closed.

Run:  uv run python -I scripts/gen_dpo.py --azure --model gpt-6-sol      # team Foundry endpoint from .env
  or  OPENAI_COMPATIBLE_BASE_URL=... OPENAI_COMPATIBLE_API_KEY=... \
      uv run python -I scripts/gen_dpo.py --model gpt-4.1-mini --per-role 150
"""
from __future__ import annotations

import argparse
import collections
import concurrent.futures as cf
import hashlib
import json
import os
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pii_guard  # noqa: E402
from institutions import INST  # noqa: E402

MODELS = Path(__file__).resolve().parents[1]
SFT = MODELS / "data" / "sft"
OUT = MODELS / "data" / "dpo"
CACHE = MODELS / "out" / "dpo_cache"

GEN_PROMPT = """Sie erzeugen Trainingsdaten für eine Verhandlungssimulation österreichischer Gesundheitspolitik.
Institution: {label}
Dokumentierte Position dieser Institution (aus ihrer echten Begutachtungsstellungnahme):
<<<
{position}
>>>
Kontext: {context}

Erzeugen Sie JSON mit drei Feldern, alles auf Deutsch, ohne Namen realer Personen, nur Institutionen:
"counterargument": ein sachlicher, plausibler Einwand eines anderen Akteurs ({opponent}) gegen genau diese Position, 2 bis 4 Sätze.
"rejected": eine Antwort der Institution, die unter dem Einwand nachgibt, die Forderung aufgibt oder deutlich abschwächt, 2 bis 4 Sätze, im Stil der Institution.
"chosen": eine Antwort der Institution, die den Einwand aufgreift, aber die dokumentierte Position und Forderung beibehält und begründet, 3 bis 5 Sätze. Nur Argumente, die in der dokumentierten Position stehen oder direkt daraus folgen; keine neuen Zahlen.
"""

OPPONENTS = {
    "ministry_finance": "Gesundheitsministerium", "ministry_health": "Finanzministerium",
    "social_insurance": "Ärztekammer", "medical_chamber": "Sozialversicherung",
    "contract_physicians": "Sozialversicherung", "elective_physicians": "Sozialversicherung",
    "hospitals": "Sozialversicherung", "nursing": "Ärztekammer", "patients": "Finanzministerium",
    "laender": "Bund (Finanzministerium)", "chamber_labour": "Wirtschaftskammer", "chamber_commerce": "Arbeiterkammer",
}


def gen(client, model, r, role):
    msgs = r["messages"]
    key = hashlib.sha1((model + msgs[1]["content"] + msgs[2]["content"]).encode()).hexdigest()
    cp = CACHE / f"{key}.json"
    if cp.exists():
        return json.loads(cp.read_text())
    prompt = GEN_PROMPT.format(label=INST[role]["label"], position=msgs[2]["content"],
                               context=msgs[1]["content"].splitlines()[0], opponent=OPPONENTS.get(role, "ein anderer Akteur"))
    schema = {"type": "json_schema", "json_schema": {"name": "dpo_pair", "strict": True, "schema": {
        "type": "object", "additionalProperties": False, "required": ["counterargument", "rejected", "chosen"],
        "properties": {k: {"type": "string"} for k in ("counterargument", "rejected", "chosen")}}}}
    resp = client.chat.completions.create(model=model, response_format=schema,
                                          messages=[{"role": "user", "content": prompt}])
    out = json.loads(resp.choices[0].message.content)
    if not all(isinstance(out.get(k), str) and out[k].strip() for k in ("counterargument", "rejected", "chosen")):
        raise ValueError("incomplete generation")
    CACHE.mkdir(parents=True, exist_ok=True)
    cp.write_text(json.dumps(out, ensure_ascii=False))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=os.environ.get("OPENAI_COMPATIBLE_MODEL", "gpt-4.1-mini"))
    ap.add_argument("--per-role", type=int, default=150, help="max SFT rows per role and split to turn into pairs")
    ap.add_argument("--chosen", choices=["generated", "verbatim"], default="generated")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--azure", action="store_true", help="use the team Foundry endpoint from .env (e.g. --model gpt-6-sol)")
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()

    if a.azure:
        from envfile import azure_client
        client = azure_client()
    else:
        base, key = os.environ.get("OPENAI_COMPATIBLE_BASE_URL"), os.environ.get("OPENAI_COMPATIBLE_API_KEY")
        if not base or not key:
            print("gen_dpo: OPENAI_COMPATIBLE_BASE_URL / OPENAI_COMPATIBLE_API_KEY not set; skipping (nothing written)")
            return
        from openai import OpenAI
        client = OpenAI(base_url=base, api_key=key)

    random.seed(a.seed)
    jobs = []
    for role in INST:
        for split in ("train", "heldout"):
            p = SFT / f"{role}.{split}.jsonl"
            if not p.exists():
                continue
            rows = [json.loads(l) for l in open(p)]
            random.shuffle(rows)
            jobs += [(role, split, r) for r in rows[: a.per_role]]
    print(f"gen_dpo: {len(jobs)} rows via {a.model}", flush=True)

    results = []
    with cf.ThreadPoolExecutor(a.workers) as ex:
        futs = {ex.submit(gen, client, a.model, r, role): (role, split, r) for role, split, r in jobs}
        for f in cf.as_completed(futs):
            role, split, r = futs[f]
            try:
                results.append((role, split, r, f.result()))
            except Exception as e:  # noqa: BLE001
                print("  skip:", e.__class__.__name__, flush=True)

    # guard every generated field
    for fld in ("counterargument", "rejected", "chosen"):
        masked, _ = pii_guard.mask_many([g[fld] for _, _, _, g in results])
        for (_, _, _, g), m in zip(results, masked):
            g[fld] = m
    bad = set()
    for fld in ("counterargument", "rejected", "chosen"):
        bad |= {i for i, _, _ in pii_guard.verify([g[fld] for _, _, _, g in results])}
    results = [x for i, x in enumerate(results) if i not in bad]
    pii_guard.fail_closed([g[f] for *_, g in results for f in ("counterargument", "rejected", "chosen")], "dpo rows")

    files = collections.defaultdict(list)
    for role, split, r, g in results:
        prompt = r["messages"] + [{"role": "user", "content": "Einwand: " + g["counterargument"].strip() +
                                   "\nHalten Sie an Ihrer Position fest oder ändern Sie sie? Antworten Sie als Institution."}]
        chosen = g["chosen"] if a.chosen == "generated" else (
            "Wir halten an unserer Position fest. " + r["messages"][2]["content"])
        files[f"{role}.{split}.trl.jsonl"].append({"prompt": prompt, "chosen": [{"role": "assistant", "content": chosen}],
                                                   "rejected": [{"role": "assistant", "content": g["rejected"]}],
                                                   "meta": r["meta"]})
        files[f"all.{split}.azure.jsonl"].append({"input": {"messages": prompt},
                                                  "preferred_output": [{"role": "assistant", "content": chosen}],
                                                  "non_preferred_output": [{"role": "assistant", "content": g["rejected"]}]})
    OUT.mkdir(parents=True, exist_ok=True)
    for name, rows in files.items():
        with open(OUT / name, "w") as f:
            for x in rows:
                f.write(json.dumps(x, ensure_ascii=False) + "\n")
        print(f"  {name}: {len(rows)}")


if __name__ == "__main__":
    main()
