"""Persona v2 report: v2 adapters vs v1 adapters (with and without the inference fix) vs the prompted base.

  uv run python -I eval_v2_report.py --run v1=<run_dir> --run v1-fix=<run_dir> --run v2=<run_dir> \
      [--proxy-log proxy.log] [--train-summary summary.json]

Each run is an eval_stance.py directory (adapter = sv-<role> or sv2-<role>, baseline = sv-base, same
held-out rows, same judge). The base is regenerated in every run; its column pools the baseline rows of
all runs. Loops: a 25+ character sentence that occurs at least twice in one output. For runs through the
fixed proxy the text is cut at the first repeat before the eval sees it, so the count comes from the
proxy's LOOP_CUT log lines (raw generation, before the cut); for the unfixed v1 run it is counted on the
stored text. Writes out/eval_v2.md and adds a "versions" block to out/persona_fidelity.json; the
top-level v1 numbers there stay as they were.
"""
from __future__ import annotations

import argparse
import collections
import json
import re
import statistics
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "out"
ROLES = ["chamber_commerce", "chamber_labour", "hospitals", "laender", "medical_chamber", "ministry_finance",
         "nursing", "patients", "social_insurance"]


def sgn(x):
    return (x > 0) - (x < 0)


def loops(text: str) -> bool:
    seen = set()
    for s in re.split(r"(?<=[.!?])\s+", text.strip()):
        k = re.sub(r"\W+", " ", s.lower()).strip()
        if len(k) >= 25 and k in seen:
            return True
        seen.add(k)
    return False


def metrics(xs, k):
    if not xs:
        return None
    ic = [x[f"{k}_incharacter"] for x in xs if x.get(f"{k}_incharacter") is not None]
    return {"n": len(xs),
            "sign": statistics.mean(sgn(x[f"{k}_stance"]) == sgn(x["ref_stance"]) for x in xs),
            "within1": statistics.mean(abs(x[f"{k}_stance"] - x["ref_stance"]) <= 1 for x in xs),
            "incharacter": statistics.mean(ic) if ic else None,
            "chars": statistics.median(len(x[f"{k}_text"]) for x in xs)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", action="append", required=True, help="label=run_dir, e.g. v2=../out/eval/2026...")
    ap.add_argument("--proxy-log", action="append", default=[])
    ap.add_argument("--train-summary")
    ap.add_argument("--note", default="", help="paragraph added under the loop section")
    a = ap.parse_args()
    runs = {lab: Path(d) for lab, d in (r.split("=", 1) for r in a.run)}
    rows = {lab: [json.loads(l) for l in open(d / "rows.jsonl")] for lab, d in runs.items()}
    judge = json.loads((next(iter(runs.values())) / "report.json").read_text())["args"]["judge_model"]
    def set_of(target_or_label: str) -> str:  # "<role>_v21" / "v2.1" -> "v21", "<role>" / "v1-fix" -> "v1"
        m = re.search(r"_?(v\d+)$", target_or_label.replace(".", "").split("-")[0])
        return m.group(1) if m else "v1"
    cuts = collections.Counter()
    for p in a.proxy_log:
        for line in open(p):
            m = re.search(r"LOOP_CUT target=(\S+)", line)
            if m:
                cuts[set_of(m.group(1))] += 1
    base_rows = [x for lab in rows for x in rows[lab]]  # base config is identical in every run
    cols = [(lab, "adapter", rows[lab]) for lab in runs] + [("base", "baseline", base_rows)]

    def tbl(metric):
        head = "| institution | " + " | ".join(c[0] for c in cols) + " |"
        out = [head, "|---|" + "---:|" * len(cols)]
        for role in ROLES + ["all"]:
            vals = []
            for _, k, xs in cols:
                sub = xs if role == "all" else [x for x in xs if x["role"] == role]
                m = metrics(sub, k)
                v = None if m is None else m[metric]
                vals.append("n/a" if v is None else f"{v:.2f}")
            out.append(f"| {'**all (micro)**' if role == 'all' else role} | " + " | ".join(vals) + " |")
        return out

    def wins(lab, metric):
        w = []
        for role in ROLES:
            ad = metrics([x for x in rows[lab] if x["role"] == role], "adapter")
            bl = metrics([x for x in base_rows if x["role"] == role], "baseline")
            if ad and bl and ad[metric] is not None and bl[metric] is not None and ad[metric] > bl[metric]:
                w.append(role)
        return w

    loop_line = []
    for lab, xs in rows.items():
        n = len(xs)
        if lab == "v1":
            c = sum(loops(x["adapter_text"]) for x in xs)
            loop_line.append(f"- `{lab}` (no fix): {c} of {n} adapter outputs loop (counted on the stored text)")
        else:
            c = cuts[set_of(lab)]
            loop_line.append(f"- `{lab}` (fixed proxy): {c} of {n} raw adapter outputs loop and were cut at the "
                             f"repeat; {sum(loops(x['adapter_text']) for x in xs)} loop after the cut")
    base_loops = sum(loops(x["baseline_text"]) for x in base_rows)
    loop_line.append(f"- base: {base_loops} of {len(base_rows)} outputs loop")

    md = ["# Persona adapters v2: held-out evaluation", "",
          f"Runs: {', '.join(f'`{lab}` = `{d.name}`' for lab, d in runs.items())}; eval_stance.py via "
          f"`models/aws/proxy.py`, judge `{judge}` (default temperature), up to 30 held-out rows per institution "
          "(the v1 split: statements dated 2023-01-01 or later, never trained on), generation temperature 0.3.", "",
          "- **v1**: `sv-<role>`, Qwen3-8B + LoRA r16, 3 epochs, lr 1e-4, Stellungnahme rows only; no inference fix",
          "- **v1-fix**: the same v1 adapters through the fixed proxy (repetition_penalty 1.1, frequency_penalty 0.3, "
          "stop after one paragraph, max 320 tokens, cut at the first repeated sentence)",
          "- **v2**: `sv2-<role>`, LoRA r16, dropout 0.05, 2 epochs, lr 7e-5; targets prefixed with the judge-labelled "
          "stance (\"Haltung: ablehnend. ...\"), plus the person-free press-derived institution-voice rows (train split); "
          "same fixed proxy, which strips the prefix before the text is judged",
          "- **v2.1**: `sv21-<role>`, the v2 data with the v1 schedule (3 epochs, lr 1e-4, r16, dropout 0.05) and at "
          "least 36 optimiser steps per adapter (epochs raised for the small sets); fixed proxy with the paragraph rule "
          "that skips a leading salutation or header instead of stopping at the first blank line (v1-fix and v2 were "
          "measured with the plain stop)",
          "- **base**: `sv-base`, prompted Qwen3-8B with the same role card and context, no adapter, no fix; "
          "regenerated in each run with identical settings; the column pools the baseline rows of all runs", "",
          "## Stance sign agreement (same direction as the institution's real paragraph)", "", *tbl("sign"), "",
          "## Stance within one step (-2..+2)", "", *tbl("within1"), "",
          "## In-character score (mean P(role | text), char-head classifier, chance 0.10)", "", *tbl("incharacter"), "",
          "## Median length (characters)", "", *tbl("chars"), "",
          "## Loops", "", *loop_line, "",
          "The v1 report's 27 of 244 used a looser reading; the count here is stricter (any 25+ character "
          "sentence that occurs twice) and is applied the same way to every version.", "",
          *([a.note, ""] if a.note else []),
          "## Wins over the prompted base (per institution)", ""]
    for lab in runs:
        ws, wi = wins(lab, "sign"), wins(lab, "incharacter")
        md.append(f"- `{lab}`: stance sign {len(ws)} of 9 ({', '.join(ws) or 'none'}); "
                  f"in-character {len(wi)} of 9 ({', '.join(wi) or 'none'})")
    md.append("")
    if a.train_summary:
        t = json.loads(Path(a.train_summary).read_text())
        md += ["## Training v2 (one SageMaker job, per adapter)", "",
               "| institution | n train | train loss | eval loss | seconds |", "|---|---:|---:|---:|---:|"]
        for r, m in t.items():
            ev = (m.get("eval") or {}).get("eval_loss")
            md.append(f"| {r} | {m['n_train']} | {m['train_loss']:.3f} | {'n/a' if ev is None else f'{ev:.2f}'} | {m['seconds']:.0f} |")
        md += ["", "Eval loss is on held-out rows without the stance prefix, so it is not comparable to v1.", ""]
    md += ["Caveats: stance labels come from an LLM judge (spot-check `rows.jsonl`); the v2 training stance labels "
           "come from the same judge, so v2 learned that judge's reading of the training paragraphs; small n for "
           "patients (12) and ministry_finance (24); the classifier head was selected on the held-out period.", ""]
    (OUT / "eval_v2.md").write_text("\n".join(md))

    fid_p = OUT / "persona_fidelity.json"
    fid = json.loads(fid_p.read_text())
    fid.setdefault("version", "v1")
    vers = {}
    for lab in runs:
        inst = {}
        for role in ROLES:
            ad = metrics([x for x in rows[lab] if x["role"] == role], "adapter")
            bl = metrics([x for x in base_rows if x["role"] == role], "baseline")
            if not ad:
                continue
            inst[role] = {"n": ad["n"], "adapter": round(ad["incharacter"], 4), "baseline": round(bl["incharacter"], 4),
                          "stance_sign_adapter": round(ad["sign"], 4), "stance_sign_baseline": round(bl["sign"], 4),
                          "within1_adapter": round(ad["within1"], 4), "within1_baseline": round(bl["within1"], 4)}
        ad, bl = metrics(rows[lab], "adapter"), metrics(base_rows, "baseline")
        vers[lab] = {"version": lab, "run": runs[lab].name, "institutions": inst,
                     "all": {"n": ad["n"], "adapter": round(ad["incharacter"], 4), "baseline": round(bl["incharacter"], 4),
                             "stance_sign_adapter": round(ad["sign"], 4), "stance_sign_baseline": round(bl["sign"], 4),
                             "within1_adapter": round(ad["within1"], 4), "within1_baseline": round(bl["within1"], 4)}}
    fid["versions"] = vers
    fid_p.write_text(json.dumps(fid, indent=1) + "\n")
    print("\n".join(md))


if __name__ == "__main__":
    main()
