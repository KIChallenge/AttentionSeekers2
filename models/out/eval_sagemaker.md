# Persona adapters on SageMaker: held-out evaluation

Runs: `20261105-232834` (eval_stance.py via `models/aws/proxy.py`), judge `gpt-6-sol`, up to 30 held-out rows per institution, temperature 0.3, max 600 tokens.

- **adapter**: `sv-<role>`, Qwen3-8B + institution LoRA (rank 16, 3 epochs), SageMaker inference component
- **baseline**: `sv-base`, the same Qwen3-8B with the same role card and context, no adapter
- **in-char**: mean P(role | text) of the char-head classifier (`persona_score.py`, 10 classes, chance 0.10). It measures register ("sounds like this institution rather than the others"), not correctness.
- **sign / within1**: share of rows where the judge's stance (-2..+2) of the generation has the same direction as / is within one step of the judge's stance of the institution's real paragraph.

| institution | n | in-char adapter | in-char baseline | sign adapter | sign baseline | within1 adapter | within1 baseline |
|---|---:|---:|---:|---:|---:|---:|---:|
| chamber_commerce | 30 | 0.10 | 0.55 | 0.50 | 0.60 | 0.57 | 0.67 |
| chamber_labour | 30 | 0.39 | 0.22 | 0.27 | 0.67 | 0.47 | 0.67 |
| hospitals | 28 | 0.18 | 0.12 | 0.46 | 0.61 | 0.79 | 0.68 |
| laender | 30 | 0.57 | 0.76 | 0.50 | 0.60 | 0.67 | 0.70 |
| medical_chamber | 30 | 0.24 | 0.31 | 0.33 | 0.67 | 0.77 | 0.67 |
| ministry_finance | 24 | 0.33 | 0.71 | 0.46 | 0.42 | 0.92 | 0.79 |
| nursing | 30 | 0.66 | 0.41 | 0.33 | 0.37 | 0.70 | 0.37 |
| patients | 12 | 0.60 | 0.62 | 0.33 | 0.50 | 0.42 | 0.58 |
| social_insurance | 30 | 0.52 | 0.61 | 0.70 | 0.63 | 0.83 | 0.67 |
| **all (micro)** | 244 | 0.39 | 0.47 | 0.44 | 0.57 | 0.69 | 0.64 |

Adapter beats baseline on in-character score for 3 of 9 institutions.

Reading: the adapters did not beat the prompted base overall. They reproduce the register of the real paragraphs (median 480 characters, one position paragraph, like the references; the baseline writes 2,000-character letters with headers), but 27 of 244 adapter outputs loop on a sentence at temperature 0.3, and stance direction is closer to the reference only for ministry_finance and social_insurance. The in-character score improves for nursing, chamber_labour and hospitals and drops sharply for chamber_commerce and ministry_finance. For the demo, use the adapters as institution voices with a repetition penalty or the base model with role card where stance fidelity matters; the joint DPO/steadfastness stage and the press-derived rows were not trained in this run.

## Training (SageMaker job, per adapter)

| institution | n train | n held-out | train loss | eval loss | seconds |
|---|---:|---:|---:|---:|---:|
| patients | 136 | 12 | 2.179 | 2.03 | 140 |
| ministry_finance | 145 | 24 | 2.027 | 1.92 | 116 |
| chamber_commerce | 140 | 79 | 2.003 | 1.94 | 153 |
| medical_chamber | 139 | 32 | 2.077 | 2.22 | 156 |
| hospitals | 151 | 28 | 2.112 | 2.06 | 134 |
| nursing | 156 | 32 | 1.996 | 2.02 | 150 |
| chamber_labour | 211 | 49 | 1.903 | 1.90 | 234 |
| social_insurance | 247 | 72 | 2.041 | 1.79 | 255 |
| laender | 1381 | 332 | 1.641 | 1.71 | 1301 |

Caveats: stance labels come from an LLM judge (spot-check `rows.jsonl`); the classifier head was selected on the same held-out period, so absolute in-character values are slightly optimistic; small n for patients and ministry_finance. Generations were masked by `pii_guard.py` before scoring.
