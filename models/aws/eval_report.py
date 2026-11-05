"""Step 6: turn an eval_stance.py run (adapter = sv-<role>, baseline = sv-base, both via proxy.py) into
models/out/eval_sagemaker.md and the compact models/out/persona_fidelity.json.

  uv run python -I eval_report.py <run_dir> [<run_dir> ...] [--train-summary summary.json]
  (several runs, e.g. one per batch of finished adapters, are merged; metrics are recomputed from rows)

persona_fidelity.json: per institution n, adapter score, baseline score, where score = mean in-character
probability P(role | text) from the char-head classifier (persona_score.py), plus stance agreement.
"""
from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "out"


def sgn(x):
    return (x > 0) - (x < 0)


def per_role(rows):
    by = {}
    for x in rows:
        by.setdefault(x["role"], []).append(x)
    out = {}
    for role, xs in by.items():
        d = {"n": len(xs)}
        for k in ("adapter", "baseline"):
            ic = [x[f"{k}_incharacter"] for x in xs if x.get(f"{k}_incharacter") is not None]
            d[k] = {"sign": statistics.mean(sgn(x[f"{k}_stance"]) == sgn(x["ref_stance"]) for x in xs),
                    "within1": statistics.mean(abs(x[f"{k}_stance"] - x["ref_stance"]) <= 1 for x in xs),
                    "incharacter": statistics.mean(ic) if ic else None}
        out[role] = d
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dir", nargs="+")
    ap.add_argument("--train-summary")
    ap.add_argument("--note", default="")
    a = ap.parse_args()
    runs = [Path(r) for r in a.run_dir]
    rep = json.loads((runs[-1] / "report.json").read_text())
    rows = [json.loads(l) for r in runs for l in open(r / "rows.jsonl")]
    per = per_role(rows)
    train = json.loads(Path(a.train_summary).read_text()) if a.train_summary else {}
    f = lambda v: "n/a" if v is None else f"{v:.2f}"  # noqa: E731

    fid = {"metric": "mean P(role | generated text), char-head in-character classifier; chance about 0.10",
           "adapter_model": "sv-<role> (Qwen3-8B + LoRA r16, SageMaker)", "baseline_model": "sv-base (prompted Qwen3-8B)",
           "split": "held-out (statements dated 2023-01-01 or later)", "institutions": {}}
    lines = ["| institution | n | in-char adapter | in-char baseline | sign adapter | sign baseline | within1 adapter | within1 baseline |",
             "|---|---:|---:|---:|---:|---:|---:|---:|"]
    tot = {"n": 0}
    for role in sorted(per):
        d = per[role]
        ad, bl = d["adapter"], d["baseline"]
        fid["institutions"][role] = {"n": d["n"], "adapter": round(ad["incharacter"], 4) if ad["incharacter"] is not None else None,
                                     "baseline": round(bl["incharacter"], 4) if bl["incharacter"] is not None else None,
                                     "stance_sign_adapter": round(ad["sign"], 4), "stance_sign_baseline": round(bl["sign"], 4)}
        lines.append(f"| {role} | {d['n']} | {f(ad['incharacter'])} | {f(bl['incharacter'])} | {f(ad['sign'])} | "
                     f"{f(bl['sign'])} | {f(ad['within1'])} | {f(bl['within1'])} |")
        tot["n"] += d["n"]
    # micro averages over all rows
    def micro(k, key):
        vals = [x.get(f"{k}_{key}") for x in rows if x.get(f"{k}_{key}") is not None]
        return statistics.mean(vals) if vals else None
    m = {k: {"incharacter": micro(k, "incharacter"),
             "sign": statistics.mean(sgn(x[f"{k}_stance"]) == sgn(x["ref_stance"]) for x in rows),
             "within1": statistics.mean(abs(x[f"{k}_stance"] - x["ref_stance"]) <= 1 for x in rows)}
         for k in ("adapter", "baseline")}
    lines.append(f"| **all (micro)** | {len(rows)} | {f(m['adapter']['incharacter'])} | {f(m['baseline']['incharacter'])} | "
                 f"{f(m['adapter']['sign'])} | {f(m['baseline']['sign'])} | {f(m['adapter']['within1'])} | {f(m['baseline']['within1'])} |")
    fid["all"] = {"n": len(rows), "adapter": round(m["adapter"]["incharacter"], 4), "baseline": round(m["baseline"]["incharacter"], 4)}
    wins = sum(1 for v in fid["institutions"].values() if v["adapter"] is not None and v["baseline"] is not None
               and v["adapter"] > v["baseline"])
    OUT.mkdir(exist_ok=True)
    (OUT / "persona_fidelity.json").write_text(json.dumps(fid, indent=1) + "\n")

    md = ["# Persona adapters on SageMaker: held-out evaluation", "",
          f"Runs: {', '.join(f'`{r.name}`' for r in runs)} (eval_stance.py via `models/aws/proxy.py`), judge `{rep['args']['judge_model']}`, "
          f"up to {rep['args']['n']} held-out rows per institution, temperature 0.3, max 600 tokens.", "",
          "- **adapter**: `sv-<role>`, Qwen3-8B + institution LoRA (rank 16, 3 epochs), SageMaker inference component",
          "- **baseline**: `sv-base`, the same Qwen3-8B with the same role card and context, no adapter",
          "- **in-char**: mean P(role | text) of the char-head classifier (`persona_score.py`, 10 classes, chance 0.10). "
          "It measures register (\"sounds like this institution rather than the others\"), not correctness.",
          "- **sign / within1**: share of rows where the judge's stance (-2..+2) of the generation has the same "
          "direction as / is within one step of the judge's stance of the institution's real paragraph.", "",
          *lines, "",
          f"Adapter beats baseline on in-character score for {wins} of {len(fid['institutions'])} institutions.", ""]
    if a.note:
        md += [a.note, ""]
    if train:
        md += ["## Training (SageMaker job, per adapter)", "",
               "| institution | n train | n held-out | train loss | eval loss | seconds |", "|---|---:|---:|---:|---:|---:|"]
        for r, t in train.items():
            ev = (t.get("eval") or {}).get("eval_loss")
            md.append(f"| {r} | {t['n_train']} | {t['n_eval']} | {t['train_loss']:.3f} | {f(ev)} | {t['seconds']:.0f} |")
        md.append("")
    md += ["Caveats: stance labels come from an LLM judge (spot-check `rows.jsonl`); the classifier head was "
           "selected on the same held-out period, so absolute in-character values are slightly optimistic; "
           "small n for patients and ministry_finance. Generations were masked by `pii_guard.py` before scoring.", ""]
    (OUT / "eval_sagemaker.md").write_text("\n".join(md))
    print("\n".join(lines))
    print("written", OUT / "eval_sagemaker.md", OUT / "persona_fidelity.json")


if __name__ == "__main__":
    main()
