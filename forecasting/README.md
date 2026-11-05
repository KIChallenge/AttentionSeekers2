# forecasting/: outcome-realism track (FR-J1 to FR-J14)

Reference-class forecasting of Austrian health-policy drafts, with counted base rates and
honest small-n intervals. **No trained model** (locked decision, uc2-requirements.md 2.13):
every rate is a count over comparable historical first drafts, and every rule is fixed in
`PREREGISTRATION.md` before scoring. Labels come from the public legislative record only
(Parlament open data, RIS), never from the press.

## Quick start

```
cd forecasting
uv sync
uv run python -m svforecast.harvest lists      # Parlament list 81 (MEs) and list 101 (bills)
uv run python -m svforecast.harvest me         # ME detail JSON, 2008+ (about 30 min, cached)
uv run python -m svforecast.vfgh               # VfGH repeal Kundmachungen from RIS
uv run python -m svforecast.registry link      # scope + ME->bill links + bill details
uv run python -m svforecast.registry texts     # ME and final law texts, similarity
uv run python -m svforecast.registry build     # data/registry.jsonl, .csv, episodes.jsonl
uv run python -m svforecast.sanity             # data/sanity.json (97% and episode counts)
uv run python -m svforecast.score              # data/scores.json, data/scores.md
uv run svforecast fixture XXVI-ME-75           # backtest fixture forecast
uv run svforecast forecast --ressort BMASGPK --date 2026-11-01 --k 8
uv run pytest -q
```

Every network call goes through `src/svforecast/http.py`: descriptive User-Agent, about one
request per second to parlament.gv.at, 2.1 s gap for RIS (its 0.5 req/s rule), and a
content-addressed cache under `cache/http/` so every step is resumable and reruns offline.
Nothing in `data/` (the other agent's folder) is read or written.

## Files

| Path | What |
|---|---|
| `PREREGISTRATION.md` | Fields, class rule, metric, scoring protocol, decision rule, deviations. Written before any score |
| `data/registry.jsonl`, `data/registry.csv` | One row per in-scope Ministerialentwurf (ME), 2008-2026 |
| `data/episodes.jsonl` | MEs grouped into episodes (same bill or same BGBl); the scoring unit |
| `data/scores.json`, `data/scores.md` | Baseline scores with GP and episode bootstrap intervals |
| `data/sanity.json` | The two handoff numbers, recounted |
| `data/fixtures/*.json` | SV-OG 2018 and PrimVG 2017 backtest fixtures with the baseline forecast |
| `src/svforecast/govtable.py` | Dated government and coalition table (source cited in the file) |
| `src/svforecast/scope.py` | Health-scope rule v1.1 |
| `src/svforecast/registry.py` | Linking, label rules, episode grouping |
| `src/svforecast/forecast.py` | Forecasters A (hierarchical class) and B (weighted analogs), status quo |
| `src/svforecast/cli.py` | CLI: k weighted analogs, class base rate with interval, the n behind it |

## Registry fields (per ME)

`case_id`, `episode_id`, `me_citation`, `title`, `first_draft_date` (ME Einlangen),
`begutachtung_end`, `ressort`, `proposer_group` (health_ministry, social_ministry,
finance_ministry, other_ministry), `government_id`, `coalition`, `coalition_parties`,
`legislative_period`, `n_stellungnahmen` (count from list 81 only; the statements themselves are
the data agent's job), `themen`, `schlagworte`, `scope_reasons`, `measure_class` (keyword rule
v1, low reliability, not used by the baseline), `links[]` (bill, doktyp, link method, status,
third reading, Bundesrat date, BGBl, vote text, changed in committee / plenum),
`text_similarity`, `vfgh_repeals[]`, `outcome` (schema enum), `fr_j1a_label`, `label_basis`,
`decision_date`, `outcome_record` (schema shape), `censored`, `knowable_date`, `needs_human[]`.

## Scope rule (v1.1, see Deviation 1)

Title only, veterinary words stripped. In scope when the title matches the health vocabulary
(`HEALTH_RE`), or the social-insurance vocabulary and the proposer is a health or social
ministry, or the proposer is a pure health ministry (BMGFJ, BMG, BMGF) and the title is not
veterinary, food, gene-technology or family/youth law.

## Linking ME to the legislative record

1. Identifier link: the ME's own stage list names its Regierungsvorlage (`/gegenstand/GP/I/n`).
2. Manual link backed by the record: PrimVG 2017, ME 312/ME XXV to Initiativantrag 2255/A XXV
   (RIS consolidated PrimVG title "NR: GP XXV IA 2255/A AB 1714"; there is no link in the
   Parlament data, data-sources.md 9.4).
3. Title match (fallback, flagged `needs_human: link_by_title_only`): RV, government-party
   Initiativantrag or Ausschussantrag (AUB) first tabled within 730 days of the ME, title-token
   Jaccard at least 0.5, years in the titles must agree.

## Label rules (mechanical, PREREGISTRATION.md section 3)

Horizon H = 730 days from the first-draft date.

| Schema `outcome` | Rule |
|---|---|
| `implemented` | Linked bill has a BGBl entry and its NR third reading is within H; ME-to-final text similarity at least 0.75; no VfGH repeal citing the act's BGBl within H |
| `partially_implemented` | As above but similarity below 0.75, or a VfGH repeal Kundmachung within H cites the act's BGBl number |
| `rejected` | Linked bill voted down in plenary or withdrawn |
| `superseded` | Not enacted; a later in-scope ME of the same proposer group, within H, title Jaccard at least 0.5, was enacted |
| `lapsed` | Everything else not enacted within H (enactment after H is flagged `enacted_late`) |
| `unknown` | Censored: first draft after 2024-11-05 (cutoff minus H); kept, never scored |

Text similarity (Deviation 2): ME Gesetzestext HTML vs the final adopted text ("Geändert im
Plenum", else "Geändert im Ausschuss", else the bill's own text), both cut at the enacting
formula, share of the draft's word 5-grams found in the final text (containment). Enacted MEs without an HTML text on either side
get `implemented` with `label_basis = no_text` and `needs_human`; they count in the binary score
and are dropped from the 3-class score.

Note on the alternative rule in data-sources.md 9.2 ("Geändert im Ausschuss" alone means
modified): it is recorded per link (`changed_in_committee`, `changed_in_plenum`) but not used as
the label rule, because committee amendments are routine and often technical; the text
similarity measures how much of the draft survived instead.

## Label mapping: schema enum vs PRD FR-J1a

Both are stored: `outcome` (schema enum) and `fr_j1a_label` (PRD vocabulary).

| Schema `outcome` (outcome-descriptor.schema.json) | `fr_j1a_label` (PRD FR-J1a) | Clean? |
|---|---|---|
| `implemented` | `implemented` | yes |
| `partially_implemented` | `implemented_modified` | mostly: schema says "material changes to scope, cost or timing"; FR-J1a / data-sources 9.2 also count a later VfGH partial repeal and any committee change. Our rule (similarity below 0.75 or VfGH repeal within H) sits between the two |
| `rejected` | `not_implemented` | lossy (FR-J1a does not separate rejected from lapsed) |
| `lapsed` | `not_implemented` | yes |
| `superseded` | `not_implemented` | lossy and arguable: the problem was addressed by a different draft that passed |
| `unknown` (censored) | null | no FR-J1a value exists for a censored or unlabelled case |
| (none) | `target_outcome` | no schema value; FR-J1a's target family (Zielsteuerung, Rechnungshof targets met or missed) is a separate label set this registry does not produce |

## Baseline forecaster

See PREREGISTRATION.md sections 4 to 9. Features: proposer group, coalition at first-draft date,
date. Forecaster A uses the finest class with n of at least 5 in the order
(proposer + coalition), coalition, proposer, all; probabilities are Jeffreys posterior means
(prior 0.5 per category, fixed); every rate carries 90 percent Jeffreys and Wilson intervals.
Forecaster B weights all pool episodes by shared features and a 6-year half-life. The status-quo
baseline is the overall pool base rate. Pools are time-respecting: an episode only enters a
forecast once its label is knowable (first draft + 730 days, uniform for every class so that
enacted cases do not enter the pool earlier than lapsed ones).

## Results (run 2, after Deviation 4; run 1 kept in `data/run1_before_deviation4/`)

### Registry and labels

165 in-scope MEs (first drafts 2008-01 to 2026-11), grouped into 155 episodes; 145 episodes
labelled and uncensored. Episode labels: implemented 82, partially_implemented 45, lapsed 15,
superseded 3, rejected 0, unknown (censored, drafts after 2024-11-05) 10. FR-J1a view:
implemented 82, implemented_modified 45, not_implemented 18.

Link provenance per ME: 121 with an identifier link (ME stage names the RV) or the one manual
record-backed link (PrimVG); 28 title-only links (flagged); 14 unlinked lapsed MEs flagged for a human check
(possible absorption into a differently named law). 37 enacted MEs have no HTML text on one side
(`no_text`, excluded from the 3-class score). 4 enactments are partially_implemented through a
VfGH repeal within the horizon (SV-OG among them).

### Sanity check 1: "about 97 percent of tabled government bills pass"

Confirmed. Parlament list 101, DOKTYP RV, closed GPs, passed = STATUS 5, not passed = STATUS 2,
3 or 4 (STATUS 1 placeholder rows and the open GP XXVIII excluded):
GP XXIII-XXVII 1448 of 1485 = 97.5 percent; GP XX-XXVII 2491 of 2587 = 96.3 percent;
RVs with THEMEN containing "Gesundheit", GP XXIV-XXVII: 128 of 131 = 97.7 percent
(data-sources.md said 128 vs 2; the third non-passed RV is a STATUS 3/4 row).
At the FR-J1a unit (the first draft) the rate is lower but still high: 127 of 145 labelled health
episodes (88 percent) were enacted within 24 months, and 45 of those with material change.

### Sanity check 2: "30 to 60 real negotiation episodes"

Depends entirely on the definition, so here are the counts (data/sanity.json):

| Definition | Count |
|---|---|
| Labelled, uncensored health first-draft episodes 2008-2026 (the forecasting unit) | 145 |
| ... of which not implemented as drafted (lapsed, superseded, or materially modified) | 63 |
| ... with at least 50 Stellungnahmen | 30 |
| ... enacted against at least one party's vote AND at least 50 Stellungnahmen | 22 |

So "30 to 60" is about right for genuinely contested negotiation episodes (22 to 30 by the two
contestation proxies here), but the forecasting population per FR-J1a is about 145, roughly
2.5 to 5 times larger. The outcome variance is thin: only 18 of 145 were not enacted at all. This
does not by itself reopen the trained-model question (the minority class is 18 cases), but the
population figure in 2.13 should read "about 145 first drafts, of which 20 to 30 contested".

### Baseline scores (preregistered, time-respecting, leave-one-episode-out)

90 percent intervals; primary = GP cluster bootstrap (only 4 GP clusters, so coarse),
secondary = episode bootstrap. D = BS_status_quo - BS_model.

| Target | N | Brier A | Brier B | Brier status quo | BSS A (GP / episode) | BSS B (GP) | Verdict A (primary) | Verdict B |
|---|---|---|---|---|---|---|---|---|
| binary enacted | 117 | 0.096 | 0.092 | 0.093 | -0.030 (-0.062 to 0.017 / -0.077 to 0.010) | 0.016 (-0.012 to 0.062) | inconclusive at this N | inconclusive at this N |
| 3-class | 82 | 0.642 | 0.617 | 0.620 | -0.035 (-0.096 to 0.002 / -0.097 to 0.026) | 0.006 (-0.007 to 0.011) | inconclusive at this N | inconclusive at this N |
| binary, no title-only links | 94 | 0.118 | 0.111 | 0.111 | -0.056 (-0.088 to -0.017) | 0.004 | worse than status quo | inconclusive |
| 3-class, no title-only links | 69 | 0.656 | 0.623 | 0.629 | -0.042 (-0.096 to -0.002) | 0.010 | worse than status quo | inconclusive |

Run 1 (before Deviation 4): binary A BSS -0.073 (-0.115 to -0.026), verdict "worse than status
quo"; B inconclusive. Reading: proposer and coalition carry no detectable signal beyond the
overall base rate; the hierarchical class (A) tends to be slightly worse because its finer
classes are noisier; the weighted-analog variant (B) is indistinguishable from the status quo.
Full tables: `data/scores.md`.

### Backtest fixtures (`data/fixtures/`)

| Fixture | First draft | Coalition | Pool (knowable before date) | A: P(enacted in 24 months) | Status quo | A 3-class (impl / modified / not) | Actual (record) |
|---|---|---|---|---|---|---|---|
| SV-OG 2018, 75/ME XXVI | 2018-09-14 | oevp_fpoe | 86 | 0.83, class "proposer", 54 of 65 enacted (90% Jeffreys 74 to 90%) | 0.83 | 0.44 / 0.35 / 0.21 | partially_implemented (passed 2018-12-13, BGBl I 100/2018; VfGH repeals published 2020-01-02 cite it; text containment 0.91) |
| PrimVG 2017, 312/ME XXV (GRUG 2017) | 2017-04-21 | spoe_oevp | 72 | 0.81, class "proposer+coalition", 44 of 54 (72 to 89%) | 0.82 | 0.43 / 0.34 / 0.23 | implemented (via 2255/A, NR 2017-06-28, BGBl I 131/2017; containment 0.80) |

For SV-OG the class level fell back to "proposer" because no ÖVP-FPÖ episode was knowable yet
(new coalition), which is the honest behaviour.

## CLI contract (for the topic dashboard)

```
uv run python -m svforecast.cli forecast --measure-class <class> --proposer <group|Ressort> --date <YYYY-MM-DD> [--k 5] [--target binary|three]
uv run python -m svforecast.cli fixture XXVI-ME-75
```

`--proposer` accepts a group (`health_ministry`, `social_ministry`, `finance_ministry`,
`other_ministry`) or a Ressort code (`BMASGPK`, `BMSGPK`, `BMG`, ...). `--measure-class` takes a
schema `measure_class` value; it only drives the descriptive `measure_class_rate` block, because
it is not part of the preregistered baseline. Coalition is derived from the date unless
`--coalition` is given. Output is one JSON object on stdout:

```
{
  "descriptor": {"first_draft_date": str, "proposer_group": str, "coalition": str, "measure_class": str|null},
  "pool_size": int,                       # episodes knowable before the date
  "forecast_A": Forecast,                 # preregistered primary
  "forecast_B": Forecast,                 # weighted analogs (n = pool size; rates[].n = weighted n)
  "status_quo": Forecast,
  "measure_class_rate": Forecast + {"note": str},   # only with --measure-class; descriptive, never scored
  "analogs": [{"episode_id": str, "title": str, "first_draft_date": str, "proposer_group": str,
               "coalition": str, "outcome": str, "weight": float}],   # k items, highest weight first
  "note": str,
  "sentence": str,                        # e.g. "... enacted within 24 months in 99 of 117 comparable cases (90% Jeffreys interval 79 to 89%)."
  "warning": str                          # only when n < 5 or a 90% interval is wider than 40 points
}
Forecast = {"method": str, "level": "proposer+coalition"|"coalition"|"proposer"|"all"|...,
            "n": float, "probs": {category: float},
            "rates": [{"category": str, "k": float, "n": float, "p": float,
                       "jeffreys90": [lo, hi], "wilson90": [lo, hi]}],
            "small_n_warning": bool, "wide_interval_warning": bool}
```

Categories: binary `enacted` / `not_enacted`; three `implemented` / `partially_implemented` /
`not_implemented`. `outcome` in analogs uses the schema enum. The `fixture` command adds
`"fixture": {"episode_id", "title", "actual_outcome"}`.

## Open issues

- Enum mismatch (schema vs FR-J1a): `target_outcome` has no schema value and is not produced;
  `superseded` and `rejected` collapse into `not_implemented`; `unknown` has no FR-J1a value.
  `partially_implemented` / `implemented_modified` are defined differently in the schema
  ("material change"), data-sources 9.2 ("any committee change or VfGH repeal") and here
  (containment below 0.75 or VfGH repeal within 24 months).
- 37 enacted MEs lack HTML text (mostly older items with PDF only); modification not measured.
- 14 unlinked "lapsed" MEs and 28 title-only links need a human check (flags in `needs_human`).
- The VfGH rule only catches Kundmachungen that cite the act's own BGBl number.
- `measure_class` is a keyword rule (v1) and not validated.
- The GP bootstrap has only 4 clusters; its intervals are rough.
- Government table: the 2019-05-22 coalition end date is not on the cited BKA page.
