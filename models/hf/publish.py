"""Stage (and, only with --execute, upload) the persona LoRA adapters to PRIVATE Hugging Face repos.

  python -I models/hf/publish.py                      # dry run (default): write cards, print the plan
  python -I models/hf/publish.py --execute            # create private repos and upload adapters
  python -I models/hf/publish.py --roles nursing,hospitals --hf-user Aryt3
  python -I models/hf/publish.py --version v2          # v2 set: repos ...-qwen3-8b-lora-v2, numbers from
                                                       # persona_fidelity.json "versions"/"v2" and eval_v2.md
  python -I models/hf/publish.py --version v2.1        # v2.1 set: repos ...-qwen3-8b-lora-v21, adapters from
                                                       # out/lora-sagemaker-v21, numbers from versions/"v2.1"

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
VERSIONS = ("v1", "v2", "v2.1")
DOSSIER = "dossier-qwen3-235b"   # versions[...] arm for the context-persona (dossier) approach on qwen3-235b
# v2 training summary (job sv-ki-challenge-lora-v2-1106-013811, 2 epochs). eval_v2.md only keeps the latest
# job's table (v21), so these rows are copied from its earlier version (git b20ef40, "Training v2").
# role: (n train, epochs, steps, train loss, eval loss)
TRAIN_V2 = {
    "patients": (182, 2, None, 2.238, 2.11), "ministry_finance": (157, 2, None, 2.275, 2.04),
    "chamber_commerce": (178, 2, None, 2.091, 2.00), "medical_chamber": (211, 2, None, 2.109, 2.28),
    "hospitals": (190, 2, None, 2.219, 2.14), "nursing": (175, 2, None, 2.155, 2.10),
    "chamber_labour": (267, 2, None, 1.954, 1.98), "social_insurance": (288, 2, None, 2.123, 1.88),
    "laender": (1428, 2, None, 1.732, 1.79),
}


def suffix(version: str) -> str:
    """Repo and folder suffix: v1 none, v2 '-v2', v2.1 '-v21'."""
    return "" if version == "v1" else "-" + version.replace(".", "")


def repo_name(user: str, role: str, version: str = "v1") -> str:
    return f"{user}/sv-persona-{role}-qwen3-8b-lora{suffix(version)}"


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


def load_eval_v2(version: str = "v2") -> dict:
    """Same shape as load_eval(), from the versions block written by models/aws/eval_v2_report.py.

    Also carries the comparison arms for the card: v1 + fix, the prompted base and the dossier approach."""
    fid = json.loads((MODELS / "out" / "persona_fidelity.json").read_text())
    vers = fid.get("versions") or {}
    for need in (version, "v1", "v1-fix", DOSSIER):
        if need not in vers:
            sys.exit(f"persona_fidelity.json has no versions.{need} block; run models/aws/eval_v2_report.py first")
    v = vers[version]
    md = (MODELS / "out" / "eval_v2.md").read_text()

    def row(x):
        return {"in-char adapter": x["adapter"], "in-char baseline": x["baseline"], "n": x["n"],
                "sign adapter": x["stance_sign_adapter"], "sign baseline": x["stance_sign_baseline"],
                "within1 adapter": x["within1_adapter"], "within1 baseline": x["within1_baseline"]}
    per = {r: row(x) for r, x in v["institutions"].items()}
    if version == "v2":
        train = TRAIN_V2
    else:  # "## Training v21" table in eval_v2.md
        train = {}
        for head, rows in md_tables(md):
            if "steps" in head and "n train" in head:
                for r in rows:
                    d = dict(zip(head, r))
                    train[d["institution"]] = tuple(num(d[k]) for k in
                                                    ("n train", "epochs", "steps", "train loss", "eval loss"))
    for r, x in per.items():
        t = train.get(r, (None,) * 5)
        x.update(dict(zip(("n train", "epochs", "steps", "train loss", "eval loss"), t)))
    loops = re.search(rf"`{re.escape(version)}` \(fixed proxy\): (\d+) of (\d+) raw adapter outputs loop", md)
    arms = {lab: {"per": vers[lab]["institutions"], "all": vers[lab]["all"]} for lab in ("v1", "v1-fix", DOSSIER)}
    return {"per": per, "all": row(v["all"]), "loops": loops.groups() if loops else ("?", "?"), "run": v["run"],
            "fid_all": {"n": v["all"]["n"], "adapter": v["all"]["adapter"], "baseline": v["all"]["baseline"]},
            "arms": arms, "version": version}


def comparison(role: str, ev: dict) -> str:
    """Small table: this version vs v1 + fix vs prompted base vs dossier on qwen3-235b, this role and all nine."""
    me, al, arms = ev["per"].get(role, {}), ev["all"], ev["arms"]
    fx, dz = arms["v1-fix"], arms[DOSSIER]
    fxr, dzr = fx["per"].get(role, {}), dz["per"].get(role, {})
    n = int(me["n"]) if me.get("n") else "n/a"
    rows = [
        (f"approach (held-out, n {n} for `{role}`, 244 for all nine)", "stance direction, this institution",
         "in-character, this institution", "stance direction, all nine", "in-character, all nine"),
        (f"**this adapter ({ev['version']})**", f2(me.get("sign adapter")), f2(me.get("in-char adapter")),
         f2(al.get("sign adapter")), f2(al.get("in-char adapter"))),
        ("v1 adapter + inference fix", f2(fxr.get("stance_sign_adapter")), f2(fxr.get("adapter")),
         f2(fx["all"].get("stance_sign_adapter")), f2(fx["all"].get("adapter"))),
        (f"prompted base `{BASE}` (role card, no adapter)", f2(me.get("sign baseline")),
         f2(me.get("in-char baseline")), f2(al.get("sign baseline")), f2(al.get("in-char baseline"))),
        ("dossier prompt on qwen3-235b (context persona, no training)", f2(dzr.get("stance_sign_adapter")),
         f2(dzr.get("adapter")), f2(dz["all"].get("stance_sign_adapter")), f2(dz["all"].get("adapter"))),
    ]
    lines = ["| " + " | ".join(r) + " |" for r in rows]
    lines.insert(1, "|---|---:|---:|---:|---:|")
    return "\n".join(lines)


def verdict_v2x(role: str, ev: dict, win_sg: list[str]) -> str:
    al, arms = ev["all"], ev["arms"]
    v1a, dza = arms["v1"]["all"], arms[DOSSIER]["all"]
    if ev["version"] == "v2":
        return (f"**Verdict: v2 is weaker than v1 and than the prompted base overall** (stance direction "
                f"{f2(al['sign adapter'])} vs {f2(v1a['stance_sign_adapter'])} for v1 and "
                f"{f2(al['sign baseline'])} for the base; in-character {f2(al['in-char adapter'])} vs "
                f"{f2(v1a['adapter'])} and {f2(al['in-char baseline'])}). Its small-institution adapters are "
                "underfit (about 24 optimiser steps at lr 7e-5) and often open with a letter salutation only. "
                "**It is kept for transparency, not for use**; v2.1 (`-v21`) is the retrained successor.")
    mine = role in win_sg
    return (f"**Verdict: v2.1 beats the prompted base on stance direction for five institutions** "
            f"({', '.join(win_sg)}){'; this institution is one of them' if mine else '; this institution is not one of them'}. "
            f"Overall it is slightly behind the base (stance direction {f2(al['sign adapter'])} vs "
            f"{f2(al['sign baseline'])}, in-character {f2(al['in-char adapter'])} vs {f2(al['in-char baseline'])}) "
            f"and **behind the dossier approach on average** (dossier on qwen3-235b: stance direction "
            f"{f2(dza['stance_sign_adapter'])}, in-character {f2(dza['adapter'])}). The prototype demo uses v2.1 "
            "only for those five institutions and the prompted base elsewhere.")


def f2(x) -> str:
    return "n/a" if x is None else f"{x:.2f}"


def card(role: str, ev: dict, version: str = "v1") -> str:
    r = ev["per"].get(role, {})
    name = f"sv-persona-{role}-qwen3-8b-lora{suffix(version)}"
    win_ic = [k for k, x in sorted(ev["per"].items())
              if (x.get("in-char adapter") or 0) > (x.get("in-char baseline") or 0)]
    win_sg = [k for k, x in sorted(ev["per"].items())
              if (x.get("sign adapter") or 0) > (x.get("sign baseline") or 0)]
    behind = ((ev["fid_all"]["adapter"] or 0) < (ev["fid_all"]["baseline"] or 0)
              and (ev["all"].get("sign adapter") or 0) < (ev["all"].get("sign baseline") or 0))
    overall = ("**Overall the adapters underperform the prompted base model**" if behind
               else "Overall the adapters are mixed against the prompted base model")
    if version == "v1":
        recipe = """- Data: {nt} SFT rows (train), {nh} held-out rows. System = institution
  role card, user = draft-law context (title, citation, date, referenced provisions), assistant = the
  institution's documented position paragraph. Loss on the assistant paragraph only.
- Out-of-time split: train on statements before 2023-01-01, evaluate after.
- LoRA rank 16, alpha 32, all attention and MLP projections, 3 epochs, lr 1e-4 cosine, batch 4 x
  grad-acc 4, max length 2048, bf16, Qwen3 non-thinking chat template. One SageMaker training job
  (ml.g6e.xlarge) for all nine adapters."""
        loop_note = "repeat a sentence at temperature 0.3.\n  Use a repetition penalty or a lower max length."
    else:
        recipe = """- Data: {nt} SFT rows (train): the v1 Stellungnahme rows plus person-free press-derived
  institution-voice rows (train split, before 2023-01-01), deduplicated. Each target starts with a
  stance label from an LLM judge ("Haltung: ablehnend. ..."), so the adapter states its direction
  first; strip that prefix before showing the text. Loss on the assistant turn only.
- Out-of-time split: train on statements before 2023-01-01, evaluate after (same held-out rows as v1).
- LoRA rank 16, alpha 32, dropout 0.05, all attention and MLP projections, 2 epochs, lr 7e-5 cosine,
  batch 4 x grad-acc 4, max length 2048, bf16, Qwen3 non-thinking chat template. One SageMaker job."""
        loop_note = ("loop in the raw generation even with\n  repetition_penalty 1.1, frequency_penalty 0.3 "
                     "and a stop after one paragraph; the serving proxy cuts at the first repeated sentence.")
    if version == "v2.1":
        recipe = """- Data: the v2 data. {nt} SFT rows (train) for this institution: the v1 Stellungnahme rows plus
  person-free press-derived institution-voice rows (train split, before 2023-01-01), deduplicated. Across all
  nine v2 sets: 2,706 Stellungnahme rows with a judge-labelled stance plus 370 press rows; for v2.1 laender
  was capped to a fixed random 600 rows (all 47 press rows kept). Each target starts with a stance label from
  an LLM judge ("Haltung: ablehnend. ..."); strip that prefix before showing the text. Loss on the assistant
  turn only.
- Out-of-time split: train on statements before 2023-01-01, evaluate after (same held-out rows as v1).
- LoRA rank 16, alpha 32, dropout 0.05, all attention and MLP projections, the v1 schedule: lr 1e-4 cosine,
  3 epochs raised so every adapter gets at least 36 optimiser steps (this one: {ep} epochs, {st} steps),
  batch 4 x grad-acc 4, max length 2048, bf16, Qwen3 non-thinking chat template. One SageMaker job
  (ml.g6e.xlarge) for all nine adapters."""
    elif version == "v2":
        recipe += """
- Data sizes across all nine sets: 2,706 Stellungnahme rows with a judge-labelled stance plus 370 press
  rows. 2 epochs for every adapter, so the small sets got only about 24 optimiser steps (underfit)."""
    recipe = recipe.format(nt=int(r["n train"]) if r.get("n train") else "n/a",
                           nh=int(r["n held-out"]) if r.get("n held-out") else int(r["n"]) if r.get("n") else "n/a",
                           ep=f"{r['epochs']:g}" if r.get("epochs") else "n/a",
                           st=f"{r['steps']:g}" if r.get("steps") else "n/a")
    if version == "v1":
        headline, compare = "a measured experiment, weaker than the base overall", ""
    else:
        headline = ("weaker than v1 and the base, kept for transparency" if version == "v2"
                    else "ahead of the base on stance for five institutions, behind the dossier approach")
        compare = ("\n## Comparison with the other approaches\n\n" + comparison(role, ev) + "\n\n"
                   + verdict_v2x(role, ev, win_sg) + "\n\nStance direction: share of held-out rows where the "
                   "LLM judge gives the generated paragraph the same direction (against, neutral, for) as the "
                   "institution's real paragraph. In-character: mean P(role given text) from a char n-gram "
                   "classifier, chance about 0.10. v1 + fix is the v1 adapter served with repetition_penalty 1.1, "
                   "frequency_penalty 0.3 and a one-paragraph stop. The dossier arm prompts qwen3-235b with an "
                   "institution dossier built only from material dated before 2023-01-01; no weights are trained.\n")
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

# {name}

LoRA adapter on `{BASE}` that writes a one-paragraph position in the register of the Austrian
institution role `{role}` in a Begutachtung (draft-law consultation) setting. Built for a hackathon
prototype that simulates health-policy negotiations between institutions, never persons.

**Research demo only.** Not a source of the institution's actual position, not affiliated with or
endorsed by the institution, and not for representing, impersonating or speaking for any real
institution or its staff in public or in real communication.

## Result first: {headline}

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
within one step {f2(al.get('within1 adapter'))} vs {f2(al.get('within1 baseline'))}. {overall}; they beat it on the
in-character score for {', '.join(win_ic) or 'no institution'} and on stance direction for
{', '.join(win_sg) or 'no institution'}. The simulator therefore uses frontier models with fitted stance
profiles by default.
{compare}
## Training

{recipe}
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

- **Loops:** {n_loop} of {n_all} adapter outputs in the held-out eval {loop_note}
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
    ap.add_argument("--version", default="v1", choices=list(VERSIONS))
    ap.add_argument("--adapters", type=Path, help="default out/lora-sagemaker, out/lora-sagemaker-v2 or -v21")
    ap.add_argument("--staging", type=Path, help="default out/hf, out/hf-v2 or out/hf-v21")
    ap.add_argument("--roles", default=",".join(ROLES_WITH_ADAPTER))
    ap.add_argument("--hf-user", default=os.environ.get("HF_USER", "Aryt3"))
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", default=True, help="default: write cards, upload nothing")
    mode.add_argument("--execute", action="store_true", help="create PRIVATE repos and upload")
    a = ap.parse_args()
    sfx = suffix(a.version)
    a.adapters = a.adapters or MODELS / "out" / f"lora-sagemaker{sfx}"
    a.staging = a.staging or MODELS / "out" / f"hf{sfx}"

    roles = [r.strip() for r in a.roles.split(",") if r.strip()]
    unknown = [r for r in roles if r not in ROLES_WITH_ADAPTER]
    if unknown:
        sys.exit(f"no adapter for roles: {unknown}")
    ev = load_eval() if a.version == "v1" else load_eval_v2(a.version)

    plan, missing = [], []
    for role in roles:
        src, dst = a.adapters / role, a.staging / role
        dst.mkdir(parents=True, exist_ok=True)
        (dst / "README.md").write_text(card(role, ev, a.version))
        (dst / "LICENSE-NOTICE.md").write_text(NOTICE)
        have = [f for f in ADAPTER_FILES if (src / f).is_file()]
        for f in have:
            shutil.copy2(src / f, dst / f)
        if len(have) < len(ADAPTER_FILES):
            missing.append(role)
        plan.append((role, repo_name(a.hf_user, role, a.version), have))

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
                          commit_message=f"sv persona adapter {role} {a.version} (Qwen3-8B LoRA r16), model card")
        print(f"uploaded {repo} (private)")


if __name__ == "__main__":
    main()
