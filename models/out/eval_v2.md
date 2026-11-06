# Persona adapters v2: held-out evaluation

Runs: `v1` = `v1-nofix`, `v1-fix` = `20261106-015512`; eval_stance.py via `models/aws/proxy.py`, judge `gpt-6-sol` (default temperature), up to 30 held-out rows per institution (the v1 split: statements dated 2023-01-01 or later, never trained on), generation temperature 0.3.

- **v1**: `sv-<role>`, Qwen3-8B + LoRA r16, 3 epochs, lr 1e-4, Stellungnahme rows only; no inference fix
- **v1-fix**: the same v1 adapters through the fixed proxy (repetition_penalty 1.1, frequency_penalty 0.3, stop after one paragraph, max 320 tokens, cut at the first repeated sentence)
- **v2**: `sv2-<role>`, LoRA r16, dropout 0.05, 2 epochs, lr 7e-5; targets prefixed with the judge-labelled stance ("Haltung: ablehnend. ..."), plus the person-free press-derived institution-voice rows (train split); same fixed proxy, which strips the prefix before the text is judged
- **base**: `sv-base`, prompted Qwen3-8B with the same role card and context, no adapter, no fix; regenerated in each run with identical settings; the column pools the baseline rows of all runs

## Stance sign agreement (same direction as the institution's real paragraph)

| institution | v1 | v1-fix | base |
|---|---:|---:|---:|
| chamber_commerce | 0.50 | 0.50 | 0.50 |
| chamber_labour | 0.27 | 0.37 | 0.65 |
| hospitals | 0.46 | 0.64 | 0.62 |
| laender | 0.50 | 0.60 | 0.55 |
| medical_chamber | 0.33 | 0.47 | 0.67 |
| ministry_finance | 0.46 | 0.50 | 0.35 |
| nursing | 0.33 | 0.50 | 0.52 |
| patients | 0.33 | 0.25 | 0.42 |
| social_insurance | 0.70 | 0.57 | 0.58 |
| **all (micro)** | 0.44 | 0.50 | 0.55 |

## Stance within one step (-2..+2)

| institution | v1 | v1-fix | base |
|---|---:|---:|---:|
| chamber_commerce | 0.57 | 0.67 | 0.55 |
| chamber_labour | 0.47 | 0.40 | 0.65 |
| hospitals | 0.79 | 0.82 | 0.70 |
| laender | 0.67 | 0.67 | 0.65 |
| medical_chamber | 0.77 | 0.67 | 0.67 |
| ministry_finance | 0.92 | 0.79 | 0.73 |
| nursing | 0.70 | 0.73 | 0.53 |
| patients | 0.42 | 0.42 | 0.50 |
| social_insurance | 0.83 | 0.70 | 0.62 |
| **all (micro)** | 0.69 | 0.66 | 0.63 |

## In-character score (mean P(role | text), char-head classifier, chance 0.10)

| institution | v1 | v1-fix | base |
|---|---:|---:|---:|
| chamber_commerce | 0.10 | 0.15 | 0.54 |
| chamber_labour | 0.39 | 0.53 | 0.22 |
| hospitals | 0.18 | 0.24 | 0.12 |
| laender | 0.57 | 0.65 | 0.75 |
| medical_chamber | 0.24 | 0.12 | 0.31 |
| ministry_finance | 0.33 | 0.23 | 0.68 |
| nursing | 0.66 | 0.43 | 0.39 |
| patients | 0.60 | 0.48 | 0.66 |
| social_insurance | 0.52 | 0.38 | 0.57 |
| **all (micro)** | 0.39 | 0.35 | 0.46 |

## Median length (characters)

| institution | v1 | v1-fix | base |
|---|---:|---:|---:|
| chamber_commerce | 565.00 | 552.00 | 2085.50 |
| chamber_labour | 926.00 | 716.00 | 2043.50 |
| hospitals | 468.00 | 517.50 | 1967.50 |
| laender | 372.50 | 360.00 | 2031.00 |
| medical_chamber | 438.50 | 445.50 | 1889.00 |
| ministry_finance | 573.50 | 389.00 | 1069.00 |
| nursing | 501.50 | 559.50 | 2060.00 |
| patients | 446.50 | 436.50 | 2069.00 |
| social_insurance | 371.50 | 435.00 | 2077.00 |
| **all (micro)** | 479.50 | 490.00 | 2022.50 |

## Loops

- `v1` (no fix): 82 of 244 adapter outputs loop (counted on the stored text)
- `v1-fix` (fixed proxy): 13 of 244 raw adapter outputs loop and were cut at the repeat; 0 loop after the cut
- base: 0 of 488 outputs loop

The v1 report's 27 of 244 used a looser reading; the count here is stricter (any 25+ character sentence that occurs twice) and is applied the same way to every version.

**v2 status (02:00): pending.** The v2 training job `sv-ki-challenge-lora-v2-1106-013811` was launched at 01:38 (9 adapters, 2 epochs, lr 7e-5, r16, stance-prefixed targets plus press rows). The AWS SSO session expired at about 01:45, before the job finished, so the deploy of v2 next to v1 and the v2 eval did not run yet; this file is regenerated with a v2 column by the same command plus `--run v2=<run_dir>`.

## Wins over the prompted base (per institution)

- `v1`: stance sign 2 of 9 (ministry_finance, social_insurance); in-character 3 of 9 (chamber_labour, hospitals, nursing)
- `v1-fix`: stance sign 3 of 9 (hospitals, laender, ministry_finance); in-character 3 of 9 (chamber_labour, hospitals, nursing)

Caveats: stance labels come from an LLM judge (spot-check `rows.jsonl`); the v2 training stance labels come from the same judge, so v2 learned that judge's reading of the training paragraphs; small n for patients (12) and ministry_finance (24); the classifier head was selected on the held-out period.
