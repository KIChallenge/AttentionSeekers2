"""In-context persona (dossier) vs short role card, same protocol as eval_stance.py.

Same held-out rows (first --n per institution of models/data/sft/<role>.heldout.jsonl: 244 rows for the
nine adapter institutions at --n 30), same judge prompt (eval_stance.JUDGE, gpt-6-sol, default temperature),
same in-character scorer (char-head classifier), same metrics (exact / sign / within1 / in-character).
Arms = model x prompt:
  card     system = the institution's role card (exactly what sv-base gets in the adapter eval)
  dossier  system = role card + packages/engine/config/dossiers/<role>.md (built from pre-2023 data only)
Models: azure/<deployment> (team Foundry endpoint, OPENAI_COMPATIBLE_*) and bedrock/<model id> (Converse API,
Bearer BIFROST_SEED_BEDROCK_KEY). The reference paragraph is judged once per row and shared by all arms.
Every generation and judgement is cached in <run>/cache.jsonl, so a run can be resumed or extended with
more arms (--run <dir>). Generations go through pii_guard.mask_many before anything is stored.

  uv run --project models python -I models/scripts/eval_dossier.py run --models azure/gpt-6-sol,bedrock/deepseek.v3.2
  uv run --project models python -I models/scripts/eval_dossier.py report --run models/out/eval/dossier-<ts>
"""
from __future__ import annotations

import argparse
import collections
import concurrent.futures as cf
import json
import os
import re
import statistics
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
MODELS = HERE.parent
REPO = MODELS.parent
sys.path.insert(0, str(HERE))
import envfile  # noqa: E402
from eval_stance import JUDGE, sign  # noqa: E402

MAIN = Path(os.environ.get("SV_MAIN_CHECKOUT", "/home/aryt3/Hacking/Hackathons/SV/sv-ki-challenge"))
ROLES = ["chamber_commerce", "chamber_labour", "hospitals", "laender", "medical_chamber", "ministry_finance",
         "nursing", "patients", "social_insurance"]
DOSSIERS = REPO / "packages" / "engine" / "config" / "dossiers"
# list prices used for the cost estimate (USD per 1M tokens in / out); Azure gpt-6-sol assumed like press/
PRICE = {"azure/gpt-6-sol": (5.0, 20.0), "bedrock/deepseek.v3.2": (0.62, 1.85),
         "bedrock/qwen.qwen3-235b-a22b-2507-v1:0": (0.22, 0.88),
         "bedrock/eu.anthropic.claude-haiku-4-5-20251001-v1:0": (1.1, 5.5)}
LOCK = threading.Lock()


def first(*ps: Path) -> Path:
    return next(p for p in ps if p.exists())


def rows(n: int) -> list[tuple[str, dict]]:
    sft = first(MODELS / "data" / "sft", MAIN / "models" / "data" / "sft")
    out = []
    for role in ROLES:
        out += [(role, json.loads(l)) for l in list(open(sft / f"{role}.heldout.jsonl"))[:n]]
    return out


class Gen:
    def __init__(self):
        envfile.load_env()
        from openai import OpenAI
        self.az = OpenAI(base_url=os.environ["OPENAI_COMPATIBLE_BASE_URL"], api_key=os.environ["OPENAI_COMPATIBLE_API_KEY"])
        self.bkey = os.environ.get("BIFROST_SEED_BEDROCK_KEY")
        self.breg = os.environ.get("BIFROST_SEED_BEDROCK_REGION") or "eu-north-1"
        self.usage = collections.defaultdict(lambda: [0, 0])

    def chat(self, model: str, system: str, user: str) -> str:
        if model.startswith("azure/"):
            # reasoning deployment: default temperature only; budget leaves room for reasoning tokens
            r = self.az.chat.completions.create(model=model[6:], max_completion_tokens=4000,
                                                messages=[{"role": "system", "content": system}, {"role": "user", "content": user}])
            with LOCK:
                self.usage[model][0] += r.usage.prompt_tokens
                self.usage[model][1] += r.usage.completion_tokens
            return (r.choices[0].message.content or "").strip()
        mid = model[len("bedrock/"):]
        body = {"system": [{"text": system}], "messages": [{"role": "user", "content": [{"text": user}]}],
                "inferenceConfig": {"maxTokens": 600, "temperature": 0.3}}
        for i in range(6):
            req = urllib.request.Request(
                f"https://bedrock-runtime.{self.breg}.amazonaws.com/model/{urllib.parse.quote(mid, safe='')}/converse",
                data=json.dumps(body).encode(), headers={"Authorization": "Bearer " + self.bkey, "Content-Type": "application/json"})
            try:
                out = json.load(urllib.request.urlopen(req, timeout=240))
                break
            except (TimeoutError, urllib.error.URLError) as e:
                if isinstance(e, urllib.error.HTTPError) and e.code not in (429, 503, 500):
                    raise RuntimeError(f"bedrock {e.code}: {e.read()[:160]!r}") from None
                if i < 5:
                    time.sleep(2 * 2 ** i)
                    continue
                raise RuntimeError(f"bedrock: {e.__class__.__name__}") from None
        with LOCK:
            self.usage[model][0] += out["usage"]["inputTokens"]
            self.usage[model][1] += out["usage"]["outputTokens"]
        text = "".join(c.get("text", "") for c in out["output"]["message"]["content"])
        return re.sub(r"<think>.*?</think>", "", text, flags=re.S).strip()

    def judge(self, context: str, text: str) -> tuple[int, str]:
        out = self.az.chat.completions.create(model="gpt-6-sol", response_format={"type": "json_object"},
                                              messages=[{"role": "user", "content": JUDGE.format(context=context, text=text)}])
        with LOCK:
            self.usage["judge/gpt-6-sol"][0] += out.usage.prompt_tokens
            self.usage["judge/gpt-6-sol"][1] += out.usage.completion_tokens
        j = json.loads(out.choices[0].message.content)
        return max(-2, min(2, int(j["stance"]))), j.get("demand", "")


def system_for(arm: str, card: str, role: str) -> str:
    if arm == "card":
        return card
    return card + "\n\n" + (DOSSIERS / f"{role}.md").read_text()


def cmd_run(a):
    run = Path(a.run) if a.run else MODELS / "out" / "eval" / time.strftime("dossier-%Y%m%d-%H%M%S")
    run.mkdir(parents=True, exist_ok=True)
    cache_p = run / "cache.jsonl"
    cache = {}
    if cache_p.exists():
        for line in open(cache_p):
            x = json.loads(line)
            cache[x["key"]] = x
    items = rows(a.n)
    g = Gen()
    arms = [(m, p) for m in a.models.split(",") for p in a.prompts.split(",")]
    print(f"run {run.name}: {len(items)} rows x {len(arms)} arms; cached {len(cache)}", flush=True)
    fh = open(cache_p, "a")

    def put(x):
        with LOCK:
            cache[x["key"]] = x
            fh.write(json.dumps(x, ensure_ascii=False) + "\n")
            fh.flush()

    def ref(i, role, r):
        k = f"ref|{i}"
        if k not in cache:
            s, d = g.judge(r["messages"][1]["content"], r["messages"][2]["content"])
            put({"key": k, "i": i, "role": role, "stance": s, "demand": d})

    def one(i, role, r, model, prompt):
        k = f"{model}|{prompt}|{i}"
        if k in cache:
            return
        import pii_guard
        text = g.chat(model, system_for(prompt, r["messages"][0]["content"], role), r["messages"][1]["content"])
        with LOCK:  # spaCy pipeline is not shared across threads
            text = pii_guard.mask_many([text], n_process=1)[0][0]
        s, d = g.judge(r["messages"][1]["content"], text) if text else (0, "")
        put({"key": k, "i": i, "role": role, "model": model, "prompt": prompt, "text": text, "stance": s, "demand": d,
             "id": r["meta"]["stellungnahme_id"], "seg": r["meta"]["seg"]})

    errs = collections.Counter()
    with cf.ThreadPoolExecutor(a.workers) as ex:
        futs = [ex.submit(ref, i, role, r) for i, (role, r) in enumerate(items)]
        futs += [ex.submit(one, i, role, r, m, p) for m, p in arms for i, (role, r) in enumerate(items)]
        done = 0
        for f in cf.as_completed(futs):
            done += 1
            try:
                f.result()
            except Exception as e:  # noqa: BLE001
                errs[f"{e.__class__.__name__}: {str(e)[:90]}"] += 1
            if done % 100 == 0:
                print(f"  {done}/{len(futs)} errors={sum(errs.values())}", flush=True)
    fh.close()
    for e, c in errs.most_common(5):
        print(f"  error x{c}: {e}")
    cost = {m: round(i / 1e6 * PRICE.get(m.replace("judge/", "azure/"), (5, 20))[0]
                     + o / 1e6 * PRICE.get(m.replace("judge/", "azure/"), (5, 20))[1], 3) for m, (i, o) in g.usage.items()}
    usage_p = run / "usage.json"
    prev = json.loads(usage_p.read_text()) if usage_p.exists() else []
    prev.append({"at": time.strftime("%Y-%m-%d %H:%M"), "tokens": dict(g.usage), "usd_est": cost, "errors": dict(errs)})
    usage_p.write_text(json.dumps(prev, indent=1))
    print("cost estimate this invocation (USD):", cost, "total", round(sum(cost.values()), 2))
    print("written", run)


def score(run: Path):
    cache = {}
    for line in open(run / "cache.jsonl"):
        x = json.loads(line)
        cache[x["key"]] = x
    refs = {x["i"]: x["stance"] for k, x in cache.items() if k.startswith("ref|")}
    gens = [x for k, x in cache.items() if not k.startswith("ref|") and x["i"] in refs]
    sys.path.insert(0, str(HERE))
    from persona_score import Scorer
    scorer = Scorer(first(MODELS / "out" / "classifier" / "model", MAIN / "models" / "out" / "classifier" / "model"))
    probs = scorer.scores_many([x["text"] for x in gens])
    for x, p in zip(gens, probs):
        x["incharacter"] = p.get(x["role"])
    arms = collections.defaultdict(lambda: collections.defaultdict(list))
    for x in gens:
        arms[f"{x['model']}|{x['prompt']}"][x["role"]].append(x)
    rep = {}
    for arm, by in arms.items():
        rep[arm] = {}
        allx = [x for xs in by.values() for x in xs]
        for role, xs in [*sorted(by.items()), ("all", allx)]:
            ic = [x["incharacter"] for x in xs if x.get("incharacter") is not None]
            rep[arm][role] = {
                "n": len(xs),
                "incharacter": sum(ic) / len(ic) if ic else None,
                "exact": sum(x["stance"] == refs[x["i"]] for x in xs) / len(xs),
                "sign": sum(sign(x["stance"]) == sign(refs[x["i"]]) for x in xs) / len(xs),
                "within1": sum(abs(x["stance"] - refs[x["i"]]) <= 1 for x in xs) / len(xs),
                "median_chars": statistics.median(len(x["text"]) for x in xs),
            }
    return rep, len(refs)


SHORT = {"azure/gpt-6-sol": "gpt-6-sol", "bedrock/deepseek.v3.2": "deepseek-v3.2",
         "bedrock/qwen.qwen3-235b-a22b-2507-v1:0": "qwen3-235b", "bedrock/eu.anthropic.claude-haiku-4-5-20251001-v1:0": "haiku-4.5"}


def arm_key(arm: str) -> str:
    m, p = arm.split("|")
    return f"{'dossier' if p == 'dossier' else 'card'}-{SHORT.get(m, m.split('/')[-1])}"


def arm_label(arm: str) -> str:
    m, p = arm.split("|")
    return f"{'Kontext-Persona (Dossier)' if p == 'dossier' else 'Rollenkarte'}, {SHORT.get(m, m)}"


def cmd_report(a):
    run = Path(a.run)
    rep, nref = score(run)
    (run / "report.json").write_text(json.dumps(rep, indent=1))
    fid_p = MODELS / "out" / "persona_fidelity.json"
    fid = json.loads(fid_p.read_text())
    old = {k: v for k, v in fid.get("versions", {}).items() if not v.get("kind") == "context_persona"}
    f4 = lambda v: None if v is None else round(v, 4)  # noqa: E731
    new = {}
    for arm in sorted(rep, key=lambda x: (x.split("|")[1], x)):
        model = arm.split("|")[0]
        card = rep.get(f"{model}|card", {})

        def entry(role, arm=arm, card=card):
            d, c = rep[arm][role], card.get(role, rep[arm][role])
            return {"n": d["n"], "adapter": f4(d["incharacter"]), "baseline": f4(c["incharacter"]),
                    "stance_sign_adapter": f4(d["sign"]), "stance_sign_baseline": f4(c["sign"]),
                    "within1_adapter": f4(d["within1"]), "within1_baseline": f4(c["within1"])}
        new[arm_key(arm)] = {"version": arm_key(arm), "run": run.name, "label": arm_label(arm), "kind": "context_persona",
                             "model": model, "prompt": arm.split("|")[1],
                             "institutions": {r: entry(r) for r in ROLES if r in rep[arm]}, "all": entry("all")}
    fid["versions"] = {**old, **new}
    fid_p.write_text(json.dumps(fid, indent=1, ensure_ascii=False) + "\n")
    write_md(run, rep, old, nref)
    print(json.dumps({k: v["all"] for k, v in rep.items()}, indent=1))


def write_md(run: Path, rep: dict, old: dict, nref: int):
    usage = json.loads((run / "usage.json").read_text()) if (run / "usage.json").exists() else []
    usd = sum(sum(u["usd_est"].values()) for u in usage)
    cols = [("v1", "adapter v1", old.get("v1"), "adapter"), ("v1-fix", "adapter v1-fix", old.get("v1-fix"), "adapter"),
            ("base", "sv-base (Qwen3-8B + Rollenkarte)", old.get("v1"), "baseline")]
    cols = [c for c in cols if c[2]]
    arms = sorted(rep, key=lambda x: (x.split("|")[1], x))
    metric = {"incharacter": ("adapter", "baseline", "In-character (mean P(role | text), char-head classifier, chance 0.10)"),
              "sign": ("stance_sign_adapter", "stance_sign_baseline", "Stance sign agreement (same direction as the real paragraph)"),
              "within1": ("within1_adapter", "within1_baseline", "Stance within one step (-2..+2)")}
    f = lambda v: "n/a" if v is None else f"{v:.2f}"  # noqa: E731
    head = "| institution | " + " | ".join(c[0] for c in cols) + " | " + " | ".join(arm_key(x) for x in arms) + " | best |"
    sep = "|---|" + "---:|" * (len(cols) + len(arms) + 1)
    L = ["# Kontext-Persona (Dossier) vs role card vs persona adapters: held-out evaluation", "",
         f"Run `{run.name}` (`models/scripts/eval_dossier.py`), {nref} held-out rows (the first 30 per institution of "
         "`models/data/sft/<role>.heldout.jsonl`, statements dated 2023-01-01 or later; the same 244 rows as "
         "`eval_sagemaker.md` / `eval_v2.md`). Judge `gpt-6-sol` with the `eval_stance.py` prompt and default temperature; "
         "the reference paragraph is judged once per row and shared by all arms of this run. Same char-head in-character scorer.", "",
         "- **card-<model>**: system prompt = the institution's short role card, exactly what `sv-base` gets",
         "- **dossier-<model>**: system prompt = the same role card plus `packages/engine/config/dossiers/<role>.md` "
         "(dossier-v1, 1,000 to 2,600 tokens, built only from material dated before 2023-01-01)",
         "- user turn identical in every arm (draft title, date, provisions, section); Bedrock models at temperature 0.3 and "
         "600 max tokens like the adapter eval; gpt-6-sol is a reasoning deployment and only accepts its default temperature",
         "- **v1 / v1-fix / base**: copied from `persona_fidelity.json` (runs `v1-nofix` and `20261106-015512`, not re-run); "
         "their reference stances came from separate judge calls, so differences of a few points are within judge noise", ""]
    best_count = collections.Counter()
    for m, (ka, kb, title) in metric.items():
        L += [f"## {title}", "", head, sep]
        for role in [*ROLES, "all"]:
            vals = {}
            for name, _, v, side in cols:
                src = v["all"] if role == "all" else v["institutions"].get(role, {})
                vals[name] = src.get(ka if side == "adapter" else kb)
            for x in arms:
                vals[arm_key(x)] = rep[x].get(role, {}).get(m)
            ok = {k: v for k, v in vals.items() if v is not None}
            best = max(ok, key=ok.get) if ok else "n/a"
            if role != "all":
                best_count[(m, best)] += 1
            name = "**all (micro)**" if role == "all" else role
            L.append(f"| {name} | " + " | ".join(f(vals[c[0]]) for c in cols) + " | "
                     + " | ".join(f(vals[arm_key(x)]) for x in arms) + f" | {best} |")
        L.append("")
    L += ["## Median length (characters)", "", "| institution | " + " | ".join(arm_key(x) for x in arms) + " |",
          "|---|" + "---:|" * len(arms)]
    for role in [*ROLES, "all"]:
        L.append(f"| {role} | " + " | ".join(f"{rep[x].get(role, {}).get('median_chars', 0):.0f}" for x in arms) + " |")
    L.append("")
    L += ["## Wins per institution (best of all columns, 9 institutions)", ""]
    for m in metric:
        L.append(f"- {m}: " + ", ".join(f"{k} {c}" for (mm, k), c in best_count.most_common() if mm == m))
    L += ["", f"Cost of this run (list-price estimate, generation + judge): about {usd:.2f} USD.", ""]
    (MODELS / "out" / "eval_dossier.md").write_text("\n".join(L))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    sp = ap.add_subparsers(dest="cmd", required=True)
    r = sp.add_parser("run")
    r.add_argument("--models", default="azure/gpt-6-sol,bedrock/deepseek.v3.2,bedrock/qwen.qwen3-235b-a22b-2507-v1:0")
    r.add_argument("--prompts", default="card,dossier")
    r.add_argument("--n", type=int, default=30)
    r.add_argument("--run", default=None)
    r.add_argument("--workers", type=int, default=12)
    p = sp.add_parser("report")
    p.add_argument("--run", required=True)
    a = ap.parse_args()
    {"run": cmd_run, "report": cmd_report}[a.cmd](a)
