# Persona adapters v2: held-out evaluation

Runs: `v1` = `v1-nofix`, `v1-fix` = `20261106-015512`, `v2` = `20261106-025255`, `v2.1` = `20261106-042021`; eval_stance.py via `models/aws/proxy.py`, judge `gpt-6-sol` (default temperature), up to 30 held-out rows per institution (the v1 split: statements dated 2023-01-01 or later, never trained on), generation temperature 0.3.

- **v1**: `sv-<role>`, Qwen3-8B + LoRA r16, 3 epochs, lr 1e-4, Stellungnahme rows only; no inference fix
- **v1-fix**: the same v1 adapters through the fixed proxy (repetition_penalty 1.1, frequency_penalty 0.3, stop after one paragraph, max 320 tokens, cut at the first repeated sentence)
- **v2**: `sv2-<role>`, LoRA r16, dropout 0.05, 2 epochs, lr 7e-5; targets prefixed with the judge-labelled stance ("Haltung: ablehnend. ..."), plus the person-free press-derived institution-voice rows (train split); same fixed proxy, which strips the prefix before the text is judged
- **v2.1**: `sv21-<role>`, the v2 data with the v1 schedule (3 epochs, lr 1e-4, r16, dropout 0.05) and at least 36 optimiser steps per adapter (epochs raised for the small sets); fixed proxy with the paragraph rule that skips a leading salutation or header instead of stopping at the first blank line (v1-fix and v2 were measured with the plain stop)
- **base**: `sv-base`, prompted Qwen3-8B with the same role card and context, no adapter, no fix; regenerated in each run with identical settings; the column pools the baseline rows of all runs

## Stance sign agreement (same direction as the institution's real paragraph)

| institution | v1 | v1-fix | v2 | v2.1 | base |
|---|---:|---:|---:|---:|---:|
| chamber_commerce | 0.50 | 0.50 | 0.07 | 0.37 | 0.53 |
| chamber_labour | 0.27 | 0.37 | 0.53 | 0.50 | 0.68 |
| hospitals | 0.46 | 0.64 | 0.14 | 0.71 | 0.66 |
| laender | 0.50 | 0.60 | 0.47 | 0.50 | 0.58 |
| medical_chamber | 0.33 | 0.47 | 0.27 | 0.70 | 0.69 |
| ministry_finance | 0.46 | 0.50 | 0.29 | 0.21 | 0.39 |
| nursing | 0.33 | 0.50 | 0.00 | 0.70 | 0.53 |
| patients | 0.33 | 0.25 | 0.00 | 0.58 | 0.46 |
| social_insurance | 0.70 | 0.57 | 0.70 | 0.60 | 0.55 |
| **all (micro)** | 0.44 | 0.50 | 0.30 | 0.55 | 0.57 |

## Stance within one step (-2..+2)

| institution | v1 | v1-fix | v2 | v2.1 | base |
|---|---:|---:|---:|---:|---:|
| chamber_commerce | 0.57 | 0.67 | 0.77 | 0.50 | 0.58 |
| chamber_labour | 0.47 | 0.40 | 0.67 | 0.50 | 0.68 |
| hospitals | 0.79 | 0.82 | 0.96 | 0.79 | 0.73 |
| laender | 0.67 | 0.67 | 0.63 | 0.60 | 0.68 |
| medical_chamber | 0.77 | 0.67 | 0.87 | 0.77 | 0.69 |
| ministry_finance | 0.92 | 0.79 | 0.71 | 0.62 | 0.75 |
| nursing | 0.70 | 0.73 | 0.63 | 0.73 | 0.53 |
| patients | 0.42 | 0.42 | 0.92 | 0.58 | 0.50 |
| social_insurance | 0.83 | 0.70 | 0.73 | 0.70 | 0.59 |
| **all (micro)** | 0.69 | 0.66 | 0.75 | 0.65 | 0.65 |

## In-character score (mean P(role | text), char-head classifier, chance 0.10)

| institution | v1 | v1-fix | v2 | v2.1 | base |
|---|---:|---:|---:|---:|---:|
| chamber_commerce | 0.10 | 0.15 | 0.03 | 0.15 | 0.55 |
| chamber_labour | 0.39 | 0.53 | 0.21 | 0.45 | 0.22 |
| hospitals | 0.18 | 0.24 | 0.04 | 0.29 | 0.13 |
| laender | 0.57 | 0.65 | 0.59 | 0.57 | 0.74 |
| medical_chamber | 0.24 | 0.12 | 0.10 | 0.16 | 0.32 |
| ministry_finance | 0.33 | 0.23 | 0.18 | 0.30 | 0.67 |
| nursing | 0.66 | 0.43 | 0.72 | 0.62 | 0.40 |
| patients | 0.60 | 0.48 | 0.05 | 0.42 | 0.68 |
| social_insurance | 0.52 | 0.38 | 0.27 | 0.49 | 0.57 |
| **all (micro)** | 0.39 | 0.35 | 0.26 | 0.38 | 0.46 |

## Median length (characters)

| institution | v1 | v1-fix | v2 | v2.1 | base |
|---|---:|---:|---:|---:|---:|
| chamber_commerce | 565.00 | 552.00 | 30.00 | 520.50 | 2090.00 |
| chamber_labour | 926.00 | 716.00 | 454.00 | 635.50 | 2045.50 |
| hospitals | 468.00 | 517.50 | 30.00 | 456.50 | 1982.50 |
| laender | 372.50 | 360.00 | 420.00 | 357.50 | 2038.00 |
| medical_chamber | 438.50 | 445.50 | 63.50 | 307.50 | 1878.50 |
| ministry_finance | 573.50 | 389.00 | 375.50 | 333.00 | 1068.00 |
| nursing | 501.50 | 559.50 | 30.00 | 513.00 | 2060.50 |
| patients | 446.50 | 436.50 | 30.00 | 618.00 | 2070.50 |
| social_insurance | 371.50 | 435.00 | 353.50 | 355.50 | 2075.50 |
| **all (micro)** | 479.50 | 490.00 | 181.50 | 442.00 | 2023.00 |

## Loops

- `v1` (no fix): 82 of 244 adapter outputs loop (counted on the stored text)
- `v1-fix` (fixed proxy): 13 of 244 raw adapter outputs loop and were cut at the repeat; 0 loop after the cut
- `v2` (fixed proxy): 0 of 244 raw adapter outputs loop and were cut at the repeat; 0 loop after the cut
- `v2.1` (fixed proxy): 0 of 244 raw adapter outputs loop and were cut at the repeat; 0 loop after the cut
- base: 1 of 976 outputs loop

The v1 report's 27 of 244 used a looser reading; the count here is stricter (any 25+ character sentence that occurs twice) and is applied the same way to every version.

**Reading.** v2 lost (stance sign 0.30): its small-role adapters were underfit (about 24 steps at lr 7e-5) and opened with a letter salutation that the old stop at the first blank line cut to nothing. **v2.1** keeps the v2 data (stance prefix, press rows), uses the v1 schedule with at least 36 steps per adapter, and the proxy skips a leading salutation. It reaches stance sign 0.55 (base 0.57, v1-fix 0.50) and beats the base on stance direction for 5 of 9 institutions (hospitals, medical_chamber, nursing, patients, social_insurance), against 3 for v1-fix. Overall it is still slightly behind the base on stance sign and in-character (0.38 vs 0.46), with 0 loops and paragraph-length answers (median 442 characters vs 2,023 for the base). Laender was trained on a fixed random 600-row subset (all 47 press rows kept) to finish before the AWS session expired; it still got 114 steps. For the demo: `sv21-<role>` for the five winning institutions, the prompted base elsewhere.

## Wins over the prompted base (per institution)

- `v1`: stance sign 2 of 9 (ministry_finance, social_insurance); in-character 3 of 9 (chamber_labour, hospitals, nursing)
- `v1-fix`: stance sign 3 of 9 (laender, ministry_finance, social_insurance); in-character 3 of 9 (chamber_labour, hospitals, nursing)
- `v2`: stance sign 1 of 9 (social_insurance); in-character 1 of 9 (nursing)
- `v2.1`: stance sign 5 of 9 (hospitals, medical_chamber, nursing, patients, social_insurance); in-character 3 of 9 (chamber_labour, hospitals, nursing)

## Training v21 (one SageMaker job, per adapter)

| institution | n train | epochs | steps | train loss | eval loss | seconds |
|---|---:|---:|---:|---:|---:|---:|
| patients | 182 | 3 | 36.0 | 2.056 | 2.07 | 195 |
| ministry_finance | 157 | 4 | 40 | 1.938 | 1.97 | 183 |
| chamber_commerce | 178 | 3 | 36.0 | 1.931 | 1.97 | 182 |
| medical_chamber | 211 | 3 | 42.0 | 1.952 | 2.25 | 210 |
| hospitals | 190 | 3 | 36.0 | 2.043 | 2.12 | 159 |
| nursing | 175 | 4 | 44 | 1.882 | 2.05 | 216 |
| chamber_labour | 267 | 3 | 51.0 | 1.823 | 1.94 | 279 |
| social_insurance | 288 | 3 | 54.0 | 1.971 | 1.84 | 290 |
| laender | 600 | 3 | 114.0 | 1.715 | 1.82 | 629 |

Eval loss is on held-out rows without the stance prefix, so it is not comparable to v1.

Caveats: stance labels come from an LLM judge (spot-check `rows.jsonl`); the v2 training stance labels come from the same judge, so v2 learned that judge's reading of the training paragraphs; small n for patients (12) and ministry_finance (24); the classifier head was selected on the held-out period.
