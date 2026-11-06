"""Azure OpenAI (Microsoft Foundry) fine-tuning variant: export, upload, create jobs.

Env (read from the repo .env, never printed): BIFROST_SEED_AZURE_ENDPOINT (v1 base URL, .../openai/v1)
      and BIFROST_SEED_AZURE_KEY (sent as api-key header); AZURE_OPENAI_V1_BASE / AZURE_OPENAI_API_KEY override.
      AZURE_FT_MODEL          default FW-Qwen3.5-9B (team Foundry resource; open-weights LoRA fine-tuning)
      AZURE_FT_TRAINING_TYPE  default unset (service default). For gpt-4.1* models: GlobalStandard/Standard/Developer.
Uses the v1 API with the plain openai SDK.

Design: ONE joint model over all institutions (the role card in the system message selects the persona)
rather than one model per institution. Per-institution Azure models each carry an hourly hosting fee
when deployed with Standard; the joint model also lets small institutions borrow register from big ones.
`--per-role` creates one job per eligible role instead.

Commands (from models/):
  uv run python -I scripts/azure_finetune.py export              # data/azure/*.jsonl, no network
  uv run python -I scripts/azure_finetune.py sft  [--per-role] [--dry-run]
  uv run python -I scripts/azure_finetune.py dpo  --from-model <fine_tuned_model_id> [--dry-run]
  uv run python -I scripts/azure_finetune.py status <job_id> | list | cancel <job_id>
  uv run python -I scripts/azure_finetune.py smoke               # 10-row job to prove upload + create
Job ids and file ids are appended to out/azure_jobs.jsonl.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

MODELS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))

AZ = MODELS / "data" / "azure"
SFT = MODELS / "data" / "sft"
DPO = MODELS / "data" / "dpo"
LOG = MODELS / "out" / "azure_jobs.jsonl"
MIN_EXAMPLES = 10  # Azure minimum per training file
USD_PER_M_TRAIN_TOKENS = float(os.environ.get("AZURE_FT_USD_PER_M", "3.3"))  # Qwen3.x SFT retail, per 1M tokens
USD_PER_HOUR_DEPLOYMENT = 0.3
CAP_USD = float(os.environ.get("AZURE_FT_CAP_USD", "100"))  # persona track budget; jobs refuse above this


def estimate(names, epochs):
    """Billed tokens ~ all tokens of every training example (system + user + assistant) x epochs."""
    from transformers import AutoTokenizer
    tok = AutoTokenizer.from_pretrained("Qwen/Qwen3-8B")  # Qwen3.x share the tokenizer family
    rows = []
    for name in names:
        p = SFT / f"{name}.train.jsonl"
        if not p.exists():
            continue
        n_ex, n_tok = 0, 0
        for l in open(p):
            m = json.loads(l)["messages"]
            n_tok += len(tok.apply_chat_template(m, tokenize=True))
            n_ex += 1
        rows.append({"name": name, "examples": n_ex, "tokens": n_tok, "epochs": epochs,
                     "billed_tokens": n_tok * epochs, "usd": n_tok * epochs / 1e6 * USD_PER_M_TRAIN_TOKENS})
    return rows


def strip(src: Path, dst: Path) -> int:
    n = 0
    with open(src) as f, open(dst, "w") as g:
        for l in f:
            r = json.loads(l)
            r.pop("meta", None)
            g.write(json.dumps(r, ensure_ascii=False) + "\n")
            n += 1
    return n


def export(per_role_list):
    AZ.mkdir(parents=True, exist_ok=True)
    out = {}
    for name in ["all"] + per_role_list:
        for split in ("train", "heldout"):
            p = SFT / f"{name}.{split}.jsonl"
            if p.exists():
                out[f"sft.{name}.{split}"] = strip(p, AZ / f"sft.{name}.{split}.jsonl")
    for split in ("train", "heldout"):
        p = DPO / f"all.{split}.azure.jsonl"
        if p.exists():
            out[f"dpo.all.{split}"] = strip(p, AZ / f"dpo.all.{split}.jsonl")
    print(json.dumps(out, indent=1))
    return out


def client():
    from envfile import azure_client
    return azure_client()


def upload(c, path: Path) -> str:
    with open(path, "rb") as f:
        fo = c.files.create(file=f, purpose="fine-tune")
    c.files.wait_for_processing(fo.id)
    return fo.id


def log(rec):
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG, "a") as f:
        f.write(json.dumps({"ts": time.strftime("%Y-%m-%dT%H:%M:%S"), **rec}) + "\n")


def create(c, model, train, valid, method, suffix, ttype, dry):
    body = dict(model=model, training_file=train, validation_file=valid, suffix=suffix[:18], method=method)
    if ttype:
        body["extra_body"] = {"trainingType": ttype}
    if dry:
        print("DRY RUN job:", json.dumps({k: v for k, v in body.items()}, indent=1))
        return None
    job = c.fine_tuning.jobs.create(**body)
    print(job.id, job.status)
    log({"job": job.id, "model": model, "suffix": suffix, "method": method["type"], "train": train, "valid": valid})
    return job.id


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["export", "sft", "dpo", "status", "smoke", "list", "cancel", "cost"])
    ap.add_argument("job_id", nargs="?")
    ap.add_argument("--per-role", action="store_true")
    ap.add_argument("--from-model", help="fine-tuned model id to continue with DPO")
    ap.add_argument("--epochs", default="3", help="2 to 3; 'auto' is rejected by the FW models")
    ap.add_argument("--dry-run", action="store_true", help="export and print the job bodies, no upload")
    a = ap.parse_args()

    model = os.environ.get("AZURE_FT_MODEL", "FW-Qwen3.5-9B")
    ttype = os.environ.get("AZURE_FT_TRAINING_TYPE", "")  # "" = service default; FW models: no Global/Developer tier
    stats = json.loads((MODELS / "data" / "stats.json").read_text())
    roles = [r for r, v in stats["per_role"].items() if v["adapter_eligible"]] if a.per_role else []

    if a.cmd == "list":
        for j in client().fine_tuning.jobs.list(limit=50).data:
            print(j.id, j.status, j.model, j.fine_tuned_model, (j.error.message if j.error else ""))
        return
    if a.cmd == "cancel":
        print(client().fine_tuning.jobs.cancel(a.job_id).status)
        return
    if a.cmd == "smoke":
        # 10 train + 2 validation rows from one role: proves upload + job creation end to end, cheap
        AZ.mkdir(parents=True, exist_ok=True)
        src = [l for l in open(SFT / "all.train.jsonl")]
        for name, rows in (("smoke.train", src[:10]), ("smoke.heldout", src[10:12])):
            (AZ / f"{name}.jsonl").write_text("".join(json.dumps({"messages": json.loads(l)["messages"]},
                                                                 ensure_ascii=False) + "\n" for l in rows))
        c = client()
        create(c, model, upload(c, AZ / "smoke.train.jsonl"), upload(c, AZ / "smoke.heldout.jsonl"),
               {"type": "supervised", "supervised": {"hyperparameters": {"n_epochs": 1}}}, "sv-smoke", ttype, False)
        return
    if a.cmd == "status":
        c = client()
        j = c.fine_tuning.jobs.retrieve(a.job_id)
        print(j.status, j.model, j.fine_tuned_model, j.error, "trained_tokens=", j.trained_tokens,
              "result_files=", j.result_files)
        for e in c.fine_tuning.jobs.list_events(j.id, limit=20).data:
            print(e.created_at, e.message)
        return

    if a.cmd == "cost":
        ep = 3 if a.epochs == "auto" else int(a.epochs)
        el = [r for r, v in stats["per_role"].items() if v["adapter_eligible"]]
        per = estimate(el, ep)
        joint = estimate(["all"], ep)
        print("| model | examples | tokens/epoch | epochs | billed tokens | USD |\n|---|---:|---:|---:|---:|---:|")
        for r in per + joint:
            print(f"| {r['name']} | {r['examples']} | {r['tokens']:,} | {r['epochs']} | {r['billed_tokens']:,} | {r['usd']:.2f} |")
        print(f"per-role total USD {sum(r['usd'] for r in per):.2f}; hosting {USD_PER_HOUR_DEPLOYMENT} USD/h per deployment")
        return

    counts = export(roles)
    if a.cmd == "export":
        return
    c = None if a.dry_run else client()

    if a.cmd == "sft":
        ep = 3 if a.epochs == "auto" else int(a.epochs)
        if not 2 <= ep <= 3:
            raise SystemExit("epochs must be 2 or 3 (cost guard)")
        est = sum(r["usd"] for r in estimate(roles or ["all"], ep))
        print(f"estimated training cost {est:.2f} USD (cap {CAP_USD})")
        if est > CAP_USD:
            raise SystemExit("estimate above cap, refusing")
        a.epochs = str(ep)
        hp = {"n_epochs": int(a.epochs)}  # FW models reject "auto" for batch_size
        for name in (roles or ["all"]):
            tr, va = AZ / f"sft.{name}.train.jsonl", AZ / f"sft.{name}.heldout.jsonl"
            if counts.get(f"sft.{name}.train", 0) < MIN_EXAMPLES or counts.get(f"sft.{name}.heldout", 0) < 1:
                print(f"skip {name}: too few rows {counts.get(f'sft.{name}.train', 0)}")
                continue
            ids = ("<train>", "<valid>") if a.dry_run else (upload(c, tr), upload(c, va))
            create(c, model, ids[0], ids[1], {"type": "supervised", "supervised": {"hyperparameters": hp}},
                   f"sv-{name}", ttype, a.dry_run)
    else:
        if not a.from_model:
            raise SystemExit("--from-model <fine-tuned model id> required (DPO runs on the SFT model)")
        tr, va = AZ / "dpo.all.train.jsonl", AZ / "dpo.all.heldout.jsonl"
        if counts.get("dpo.all.train", 0) < MIN_EXAMPLES:
            raise SystemExit("no DPO data: run scripts/gen_dpo.py first (needs OPENAI_COMPATIBLE_* endpoint)")
        ids = ("<train>", "<valid>") if a.dry_run else (upload(c, tr), upload(c, va))
        create(c, a.from_model, ids[0], ids[1], {"type": "dpo", "dpo": {"hyperparameters": {"beta": "auto"}}},
               "sv-steadfast", ttype, a.dry_run)


if __name__ == "__main__":
    main()
