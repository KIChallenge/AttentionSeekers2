"""Build the proposal registry: in-scope MEs, linked bills, record outcomes.

  python -m svforecast.registry link     # scope + ME->bill links (fetches bill details as needed)
  python -m svforecast.registry texts    # fetch ME and final law texts, compute similarity
  python -m svforecast.registry build    # labels, episodes -> data/registry.jsonl + .csv

Everything reads through the cache; network only for items not cached yet.
"""

from __future__ import annotations

import csv
import datetime as dt
import html
import json
import re
import sys
from pathlib import Path

from . import http
from .govtable import government_at, proposer_group
from .scope import scope_reasons

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
WORK = ROOT / "cache" / "work"
START = "2008-01-01"
CUTOFF = "2026-11-05"
HORIZON_DAYS = 730
SIM_THRESHOLD = 0.75
GPS = ["XXIII", "XXIV", "XXV", "XXVI", "XXVII", "XXVIII"]
BILL_DOKTYP = ["RV", "A", "BUA", "GABR", "GABR13", "BRA", "RVS", "RVS15"]
GP_ORDER = {g: i for i, g in enumerate(["XX", "XXI", "XXII"] + GPS)}

# Manual links that the record supports but the data does not encode (documented in README).
# PrimVG 2017: ME 312/ME XXV went to parliament as Initiativantrag 2255/A XXV, not as an RV;
# the RIS consolidated PrimVG title carries "NR: GP XXV IA 2255/A AB 1714" (data-sources.md 2, 8).
MANUAL_LINKS = {("XXV", 312): [("XXV", "A", "2255", "ris_brkons_citation")]}


def iso(d: str | None) -> str | None:
    if not d:
        return None
    if re.match(r"\d{4}-\d{2}-\d{2}", d):
        return d[:10]
    m = re.match(r"(\d{2})\.(\d{2})\.(\d{4})", d)
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else None


def add_days(d: str, n: int) -> str:
    return (dt.date.fromisoformat(d) + dt.timedelta(days=n)).isoformat()


def strip_tags(s: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", " ", s or "")).strip()


def bubbles(c: dict, key: str) -> list[str]:
    try:
        return [b["label"] for b in c[key]["data"]["bubbles"]]
    except (KeyError, TypeError):
        return []


# ---------------------------------------------------------------- lists

def me_rows():
    d = http.parl_list(81, {})
    return [r for r in d["rows"] if (r[10] or "") >= START]


def bill_index():
    """(GP, ITYP, INR) -> list 101 row, for bills and Ausschussberichte."""
    idx = {}
    for gp in ["XXII"] + GPS:
        for body in ({"GP_CODE": [gp], "DOKTYP": BILL_DOKTYP}, {"GP_CODE": [gp], "DOKTYP": ["AUB"]}):
            for r in http.parl_list(101, body)["rows"]:
                idx[(r[0], r[1], str(r[2]))] = r
    return idx


# ---------------------------------------------------------------- bill details

def bill_record(gp: str, ityp: str, inr: str, idx: dict, depth: int = 0) -> dict:
    d = http.parl_item(gp, ityp, inr)
    row = idx.get((gp, ityp, str(inr)))
    rec = {"gp": gp, "ityp": ityp, "inr": str(inr), "url": f"{http.PARL}/gegenstand/{gp}/{ityp}/{inr}"}
    if d is None:
        rec["missing"] = True
        return rec
    c = d["content"]
    rec["doktyp"] = c.get("doktyp")
    rec["title"] = c.get("title")
    rec["einlangen"] = iso(c.get("einlangen"))
    st = c.get("status") or {}
    rec["status"] = st.get("number")
    bg = [b["title"] for b in st.get("bgbllinks") or [] if b.get("title", "").startswith("Bundesgesetzblatt")]
    rec["bgbl"] = [re.sub(r"^Bundesgesetzblatt\s+", "BGBl. ", t) for t in bg]
    third, br, rejected, withdrawn = None, None, None, None
    stage_list = [(ph.get("name", ""), s) for ph in c.get("phase") or [] for s in ph.get("stages") or []]
    stage_list += [("", s) for s in c.get("stages") or []]
    for phname, s in stage_list:
        t = strip_tags(s.get("text", ""))
        if "dritter Lesung angenommen" in re.sub(r"\s+", " ", t):
            third = third or iso(s.get("date"))
        if "Beschluss im Bundesrat" in t or "keinen Einspruch zu erheben, angenommen" in re.sub(r"\s+", " ", t):
            br = br or iso(s.get("date"))
        if re.search(r"Gesetzesvorschlag in (zweiter|dritter) Lesung\s+abgelehnt", re.sub(r"\s+", " ", t)):
            rejected = rejected or iso(s.get("date"))
        if re.search(r"(Regierungsvorlage|Antrag|Gesetzesvorschlag) (wurde )?zurückgezogen|Zurückziehung der Regierungsvorlage", t):
            withdrawn = withdrawn or iso(s.get("date"))
    rec.update(third_reading=third, br_date=br, rejected_date=rejected, withdrawn_date=withdrawn)
    if row:
        rec["list_status"] = row[10]
        rec["vote_text"] = row[34]
        rec["themen"] = row[22]
    vote = c.get("vote") or {}
    if vote.get("text") and not rec.get("vote_text"):
        rec["vote_text"] = vote["text"]
    docs = {}
    for g in (c.get("documents") or []) + ((c.get("statements") or {}).get("documents") or []):
        for doc in g.get("documents") or []:
            docs.setdefault(g["title"].strip(), []).append(doc["link"])
    rec["docs"] = docs
    rec["preconst"] = [(p["gp_code"], p["ityp"], str(p["inr"])) for p in c.get("preconst") or []]
    if rec["doktyp"] == "AUB":
        hg = [r_ for r_ in c.get("reference") or [] if r_.get("art") == "HG"]
        m = re.match(r"/gegenstand/([A-Z]+)/([A-Z]+)/(\d+)", hg[0]["url"]) if hg else None
        if m and depth == 0:
            main = bill_record(m.group(1), m.group(2), m.group(3), idx, depth=1)
            main["via_report"] = f"{gp} {ityp} {inr}"
            main["report_docs"] = docs
            return main
        # committee's own motion without a main item: the AUB itself carries the law
        if third and br:
            rec["status"] = 5
    return rec


# ---------------------------------------------------------------- linking

STOP = {"änderung", "bundesgesetz", "u.a.", "u", "a", "und", "das", "der", "die", "des", "mit", "dem",
        "geändert", "wird", "werden", "gesetz", "novelle", "über", "zur", "für", "sowie", "änderungen", "bgbl", "i", "nr"}


def tokens(s: str) -> set[str]:
    s = re.sub(r"[–\-,;:()\"„“]", " ", (s or "").lower())
    return {t for t in s.split() if t not in STOP and not re.fullmatch(r"\d+|\d+/\d+", t) and len(t) > 2}


def jaccard(a: set, b: set) -> float:
    return len(a & b) / len(a | b) if a and b else 0.0


def gov_parties_short(date_iso: str) -> set[str]:
    m = {"SPÖ": "SPÖ", "ÖVP": "ÖVP", "FPÖ": "FPÖ", "Grüne": "GRÜNE", "NEOS": "NEOS"}
    return {m[p] for p in government_at(date_iso).parties}


def link_me(r, c, idx) -> list[dict]:
    gp, inr = r[0], r[2]
    links = []
    for gp2, it, n, how in MANUAL_LINKS.get((gp, inr), []):
        links.append({"gp": gp2, "ityp": it, "inr": n, "method": how})
    for s in c.get("stages") or []:
        for m in re.finditer(r"/gegenstand/([A-Z]+)/(I|A)/(\d+)", s.get("text", "")):
            key = (m.group(1), m.group(2), m.group(3))
            if not any((l["gp"], l["ityp"], l["inr"]) == key for l in links):
                links.append({"gp": key[0], "ityp": key[1], "inr": key[2], "method": "me_stage_link"})
    return links


def title_match(r, idx, reverse_pre: dict) -> dict | None:
    """Fallback for MEs without an identifier link. Candidates: RV, government-party A,
    and AUB items first tabled within the horizon, title-token Jaccard >= 0.5."""
    me_date = iso(r[3])
    end = add_days(me_date, HORIZON_DAYS)
    tk = tokens(r[4])
    best = None
    for key, row in idx.items():
        dk = row[11]
        if dk not in ("RV", "A", "AUB"):
            continue
        d = iso(row[4])
        if not d or not (me_date <= d <= end):
            continue
        if dk == "RV" and reverse_pre.get(key):  # RV already claimed by another ME's identifier link
            continue
        if dk == "A":
            try:
                fr = set(json.loads(row[21] or "[]"))
            except json.JSONDecodeError:
                fr = set()
            if not fr or not fr <= gov_parties_short(d):
                continue
        y1, y2 = set(re.findall(r"\b20\d\d\b", r[4])), set(re.findall(r"\b20\d\d\b", row[6] or ""))
        if y1 and y2 and not (y1 & y2):  # "SVAeG 2011" is not "SVAeG 2012"
            continue
        j = jaccard(tk, tokens(row[6]))
        if j >= 0.5 and (best is None or j > best[0] or (j == best[0] and d < best[2])):
            best = (j, key, d)
    if best:
        return {"gp": best[1][0], "ityp": best[1][1], "inr": best[1][2], "method": "title_match", "jaccard": round(best[0], 3)}
    return None


def link():
    idx = bill_index()
    rows = me_rows()
    out = []
    for r in rows:
        d = http.parl_item(r[0], "ME", r[2])
        c = d["content"] if d else {}
        topics = bubbles(c, "topics")
        reasons = scope_reasons(r[4], c.get("description", ""), topics, r[6])
        if not reasons:
            continue
        out.append({"r": r, "c_desc": c.get("description", ""), "topics": topics,
                    "headwords": bubbles(c, "headwords"), "eurovoc": bubbles(c, "eurovoc"),
                    "scope": reasons, "links": link_me(r, c, idx),
                    "me_docs": {g["title"].strip(): [x["link"] for x in g["documents"]] for g in c.get("documents") or []},
                    "stages": [strip_tags(s.get("text", "")) for s in c.get("stages") or []]})
    # reverse map of identifier-linked bills
    claimed = {}
    for o in out:
        for l in o["links"]:
            claimed.setdefault((l["gp"], l["ityp"], l["inr"]), []).append((o["r"][0], o["r"][2]))
    for o in out:
        if not o["links"]:
            tm = title_match(o["r"], idx, claimed)
            if tm:
                o["links"].append(tm)
    # fetch bill details for every link (cached)
    bills = {}
    for o in out:
        for l in o["links"]:
            k = (l["gp"], l["ityp"], l["inr"])
            if k not in bills:
                bills[k] = bill_record(*k, idx)
    WORK.mkdir(parents=True, exist_ok=True)
    (WORK / "linked.json").write_text(json.dumps(
        {"mes": out, "bills": {"|".join(k): v for k, v in bills.items()}}, ensure_ascii=False, indent=1))
    print("in scope:", len(out), "with identifier link:", sum(any(l["method"] != "title_match" for l in o["links"]) for o in out),
          "title-only:", sum(all(l["method"] == "title_match" for l in o["links"]) and bool(o["links"]) for o in out),
          "bills:", len(bills))


# ---------------------------------------------------------------- texts

def html_lines(raw: str | None) -> list[str]:
    if not raw:
        return []
    raw = re.sub(r"(?is)<(script|style|head)[^>]*>.*?</\1>", " ", raw)
    raw = re.sub(r"(?i)<br\s*/?>|</(p|div|li|tr|h\d|td|table)>", "\n", raw)
    txt = html.unescape(re.sub(r"<[^>]+>", " ", raw))
    lines = []
    for ln in txt.split("\n"):
        ln = re.sub(r"\s+", " ", ln).strip().lower()
        if ln:
            lines.append(ln)
    return lines


def body_words(lines: list[str]) -> list[str]:
    """Words of the law text after the enacting formula; drops cover-page boilerplate
    ("Entwurf" vs "1349 der Beilagen ... Regierungsvorlage")."""
    start = 0
    for i, ln in enumerate(lines):
        if "hat beschlossen" in ln:
            start = i + 1
            break
    return re.findall(r"[\wäöüß§]+", " ".join(lines[start:]))


def shingle_dice(a_lines: list[str], b_lines: list[str], n: int = 5) -> float | None:
    """Deviation 2: share of the draft's word 5-grams that survive in the final text, |A and B| / |A|."""
    a, b = body_words(a_lines), body_words(b_lines)
    A = {tuple(a[i:i + n]) for i in range(len(a) - n + 1)}
    B = {tuple(b[i:i + n]) for i in range(len(b) - n + 1)}
    if not A or not B:
        return None
    return len(A & B) / len(A)


def html_link(links: list[str]) -> str | None:
    for l in links or []:
        if l.endswith(".html"):
            return l
    return None


def final_text_link(bill: dict) -> tuple[str | None, str]:
    docs = bill.get("docs") or {}
    rdocs = bill.get("report_docs") or {}
    for src, key in (("bill", "Geändert im Plenum"), ("bill", "Geändert im Ausschuss"), ("report", "Gesetzestext"),
                     ("bill", "Gesetzestext"), ("bill", "Antragstext"), ("bill", "Antrag"),
                     ("bill", "Initiativantrag (elektr. übermittelte Version)")):
        l = html_link((docs if src == "bill" else rdocs).get(key))
        if l:
            return l, key if src == "bill" else "Ausschussbericht Gesetzestext"
    return None, "none"


def is_passed(b: dict) -> bool:
    return b.get("status") == 5 or bool(b.get("third_reading") and b.get("br_date") and not b.get("rejected_date"))


def texts():
    L = json.loads((WORK / "linked.json").read_text())
    bills = L["bills"]
    sims = {}
    for o in L["mes"]:
        r = o["r"]
        me_link = html_link(o["me_docs"].get("Gesetzestext") or o["me_docs"].get("Entwurf"))
        enacted_links = [l for l in o["links"] if is_passed(bills["|".join((l["gp"], l["ityp"], l["inr"]))])]
        if not enacted_links or not me_link:
            continue
        b = bills["|".join((enacted_links[0]["gp"], enacted_links[0]["ityp"], enacted_links[0]["inr"]))]
        fl, which = final_text_link(b)
        if not fl:
            sims[f"{r[0]}|{r[2]}"] = {"similarity": None, "final_doc": which, "me_doc": me_link}
            continue
        a = html_lines(http.parl_doc(me_link))
        f = html_lines(http.parl_doc(fl))
        sim = shingle_dice(a, f) if a and f else None
        sims[f"{r[0]}|{r[2]}"] = {"similarity": None if sim is None else round(sim, 4), "final_doc": which,
                                  "me_doc": me_link, "final_link": fl, "me_lines": len(a), "final_lines": len(f)}
        print(r[0], r[2], which, sims[f"{r[0]}|{r[2]}"]["similarity"], flush=True)
    (WORK / "similarity.json").write_text(json.dumps(sims, indent=1))




# ---------------------------------------------------------------- measure class (keyword rule v1)

MEASURE_RULES = [
    ("digitalisation", r"telematik|elga|e-card|e-health|digital|eeltern|e-rezept|e-impfpass"),
    ("structural_reform", r"organisation|zielsteuerung|gesundheitsreform|primärversorgung|grug|sv-og|kakug|krankenanstalten|struktur"),
    ("workforce", r"ärztegesetz|ärzte|gukg|krankenpflege|pflegeassistenz|mtd|berufs|ausbildung|hebamme|psycholog|psychotherap|sanitäter|zahnärzt|kammer|\bota\b|kardiotechnik|musiktherap"),
    ("prevention_program", r"impf|tabak|nichtraucher|sucht|epidemie|covid|tuberkulose|prävention|screening|alkohol"),
    ("drug_reimbursement", r"arznei|apothek|rezept|heilmittel|medizinprodukt|blut|gewebe|transplant|gentechnik"),
    ("financing_rule", r"finanzierung|fonds|zweckzuschuss|finanzausgleich|kostenersatz|beitrag|budget"),
    ("monitoring_reporting", r"dokumentation|dokug|register|statistik|qualität"),
    ("access_rule", r"patient|wartezeit|zugang"),
    ("structural_reform", r"sozialversicherung|asvg|gsvg|bsvg|b-kuvg"),
]


def measure_class(title: str) -> str:
    t = (title or "").lower()
    for cls, rx in MEASURE_RULES:
        if re.search(rx, t):
            return cls
    return "other"


# ---------------------------------------------------------------- labels

# Schema enum -> PRD FR-J1a label. FR-J1a's "target_outcome" is a separate label family
# (Zielsteuerung / Rechnungshof targets) that this registry does not produce; "unknown" (censored)
# has no FR-J1a value and maps to None.
FR_J1A_MAP = {
    "implemented": "implemented",
    "partially_implemented": "implemented_modified",
    "rejected": "not_implemented",
    "lapsed": "not_implemented",
    "superseded": "not_implemented",
    "unknown": None,
}


class UF:
    def __init__(self):
        self.p = {}

    def find(self, x):
        self.p.setdefault(x, x)
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def union(self, a, b):
        self.p[self.find(a)] = self.find(b)


def build():
    L = json.loads((WORK / "linked.json").read_text())
    bills = L["bills"]
    sims = json.loads((WORK / "similarity.json").read_text()) if (WORK / "similarity.json").exists() else {}
    vf = json.loads((WORK / "vfgh.json").read_text()) if (WORK / "vfgh.json").exists() else []
    knowable_cut = add_days(CUTOFF, -HORIZON_DAYS)
    recs = []
    for o in L["mes"]:
        r = o["r"]
        gp, inr = r[0], r[2]
        d0 = iso(r[3])
        g = government_at(d0)
        horizon_end = add_days(d0, HORIZON_DAYS)
        rec = {
            "case_id": f"{gp}-ME-{inr}", "me_citation": f"{inr}/ME {gp}. GP", "gp": gp, "me_inr": inr,
            "title": r[4], "first_draft_date": d0, "begutachtung_end": iso(r[8]),
            "ressort": r[6], "ressort_name": r[16], "proposer_group": proposer_group(r[6]),
            "government_id": g.gov_id, "coalition": g.coalition, "coalition_parties": list(g.parties),
            "legislative_period": gp, "n_stellungnahmen": r[13], "themen": o["topics"],
            "schlagworte": o["headwords"], "scope_reasons": o["scope"], "measure_class": measure_class(r[4]),
            "measure_class_method": "keyword_rule_v1", "me_url": f"{http.PARL}/gegenstand/{gp}/ME/{inr}",
            "links": [], "needs_human": [],
        }
        enacted_in_h, enacted_late, rejected = [], [], []
        for l in o["links"]:
            b = bills["|".join((l["gp"], l["ityp"], l["inr"]))]
            docs = b.get("docs") or {}
            lk = {"bill": f"{l['gp']} {l['ityp']} {l['inr']}", "doktyp": b.get("doktyp"), "method": l["method"],
                  "jaccard": l.get("jaccard"), "title": b.get("title"), "status": b.get("status"),
                  "einlangen": b.get("einlangen"), "third_reading": b.get("third_reading"), "br_date": b.get("br_date"),
                  "bgbl": b.get("bgbl"), "vote_text": b.get("vote_text"), "via_report": b.get("via_report"),
                  "changed_in_committee": "Geändert im Ausschuss" in docs, "changed_in_plenum": "Geändert im Plenum" in docs,
                  "url": b["url"]}
            rec["links"].append(lk)
            if l["method"] == "title_match":
                rec["needs_human"].append("link_by_title_only")
            passed = b.get("status") == 5 or (b.get("third_reading") and b.get("br_date") and not b.get("rejected_date"))
            if passed and not b.get("bgbl"):
                rec["needs_human"].append("enacted_but_no_bgbl_link_in_parlament_data")
            dd = b.get("third_reading") or b.get("br_date")
            if passed and dd and dd <= horizon_end:
                enacted_in_h.append((dd, lk, b))
            elif passed:
                enacted_late.append((dd, lk, b))
            elif b.get("status") != 5 and (b.get("rejected_date") or b.get("withdrawn_date")):
                rejected.append((b.get("rejected_date") or b.get("withdrawn_date"), lk, b))
        sim = sims.get(f"{gp}|{inr}", {})
        rec["text_similarity"] = sim.get("similarity")
        rec["text_final_doc"] = sim.get("final_doc")
        rec["vfgh_repeals"] = []
        if enacted_in_h:
            enacted_in_h.sort(key=lambda x: x[0])
            dd, lk, b = enacted_in_h[0]
            nums = {re.sub(r"BGBl\. I Nr\.\s*", "", x) for e in enacted_in_h for x in (e[1]["bgbl"] or [])}
            for k in vf:
                if k["date"] <= horizon_end and nums & set(k["cited_bgbl_I"]):
                    rec["vfgh_repeals"].append({"kundmachung": k["bgbl"], "date": k["date"], "title": k["title"]})
            rec["decision_date"] = dd
            rec["outcome_record"] = {"source": "parlament_gesetzgebungsverfahren",
                                     "identifier": f"GP {lk['bill'].split()[0]} {lk['doktyp'] or lk['bill'].split()[1]} {lk['bill'].split()[2]}; {', '.join(lk['bgbl'] or []) or 'BGBl not linked in Parlament data'}",
                                     "url": lk["url"]}
            if rec["vfgh_repeals"]:
                label, basis = "partially_implemented", "vfgh_repeal_within_horizon"
            elif rec["text_similarity"] is None:
                label, basis = "implemented", "no_text"
                rec["needs_human"].append("modification_not_measurable_no_text")
            elif rec["text_similarity"] < SIM_THRESHOLD:
                label, basis = "partially_implemented", "text_similarity_below_0.75"
            else:
                label, basis = "implemented", "text_similarity_at_least_0.75"
        elif rejected:
            label, basis = "rejected", "bill_rejected_or_withdrawn"
            rec["decision_date"] = rejected[0][0]
            rec["outcome_record"] = {"source": "parlament_gesetzgebungsverfahren", "identifier": rejected[0][1]["bill"], "url": rejected[0][1]["url"]}
        else:
            label, basis = "lapsed", "no_enactment_within_730_days"
            rec["decision_date"] = horizon_end
            if enacted_late:
                rec["enacted_late"] = True
                basis = "enacted_after_horizon"
            rec["outcome_record"] = {"source": "parlament_gesetzgebungsverfahren",
                                     "identifier": rec["links"][0]["bill"] if rec["links"] else f"{inr}/ME {gp}. GP (no bill)",
                                     "url": rec["links"][0]["url"] if rec["links"] else rec["me_url"]}
        rec["outcome"], rec["label_basis"] = label, basis
        rec["censored"] = d0 > knowable_cut
        rec["knowable_date"] = horizon_end
        recs.append(rec)

    # superseded: not enacted, later same-group ME within H with similar title was enacted
    for rec in recs:
        if rec["outcome"] != "lapsed" or rec.get("enacted_late"):
            continue
        tk = tokens(rec["title"])
        for other in recs:
            if (other["proposer_group"] == rec["proposer_group"] and rec["first_draft_date"] < other["first_draft_date"] <= rec["knowable_date"]
                    and other["outcome"] in ("implemented", "partially_implemented") and jaccard(tk, tokens(other["title"])) >= 0.5):
                rec["outcome"], rec["label_basis"] = "superseded", f"superseded_by_{other['case_id']}"
                rec["superseded_by"] = other["case_id"]
                break
    for rec in recs:
        if rec["outcome"] == "lapsed" and not rec["links"]:
            rec["needs_human"].append("unlinked_check_absorbed_into_other_law")
        if rec["censored"]:
            rec["outcome_final"] = rec["outcome"]
            rec["outcome"] = "unknown"
            rec["label_basis"] = "censored_draft_after_" + knowable_cut

    for rec in recs:
        rec["fr_j1a_label"] = FR_J1A_MAP[rec["outcome"]]

    # episodes: MEs sharing a linked bill or a BGBl number
    uf = UF()
    for rec in recs:
        uf.find(rec["case_id"])
        for lk in rec["links"]:
            uf.union(rec["case_id"], "BILL " + lk["bill"])
            for b in lk["bgbl"] or []:
                uf.union(rec["case_id"], "BGBL " + b)
    groups = {}
    for rec in recs:
        groups.setdefault(uf.find(rec["case_id"]), []).append(rec)
    episodes = []
    rank = {"partially_implemented": 4, "implemented": 3, "rejected": 2, "superseded": 1, "lapsed": 0, "unknown": -1}
    for members in groups.values():
        members.sort(key=lambda x: (x["first_draft_date"], x["me_inr"]))
        lead = members[0]
        eid = "EP-" + lead["case_id"]
        for m in members:
            m["episode_id"] = eid
        labels = [m["outcome"] for m in members]
        ep_label = "unknown" if lead["censored"] else max(labels, key=lambda x: rank[x])
        episodes.append({
            "episode_id": eid, "members": [m["case_id"] for m in members], "lead_case": lead["case_id"],
            "title": lead["title"], "first_draft_date": lead["first_draft_date"], "gp": lead["gp"],
            "proposer_group": lead["proposer_group"], "ressort": lead["ressort"], "coalition": lead["coalition"],
            "government_id": lead["government_id"], "n_stellungnahmen": sum(m["n_stellungnahmen"] or 0 for m in members),
            "measure_class": lead["measure_class"], "outcome": ep_label, "fr_j1a_label": FR_J1A_MAP[ep_label], "censored": lead["censored"],
            "knowable_date": add_days(lead["first_draft_date"], HORIZON_DAYS),
            "needs_human": sorted({n for m in members for n in m["needs_human"]}),
            "title_link_only": any(m["links"] for m in members) and all(
                l["method"] == "title_match" for m in members for l in m["links"]),
            "three_class_ok": not any(m["label_basis"] == "no_text" for m in members),
            "vote_text": next((lk["vote_text"] for m in members for lk in m["links"] if lk.get("vote_text")), None),
            "text_similarity": lead["text_similarity"],
        })
    DATA.mkdir(exist_ok=True)
    with open(DATA / "registry.jsonl", "w") as f:
        for rec in sorted(recs, key=lambda x: (x["first_draft_date"], x["me_inr"])):
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    with open(DATA / "episodes.jsonl", "w") as f:
        for e in sorted(episodes, key=lambda x: x["first_draft_date"]):
            f.write(json.dumps(e, ensure_ascii=False) + "\n")
    cols = ["case_id", "episode_id", "me_citation", "title", "first_draft_date", "begutachtung_end", "ressort",
            "proposer_group", "government_id", "coalition", "legislative_period", "n_stellungnahmen", "measure_class",
            "bill", "bill_doktyp", "link_method", "bill_status", "third_reading", "bgbl", "vote_text",
            "changed_in_committee", "changed_in_plenum", "text_similarity", "vfgh_repeals", "outcome", "fr_j1a_label", "label_basis",
            "decision_date", "censored", "needs_human", "me_url"]
    with open(DATA / "registry.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(cols)
        for rec in sorted(recs, key=lambda x: (x["first_draft_date"], x["me_inr"])):
            lk = rec["links"][0] if rec["links"] else {}
            w.writerow([rec["case_id"], rec["episode_id"], rec["me_citation"], rec["title"], rec["first_draft_date"],
                        rec["begutachtung_end"], rec["ressort"], rec["proposer_group"], rec["government_id"], rec["coalition"],
                        rec["legislative_period"], rec["n_stellungnahmen"], rec["measure_class"], lk.get("bill"), lk.get("doktyp"),
                        lk.get("method"), lk.get("status"), lk.get("third_reading"), "; ".join(lk.get("bgbl") or []),
                        lk.get("vote_text"), lk.get("changed_in_committee"), lk.get("changed_in_plenum"), rec["text_similarity"],
                        "; ".join(v["kundmachung"] for v in rec["vfgh_repeals"]), rec["outcome"], rec["fr_j1a_label"], rec["label_basis"],
                        rec.get("decision_date"), rec["censored"], "; ".join(rec["needs_human"]), rec["me_url"]])
    from collections import Counter
    print("registry:", len(recs), "episodes:", len(episodes))
    print("ME labels:", Counter(r["outcome"] for r in recs))
    print("episode labels:", Counter(e["outcome"] for e in episodes))


if __name__ == "__main__":
    step = sys.argv[1]
    {"link": link, "texts": texts, "build": build}[step]()
