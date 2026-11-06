"""LoRA persona adapters (GPU VM). PEFT + TRL, one adapter per institution, optional DPO stage.

Base model: Qwen/Qwen3-8B (Apache-2.0: adapters and merged weights may be redistributed with the
licence notice; strong German in the 100+ language set; first-class vLLM multi-LoRA support).
Fallback: mistralai/Mistral-7B-Instruct-v0.3 (Apache-2.0). Avoid Llama 3.x for publishable
adapters unless the "Built with Llama" naming and acceptable-use terms are acceptable.

Data: models/data/sft/<role>.train.jsonl (chat rows). Converted to TRL prompt/completion form so
the loss covers only the institution's paragraph, not the role card or the draft context.
Thinking is disabled: Qwen3 is trained and served in non-thinking mode (enable_thinking=False).

Usage (on the GPU VM, from models/):
  uv sync --extra gpu                                     # CUDA torch from PyPI, see README
  uv run python -I scripts/train_lora.py --role all-eligible
  uv run python -I scripts/train_lora.py --role medical_chamber --epochs 3
  uv run python -I scripts/train_lora.py --role joint     # one adapter over all roles (role card selects)
  uv run python -I scripts/train_lora.py --role medical_chamber --dpo   # SFT adapter -> DPO on data/dpo
Outputs: out/lora/<role>/ (adapter_model.safetensors is gitignored), out/lora/<role>/train_meta.json
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

MODELS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from institutions import INST  # noqa: E402

DEFAULT_BASE = "Qwen/Qwen3-8B"


def render_prompt(tok, msgs):
    """Pre-render with the base model's chat template in non-thinking mode, so training matches serving
    (vLLM: chat_template_kwargs={"enable_thinking": false}) independent of the TRL version."""
    kw = {"enable_thinking": False} if "enable_thinking" in (tok.chat_template or "") else {}
    return tok.apply_chat_template(msgs, add_generation_prompt=True, tokenize=False, **kw)


def end_of_turn(tok):
    return "<|im_end|>\n" if "<|im_end|>" in (tok.chat_template or "") else tok.eos_token


def load_rows(paths, tok):
    rows = []
    for p in paths:
        if p.exists():
            for l in open(p):
                m = json.loads(l)["messages"]
                rows.append({"prompt": render_prompt(tok, m[:-1]), "completion": m[-1]["content"] + end_of_turn(tok)})
    return rows


def eligible_roles():
    stats = json.loads((MODELS / "data" / "stats.json").read_text())
    return [r for r, v in stats["per_role"].items() if v["adapter_eligible"]]


def train_one(role, a):
    import torch
    from datasets import Dataset
    from peft import LoraConfig
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
    from trl import SFTConfig, SFTTrainer

    sft = MODELS / "data" / "sft"
    tok = AutoTokenizer.from_pretrained(a.base)
    if tok.pad_token is None:
        tok.pad_token = tok.eos_token
    name = "all" if role == "joint" else role
    tr, ev = load_rows([sft / f"{name}.train.jsonl"], tok), load_rows([sft / f"{name}.heldout.jsonl"], tok)
    if not tr:
        print(f"[{role}] no training rows, skip")
        return
    out = MODELS / "out" / "lora" / role
    qcfg = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_use_double_quant=True,
                              bnb_4bit_compute_dtype=torch.bfloat16) if a.qlora else None
    model = AutoModelForCausalLM.from_pretrained(a.base, torch_dtype=torch.bfloat16, quantization_config=qcfg,
                                                 attn_implementation=a.attn)
    lora = LoraConfig(r=a.rank, lora_alpha=2 * a.rank, lora_dropout=0.05, task_type="CAUSAL_LM",
                      target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"])
    cfg = SFTConfig(
        output_dir=str(out / "checkpoints"), num_train_epochs=a.epochs, learning_rate=a.lr,
        per_device_train_batch_size=a.batch, gradient_accumulation_steps=a.grad_acc, lr_scheduler_type="cosine",
        warmup_ratio=0.05, bf16=True, logging_steps=10, save_strategy="epoch", save_total_limit=1,
        eval_strategy="epoch" if ev else "no", max_length=a.max_len, completion_only_loss=True,
        gradient_checkpointing=True, report_to="none", seed=a.seed,
    )
    trainer = SFTTrainer(model=model, args=cfg, train_dataset=Dataset.from_list(tr),
                         eval_dataset=Dataset.from_list(ev) if ev else None, processing_class=tok, peft_config=lora)
    trainer.train()
    trainer.save_model(str(out))
    tok.save_pretrained(str(out))
    meta = {"role": role, "base": a.base, "n_train": len(tr), "n_eval": len(ev), "epochs": a.epochs, "lr": a.lr,
            "rank": a.rank, "qlora": a.qlora, "eval": trainer.evaluate() if ev else None}
    (out / "train_meta.json").write_text(json.dumps(meta, indent=1))
    print(f"[{role}] saved {out}")


def dpo_one(role, a):
    import torch
    from datasets import Dataset
    from peft import PeftModel
    from transformers import AutoModelForCausalLM, AutoTokenizer
    from trl import DPOConfig, DPOTrainer

    dpo = MODELS / "data" / "dpo"
    sft_dir = MODELS / "out" / "lora" / role
    out = MODELS / "out" / "lora" / f"{role}-dpo"
    tok = AutoTokenizer.from_pretrained(sft_dir)
    eot = end_of_turn(tok)

    def rows(split):
        p = dpo / f"{role}.{split}.trl.jsonl"
        if not p.exists():
            return []
        out_rows = []
        for l in open(p):
            r = json.loads(l)
            out_rows.append({"prompt": render_prompt(tok, r["prompt"]), "chosen": r["chosen"][0]["content"] + eot,
                             "rejected": r["rejected"][0]["content"] + eot})
        return out_rows
    tr, ev = rows("train"), rows("heldout")
    if not tr:
        print(f"[{role}] no DPO rows (run scripts/gen_dpo.py first), skip")
        return
    base = AutoModelForCausalLM.from_pretrained(a.base, torch_dtype=torch.bfloat16, attn_implementation=a.attn)
    # SFT adapter as the trainable policy; a frozen copy of it as the reference
    model = PeftModel.from_pretrained(base, str(sft_dir), is_trainable=True, adapter_name="policy")
    model.load_adapter(str(sft_dir), adapter_name="reference")
    cfg = DPOConfig(output_dir=str(out / "checkpoints"), beta=0.1, learning_rate=5e-6, num_train_epochs=1,
                    per_device_train_batch_size=2, gradient_accumulation_steps=8, bf16=True, logging_steps=10,
                    max_length=a.max_len, model_adapter_name="policy", ref_adapter_name="reference",
                    gradient_checkpointing=True, report_to="none", eval_strategy="epoch" if ev else "no")
    t = DPOTrainer(model=model, args=cfg, train_dataset=Dataset.from_list(tr),
                   eval_dataset=Dataset.from_list(ev) if ev else None, processing_class=tok)
    t.train()
    model.save_pretrained(str(out), selected_adapters=["policy"])
    tok.save_pretrained(str(out))
    print(f"[{role}] DPO adapter saved {out}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--role", required=True, help="role id, 'all-eligible', or 'joint'")
    ap.add_argument("--base", default=DEFAULT_BASE)
    ap.add_argument("--epochs", type=float, default=3)
    ap.add_argument("--lr", type=float, default=1e-4)
    ap.add_argument("--rank", type=int, default=16)
    ap.add_argument("--batch", type=int, default=4)
    ap.add_argument("--grad-acc", type=int, default=4)
    ap.add_argument("--max-len", type=int, default=2048)
    ap.add_argument("--qlora", action="store_true", help="4-bit base (24 GB GPUs); default bf16 needs ~40 GB")
    ap.add_argument("--attn", default="sdpa")
    ap.add_argument("--dpo", action="store_true", help="run the DPO stage on top of an existing SFT adapter")
    ap.add_argument("--seed", type=int, default=42)
    a = ap.parse_args()
    roles = eligible_roles() if a.role == "all-eligible" else [a.role]
    for r in roles:
        if r not in INST and r != "joint":
            raise SystemExit(f"unknown role {r}")
        (dpo_one if a.dpo else train_one)(r, a)
    if a.role == "all-eligible":
        print("eligible roles:", roles)


if __name__ == "__main__":
    main()
