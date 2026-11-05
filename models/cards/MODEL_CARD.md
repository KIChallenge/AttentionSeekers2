---
# DRAFT, NOT PUBLISHED. Hugging Face model card for the persona adapters and the classifier.
language:
- de
license: apache-2.0
base_model: Qwen/Qwen3-8B
library_name: peft
tags:
- lora
- persona
- policy-simulation
- austria
- health-policy
---

# SV persona adapters (Austrian health-policy institutions)

LoRA adapters on Qwen3-8B, one per institution with enough data, that make the model argue in the
register and with the typical demands of an Austrian health-policy institution in the Begutachtung
setting. Companion: a SetFit classifier (paraphrase-multilingual-mpnet-base-v2) that estimates
P(institution | text) and is used as an in-character score.

## Status: draft, do not publish as is

Adapters are trained on text owned by the institutions (see the dataset card). An adapter can
reproduce passages from its training data. Clear the data licence before releasing weights.

## Base model and licence

- Qwen/Qwen3-8B, Apache-2.0. Adapters and merged weights may be redistributed under Apache-2.0
  with the licence and notice retained. Chosen for strong German among its 100+ languages, 8B size
  (single 24 GB GPU with QLoRA, 40 GB in bf16), and vLLM multi-LoRA support.
- Classifier base: sentence-transformers/paraphrase-multilingual-mpnet-base-v2, Apache-2.0.
- Training data: see the dataset card. Data licence, not the model licence, is the binding constraint.

## Training

- SFT: system = institution role card, user = draft-law context (ME title, citation, date,
  referenced provisions), assistant = the institution's documented position paragraph. Loss on
  the assistant paragraph only. LoRA r=16, alpha=32, all linear projections, 3 epochs, lr 1e-4,
  cosine, non-thinking chat template.
- Optional DPO for steadfastness: chosen keeps the documented position under a synthetic
  counterargument, rejected concedes; beta 0.1, reference = the frozen SFT adapter.
- Time split: trained on statements before 2023-01-01, evaluated after. A separate backtest
  variant is trained only on statements before 2018-09-14 and evaluated on the SV-OG draft.

## Masking procedure

All training text passed the person-name guard twice (data build and again per training row):
spaCy PER entities, title rule, name lists, first-name list, signature marks; any hit masks the
whole sentence; anything that still hits after re-verification is dropped, and the build fails
closed. Institution names are kept in SFT text (they are institutions, not persons) and replaced by
`[INSTITUTION]` only in the classifier input.

## Evaluation

`scripts/eval_stance.py`: on held-out drafts, an LLM judge labels the stance (-2..+2) of the real
paragraph, the adapter output and the prompted-baseline output; reported per institution as exact,
same-direction and within-one agreement, plus the classifier's in-character probability.
Classifier: out-of-time macro F1 per institution in `out/classifier/report.md`.

## Intended use

Persona agents in a negotiation simulator that is labelled as simulation and that attributes every
utterance to an institution, never to a person (challenge rules CON-1/CON-2).

## Out of scope and risks

- Not a source of an institution's actual current position; positions drift and the adapter
  reflects 2007 to 2022 statements.
- Must not be used to impersonate institutions or their staff in real communication.
- Can over-produce opposition (Stellungnahmen are mostly critical by genre), which the simulator
  must counter with its temperament and coalition logic.
- Institutions with little data (elective physicians, ministry of health, contract physicians)
  have no adapter and rely on prompting plus few-shot exemplars.
