"""In-character classifier: "which institution wrote this paragraph" (SetFit, CPU).

Data: models/data/classifier/paragraphs.jsonl (person-masked, institution names masked as [INSTITUTION]).
Classes: roles with >= classifier_min_train train paragraphs and >= classifier_min_test held-out paragraphs.
Split: time split from configs/institutions.yaml (train < cutoff <= held-out), so the score is an
out-of-time estimate, not a random split that leaks the same draft into both sides.

Model: sentence-transformers/paraphrase-multilingual-mpnet-base-v2, SetFit contrastive fine-tune on a
class-balanced sample, then a class-weighted logistic-regression head on ALL train paragraphs.
Baseline for comparison: the same LR head on frozen (not fine-tuned) embeddings.

Outputs: out/classifier/model/ (weights gitignored), out/classifier/report.json, report.md
Run:  uv run python -I scripts/train_classifier.py [--per-class 64 --iterations 10]
"""
from __future__ import annotations

import argparse
import collections
import json
import random
import sys
import time
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import confusion_matrix, f1_score, precision_recall_fscore_support

sys.path.insert(0, str(Path(__file__).resolve().parent))
from institutions import CFG, INST  # noqa: E402

MODELS = Path(__file__).resolve().parents[1]
DATA = MODELS / "data" / "classifier" / "paragraphs.jsonl"
OUT = MODELS / "out" / "classifier"
BASE = "sentence-transformers/paraphrase-multilingual-mpnet-base-v2"


def evaluate(y_true, y_pred, labels):
    p, r, f, n = precision_recall_fscore_support(y_true, y_pred, labels=labels, zero_division=0)
    return {
        "macro_f1": float(f1_score(y_true, y_pred, labels=labels, average="macro", zero_division=0)),
        "accuracy": float(np.mean(np.array(y_true) == np.array(y_pred))),
        "per_class": {l: {"precision": float(p[i]), "recall": float(r[i]), "f1": float(f[i]), "n": int(n[i])}
                      for i, l in enumerate(labels)},
        "confusion": confusion_matrix(y_true, y_pred, labels=labels).tolist(),
    }


def head(X, y):
    return LogisticRegression(max_iter=3000, class_weight="balanced", C=2.0).fit(X, y)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-class", type=int, default=64, help="balanced sample per class for the contrastive step")
    ap.add_argument("--iterations", type=int, default=10, help="SetFit num_iterations (pairs per sample)")
    ap.add_argument("--max-seq", type=int, default=256)
    ap.add_argument("--seed", type=int, default=13)
    args = ap.parse_args()
    random.seed(args.seed)

    import torch
    torch.set_num_threads(max(1, (torch.get_num_threads() or 8)))
    from datasets import Dataset
    from setfit import SetFitModel, Trainer, TrainingArguments

    rows = [json.loads(l) for l in open(DATA)]
    th = CFG["thresholds"]
    cnt = collections.Counter((r["role"], r["split"]) for r in rows)
    labels = [k for k in INST if cnt[(k, "train")] >= th["classifier_min_train"] and cnt[(k, "heldout")] >= th["classifier_min_test"]]
    excluded = {k: {"train": cnt[(k, "train")], "heldout": cnt[(k, "heldout")]} for k in INST if k not in labels}
    if len(labels) < 2:
        raise SystemExit(f"need >= 2 classes, have {labels}")
    tr = [r for r in rows if r["role"] in labels and r["split"] == "train"]
    te = [r for r in rows if r["role"] in labels and r["split"] == "heldout"]
    print("classes:", labels, "train", len(tr), "heldout", len(te), flush=True)

    by = collections.defaultdict(list)
    for r in tr:
        by[r["role"]].append(r)
    sample = []
    for k in labels:
        xs = by[k][:]
        random.shuffle(xs)
        sample += xs[: args.per_class]

    model = SetFitModel.from_pretrained(BASE, labels=labels)
    model.model_body.max_seq_length = args.max_seq

    t0 = time.time()
    Xtr0 = model.model_body.encode([r["text"] for r in tr], batch_size=32)
    Xte0 = model.model_body.encode([r["text"] for r in te], batch_size=32)
    ytr, yte = [r["role"] for r in tr], [r["role"] for r in te]
    base_rep = evaluate(yte, head(Xtr0, ytr).predict(Xte0).tolist(), labels)
    print(f"frozen baseline macro F1 {base_rep['macro_f1']:.3f} ({time.time()-t0:.0f}s)", flush=True)

    ds = Dataset.from_list([{"text": r["text"], "label": r["role"]} for r in sample])
    targs = TrainingArguments(batch_size=16, num_epochs=1, num_iterations=args.iterations, seed=args.seed,
                              body_learning_rate=2e-5, show_progress_bar=False)
    trainer = Trainer(model=model, args=targs, train_dataset=ds)
    t0 = time.time()
    trainer.train()
    print(f"contrastive step done ({time.time()-t0:.0f}s)", flush=True)

    Xtr = model.model_body.encode([r["text"] for r in tr], batch_size=32)
    Xte = model.model_body.encode([r["text"] for r in te], batch_size=32)
    clf = head(Xtr, ytr)
    model.model_head = clf
    model.labels = None  # head predicts role strings directly
    rep = evaluate(yte, clf.predict(Xte).tolist(), labels)
    print(f"SetFit macro F1 {rep['macro_f1']:.3f}", flush=True)

    OUT.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(str(OUT / "model"))
    (OUT / "model" / "persona_labels.json").write_text(json.dumps(
        {"labels": list(clf.classes_), "base": BASE, "max_seq_length": args.max_seq,
         "input_preprocessing": "institutions.mask_institutions (names -> [INSTITUTION])"}, indent=1))
    report = {"base_model": BASE, "labels": labels, "excluded": excluded, "n_train": len(tr), "n_heldout": len(te),
              "time_cutoff": CFG["splits"]["time_cutoff"], "contrastive_sample_per_class": args.per_class,
              "iterations": args.iterations, "setfit": rep, "frozen_baseline": base_rep}
    (OUT / "report.json").write_text(json.dumps(report, indent=1))

    md = [f"# In-character classifier report\n",
          f"Base `{BASE}`, SetFit contrastive step on {args.per_class} paragraphs/class, LR head on all {len(tr)} train "
          f"paragraphs. Held-out = statements dated >= {CFG['splits']['time_cutoff']} ({len(te)} paragraphs).\n",
          f"Macro F1: **SetFit {rep['macro_f1']:.3f}**, frozen-embedding baseline {base_rep['macro_f1']:.3f}. "
          f"Accuracy {rep['accuracy']:.3f} (baseline {base_rep['accuracy']:.3f}).\n",
          "| institution | n held-out | precision | recall | F1 | F1 frozen |", "|---|---:|---:|---:|---:|---:|"]
    for l in labels:
        a, b = rep["per_class"][l], base_rep["per_class"][l]
        md.append(f"| {l} | {a['n']} | {a['precision']:.2f} | {a['recall']:.2f} | {a['f1']:.2f} | {b['f1']:.2f} |")
    md += ["", "Confusion matrix (rows = true, columns = predicted):", "",
           "| true \\ pred | " + " | ".join(labels) + " |", "|---|" + "---:|" * len(labels)]
    for l, row in zip(labels, rep["confusion"]):
        md.append(f"| {l} | " + " | ".join(str(x) for x in row) + " |")
    md += ["", "Excluded (too few paragraphs, train/held-out): " +
           ", ".join(f"{k} {v['train']}/{v['heldout']}" for k, v in excluded.items())]
    (OUT / "report.md").write_text("\n".join(md) + "\n")
    print("\n".join(md))


if __name__ == "__main__":
    main()
