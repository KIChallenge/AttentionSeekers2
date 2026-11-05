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

RESULTS_PLACEHOLDER
