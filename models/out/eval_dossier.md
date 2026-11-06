# Kontext-Persona (Dossier) vs role card vs persona adapters: held-out evaluation

Run `dossier-main` (`models/scripts/eval_dossier.py`), 244 held-out rows (the first 30 per institution of `models/data/sft/<role>.heldout.jsonl`, statements dated 2023-01-01 or later; the same 244 rows as `eval_sagemaker.md` / `eval_v2.md`). Judge `gpt-6-sol` with the `eval_stance.py` prompt and default temperature; the reference paragraph is judged once per row and shared by all arms of this run. Same char-head in-character scorer.

- **card-<model>**: system prompt = the institution's short role card, exactly what `sv-base` gets
- **dossier-<model>**: system prompt = the same role card plus `packages/engine/config/dossiers/<role>.md` (dossier-v1, 1,000 to 2,600 tokens, built only from material dated before 2023-01-01)
- user turn identical in every arm (draft title, date, provisions, section); Bedrock models at temperature 0.3 and 600 max tokens like the adapter eval; gpt-6-sol is a reasoning deployment and only accepts its default temperature
- **v1 / v1-fix / base**: copied from `persona_fidelity.json` (runs `v1-nofix` and `20261106-015512`, not re-run); their reference stances came from separate judge calls, so differences of a few points are within judge noise

## In-character (mean P(role | text), char-head classifier, chance 0.10)

| institution | v1 | v1-fix | base | card-gpt-6-sol | card-deepseek-v3.2 | card-qwen3-235b | dossier-gpt-6-sol | dossier-deepseek-v3.2 | dossier-qwen3-235b | best |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| chamber_commerce | 0.10 | 0.15 | 0.54 | 0.53 | 0.77 | 0.55 | 0.55 | 0.65 | 0.74 | card-deepseek-v3.2 |
| chamber_labour | 0.39 | 0.53 | 0.22 | 0.36 | 0.31 | 0.29 | 0.30 | 0.32 | 0.38 | v1-fix |
| hospitals | 0.18 | 0.24 | 0.12 | 0.16 | 0.14 | 0.22 | 0.22 | 0.29 | 0.32 | dossier-qwen3-235b |
| laender | 0.57 | 0.65 | 0.75 | 0.86 | 0.78 | 0.74 | 0.82 | 0.75 | 0.84 | card-gpt-6-sol |
| medical_chamber | 0.24 | 0.12 | 0.31 | 0.31 | 0.39 | 0.34 | 0.36 | 0.36 | 0.52 | dossier-qwen3-235b |
| ministry_finance | 0.33 | 0.23 | 0.68 | 0.84 | 0.78 | 0.69 | 0.88 | 0.93 | 0.81 | dossier-deepseek-v3.2 |
| nursing | 0.66 | 0.43 | 0.39 | 0.44 | 0.44 | 0.54 | 0.45 | 0.28 | 0.47 | v1 |
| patients | 0.59 | 0.48 | 0.66 | 0.33 | 0.58 | 0.45 | 0.21 | 0.30 | 0.42 | base |
| social_insurance | 0.52 | 0.38 | 0.57 | 0.76 | 0.50 | 0.51 | 0.65 | 0.43 | 0.60 | card-gpt-6-sol |
| **all (micro)** | 0.39 | 0.35 | 0.46 | 0.52 | 0.52 | 0.48 | 0.51 | 0.48 | 0.57 | dossier-qwen3-235b |

## Stance sign agreement (same direction as the real paragraph)

| institution | v1 | v1-fix | base | card-gpt-6-sol | card-deepseek-v3.2 | card-qwen3-235b | dossier-gpt-6-sol | dossier-deepseek-v3.2 | dossier-qwen3-235b | best |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| chamber_commerce | 0.50 | 0.50 | 0.50 | 0.47 | 0.50 | 0.60 | 0.57 | 0.57 | 0.67 | dossier-qwen3-235b |
| chamber_labour | 0.27 | 0.37 | 0.65 | 0.43 | 0.57 | 0.57 | 0.37 | 0.43 | 0.70 | dossier-qwen3-235b |
| hospitals | 0.46 | 0.64 | 0.62 | 0.64 | 0.57 | 0.61 | 0.64 | 0.61 | 0.79 | dossier-qwen3-235b |
| laender | 0.50 | 0.60 | 0.55 | 0.53 | 0.60 | 0.60 | 0.60 | 0.57 | 0.57 | v1-fix |
| medical_chamber | 0.33 | 0.47 | 0.67 | 0.70 | 0.67 | 0.67 | 0.60 | 0.73 | 0.67 | dossier-deepseek-v3.2 |
| ministry_finance | 0.46 | 0.50 | 0.35 | 0.54 | 0.54 | 0.54 | 0.46 | 0.46 | 0.58 | dossier-qwen3-235b |
| nursing | 0.33 | 0.50 | 0.52 | 0.57 | 0.67 | 0.67 | 0.63 | 0.47 | 0.63 | card-deepseek-v3.2 |
| patients | 0.33 | 0.25 | 0.42 | 0.42 | 0.50 | 0.83 | 0.58 | 0.42 | 0.58 | card-qwen3-235b |
| social_insurance | 0.70 | 0.57 | 0.58 | 0.60 | 0.77 | 0.50 | 0.67 | 0.70 | 0.57 | card-deepseek-v3.2 |
| **all (micro)** | 0.44 | 0.50 | 0.55 | 0.55 | 0.61 | 0.61 | 0.57 | 0.56 | 0.64 | dossier-qwen3-235b |

## Stance within one step (-2..+2)

| institution | v1 | v1-fix | base | card-gpt-6-sol | card-deepseek-v3.2 | card-qwen3-235b | dossier-gpt-6-sol | dossier-deepseek-v3.2 | dossier-qwen3-235b | best |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| chamber_commerce | 0.57 | 0.67 | 0.55 | 0.50 | 0.53 | 0.63 | 0.60 | 0.67 | 0.77 | dossier-qwen3-235b |
| chamber_labour | 0.47 | 0.40 | 0.65 | 0.43 | 0.57 | 0.57 | 0.40 | 0.43 | 0.70 | dossier-qwen3-235b |
| hospitals | 0.79 | 0.82 | 0.70 | 0.71 | 0.64 | 0.68 | 0.71 | 0.68 | 0.86 | dossier-qwen3-235b |
| laender | 0.67 | 0.67 | 0.65 | 0.63 | 0.60 | 0.67 | 0.70 | 0.57 | 0.63 | dossier-gpt-6-sol |
| medical_chamber | 0.77 | 0.67 | 0.67 | 0.73 | 0.67 | 0.67 | 0.67 | 0.73 | 0.70 | v1 |
| ministry_finance | 0.92 | 0.79 | 0.73 | 0.88 | 0.79 | 0.88 | 0.79 | 0.96 | 0.88 | dossier-deepseek-v3.2 |
| nursing | 0.70 | 0.73 | 0.53 | 0.60 | 0.70 | 0.70 | 0.67 | 0.50 | 0.67 | v1-fix |
| patients | 0.42 | 0.42 | 0.50 | 0.42 | 0.50 | 0.83 | 0.58 | 0.42 | 0.58 | card-qwen3-235b |
| social_insurance | 0.83 | 0.70 | 0.62 | 0.63 | 0.80 | 0.53 | 0.70 | 0.73 | 0.60 | v1 |
| **all (micro)** | 0.69 | 0.66 | 0.63 | 0.62 | 0.65 | 0.67 | 0.65 | 0.64 | 0.71 | dossier-qwen3-235b |

## Median length (characters)

| institution | card-gpt-6-sol | card-deepseek-v3.2 | card-qwen3-235b | dossier-gpt-6-sol | dossier-deepseek-v3.2 | dossier-qwen3-235b |
|---|---:|---:|---:|---:|---:|---:|
| chamber_commerce | 767 | 2050 | 2108 | 652 | 882 | 1674 |
| chamber_labour | 767 | 2052 | 2080 | 766 | 784 | 1802 |
| hospitals | 1124 | 2136 | 1967 | 892 | 1230 | 1918 |
| laender | 882 | 2154 | 1999 | 848 | 941 | 1726 |
| medical_chamber | 811 | 1757 | 1918 | 744 | 1099 | 1513 |
| ministry_finance | 538 | 1866 | 1466 | 540 | 492 | 864 |
| nursing | 1258 | 2178 | 2040 | 952 | 1588 | 2152 |
| patients | 1194 | 2243 | 2084 | 976 | 1506 | 2161 |
| social_insurance | 1180 | 2198 | 1989 | 1022 | 1610 | 2088 |
| all | 944 | 2116 | 2018 | 818 | 1094 | 1842 |

## Wins per institution (best of all columns, 9 institutions)

- incharacter: dossier-qwen3-235b 2, card-gpt-6-sol 2, card-deepseek-v3.2 1, v1-fix 1, dossier-deepseek-v3.2 1, v1 1, base 1
- sign: dossier-qwen3-235b 4, card-deepseek-v3.2 2, v1-fix 1, dossier-deepseek-v3.2 1, card-qwen3-235b 1
- within1: dossier-qwen3-235b 3, v1 2, dossier-gpt-6-sol 1, dossier-deepseek-v3.2 1, v1-fix 1, card-qwen3-235b 1

Cost of this run (list-price estimate, generation + judge): about 17.80 USD.
## Reading

- **Overall winner: `dossier-qwen3-235b`** on all three micro metrics (in-character 0.57, sign 0.64, within one step 0.71), ahead of every adapter version (v1 0.39 / 0.44 / 0.69, v1-fix 0.35 / 0.50 / 0.66) and of sv-base (0.46 / 0.55 / 0.63). Against its own role-card arm the dossier adds +0.09 in-character, +0.03 sign, +0.04 within one step.
- **The dossier does not help every model.** For gpt-6-sol it is a wash (in-character 0.51 vs 0.52, sign 0.57 vs 0.55, within one step 0.65 vs 0.62); for deepseek-v3.2 it lowers in-character (0.48 vs 0.52) and sign (0.56 vs 0.61). Much of the gain is the strong general model, not the dossier: the card-only arms already beat the adapters on in-character and sign.
- **Where the adapters still win:** in-character for chamber_labour (v1-fix 0.53) and nursing (v1 0.66), within one step for medical_chamber and social_insurance (v1). The fine-tuned register is real for those two voices; stance fidelity is not.
- Weak spots of the dossier: patients (in-character drops for every model with the dossier; n = 12, mostly technical eHealth drafts) and nursing with deepseek.
- With n = 12 to 30 per institution, differences under about 0.10 per institution are noise; the micro numbers (n = 244) are the ones to quote.
- Haiku 4.5 on Bedrock (`eu.anthropic.claude-haiku-4-5-20251001-v1:0`) was probed at the start and again after the run: 404 "Model use case details have not been submitted for this account". Not included; once access is enabled, `eval_dossier.py run --run models/out/eval/dossier-main --models bedrock/eu.anthropic.claude-haiku-4-5-20251001-v1:0` adds it from the same cache.
- About 2 % of early rows used the dossier before a whitespace-only reformat (blank lines after headings); content identical.
