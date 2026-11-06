"""Persona dossiers: the institution's whole personality as in-context material (no fine-tuning).

One Markdown dossier per institution, written to packages/engine/config/dossiers/<role>.md, built ONLY
from training-split material (dated before splits.time_cutoff = 2023-01-01, the adapter eval cutoff):
  - engine agent profile (packages/engine/config/agents.json): goals, interests, restrictions, budget,
    priorities, red lines with tiers, temperament, register
  - masked Stellungnahmen paragraphs with judge-labelled stance (models/data/v2/sft/<role>.train.jsonl,
    falls back to models/data/sft without stance labels)
  - person-free press institution-voice positions (press/derived/press_stances.jsonl)
  - forecasting registry episodes decided before the cutoff (forecasting/data/episodes.jsonl)
Evidence lines are paraphrased by one LLM call per institution (gpt-6-sol on the team Foundry endpoint);
the dossier never quotes persons and carries source ids, not texts. Every dossier runs through
pii_guard: lines that hit are dropped, then the whole document is re-verified and the run aborts without
writing anything if a hit survives (CON-1/CON-2, fail closed).

Run (from the repo root or a worktree; data paths default to the main checkout):
  uv run --project models python -I models/scripts/build_dossiers.py [--roles a,b] [--no-llm]
"""
from __future__ import annotations

import argparse
import collections
import concurrent.futures as cf
import hashlib
import json
import math
import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
MODELS = HERE.parent
REPO = MODELS.parent
sys.path.insert(0, str(HERE))
from institutions import CFG, INST  # noqa: E402

CUTOFF = CFG["splits"]["time_cutoff"]
VERSION = "dossier-v1"
OUT = REPO / "packages" / "engine" / "config" / "dossiers"

# role -> engine agent id (packages/contracts/src/catalog.ts)
AGENT_OF = {
    "ministry_health": "gm", "social_insurance": "sv", "medical_chamber": "ak", "contract_physicians": "va",
    "hospitals": "ka", "nursing": "pf", "laender": "bl", "patients": "pv", "ministry_finance": "fm",
    "chamber_commerce": "wk", "chamber_labour": "abk", "industry_pharma": "ind",
}
LABEL = {"industry_pharma": "Pharmaindustrie"}

TOPICS = [
    ("finanzierung", "Finanzierung, Zielsteuerung, Kostentragung",
     r"Finanz|Zielsteuerung|15a|Budget|Kosten|Gebühr|Beitrag|Abgabe|Selbstbehalt|Haushalt|Bedeckung|FAG|Gesundheitsreformma"),
    ("sozialversicherung", "Sozialversicherung und Selbstverwaltung",
     r"ASVG|Sozialversicherung|GSVG|BSVG|B-KUVG|Selbstverwaltung|SV-OG|Organisationsreform|Krankenversicherung"),
    ("aerzte", "Ärztliche Versorgung, Kassenstellen, Ärztegesetz",
     r"Ärzte|ärztlich|Arzt|Kassenstell|Gesamtvertrag|Wahlarzt|Primärversorgung|PVE|niedergelassen"),
    ("pflege", "Pflege und Gesundheitsberufe",
     r"Pflege|GuKG|Krankenpflege|MTD|Hebamm|Sanitäter|Gesundheitsberuf|Psychotherap|Ausbildung|Kardiotechn|Zahnärzt"),
    ("krankenanstalten", "Krankenanstalten und Spitalsplanung",
     r"Krankenanstalt|KAKuG|KAG|Spital|Kranken- und Kuranstalten|LKF|Ambulanz"),
    ("digital", "Digitalisierung, ELGA, Daten",
     r"Telematik|ELGA|GTelG|e-?Health|E-Card|e-card|Register|Dokumentation|Daten|digital|Telemedizin"),
    ("arzneimittel", "Arzneimittel, Apotheken, Medizinprodukte",
     r"Arzneimittel|Medikament|Apothek|Rezept|Suchtmittel|Medizinprodukt|Heilmittel|Impfstoff"),
    ("public_health", "Öffentliche Gesundheit, Epidemie, Prävention",
     r"Epidemie|COVID|Covid|Corona|Impf|Tuberkulose|Gesundheitsförderung|Prävention|Tabak|Lebensmittel|Pandemie"),
    ("patientenrechte", "Patientenrechte, Qualität, Haftung",
     r"Patient|Qualität|Haftung|Entschädigung|Rechte|Beschwerde"),
]
PRESS_TOPIC = {"finanzierung": "finanzierung", "spitalsplanung": "krankenanstalten", "pflege": "pflege",
               "medikamente": "arzneimittel", "telemedizin": "digital", "primaerversorgung": "aerzte",
               "kassenstellen": "aerzte", "wahlarzt": "aerzte", "wartezeiten": "aerzte", "sonstiges": None}
PRESS_STANCE = {"support": 1.0, "oppose": -1.0, "conditional": 0.5, "neutral": 0.0}
OUTCOME_DE = {"implemented": "umgesetzt", "partially_implemented": "geändert umgesetzt", "lapsed": "nicht umgesetzt (verfallen)",
              "superseded": "durch anderen Entwurf ersetzt", "unknown": "Ausgang unklar"}
STOP = set("""der die das und in zu den von mit im für ist des dem nicht ein eine einer eines auf als auch es an werden
wird sich bei oder sind nach durch aus so dass daß zur zum wie sowie bzw diese dieser dieses ist sein kann können soll
sollte sollen nur noch wäre wären wurde wurden hat haben vom einem einen um über unter gegen vor bis mehr keine kein
z b abs § ff iSd idF lit gem gemäß""".split())


def recency(date: str) -> float:
    """Half-life of five years, measured back from the cutoff."""
    y = int(date[:4]) + (int(date[5:7]) - 1) / 12
    return 0.5 ** ((int(CUTOFF[:4]) - y) / 5)


def stance_word(x: float) -> str:
    if x <= -1.25:
        return "entschieden ablehnend"
    if x <= -0.4:
        return "überwiegend ablehnend, Änderungen gefordert"
    if x < 0.4:
        return "gemischt bzw. neutral-technisch"
    if x < 1.25:
        return "eher zustimmend mit Vorbehalten"
    return "klar zustimmend"


MATCH_ORDER = ["digital", "arzneimittel", "pflege", "krankenanstalten", "aerzte", "sozialversicherung",
               "public_health", "patientenrechte", "finanzierung"]  # specific before generic


def topic_of(text: str) -> str | None:
    rx = {k: r for k, _, r in TOPICS}
    for key in MATCH_ORDER:
        if re.search(rx[key], text):
            return key
    return None


def first_existing(*paths: Path) -> Path | None:
    return next((p for p in paths if p.exists()), None)


def load_statements(role: str, v2_dir: Path | None, sft_dir: Path) -> list[dict]:
    p = (v2_dir / "sft" / f"{role}.train.jsonl") if v2_dir else None
    rows = []
    src = p if p and p.exists() else sft_dir / f"{role}.train.jsonl"
    if not src.exists():
        return []
    for line in open(src):
        r = json.loads(line)
        m = r["meta"]
        if m.get("corpus", "stellungnahme") != "stellungnahme" or m["date"] >= CUTOFF:
            continue
        user = r["messages"][1]["content"]
        title = re.sub(r"^Ministerialentwurf:\s*", "", user.splitlines()[0])
        text = re.sub(r"^Haltung:[^.]*\.\s*", "", r["messages"][2]["content"])
        rows.append({"kind": "SN", "id": f"{m['stellungnahme_id']}#{m['seg']}", "sn": m["stellungnahme_id"],
                     "date": m["date"], "gp": m.get("gp"), "me_inr": m.get("me_inr"), "title": title,
                     "topic": topic_of(title) or topic_of(text), "stance": m.get("stance"), "text": text})
    return rows


def load_press(role: str, path: Path) -> list[dict]:
    out = []
    if not path.exists():
        return out
    for line in open(path):
        p = json.loads(line)
        if p["role"] != role or p["date"] >= CUTOFF:
            continue
        t = PRESS_TOPIC.get(p["topic"]) or topic_of(p["about"] + " " + p["stance_text_de"])
        out.append({"kind": "PR", "id": p["source_ref"]["source_id"], "date": p["date"], "title": p["about"],
                    "topic": t, "stance": PRESS_STANCE.get(p["stance"]), "text": p["stance_text_de"]})
    return out


def distinctive_terms(by_role: dict[str, list[str]], role: str, k: int = 14) -> list[str]:
    """Log-odds with an informative Dirichlet prior (role vs all other roles), unigrams and bigrams."""
    def grams(t):
        w = [x for x in re.findall(r"[A-Za-zÄÖÜäöüß][\wÄÖÜäöüß-]{2,}", t)]
        uni = [x for x in w if x.lower() not in STOP and not x.isupper()]
        bi = [f"{a} {b}" for a, b in zip(w, w[1:]) if a.lower() not in STOP and b.lower() not in STOP]
        return uni + bi
    own = collections.Counter(g for t in by_role.get(role, []) for g in grams(t))
    rest = collections.Counter(g for r, ts in by_role.items() if r != role for t in ts for g in grams(t))
    if not own:
        return []
    allc = own + rest
    n1, n2, n0 = sum(own.values()), sum(rest.values()), sum(allc.values())
    a0 = 1000.0
    scored = []
    for g, c in own.items():
        if c < 4:
            continue
        ag = a0 * allc[g] / n0
        d = math.log((c + ag) / (n1 + a0 - c - ag)) - math.log((rest[g] + ag) / (n2 + a0 - rest[g] - ag))
        var = 1 / (c + ag) + 1 / (rest[g] + ag)
        scored.append((d / math.sqrt(var), g))
    scored.sort(reverse=True)
    out, seen = [], set()
    for _, g in scored:
        low = g.lower()
        if any(low in s or s in low for s in seen):
            continue
        seen.add(low)
        out.append(g)
        if len(out) >= k:
            break
    return out


def pick_evidence(items: list[dict], per_topic: int = 4, max_topics: int = 6) -> dict[str, list[dict]]:
    by = collections.defaultdict(list)
    for x in items:
        if x["topic"] and len(x["text"]) >= 60:
            by[x["topic"]].append(x)
    weight = {t: sum(recency(x["date"]) for x in xs) for t, xs in by.items()}
    chosen = {}
    for t in sorted(weight, key=weight.get, reverse=True)[:max_topics]:
        xs = sorted(by[t], key=lambda x: (recency(x["date"]) * (1.2 if x["stance"] not in (None, 0) else 1.0)), reverse=True)
        sel, seen = [], set()
        for x in xs:
            key = x.get("sn") or x["id"]
            if key in seen:
                continue
            seen.add(key)
            sel.append(x)
            if len(sel) >= per_topic:
                break
        chosen[t] = sel
    return chosen


LLM_PROMPT = """Sie erstellen ein Dossier über die Institution "{label}" für eine transparente Verhandlungssimulation.
Unten stehen Belegzeilen aus Stellungnahmen und Pressepositionen dieser Institution (alle vor 2023), jeweils mit id.

Aufgaben (Antwort als JSON):
1. "items": für jede Belegzeile {{"id": <id>, "p": <Paraphrase>}}. Paraphrase: höchstens 22 Wörter, sinngemäß, in der
   dritten Person über die Institution ("fordert", "lehnt ab", "verlangt"), KEIN wörtliches Zitat, KEINE Personennamen,
   keine Funktionsbezeichnungen einzelner Personen. Den Gegenstand (Gesetz, Maßnahme) knapp nennen.
2. "arguments": 5 bis 6 typische Argumentationsmuster der Institution, je ein Satz (höchstens 20 Wörter), abgeleitet
   aus allen Belegen (z. B. "Verweist bei neuen Aufgaben stets auf fehlende Kostendeckung").
3. "register": zwei Sätze zum Sprachstil und Tonfall (Form, typische Wendungen paraphrasiert, Härte der Ablehnung).
4. "identity": zwei Sätze: wer die Institution ist und wessen Interessen sie vertritt.
Keine Personennamen, keine Zitate von Personen, keine Gedankenstriche (das lange Strichzeichen).

Belege:
{evidence}

Kennzeichnende Begriffe (Phrasenstatistik gegen andere Institutionen): {terms}
"""


def llm_enrich(role: str, label: str, chosen: dict[str, list[dict]], terms: list[str], extra: list[dict]) -> dict:
    import envfile
    from openai import OpenAI
    envfile.load_env()
    client = OpenAI(base_url=os.environ["OPENAI_COMPATIBLE_BASE_URL"], api_key=os.environ["OPENAI_COMPATIBLE_API_KEY"])
    lines = []
    for t, xs in chosen.items():
        for x in xs:
            lines.append(f"- id={x['id']} | {x['date']} | {x['title'][:120]} | {x['text'][:420]}")
    for x in extra:
        lines.append(f"- id={x['id']} | {x['date']} | {x['title'][:120]} | {x['text'][:300]}")
    msg = LLM_PROMPT.format(label=label, evidence="\n".join(lines), terms=", ".join(terms))
    cache = MODELS / "out" / "dossier_cache" / f"{role}-{hashlib.sha256(msg.encode()).hexdigest()[:16]}.json"
    if cache.exists():
        return json.loads(cache.read_text())
    r = client.chat.completions.create(model=os.environ.get("DOSSIER_MODEL", "gpt-6-sol"),
                                       response_format={"type": "json_object"},
                                       messages=[{"role": "user", "content": msg}])
    j = json.loads(r.choices[0].message.content)
    j["_usage"] = {"in": r.usage.prompt_tokens, "out": r.usage.completion_tokens}
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(j, ensure_ascii=False))
    return j


def nodash(s: str) -> str:
    return s.replace("—", ",").replace("–", "-").strip()


def build(role: str, ctx: dict, use_llm: bool) -> tuple[str, dict]:
    cfg = INST.get(role, {})
    agent = AGENT_OF.get(role)
    prof = ctx["agents"]["agents"].get(agent, {}) if agent else {}
    reds = [r for r in ctx["agents"]["redLines"] if r["agentId"] == agent]
    label = cfg.get("label") or LABEL.get(role, role)
    sn = load_statements(role, ctx["v2_dir"], ctx["sft_dir"])
    pr = load_press(role, ctx["press"])
    items = sn + pr
    chosen = pick_evidence(items)
    terms = ctx["terms"].get(role, [])
    # past reforms: episodes decided before the cutoff in which the institution submitted a statement
    by_me = collections.defaultdict(list)
    for x in sn:
        by_me[(x["gp"], x["me_inr"])].append(x)
    reforms = []
    for e in ctx["episodes"]:
        dd = e.get("decision_date") or e.get("knowable_date") or "9999"
        if dd >= CUTOFF or e["first_draft_date"] >= CUTOFF:
            continue
        xs = [x for c in e["members"] for x in by_me.get(tuple(_me_key(c)), [])]
        if not xs:
            continue
        st = [x["stance"] for x in xs if x["stance"] is not None]
        reforms.append({"title": e["title"], "date": e["first_draft_date"], "outcome": e["outcome"], "n": len(xs),
                        "stance": sum(st) / len(st) if st else None, "id": e["episode_id"], "ex": xs[0]})
    reforms.sort(key=lambda r: (recency(r["date"]) * math.log(1 + r["n"])), reverse=True)
    reforms = reforms[:5]
    enr = {}
    if use_llm and (chosen or reforms):
        enr = llm_enrich(role, label, chosen, terms, [r["ex"] for r in reforms])
    para = {str(i["id"]): nodash(i["p"]) for i in enr.get("items", []) if i.get("p")}

    def para_of(x):
        return para.get(x["id"]) or nodash(x["text"][:200])  # --no-llm fallback: shortened institution text

    md = [f"# Persona-Dossier: {label}", "",
          f"Version {VERSION}. Rolle `{role}`{f', Agent `{agent}`' if agent else ''}. Nur Material vor {CUTOFF} "
          f"(Trainingssplit): {len(sn)} Stellungnahme-Absätze, {len(pr)} Pressepositionen, "
          f"{len(reforms)} frühere Reformepisoden. Personenfrei; Belege sind Paraphrasen mit Quellenkennung.", ""]
    md += ["## Wer wir sind", ""]
    ident = nodash(enr.get("identity", "")) if enr.get("identity") else ""
    md.append(ident or nodash(cfg.get("role_card", label)))
    if prof:
        md.append(f"Einheit am Tisch: {prof['unit']}. Verhandlungsmacht: {prof['vetoStatus']} ({prof['vetoBasis']['de']}).")
    md.append("")
    if prof:
        md += ["## Ziele und Interessen", ""]
        for k, h in (("goals", "Ziele"), ("interests", "Interessen"), ("restrictions", "Restriktionen"), ("budget", "Budgetvorgaben")):
            if prof.get(k):
                md.append(f"- {h}: {'; '.join(x['de'] for x in prof[k])}")
        if prof.get("priorities"):
            md.append("- Prioritäten: " + ", ".join(f"{x['de']} {round(x['weight'] * 100)} %" for x in prof["priorities"]))
        md.append("")
    md += ["## Nicht verhandelbar", ""]
    if reds:
        tier = {"deep_core": "Kernüberzeugung (niemals aufgeben)", "policy_core": "Politischer Kern (nur gegen echten Ausgleich bewegen)",
                "secondary": "Sekundär (verhandelbar)"}
        for r in reds:
            md.append(f"- {r['de']} [{tier.get(r['tier'], r['tier'])}; Themen: {', '.join(r['topicKeys'])}]")
    else:
        md.append("- Keine formale rote Linie im Profil; die folgenden Haltungen gelten als feste Interessen.")
    md.append("")
    md += ["## Haltung nach Thema", "", "Skala -2 bis +2, Mittelwert nach Aktualität gewichtet (Halbwertszeit fünf Jahre vor dem Stichtag).", ""]
    tl = {k: lab for k, lab, _ in TOPICS}
    for t, xs in chosen.items():
        allx = [x for x in items if x["topic"] == t and x["stance"] is not None]
        w = sum(recency(x["date"]) for x in allx)
        mean = sum(recency(x["date"]) * x["stance"] for x in allx) / w if w else 0.0
        md.append(f"### {tl[t]}: {stance_word(mean)} ({mean:+.1f}, n={len(allx)})")
        for x in sorted(xs, key=lambda x: x["date"], reverse=True):
            md.append(f"- {x['date'][:7]}: {para_of(x)} [{x['kind']} {x['id']}]")
        md.append("")
    md += ["## Typische Argumente und Register", ""]
    for a in enr.get("arguments", [])[:6]:
        md.append(f"- {nodash(a)}")
    if enr.get("register"):
        md.append(f"- Register: {nodash(enr['register'])}")
    if prof.get("register"):
        md.append(f"- Profil-Register: {prof['register']}.")
    if prof.get("temperament"):
        c, a, k, r = prof["temperament"]
        md.append(f"- Temperament (0..1): Konzession {c}, Durchsetzung {a}, Koalitionsneigung {k}, Risiko {r}.")
    if terms:
        md.append(f"- Kennzeichnende Begriffe (Phrasenstatistik): {', '.join(terms)}.")
    md.append("")
    if reforms:
        md += ["## Verhalten in früheren Reformen", ""]
        for r in reforms:
            st = f"{stance_word(r['stance'])} ({r['stance']:+.1f})" if r["stance"] is not None else "Haltung nicht gelabelt"
            md.append(f"- {r['date'][:4]}, {r['title'][:110]}: {st}, {r['n']} Absätze; Ausgang {OUTCOME_DE.get(r['outcome'], r['outcome'])}. "
                      f"Kern: {para_of(r['ex'])} [{r['id']}]")
        md.append("")
    md += ["## Verwendung", "",
           "Hintergrund für die Rolle: Die Institution tritt mit \"wir\" auf, nie als Person.",
           "Das Dossier beschreibt Haltungen bis Ende 2022; neue Belege im Gespräch haben Vorrang.",
           "Den Wortlaut des Dossiers nicht zitieren und keine Quellenkennungen im gesprochenen Text nennen.", ""]
    text = "\n".join(md)
    meta = {"role": role, "agent": agent, "n_sn": len(sn), "n_press": len(pr), "n_reforms": len(reforms),
            "topics": list(chosen), "usage": enr.get("_usage")}
    return text, meta


def _me_key(case_id: str):
    m = re.match(r"([XVI]+)-ME-(\d+)", case_id)
    return (m.group(1), int(m.group(2))) if m else (None, None)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--roles", default="auto")
    ap.add_argument("--main", default=os.environ.get("SV_MAIN_CHECKOUT", "/home/aryt3/Hacking/Hackathons/SV/sv-ki-challenge"),
                    help="checkout that holds data/, press/derived/, models/data/ (gitignored derivatives)")
    ap.add_argument("--v2-dir", default=None, help="models/data/v2 with judge-labelled stances")
    ap.add_argument("--no-llm", action="store_true")
    ap.add_argument("--workers", type=int, default=6)
    a = ap.parse_args()
    main_co = Path(a.main)
    cand = [Path(a.v2_dir)] if a.v2_dir else [MODELS / "data" / "v2", main_co / "models" / "data" / "v2",
                                               *sorted((main_co / ".claude" / "worktrees").glob("*/models/data/v2"))]
    v2 = next((p for p in cand if (p / "sft").exists()), None)
    ctx = {
        "agents": json.loads((REPO / "packages" / "engine" / "config" / "agents.json").read_text()),
        "v2_dir": v2,
        "sft_dir": first_existing(MODELS / "data" / "sft", main_co / "models" / "data" / "sft"),
        "press": first_existing(REPO / "press" / "derived" / "press_stances.jsonl", main_co / "press" / "derived" / "press_stances.jsonl") or Path("/nonexistent"),
        "episodes": [json.loads(l) for l in open(first_existing(REPO / "forecasting" / "data" / "episodes.jsonl", main_co / "forecasting" / "data" / "episodes.jsonl"))],
    }
    print(f"sources: v2={'yes' if v2 else 'no'} sft={ctx['sft_dir'] is not None} press={ctx['press'].exists()} episodes={len(ctx['episodes'])}")
    roles = list(AGENT_OF) if a.roles == "auto" else a.roles.split(",")
    by_role = {r: [x["text"] for x in load_statements(r, v2, ctx["sft_dir"])] + [x["text"] for x in load_press(r, ctx["press"])] for r in AGENT_OF}
    roles = [r for r in roles if len(by_role.get(r, [])) >= 20]
    ctx["terms"] = {r: distinctive_terms(by_role, r) for r in roles}
    import pii_guard
    results = {}
    with cf.ThreadPoolExecutor(a.workers) as ex:
        futs = {ex.submit(build, r, ctx, not a.no_llm): r for r in roles}
        for f in cf.as_completed(futs):
            results[futs[f]] = f.result()
    # CON-1/CON-2: drop lines that hit, then verify every document; abort without writing on any survivor
    dropped = 0
    for r, (text, meta) in results.items():
        lines = text.split("\n")
        bad = {i for i, _, _ in pii_guard.verify(lines)}
        dropped += len(bad)
        results[r] = ("\n".join(x for i, x in enumerate(lines) if i not in bad), {**meta, "dropped_lines": len(bad)})
    pii_guard.fail_closed([t for t, _ in results.values()], "dossiers")
    if any("—" in t for t, _ in results.values()):
        raise SystemExit("em dash in a dossier; nothing written")
    OUT.mkdir(parents=True, exist_ok=True)
    index = {"version": VERSION, "cutoff": CUTOFF, "dossiers": {}}
    for r, (text, meta) in sorted(results.items()):
        (OUT / f"{r}.md").write_text(text)
        index["dossiers"][r] = {**{k: v for k, v in meta.items() if k != "usage"}, "chars": len(text),
                                "tokens_est": round(len(text) / 3.6), "sha256": hashlib.sha256(text.encode()).hexdigest()[:16]}
        print(f"{r:20s} {len(text):6d} chars ~{round(len(text) / 3.6):5d} tok  sn={meta['n_sn']} press={meta['n_press']} "
              f"reforms={meta['n_reforms']} dropped={meta['dropped_lines']} usage={meta.get('usage')}")
    (OUT / "index.json").write_text(json.dumps(index, indent=1, ensure_ascii=False) + "\n")
    print(f"written {len(results)} dossiers to {OUT} (guard dropped {dropped} lines)")


if __name__ == "__main__":
    main()
