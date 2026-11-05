# models/: persona-model track (FR-C1 to C6)

Institution personas for the negotiation engine, fitted on the **person-masked** Begutachtungs-
Stellungnahmen from `data/derived/` (never on raw PDFs). Owner: persona-model track. Reads `data/`
read-only, writes only here.

```
models/
  pyproject.toml, uv.lock        uv project, CPU torch on the laptop; `--extra gpu` for the GPU VM
  configs/institutions.yaml      role ids (= packages/contracts Role), data mapping, role cards, thresholds, splits
  scripts/
    pii_guard.py                 CON-1/CON-2 guard, imports the data track's rules, fail closed
    institutions.py              config loader, [INSTITUTION] name masking for the classifier
    build_datasets.py            1. SFT / classifier / backtest sets + stats.json
    gen_dpo.py                   1b. steadfastness DPO pairs (`--azure --model gpt-6-sol`, or OPENAI_COMPATIBLE_*)
    envfile.py                   reads ../.env (Foundry endpoint + key), never prints values
    train_classifier.py          2. SetFit "which institution wrote this", time-split report
    persona_score.py             2. score(text, institution) -> probability; CLI and HTTP
    train_lora.py                3a. PEFT/TRL LoRA per institution (+ optional DPO stage)
    serve_vllm.sh                3a. vLLM multi-LoRA server, one model name per role
    azure_finetune.py            3b. Azure OpenAI export / upload / SFT and DPO jobs
    eval_stance.py               3c. held-out stance agreement adapter vs prompted baseline
  cards/MODEL_CARD.md, DATASET_CARD.md   Hugging Face drafts (not published)
  data/                          generated training sets (rebuild any time)
  out/                           classifier model + report, LoRA adapters, eval runs (weights gitignored)
```

All Python that reads downloaded/derived data runs with `python -I`.

## Rebuild (CPU, laptop)

```sh
cd models && uv sync
uv run python -I scripts/build_datasets.py      # rerun whenever data/derived/stellungnahmen*.jsonl grows
uv run python -I scripts/train_classifier.py    # ~10 to 30 min on CPU depending on data size
uv run python -I scripts/gen_dpo.py --azure --model gpt-6-sol   # DPO pairs via the team Foundry endpoint
```

## Datasets (1)

- `data/sft/<role>.{train,heldout}.jsonl`, `data/sft/all.*.jsonl`: chat rows
  `{"messages":[system=role card, user=draft context, assistant=position paragraph], "meta":{...}}`.
  User turn: ME title + citation + GP, date of the statement, referenced provisions (`§ 5 Abs. 2`,
  `Z 4`, ...) and the preceding "Zu § ..." heading when present. The draft text itself is not in the
  corpus, so the provision excerpt is the reference, not the wording.
- `data/classifier/paragraphs.jsonl`: every usable paragraph (max 8 per statement), institution names
  replaced by `[INSTITUTION]`, duplicate or cross-institution identical paragraphs removed.
- `data/backtest/sft.bt_train.jsonl` (dated before 2018-09-14) and `sft.bt_eval.jsonl` (statements on
  the SV-OG draft, 75/ME XXVI. GP; empty until the data track has fetched those PDFs).
- `data/dpo/`: written by `gen_dpo.py` only.
- `data/stats.json`: per-role counts, guard counters, adapter eligibility.

Split: train < `2023-01-01` <= held-out (out-of-time, by statement date). Thresholds in
`configs/institutions.yaml`: adapter needs >= 100 SFT train rows from >= 30 statements and >= 10 held-out rows.

**CON-1/CON-2 (fail closed).** `pii_guard.py` loads the rule set from `data/scripts/05_extract_clean.py`
(spaCy PER with its false-positive filter, title rule, name lists, first names, `e.h.`) and re-runs it on
every user and assistant text: hit sentences become `[...]`, the result is re-verified, rows that still
hit are dropped, and a final verification over everything aborts the build without writing if anything
survives. The same guard runs on DPO generations and on eval generations.

## In-character classifier (2)

SetFit on `paraphrase-multilingual-mpnet-base-v2`: contrastive fine-tune on a class-balanced sample, then a
class-weighted logistic-regression head on all train paragraphs. Report with per-institution F1, the
frozen-embedding baseline and the confusion matrix: `out/classifier/report.md`.

### Interface for the engine

Role ids are the `Role` enum of `packages/contracts/src/primitives.ts`.

```python
# from models/ (or add models/scripts to sys.path)
from persona_score import Scorer
s = Scorer()                                 # loads out/classifier/model once
s.score(text, "medical_chamber")             # float in [0,1]; None if the role is not a classifier class
s.scores(text)                               # {role: probability} over all classes (sums to 1)
```

CLI: `uv run python -I scripts/persona_score.py --institution nursing "Text ..."` (or `-` for stdin).

HTTP (localhost): `uv run python -I scripts/persona_score.py --serve --port 8765`

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/health` | | `{"ok": true, "labels": [...]}` |
| POST | `/score` | `{"text", "institution"}` | `{"institution", "known", "probability", "predicted", "probs": {role: p}}` |
| POST | `/score_batch` | `{"items": [{"text", "institution"}]}` | `{"results": [...]}` |

`probability` is relative to the classifier's classes only (it is a "sounds like X rather than the other
fitted institutions" score, not an absolute authenticity score). Roles without enough data return
`known: false, probability: null`. Input is preprocessed like training (names to `[INSTITUTION]`), so an
utterance cannot score high just by naming its institution.

## LoRA kit (3)

### Base model choice

`Qwen/Qwen3-8B`, Apache-2.0 (adapters and merged weights redistributable with the licence notice),
strong German, fits one 24 GB GPU with `--qlora` or a 40/80 GB GPU in bf16, native vLLM multi-LoRA.
Trained and served in non-thinking mode. Fallback with the same licence: `mistralai/Mistral-7B-Instruct-v0.3`
(`--base`). Llama 3.x was not chosen because its licence adds naming and acceptable-use conditions to
redistributed derivatives.

### GPU VM (one A100/H100 80 GB, or L4/A10 24 GB with --qlora)

```sh
git clone <repo> && cd sv-ki-challenge/models     # models/data/ is tracked; if not committed, copy it over
uv venv -p 3.12 && uv pip install -r requirements-gpu.txt   # CUDA torch via vLLM; pyproject stays CPU-only
.venv/bin/python -I scripts/train_lora.py --role all-eligible            # one adapter per eligible role
.venv/bin/python -I scripts/train_lora.py --role joint                   # one adapter, all roles
.venv/bin/python -I scripts/train_lora.py --role medical_chamber --dpo   # after gen_dpo.py
scripts/serve_vllm.sh Qwen/Qwen3-8B 8000                                 # model=<role> per adapter
OPENAI_COMPATIBLE_BASE_URL=... OPENAI_COMPATIBLE_API_KEY=... \
  .venv/bin/python -I scripts/eval_stance.py --n 40                      # adapter vs baseline
```

### Azure Foundry fine-tuning (preferred path: team resource, no GPU VM)

Credentials come from the repo `.env` (`BIFROST_SEED_AZURE_ENDPOINT` = v1 base URL, `BIFROST_SEED_AZURE_KEY`,
sent as `api-key` header); `scripts/envfile.py` loads them and never prints them. Fine-tunable models on
the resource (`GET /models`, `capabilities.fine_tune=true`) are only the Fireworks-backed `FW-*` models;
default base `FW-Qwen3.5-9B` (Qwen3.5-9B, Apache-2.0, hybrid thinking, 201 languages).

```sh
cd models
uv run python -I scripts/azure_finetune.py cost                       # token count x epochs -> USD, no network
uv run python -I scripts/azure_finetune.py smoke                      # 10-row job: proves upload + create
AZURE_FT_TRAINING_TYPE=GlobalStandard \
  uv run python -I scripts/azure_finetune.py sft --per-role --epochs 3  # one job per eligible role
AZURE_FT_TRAINING_TYPE=GlobalStandard \
  uv run python -I scripts/azure_finetune.py sft --epochs 3             # alternative: one joint model
uv run python -I scripts/azure_finetune.py list | status <job_id> | cancel <job_id>
```

Guards in the script: epochs must be 2 or 3; the estimated training cost must stay under
`AZURE_FT_CAP_USD` (default 100, this track's cap) or the job is refused. SFT only. Never use RFT or
any method billed per training hour (RFT is about 80 USD/h). DPO only if the model accepts
`method=dpo` and it is billed per token; the `FW-*` models are documented for SFT/RFT only, so the DPO
pairs are for the open-weights path (`train_lora.py --dpo`) until that changes.

**Cost estimate** (Qwen tokenizer, all tokens of every training example x epochs, 3.3 USD per 1M
training tokens; interim corpus of 300 statements, rerun `cost` after the data track finishes):

| model | examples | tokens/epoch | epochs | billed tokens | USD |
|---|---:|---:|---:|---:|---:|
| medical_chamber | 110 | 54,008 | 3 | 162,024 | 0.53 |
| nursing | 156 | 65,240 | 3 | 195,720 | 0.65 |
| patients | 136 | 54,050 | 3 | 162,150 | 0.54 |
| ministry_finance | 147 | 55,667 | 3 | 167,001 | 0.55 |
| joint (all roles) | 574 | 238,046 | 3 | 714,138 | 2.36 |

Training for all four per-role adapters: about 2.3 USD. Hosting dominates: about 0.3 USD per hour per
fine-tuned deployment, so 5 deployments from tonight to tomorrow 13:00 (about 17 h) are about 25 USD.
Recommendation: at most 5 to 6 deployments for the demo (the four adapters plus optionally the joint
model), and **delete every fine-tuned deployment after the event** (hosting keeps billing while idle).
Even if the full corpus grows the data tenfold, training stays below 25 USD.

**Status 2026-11-05 evening: job creation is blocked server-side.** File upload works
(`purpose=fine-tune`, files reach `processed`). Every `POST /fine_tuning/jobs` for an `FW-*` model with
`method=supervised` returns HTTP 500 "Service has failed unexpectedly" (FW-Qwen3.5-9B, FW-Qwen3.5-4B,
FW-Qwen3.6-35B-A3B; resource host and services.ai.azure.com host; with and without hyperparameters).
Other combinations fail validation: `Standard` "not supported", `DataZoneStandard` and `GlobalStandard`
without an explicit method "model not supported with method Supervised", `Developer`/`Global` are not
valid enum values. `batch_size: "auto"` is rejected. No job was created, nothing was billed; the
smoke files were deleted. Likely causes: Managed Training for these Fireworks models is not enabled in
the resource's region (Microsoft lists several regions where `Qwen3.6`/`Qwen3.8` Managed Training is
unsupported), or the FW models need the project-scoped endpoint
(`https://<resource>.services.ai.azure.com/api/projects/<project>/openai/v1`). Next step for someone
with portal access: Foundry portal > the project > Fine-tuning > Fine-tune > `Qwen3.5-9B` > Supervised,
upload `data/azure/sft.medical_chamber.train.jsonl` and `...heldout.jsonl`; if the portal accepts it,
copy the project endpoint into `.env` as `AZURE_OPENAI_V1_BASE` and rerun the script. If the portal also
fails, open a support case with the request ids in `out/azure_probe.md`.

**Deploying a finished job (portal only; the API key cannot do control-plane operations):**
1. Foundry portal (https://ai.azure.com) > select the project on this resource > Build > Fine-tune.
2. Open the job (`sv-<role>` suffix), check Status = Succeeded and the validation loss.
3. Select **Deploy** > deployment type as offered (serverless Global Standard for FW models) > name the
   deployment exactly `sv-<role>` (e.g. `sv-medical_chamber`) so the engine and `eval_stance.py
   --adapter-model sv-{role}` find it.
4. Repeat per role (max 5 to 6 deployments). Test with
   `curl $ENDPOINT/chat/completions -H "api-key: ..." -d '{"model":"sv-medical_chamber","messages":[...]}'`.
5. After the event: Build > Models + endpoints > select each `sv-*` deployment > Delete.

**Downloading weights for Hugging Face:** not found for Managed Training. Microsoft documents importing
your own LoRA adapters into Foundry (Fireworks runtime: `adapter_config.json` +
`adapter_model.safetensors`) and states that Fireworks merges an adapter into a full-weight copy for
serving; no documented export of adapters trained by Managed Training. So publishable adapters come from
the open-weights path (`train_lora.py` on a GPU VM, Qwen3-8B), which also allows DPO.

Formats: SFT `{"messages":[...]}`, DPO `{"input":{"messages":[...]}, "preferred_output":[...],
"non_preferred_output":[...]}` (`data/azure/`, written by `export`).

## Hugging Face prep (4)

`cards/MODEL_CARD.md`, `cards/DATASET_CARD.md`: drafts with licence notes, masking procedure, intended
use, limitations. Nothing is published; text of the Stellungnahmen belongs to the institutions.
