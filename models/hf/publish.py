"""Stage (and, only with --execute, upload) the persona LoRA adapters to PRIVATE Hugging Face repos.

  python -I models/hf/publish.py                      # dry run (default): write cards, print the plan
  python -I models/hf/publish.py --execute            # create private repos and upload adapters
  python -I models/hf/publish.py --roles nursing,hospitals --hf-user Aryt3

Inputs: adapter folders from fetch_adapters.sh (default models/out/lora-sagemaker/<role>/, each with
adapter_config.json + adapter_model.safetensors), the eval numbers in models/out/eval_sagemaker.md and
models/out/persona_fidelity.json, and the role list in configs/institutions.yaml.

Output per role: models/out/hf/<role>/ with README.md (model card, YAML metadata) plus copies of the
allowlisted adapter files. Only that allowlist is ever uploaded (adapter_config.json,
adapter_model.safetensors, README.md, LICENSE-NOTICE.md). No training data, no train_meta.json, no
jsonl, ever.

Safety rules for --execute:
- HF_TOKEN comes from the repo .env (SV_ENV_FILE overrides the path) or the environment; never printed.
- Every repo is created with private=True.
- Before anything is created or uploaded, every target repo is checked: if one already exists and is
  public, the whole run is refused. Nothing is uploaded for any role then.
- Missing adapter folders are reported; with --execute the run is refused unless every selected role
  has both adapter files.
Needs huggingface_hub only for --execute (`uv run --with huggingface_hub python -I ...`).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
from pathlib import Path

MODELS = Path(__file__).resolve().parents[1]
REPO = MODELS.parent
ROLES_WITH_ADAPTER = [
    "laender", "social_insurance", "chamber_labour", "nursing", "hospitals",
    "ministry_finance", "chamber_commerce", "medical_chamber", "patients",
]
ADAPTER_FILES = ("adapter_config.json", "adapter_model.safetensors")
UPLOAD_ALLOW = [*ADAPTER_FILES, "README.md", "LICENSE-NOTICE.md"]
BASE = "Qwen/Qwen3-8B"
TIE = 0.05


def repo_name(user: str, role: str) -> str:
    return f"{user}/sv-persona-{role}-qwen3-8b-lora"


def read_env_token() -> str | None:
    if os.environ.get("HF_TOKEN"):
        return os.environ["HF_TOKEN"]
    path = Path(os.environ.get("SV_ENV_FILE", REPO / ".env"))
    if not path.is_file():
        return None
    for line in path.read_text().splitlines():
        m = re.match(r"\s*(?:export\s+)?HF_TOKEN\s*=\s*(.*)\s*$", line)
        if m:
            return m.group(1).strip().strip("'\"") or None
    return None


def md_tables(md: str) -> list[tuple[list[str], list[list[str]]]]:
    out, lines, i = [], md.splitlines(), 0
    split = lambda s: [c.strip() for c in s.strip().strip("|").split("|")]  # noqa: E731
    while i < len(lines) - 1:
        if lines[i].strip().startswith("|") and re.match(r"^\s*\|[\s:|-]+\|\s*$", lines[i + 1]):
            head, rows, j = split(lines[i]), [], i + 2
            while j < len(lines) and lines[j].strip().startswith("|"):
                rows.append(split(lines[j]))
                j += 1
            out.append((head, rows))
            i = j
        else:
            i += 1
    return out


def num(cell: str) -> float | None:
    m = re.search(r"-?\d+(?:\.\d+)?", cell.replace("*", "").replace(",", ""))
    return float(m.group()) if m else None


def load_eval() -> dict:
    md = (MODELS / "out" / "eval_sagemaker.md").read_text()
    fid = json.loads((MODELS / "out" / "persona_fidelity.json").read_text())
    per: dict[str, dict] = {}
    allrow: dict = {}
    for head, rows in md_tables(md):
        if "in-char adapter" in head:
            for r in rows:
                d = dict(zip(head, r))
                role = d["institution"].replace("*", "").strip()
                vals = {k: num(v) for k, v in d.items() if k != "institution"}
                (allrow.update(vals) if role.startswith("all") else per.setdefault(role, {}).update(vals))
        if "eval loss" in head:
            for r in rows:
                d = dict(zip(head, r))
                per.setdefault(d["institution"], {}).update({k: num(v) for k, v in d.items() if k != "institution"})
    for role, f in fid["institutions"].items():
        per.setdefault(role, {}).update({"in-char adapter": f["adapter"], "in-char baseline": f["baseline"]})
    loops = re.search(r"(\d+) of (\d+) adapter outputs loop", md)
    run = re.search(r"Runs?: `([^`]+)`", md)
    return {"per": per, "all": allrow, "loops": loops.groups() if loops else ("?", "?"),
            "run": run.group(1) if run else "?", "fid_all": fid["all"]}


def f2(x) -> str:
    return "n/a" if x is None else f"{x:.2f}"


def card(role: str, ev: dict) -> str:
    r = ev["per"].get(role, {})
    a, b = r.get("in-char adapter"), r.get("in-char baseline")
    verdict = "n/a" if a is None or b is None else ("tie" if abs(a - b) < TIE else ("better" if a > b else "worse"))
    al = ev["all"]
    n_loop, n_all = ev["loops"]
    return f"""---
base_model: {BASE}
library_name: peft
license: apache-2.0
language:
- de
pipeline_tag: text-generation
tags:
- lora
- peft
- qwen3
- persona
- policy-simulation
- research-demo
- austria
- health-policy
---

# sv-persona-{role}-qwen3-8b-lora

LoRA adapter on `{BASE}` that writes a one-paragraph position in the register of the Austrian
institution role `{role}` in a Begutachtung (draft-law consultation) setting. Built for a hackathon
prototype that simulates health-policy negotiations between institutions, never persons.

**Research demo only.** Not a source of the institution's actual position, not affiliated with or
endorsed by the institution, and not for representing, impersonating or speaking for any real
institution or its staff in public or in real communication.

## Result first: a measured experiment, weaker than the base overall

On held-out statements (dated 2023-01-01 or later, run `{ev['run']}`), compared with the same base model
prompted with the same role card (`sv-base`):

| metric (held-out) | this adapter | prompted base |
|---|---:|---:|
| n rows | {int(r['n']) if r.get('n') else 'n/a'} | |
| in-character score (mean P(role given text), char n-gram classifier, chance about 0.10) | {f2(a)} | {f2(b)} |
| stance direction matches the real paragraph (LLM judge) | {f2(r.get('sign adapter'))} | {f2(r.get('sign baseline'))} |
| stance within one step (-2..+2) | {f2(r.get('within1 adapter'))} | {f2(r.get('within1 baseline'))} |

Verdict on in-character score (tie below {TIE} difference): **{verdict}**.

Across all nine adapters (micro, n {ev['fid_all']['n']}): in-character {f2(ev['fid_all']['adapter'])} adapter vs
{f2(ev['fid_all']['baseline'])} base, stance direction {f2(al.get('sign adapter'))} vs {f2(al.get('sign baseline'))},
within one step {f2(al.get('within1 adapter'))} vs {f2(al.get('within1 baseline'))}. **Overall the adapters
underperform the prompted base model**; they beat it on the in-character score only for nursing,
chamber_labour and hospitals. The simulator therefore uses frontier models with fitted stance profiles
by default.

## Training

- Data: {int(r['n train']) if r.get('n train') else 'n/a'} SFT rows (train), {int(r['n held-out']) if r.get('n held-out') else 'n/a'} held-out rows. System = institution
  role card, user = draft-law context (title, citation, date, referenced provisions), assistant = the
  institution's documented position paragraph. Loss on the assistant paragraph only.
- Out-of-time split: train on statements before 2023-01-01, evaluate after.
- LoRA rank 16, alpha 32, all attention and MLP projections, 3 epochs, lr 1e-4 cosine, batch 4 x
  grad-acc 4, max length 2048, bf16, Qwen3 non-thinking chat template. One SageMaker training job
  (ml.g6e.xlarge) for all nine adapters.
- Train loss {f2(r.get('train loss'))}, eval loss {f2(r.get('eval loss'))}.

## Masking procedure

Source texts are public consultation statements (Begutachtungs-Stellungnahmen, Austrian Parliament
Open Data). Before any training row was written, a person-name guard ran on every user and assistant
text: spaCy PER entities with a false-positive filter, an academic/office title rule, name lists, a
first-name list and signature marks. Any hit masks the whole sentence as `[...]`; the result is
re-verified, rows that still hit are dropped, and a final pass aborts the build if anything survives.
Institution names are kept (they are institutions, not persons). Masking is best effort without a
measured recall.

## No training data in this repository

This repository contains only `adapter_config.json`, `adapter_model.safetensors`, this card and the
licence notice. **No training data, no statement text and no derived dataset is uploaded**, here or
anywhere else; the text of the statements belongs to the institutions.

## Limitations

- **Loops:** {n_loop} of {n_all} adapter outputs in the held-out eval repeat a sentence at temperature 0.3.
  Use a repetition penalty or a lower max length.
- Underperforms the prompted base overall on register and stance direction (see above).
- Reflects 2007 to 2022 statements; positions drift. Statements are opening positions and mostly
  critical by genre, so the adapter can over-produce opposition.
- May reproduce phrasing from its training statements.
- Stance labels come from an LLM judge; the in-character classifier was selected on the same
  held-out period, so absolute in-character values are slightly optimistic. Small n for some roles.

## Intended use

Research demo of persona fidelity measurement in a clearly labelled simulation that attributes every
utterance to an institution role, never to a person. Out of scope: any real-world representation of
an institution, political communication, or use as evidence of what an institution thinks.

## Licence

Apache-2.0, as the base model `{BASE}` (Apache-2.0, licence and notice retained, see
LICENSE-NOTICE.md).

## Usage

```python
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer
tok = AutoTokenizer.from_pretrained("{BASE}")
model = PeftModel.from_pretrained(AutoModelForCausalLM.from_pretrained("{BASE}"), "<this repo>")
# use the Qwen3 chat template with enable_thinking=False and a role card as system prompt
```
"""


NOTICE = f"""# Licence notice

This adapter is a derivative of {BASE}, licensed under the Apache License 2.0
(https://www.apache.org/licenses/LICENSE-2.0). The adapter weights are released under the same
licence. Copyright for the base model remains with its authors. No training data is included.
"""


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--adapters", type=Path, default=MODELS / "out" / "lora-sagemaker")
    ap.add_argument("--staging", type=Path, default=MODELS / "out" / "hf")
    ap.add_argument("--roles", default=",".join(ROLES_WITH_ADAPTER))
    ap.add_argument("--hf-user", default=os.environ.get("HF_USER", "Aryt3"))
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", default=True, help="default: write cards, upload nothing")
    mode.add_argument("--execute", action="store_true", help="create PRIVATE repos and upload")
    a = ap.parse_args()

    roles = [r.strip() for r in a.roles.split(",") if r.strip()]
    unknown = [r for r in roles if r not in ROLES_WITH_ADAPTER]
    if unknown:
        sys.exit(f"no adapter for roles: {unknown}")
    ev = load_eval()

    plan, missing = [], []
    for role in roles:
        src, dst = a.adapters / role, a.staging / role
        dst.mkdir(parents=True, exist_ok=True)
        (dst / "README.md").write_text(card(role, ev))
        (dst / "LICENSE-NOTICE.md").write_text(NOTICE)
        have = [f for f in ADAPTER_FILES if (src / f).is_file()]
        for f in have:
            shutil.copy2(src / f, dst / f)
        if len(have) < len(ADAPTER_FILES):
            missing.append(role)
        plan.append((role, repo_name(a.hf_user, role), have))

    # Fail closed: nothing outside the allowlist may sit in a staging folder that gets uploaded.
    for role, _, _ in plan:
        extra = [p.name for p in (a.staging / role).iterdir() if p.name not in UPLOAD_ALLOW]
        if extra:
            sys.exit(f"{role}: unexpected files in staging, refusing: {extra}")

    print(f"mode: {'EXECUTE' if a.execute else 'dry-run'}; staging {a.staging}")
    for role, repo, have in plan:
        state = "adapter ok" if len(have) == len(ADAPTER_FILES) else f"adapter MISSING ({a.adapters / role})"
        print(f"  {repo:60s} private  {state}")
    token = read_env_token()
    print(f"HF_TOKEN: {'found' if token else 'not found'} (value never printed)")

    if not a.execute:
        print("dry run: cards written, nothing created or uploaded. Rerun with --execute to upload.")
        return
    if missing:
        sys.exit(f"refusing --execute: adapter files missing for {missing}; run models/hf/fetch_adapters.sh first")
    if not token:
        sys.exit("refusing --execute: HF_TOKEN not set in .env or environment")

    from huggingface_hub import HfApi  # noqa: PLC0415
    from huggingface_hub.utils import RepositoryNotFoundError  # noqa: PLC0415

    api = HfApi(token=token)
    who = api.whoami().get("name")
    if who != a.hf_user:
        print(f"note: token belongs to {who!r}, target namespace is {a.hf_user!r}")

    # Check every target first; one public repo stops the whole run before anything is written.
    public = []
    for _, repo, _ in plan:
        try:
            info = api.repo_info(repo, repo_type="model")
            if not info.private:
                public.append(repo)
        except RepositoryNotFoundError:
            pass
    if public:
        sys.exit(f"refusing --execute: these repos exist and are PUBLIC: {public}. Nothing was uploaded.")

    for role, repo, _ in plan:
        api.create_repo(repo, repo_type="model", private=True, exist_ok=True)
        if not api.repo_info(repo, repo_type="model").private:
            sys.exit(f"{repo} is not private after create, stopping before upload")
        api.upload_folder(repo_id=repo, repo_type="model", folder_path=str(a.staging / role),
                          allow_patterns=UPLOAD_ALLOW,
                          commit_message=f"sv persona adapter {role} (Qwen3-8B LoRA r16), model card")
        print(f"uploaded {repo} (private)")


if __name__ == "__main__":
    main()
