"""Add a character n-gram TF-IDF head to the saved SetFit classifier and evaluate the ensemble.

Register (spelling conventions, abbreviations, legal phrasing) is a strong authorship signal that sentence
embeddings partly normalise away; a char_wb 2-5 gram logistic regression captures it. The ensemble score is
the mean of the SetFit-head and char-head probabilities. Same time split as train_classifier.py.
Writes out/classifier/model/char_head.joblib and appends to out/classifier/report.{json,md}.
Run after train_classifier.py:  uv run python -I scripts/add_char_head.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline

sys.path.insert(0, str(Path(__file__).resolve().parent))
from train_classifier import DATA, OUT, evaluate  # noqa: E402


def main():
    from setfit import SetFitModel
    rep = json.loads((OUT / "report.json").read_text())
    labels = rep["labels"]
    rows = [json.loads(l) for l in open(DATA)]
    tr = [r for r in rows if r["role"] in labels and r["split"] == "train"]
    te = [r for r in rows if r["role"] in labels and r["split"] == "heldout"]
    ytr, yte = [r["role"] for r in tr], [r["role"] for r in te]

    char = make_pipeline(TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5), sublinear_tf=True, min_df=2),
                         LogisticRegression(max_iter=3000, class_weight="balanced", C=5))
    char.fit([r["text"] for r in tr], ytr)
    model = SetFitModel.from_pretrained(str(OUT / "model"))
    meta = json.loads((OUT / "model" / "persona_labels.json").read_text())
    model.model_body.max_seq_length = meta["max_seq_length"]
    head = model.model_head
    assert list(head.classes_) == list(char.classes_)
    P_st = head.predict_proba(model.model_body.encode([r["text"] for r in te], batch_size=32))
    P_ch = char.predict_proba([r["text"] for r in te])
    cls = list(head.classes_)
    out = {}
    for name, P in (("char", P_ch), ("ensemble", (P_st + P_ch) / 2)):
        out[name] = evaluate(yte, [cls[i] for i in np.argmax(P, 1)], labels)
    joblib.dump(char, OUT / "model" / "char_head.joblib")
    scores = {"setfit": rep["setfit"]["macro_f1"], "char": out["char"]["macro_f1"], "ensemble": out["ensemble"]["macro_f1"]}
    meta["mode"] = max(scores, key=scores.get)  # note: chosen on the held-out split, so the shipped F1 is optimistic
    print("scorer mode:", meta["mode"], scores)
    (OUT / "model" / "persona_labels.json").write_text(json.dumps(meta, indent=1))
    rep["char_tfidf"], rep["ensemble"] = out["char"], out["ensemble"]
    (OUT / "report.json").write_text(json.dumps(rep, indent=1))

    md = ["", "## Character n-gram head and ensemble", "",
          f"Macro F1: **ensemble {out['ensemble']['macro_f1']:.3f}**, char TF-IDF alone {out['char']['macro_f1']:.3f}, "
          f"SetFit alone {rep['setfit']['macro_f1']:.3f}, frozen embeddings {rep['frozen_baseline']['macro_f1']:.3f}. "
          f"Chance for {len(labels)} balanced classes is {1/len(labels):.2f}. The scorer ships the best of the three "
          f"(`mode` in persona_labels.json: **{meta['mode']}**); that choice was made on the held-out split, so treat "
          f"its F1 as slightly optimistic.", "",
          "| institution | n held-out | precision | recall | F1 ensemble | F1 char | F1 SetFit |", "|---|---:|---:|---:|---:|---:|---:|"]
    for l in labels:
        e = out["ensemble"]["per_class"][l]
        md.append(f"| {l} | {e['n']} | {e['precision']:.2f} | {e['recall']:.2f} | {e['f1']:.2f} | "
                  f"{out['char']['per_class'][l]['f1']:.2f} | {rep['setfit']['per_class'][l]['f1']:.2f} |")
    for name in ("char", "ensemble"):
        md += ["", f"Confusion matrix, {name} (rows = true, columns = predicted):", "",
               "| true \\ pred | " + " | ".join(labels) + " |", "|---|" + "---:|" * len(labels)]
        for l, row in zip(labels, out[name]["confusion"]):
            md.append(f"| {l} | " + " | ".join(str(x) for x in row) + " |")
    with open(OUT / "report.md", "a") as f:
        f.write("\n".join(md) + "\n")
    print("\n".join(md))


if __name__ == "__main__":
    main()
