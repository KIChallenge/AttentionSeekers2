"""SageMaker training entry: one job, one GPU, the 9 per-institution LoRA adapters trained sequentially.

Mirrors models/scripts/train_lora.py (same prompt rendering, completion-only loss, LoRA targets) so the
adapters are interchangeable with the GPU-VM path. Runs inside the HF PyTorch training DLC.

Inputs:  channel `sft` = models/data/sft/<role>.{train,heldout}.jsonl (masked, gitignored)
Outputs (written to S3 as soon as each piece is ready, so a crash keeps finished adapters):
  s3://<bucket>/base/Qwen3-8B/                  base weights for the endpoint (fast S3 load, no HF pull)
  s3://<bucket>/adapters/<role>/                adapter_config.json, adapter_model.safetensors, train_meta.json
  s3://<bucket>/adapters-tar/<role>.tar.gz      same adapter files at archive root (inference components)
--out-prefix moves both adapter prefixes (v2: adapters-v2/ and adapters-v2-tar/), so v1 stays untouched.
"""
from __future__ import annotations

import argparse
import gc
import json
import os
import tarfile
import time
from pathlib import Path

import boto3

SFT = Path(os.environ.get("SM_CHANNEL_SFT", "/opt/ml/input/data/sft"))
WORK = Path("/opt/ml/work")


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def s3_upload_dir(s3, local: Path, bucket: str, prefix: str):
    for p in sorted(local.rglob("*")):
        if p.is_file():
            s3.upload_file(str(p), bucket, f"{prefix}/{p.relative_to(local).as_posix()}")


def render_prompt(tok, msgs):
    kw = {"enable_thinking": False} if "enable_thinking" in (tok.chat_template or "") else {}
    return tok.apply_chat_template(msgs, add_generation_prompt=True, tokenize=False, **kw)


def end_of_turn(tok):
    return "<|im_end|>\n" if "<|im_end|>" in (tok.chat_template or "") else tok.eos_token


def load_rows(p: Path, tok):
    if not p.exists():
        return []
    return [{"prompt": render_prompt(tok, m[:-1]), "completion": m[-1]["content"] + end_of_turn(tok)}
            for m in (json.loads(l)["messages"] for l in open(p))]


def train_one(role, a, base_dir, s3):
    import torch
    from datasets import Dataset
    from peft import LoraConfig
    from transformers import AutoModelForCausalLM, AutoTokenizer
    from trl import SFTConfig, SFTTrainer

    tok = AutoTokenizer.from_pretrained(base_dir)
    if tok.pad_token is None:
        tok.pad_token = tok.eos_token
    tr, ev = load_rows(SFT / f"{role}.train.jsonl", tok), load_rows(SFT / f"{role}.heldout.jsonl", tok)
    if not tr:
        log(f"[{role}] no training rows, skip")
        return None
    out = WORK / "lora" / role
    t0 = time.time()
    model = AutoModelForCausalLM.from_pretrained(base_dir, torch_dtype=torch.bfloat16, attn_implementation="sdpa")
    lora = LoraConfig(r=a.rank, lora_alpha=2 * a.rank, lora_dropout=a.dropout, task_type="CAUSAL_LM",
                      target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"])
    cfg = SFTConfig(
        output_dir=str(out / "checkpoints"), num_train_epochs=a.epochs, learning_rate=a.lr,
        per_device_train_batch_size=a.batch, gradient_accumulation_steps=a.grad_acc, lr_scheduler_type="cosine",
        warmup_ratio=0.05, bf16=True, logging_steps=10, save_strategy="no",
        eval_strategy="epoch" if ev else "no", per_device_eval_batch_size=a.batch, max_length=a.max_len,
        completion_only_loss=True, gradient_checkpointing=True, report_to="none", seed=a.seed,
    )
    trainer = SFTTrainer(model=model, args=cfg, train_dataset=Dataset.from_list(tr),
                         eval_dataset=Dataset.from_list(ev) if ev else None, processing_class=tok, peft_config=lora)
    res = trainer.train()
    ev_metrics = trainer.evaluate() if ev else None
    trainer.model.save_pretrained(str(out))
    # publishable config: point at the hub id, not the container's local snapshot path
    cfg_p = out / "adapter_config.json"
    c = json.loads(cfg_p.read_text())
    c["base_model_name_or_path"] = a.base
    cfg_p.write_text(json.dumps(c, indent=2))
    meta = {"role": role, "base": a.base, "n_train": len(tr), "n_eval": len(ev), "epochs": a.epochs, "lr": a.lr,
            "rank": a.rank, "alpha": 2 * a.rank, "dropout": a.dropout, "version": a.out_prefix, "max_len": a.max_len, "train_loss": res.training_loss,
            "eval": ev_metrics, "seconds": round(time.time() - t0, 1)}
    (out / "train_meta.json").write_text(json.dumps(meta, indent=1))
    keep = ["adapter_config.json", "adapter_model.safetensors"]
    for f in keep + ["train_meta.json"]:
        s3.upload_file(str(out / f), a.bucket, f"{a.out_prefix}/{role}/{f}")
    tgz = WORK / f"{role}.tar.gz"
    with tarfile.open(tgz, "w:gz") as t:
        for f in keep:
            t.add(out / f, arcname=f)
    s3.upload_file(str(tgz), a.bucket, f"{a.out_prefix}-tar/{role}.tar.gz")
    log(f"[{role}] done in {meta['seconds']}s, train_loss={res.training_loss:.4f}, "
        f"eval_loss={(ev_metrics or {}).get('eval_loss')}")
    del trainer, model
    gc.collect()
    torch.cuda.empty_cache()
    return meta


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--roles", required=True, help="comma list, trained in this order")
    ap.add_argument("--bucket", required=True)
    ap.add_argument("--base", default="Qwen/Qwen3-8B")
    ap.add_argument("--epochs", type=float, default=3)
    ap.add_argument("--lr", type=float, default=1e-4)
    ap.add_argument("--rank", type=int, default=16)
    ap.add_argument("--batch", type=int, default=4)
    ap.add_argument("--grad-acc", type=int, default=4)
    ap.add_argument("--max-len", type=int, default=2048)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--upload-base", type=int, default=1)
    ap.add_argument("--dropout", type=float, default=0.05)
    ap.add_argument("--out-prefix", default="adapters", help="S3 prefix for this adapter set (v1: adapters)")
    a = ap.parse_args()
    import torch
    import peft
    import transformers
    import trl
    log("versions: torch", torch.__version__, "transformers", transformers.__version__, "trl", trl.__version__,
        "peft", peft.__version__, "gpu", torch.cuda.get_device_name(0))
    log("sft files:", sorted(p.name for p in SFT.glob("*.jsonl")))
    s3 = boto3.client("s3")
    from huggingface_hub import snapshot_download
    base_dir = Path(snapshot_download(a.base, local_dir=str(WORK / "base"),
                                      allow_patterns=["*.json", "*.safetensors", "*.txt", "merges.txt", "LICENSE"]))
    log("base downloaded", base_dir)
    if a.upload_base:
        s3_upload_dir(s3, base_dir, a.bucket, "base/Qwen3-8B")
        s3.put_object(Bucket=a.bucket, Key="base/_READY", Body=b"ok")
        log("base uploaded to S3")
    metas = {}
    for role in a.roles.split(","):
        m = train_one(role, a, base_dir, s3)
        if m:
            metas[role] = m
            s3.put_object(Bucket=a.bucket, Key=f"{a.out_prefix}/summary.json", Body=json.dumps(metas, indent=1).encode())
    Path("/opt/ml/model").mkdir(parents=True, exist_ok=True)
    (Path("/opt/ml/model") / "summary.json").write_text(json.dumps(metas, indent=1))
    log("all done:", list(metas))


if __name__ == "__main__":
    main()
