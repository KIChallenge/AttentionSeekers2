# Persona adapters v2: held-out evaluation

Runs: `v1` = `v1-nofix`, `v1-fix` = `20261106-015512`, `v2` = `20261106-025255`; eval_stance.py via `models/aws/proxy.py`, judge `gpt-6-sol` (default temperature), up to 30 held-out rows per institution (the v1 split: statements dated 2023-01-01 or later, never trained on), generation temperature 0.3.

- **v1**: `sv-<role>`, Qwen3-8B + LoRA r16, 3 epochs, lr 1e-4, Stellungnahme rows only; no inference fix
- **v1-fix**: the same v1 adapters through the fixed proxy (repetition_penalty 1.1, frequency_penalty 0.3, stop after one paragraph, max 320 tokens, cut at the first repeated sentence)
- **v2**: `sv2-<role>`, LoRA r16, dropout 0.05, 2 epochs, lr 7e-5; targets prefixed with the judge-labelled stance ("Haltung: ablehnend. ..."), plus the person-free press-derived institution-voice rows (train split); same fixed proxy, which strips the prefix before the text is judged
- **base**: `sv-base`, prompted Qwen3-8B with the same role card and context, no adapter, no fix; regenerated in each run with identical settings; the column pools the baseline rows of all runs

## Stance sign agreement (same direction as the institution's real paragraph)

| institution | v1 | v1-fix | v2 | base |
|---|---:|---:|---:|---:|
| chamber_commerce | 0.50 | 0.50 | 0.07 | 0.50 |
| chamber_labour | 0.27 | 0.37 | 0.53 | 0.68 |
| hospitals | 0.46 | 0.64 | 0.14 | 0.64 |
| laender | 0.50 | 0.60 | 0.47 | 0.59 |
| medical_chamber | 0.33 | 0.47 | 0.27 | 0.68 |
| ministry_finance | 0.46 | 0.50 | 0.29 | 0.39 |
| nursing | 0.33 | 0.50 | 0.00 | 0.52 |
| patients | 0.33 | 0.25 | 0.00 | 0.47 |
| social_insurance | 0.70 | 0.57 | 0.70 | 0.56 |
| **all (micro)** | 0.44 | 0.50 | 0.30 | 0.57 |

## Stance within one step (-2..+2)

| institution | v1 | v1-fix | v2 | base |
|---|---:|---:|---:|---:|
| chamber_commerce | 0.57 | 0.67 | 0.77 | 0.54 |
| chamber_labour | 0.47 | 0.40 | 0.67 | 0.68 |
| hospitals | 0.79 | 0.82 | 0.96 | 0.71 |
| laender | 0.67 | 0.67 | 0.63 | 0.69 |
| medical_chamber | 0.77 | 0.67 | 0.87 | 0.68 |
| ministry_finance | 0.92 | 0.79 | 0.71 | 0.76 |
| nursing | 0.70 | 0.73 | 0.63 | 0.53 |
| patients | 0.42 | 0.42 | 0.92 | 0.53 |
| social_insurance | 0.83 | 0.70 | 0.73 | 0.59 |
| **all (micro)** | 0.69 | 0.66 | 0.75 | 0.64 |

## In-character score (mean P(role | text), char-head classifier, chance 0.10)

| institution | v1 | v1-fix | v2 | base |
|---|---:|---:|---:|---:|
| chamber_commerce | 0.10 | 0.15 | 0.03 | 0.55 |
| chamber_labour | 0.39 | 0.53 | 0.21 | 0.22 |
| hospitals | 0.18 | 0.24 | 0.04 | 0.13 |
| laender | 0.57 | 0.65 | 0.59 | 0.74 |
| medical_chamber | 0.24 | 0.12 | 0.10 | 0.32 |
| ministry_finance | 0.33 | 0.23 | 0.18 | 0.66 |
| nursing | 0.66 | 0.43 | 0.72 | 0.39 |
| patients | 0.60 | 0.48 | 0.05 | 0.68 |
| social_insurance | 0.52 | 0.38 | 0.27 | 0.57 |
| **all (micro)** | 0.39 | 0.35 | 0.26 | 0.46 |

## Median length (characters)

| institution | v1 | v1-fix | v2 | base |
|---|---:|---:|---:|---:|
| chamber_commerce | 565.00 | 552.00 | 30.00 | 2081.50 |
| chamber_labour | 926.00 | 716.00 | 454.00 | 2042.00 |
| hospitals | 468.00 | 517.50 | 30.00 | 1974.00 |
| laender | 372.50 | 360.00 | 420.00 | 2035.00 |
| medical_chamber | 438.50 | 445.50 | 63.50 | 1888.00 |
| ministry_finance | 573.50 | 389.00 | 375.50 | 1064.50 |
| nursing | 501.50 | 559.50 | 30.00 | 2059.50 |
| patients | 446.50 | 436.50 | 30.00 | 2069.00 |
| social_insurance | 371.50 | 435.00 | 353.50 | 2078.50 |
| **all (micro)** | 479.50 | 490.00 | 181.50 | 2023.00 |

## Loops

- `v1` (no fix): 82 of 244 adapter outputs loop (counted on the stored text)
- `v1-fix` (fixed proxy): 13 of 244 raw adapter outputs loop and were cut at the repeat; 0 loop after the cut
- `v2` (fixed proxy): 0 of 244 raw adapter outputs loop and were cut at the repeat; 0 loop after the cut
- base: 1 of 732 outputs loop

The v1 report's 27 of 244 used a looser reading; the count here is stricter (any 25+ character sentence that occurs twice) and is applied the same way to every version.

**Reading: v2 does not win.** Stance sign drops to 0.30 (v1-fix 0.50, base 0.57); only social_insurance (0.70 vs 0.56) beats the base. Within one step rises to 0.75, but mostly because 135 of 244 v2 outputs are judged neutral (0). Cause: the small-role v2 adapters are underfit. 2 epochs at lr 7e-5 on 157 to 211 rows is about 24 optimiser steps, less than v1 got (3 epochs at lr 1e-4). Even greedy, patients_v2, nursing_v2 and hospitals_v2 open like the base model with a letter salutation ("Sehr geehrte Damen und Herren,"), which never occurs in their training targets, and do not emit the stance prefix. The proxy's one-paragraph stop then cuts the answer to the salutation alone, which the judge rates neutral (median length 30 characters for patients). The larger sets (chamber_labour, social_insurance, laender) do emit `Haltung: ...` first. Best served option for the demo: v1 adapters through the fixed proxy (`sv-<role>`), or the prompted base where stance fidelity matters. A v2.1 with the v1 schedule (3 epochs, lr 1e-4) and the stance prefix would be the next try (about 2.5 USD, 45 min, plus a redeploy).

## Wins over the prompted base (per institution)

- `v1`: stance sign 2 of 9 (ministry_finance, social_insurance); in-character 3 of 9 (chamber_labour, hospitals, nursing)
- `v1-fix`: stance sign 3 of 9 (laender, ministry_finance, social_insurance); in-character 3 of 9 (chamber_labour, hospitals, nursing)
- `v2`: stance sign 1 of 9 (social_insurance); in-character 1 of 9 (nursing)

## Training v2 (one SageMaker job, per adapter)

| institution | n train | train loss | eval loss | seconds |
|---|---:|---:|---:|---:|
| patients | 182 | 2.238 | 2.11 | 149 |
| ministry_finance | 157 | 2.275 | 2.04 | 102 |
| chamber_commerce | 178 | 2.091 | 2.00 | 122 |
| medical_chamber | 211 | 2.109 | 2.28 | 139 |
| hospitals | 190 | 2.219 | 2.14 | 104 |
| nursing | 175 | 2.155 | 2.10 | 108 |
| chamber_labour | 267 | 1.954 | 1.98 | 186 |
| social_insurance | 288 | 2.123 | 1.88 | 193 |
| laender | 1428 | 1.732 | 1.79 | 910 |

Eval loss is on held-out rows without the stance prefix, so it is not comparable to v1.

Caveats: stance labels come from an LLM judge (spot-check `rows.jsonl`); the v2 training stance labels come from the same judge, so v2 learned that judge's reading of the training paragraphs; small n for patients (12) and ministry_finance (24); the classifier head was selected on the held-out period.
