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
    add_char_head.py             2. char n-gram TF-IDF head + ensemble; picks the scorer mode
    persona_score.py             2. score(text, institution) -> probability; CLI and HTTP
    train_lora.py                3a. PEFT/TRL LoRA per institution (+ optional DPO stage)
    serve_vllm.sh                3a. vLLM multi-LoRA server, one model name per role
    azure_finetune.py            3b. Azure OpenAI export / upload / SFT and DPO jobs
    eval_stance.py               3c. held-out stance agreement adapter vs prompted baseline
  aws/                           3d. SageMaker path (own uv project): setup, training job, endpoint, proxy, teardown
  cards/MODEL_CARD.md, DATASET_CARD.md   Hugging Face drafts (not published)
  data/                          generated training sets (rebuild any time)
  out/                           classifier model + report, LoRA adapters, eval runs (weights gitignored)
```

All Python that reads downloaded/derived data runs with `python -I`.

## Rebuild (CPU, laptop)

```sh
cd models && uv sync
uv run python -I scripts/build_datasets.py      # rerun whenever data/derived/stellungnahmen*.jsonl grows
uv run python -I scripts/train_classifier.py --per-class 32 --iterations 5 --max-seq 192   # ~15 min CPU
uv run python -I scripts/add_char_head.py       # ~1 min
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
  the SV-OG draft, 75/ME XXVI. GP; empty: SV-OG is flagged `health_broad`, not `health_core`, so its PDFs are only fetched by the data track with `04_fetch_pdfs.py --broad`).
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

Three heads on the same person- and name-masked paragraphs, same out-of-time split (train before
2023-01-01: 5,812 paragraphs; held-out after: 1,421 paragraphs; 10 classes with enough data, i.e. all
roles except ministry_health and elective_physicians):

| head | macro F1 held-out (10 classes, chance 0.10) |
|---|---:|
| SetFit (`paraphrase-multilingual-mpnet-base-v2`, contrastive step + LR head) | 0.22 |
| frozen embeddings + LR | 0.24 |
| char_wb 2-5 gram TF-IDF + LR (**shipped**, `mode: char`) | 0.38 |
| mean of SetFit and char | 0.32 |

Per institution (char head, F1): laender 0.72, nursing 0.49, social_insurance 0.43,
contract_physicians 0.43, chamber_labour 0.42, medical_chamber 0.39, ministry_finance 0.36,
chamber_commerce 0.31, patients 0.15, hospitals 0.12. Main confusions: everything with laender (largest
class, generic administrative register), hospitals with laender and AK, patients with AK. On the interim
5-class corpus the same char head reached 0.60. Register (spelling, abbreviations, legal phrasing)
carries more signal than sentence semantics here; single paragraphs are a hard unit. The head was
chosen on the held-out split, so its F1 is slightly optimistic. Use the score as a relative signal
(compare adapter vs baseline, or flag out-of-character drift), not as a gate. Full report and confusion
matrices: `out/classifier/report.md`.

### Interface for the engine

Role ids are the `Role` enum of `packages/contracts/src/primitives.ts`.

```python
# from models/ (or add models/scripts to sys.path)
from persona_score import Scorer
s = Scorer()                                 # loads out/classifier/model once (mode from persona_labels.json)
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

### AWS SageMaker (the path that is running for the demo)

Region `eu-north-1`, one `ml.g6e.xlarge` (1x L40S 48 GB) for training and one for hosting, every resource
tagged `Project=sv-ki-challenge`. Nothing account-specific is in the repo: the account id comes from STS at
runtime, the bucket is `sv-ki-challenge-<account>-eu-north-1` (override with `SV_SM_BUCKET`). Uses the
default AWS CLI profile (SSO).

```sh
cd models/aws && uv sync
uv run python -I setup_infra.py                    # budget (200 USD/month, no subscriber), bucket, IAM role
SV_SFT_DIR=../data/sft uv run python -I train_job.py launch   # uploads the 18 SFT files, starts ONE job
uv run python -I train_job.py status | cost        # log tail / billable seconds x 2.7636 USD/h
uv run python -I deploy.py single                  # after the job: stage adapters, LMI model, endpoint, ~10 min
uv run python -I deploy.py status | smoke <role>   # smoke base | smoke medical_chamber
uv run python -I invoke_user.py --env ../../.env    # invoke-only key for the proxy (no SSO expiry)
uv run python -I proxy.py                          # OpenAI-compatible on http://127.0.0.1:8790/v1
./teardown.sh                                      # dry run; --execute deletes everything incl. the IAM user
```

- **Infra** (`setup_infra.py`): bucket with public access blocked, SSE-S3, TLS-only policy. Execution role
  `sv-ki-challenge-sagemaker`, trust limited to `sagemaker.amazonaws.com` from this account, inline policy
  only: list/get/put/delete on this bucket, CloudWatch Logs under `/aws/sagemaker/*`, `PutMetricData` in
  the SageMaker namespaces, ECR pulls from the AWS Deep Learning Containers registry (763104351884).
- **Training** (`train_job.py`, `train/sm_train.py`): HF PyTorch training DLC
  (`2.8.0-transformers4.56.2-gpu-py312-cu129`, trl 0.23, peft 0.17), 3 h runtime cap. The job first copies
  Qwen3-8B to `s3://<bucket>/base/Qwen3-8B/` (so the endpoint loads from S3 and can start while training
  runs), then trains the nine adapters sequentially with the same recipe as `train_lora.py`: bf16 LoRA
  rank 16 / alpha 32 on all attention and MLP projections, 3 epochs, lr 1e-4 cosine, batch 4 x grad-acc 4,
  max length 2048, completion-only loss, Qwen3 non-thinking prompts. Each adapter is uploaded as soon as it
  is done: `adapters/<role>/` (adapter_config.json, adapter_model.safetensors, train_meta.json) and
  `adapters-tar/<role>.tar.gz` (files at archive root, the format inference components need).
- **Serving** (`deploy.py single`): endpoint `sv-ki-challenge-personas`, one classic single-model
  variant on the LMI container (`djl-inference:0.36.0-lmi24.0.0-cu129`, vLLM rolling batch, bf16, max model
  len 6144, LoRA on, max 10 adapters on GPU, rank 16). The nine adapters are copied into
  `s3://<bucket>/base/Qwen3-8B/adapters/<role>/`, so LMI loads all of them at startup together with the base
  weights; a request selects one with the body field `"adapters": "<role>"`, no field means the prompted
  base. First attempt was SageMaker multi-adapter inference (one base inference component plus one
  adapter component per institution, `deploy.py endpoint|base|adapters`, `SV_SM_MODE=ic`): it served, but
  adapter components are registered lazily at runtime, and under eval load a registration timed out
  ("Read chunk timeout"), the LMI worker restarted and came back with adapters missing (HTTP 424). On
  g6e.xlarge the base component also only placed with a 2 GiB memory reservation (16 and 8 GiB: "not enough
  hardware resources").
- **Proxy** (`proxy.py`, port 8790): `GET /v1/models`, `POST /v1/chat/completions`. Model ids
  `sv-<role>` (role ids as in packages/contracts, e.g. `sv-medical_chamber`) select that adapter,
  `sv-base` (alias `Qwen/Qwen3-8B`) the prompted baseline. Requests are SigV4-signed by boto3. The proxy renders
  the Qwen3 chat template with an empty think block itself (checked identical to the tokenizer with
  `enable_thinking=False`), so serving matches training; `stream: true` returns one SSE chunk. The engine
  uses it as an OpenAI-compatible endpoint: base URL `http://127.0.0.1:8790/v1`, any API key.
- **Eval** (`eval_report.py`): `eval_stance.py --gen-base-url http://127.0.0.1:8790/v1 --base-model sv-base
  --adapter-model "sv-{role}" --judge-model gpt-6-sol --judge-temperature none`, then
  `eval_report.py <run dirs>` writes `out/eval_sagemaker.md` and `out/persona_fidelity.json`.
  Result (244 held-out rows, run 20261105-232834): micro in-character 0.39 adapter vs 0.47 baseline,
  stance sign 0.44 vs 0.57, within one step 0.69 vs 0.64; the adapter wins in-character for nursing,
  chamber_labour and hospitals only, and 27 of 244 adapter outputs loop on a sentence. Details and caveats
  in `out/eval_sagemaker.md` (committed with `persona_fidelity.json` although `out/` is ignored: metrics only).

**Costs actually incurred** (on-demand, ml.g6e.xlarge eu-north-1 = 2.7636 USD/h for training; the Pricing
API has no separate hosting row for this type, the same rate is assumed):

| item | duration | USD |
|---|---:|---:|
| training job `sv-ki-challenge-lora-1105-220044` (9 adapters, 3 epochs, base copy to S3) | 3,118 billable s | 2.39 |
| first endpoint, inference-component mode (22:01 to 22:34 CET, deleted) | about 0.55 h | about 1.52 |
| single-model endpoint, InService since 23:07 CET, projected to 13:00 CET on jury day | about 14 h | about 38.4 |
| S3 (21 GB: base weights, staged adapters, data; one day) | | < 0.1 |
| **spent by 23:10 CET** | | **about 4.0** |
| **projected total to 13:00** | | **about 42.5** |

The CLI login (SSO) expires after about an hour, so the proxy does not use it for the demo:
`uv run python -I invoke_user.py --env ../../.env` creates IAM user `sv-ki-challenge-invoke` with only
`sagemaker:InvokeEndpoint` and `InvokeEndpointWithResponseStream` on the endpoint ARN and writes one access
key to the gitignored repo `.env` as `SV_SAGEMAKER_ACCESS_KEY_ID` / `SV_SAGEMAKER_SECRET_ACCESS_KEY` (never
printed). The proxy prefers these and falls back to the default profile; it reads the repo `.env`
(`SV_ENV_FILE` overrides the path, e.g. when running from a worktree).

Delete with `models/aws/teardown.sh --execute` right after the jury (hosting bills per hour while idle).
Download the adapters first if they should outlive the bucket:
`aws s3 sync s3://<bucket>/adapters/ out/lora-sagemaker/ --exclude "summary.json"`.

**Publishing the adapters to Hugging Face later (not done):**
1. Download as above; each `out/lora-sagemaker/<role>/` is a standard PEFT adapter whose
   `adapter_config.json` already names `Qwen/Qwen3-8B` as base (rewritten from the container path).
2. Re-check the licence position first: Qwen3-8B is Apache-2.0 (redistribution with the licence notice is
   fine), but the training text is the institutions' Stellungnahmen (see `cards/DATASET_CARD.md`); publish
   adapters only, never the SFT data, and keep the person masking statement in the card.
3. Fill `cards/MODEL_CARD.md` per adapter (base, rank, epochs, `train_meta.json` losses, the held-out
   numbers from `out/eval_sagemaker.md`, limitations, intended use: simulation, not real positions).
4. `huggingface-cli login` with a write token kept outside the repo, then
   `huggingface-cli upload <org>/sv-persona-<role> out/lora-sagemaker/<role> . --private` (start private,
   flip to public after review). Do not upload `train_meta.json` if it is not wanted public.

### Azure Foundry fine-tuning (blocked server-side, see status below)

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
training tokens; corpus of 2,667 statements as of 20:31; rerun `cost` after any rebuild):

| model | examples | tokens/epoch | epochs | billed tokens | USD |
|---|---:|---:|---:|---:|---:|
| social_insurance | 247 | 112,469 | 3 | 337,407 | 1.11 |
| medical_chamber | 139 | 67,425 | 3 | 202,275 | 0.67 |
| hospitals | 151 | 58,841 | 3 | 176,523 | 0.58 |
| nursing | 156 | 65,240 | 3 | 195,720 | 0.65 |
| patients | 136 | 54,050 | 3 | 162,150 | 0.54 |
| laender | 1381 | 575,520 | 3 | 1,726,560 | 5.70 |
| ministry_finance | 145 | 55,207 | 3 | 165,621 | 0.55 |
| chamber_labour | 211 | 96,359 | 3 | 289,077 | 0.95 |
| chamber_commerce | 140 | 58,571 | 3 | 175,713 | 0.58 |
| joint (all roles) | 2731 | 1,152,763 | 3 | 3,458,289 | 11.41 |

Training all nine per-role adapters: about 11.3 USD (the joint model alone: 11.4 USD). Hosting
dominates: about 0.3 USD per hour per fine-tuned deployment, so 5 deployments from tonight to tomorrow
13:00 (about 17 h) are about 25 USD; 6 are about 31 USD. Recommendation: at most 5 to 6 deployments for
the demo (for example social_insurance, medical_chamber, laender, ministry_finance, nursing, patients,
or the joint model plus four), and **delete every fine-tuned deployment after the event** (hosting
keeps billing while idle). Worst case for this track: about 45 USD, under the 100 USD cap.

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
