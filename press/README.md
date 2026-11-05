# press/: DVSV press archive to person-free institution positions

Turns the DVSV Pressespiegel archive (`presse.db`, SQLite FTS5, 223,909 OCR'd pages of daily press
reviews 2008-11 to 2026-09) into short paraphrases of what each agent institution publicly demanded,
in the institution's own voice, for the evidence DB and for persona training.

Press texts never enter the repo. Tracked here: scripts, tests, `derived/COUNTS.md` and
`derived/press_masking_summary.json` (counts only). Everything else in `work/` and `derived/` is
gitignored. Rights: the organisers declared all SV-Box data publicly available and freely
distributable, and the brief names the press archive as a data source; we still publish only
paraphrases, never clippings.

## Run

```sh
cd press && uv sync
uv run python -I -m pytest -q                                   # synthetic archive, offline, ~2 s
# real archive (absolute path: pnpm runs the script from press/)
pnpm press:all --db /home/aryt3/Hacking/Hackathons/SV/presse/presse.db --yes
# equivalent: cd press && uv run python -I -m sv_press all --db <path> --yes
pnpm db:import                                                  # loads press/derived/press_*.jsonl too
```

`all` runs extract, clean, rewrite, export. Without `--yes` it stops (exit 2) after printing the token
and USD estimate if that estimate exceeds `--budget`; with `--yes` it proceeds and the ledger stops
calling at the budget. Single steps: `extract`, `clean`, `rewrite [--dry]`, `export`, `synth <db>`.
Every step is resumable; model answers are cached in `work/cache/rewrite/`, so a rerun after a budget
stop or crash only pays for what is missing. Options: `--cap` passages per institution (default 200),
`--per-year` candidate windows kept per institution and year (60), `--budget` USD (25),
`--workers` (8), `--institutions sv,aek,...`, `--model` (`gpt-6-sol`), `--mock` (offline stand-in).

## Pipeline

1. **Extract** (`extract.py`, `institutions.py`). One FTS5 query per institution: alias terms AND
   health-topic terms (Wartezeiten, Kassenstellen/Ärztemangel, Primärversorgung, Telemedizin/ELGA,
   Finanzierung, Pflege, Spitalsplanung, Medikamente, Wahlärzte). Wahlärzte and patient advocacy are
   rare, so their alias alone is the query. Hit pages are reflowed (pdftotext `-layout` puts columns
   side by side; gutters are detected per page), cut into paragraphs, and every paragraph that names
   the institution next to a position marker (fordert, lehnt ab, warnt, begrüßt, ...) becomes a window
   of 350 to 1,500 characters. Date = earliest day-precise press review the page appears in
   (`pages.dup_of`); pages that only live in long compilations (`20180101-20190125.pdf`) are skipped.
   Outlet from the clipping header when it names one. A heap per institution and year keeps the best
   windows (position marker in the same sentence, topic density), so every year stays represented.
2. **Clean** (`clean.py`, `guard.py`, `text.py`). OCR cleanup (ligatures, soft hyphens, line-end
   hyphenation, junk lines, page furniture, em dash to en dash); exact and near-duplicate removal
   (word 6-gram Jaccard >= 0.5, earliest date wins; the archive reprints agency texts across days);
   round-robin selection over years; then CON-1/CON-2:
   - sentences with quotation marks, first-person speech or `, sagt der <Amt>` are dropped;
   - office nouns that point at one person (Gesundheitsministerin, Kammerpräsident, Obmann, Sprecher,
     Patientenanwalt) become the institution or `[Funktion]`;
   - person masking reuses `data/scripts/05_extract_clean.py` read-only (spaCy `de_core_news_lg` PER,
     title rule, name lists, first-name rule): a hit masks the whole sentence as `[...]`, then a
     rescan drops the passage if anything person-like survives (fail closed). Masked name strings
     are kept in `work/masked_names.json` for the output check, never in `derived/`.
3. **Rewrite** (`rewrite.py`). `gpt-6-sol` via `OPENAI_COMPATIBLE_BASE_URL`/`_API_KEY` from the repo
   `.env`, strict `json_schema`: `{relevant, topic, about, stance, stance_text_de}`. The model only
   sees masked text and is told: institution as subject, third person, no persons, offices, quotes
   or first person, nothing the excerpt does not say. Token count first, ledger across runs, budget
   cap, interleaved institutions so a budget stop keeps coverage balanced.
4. **Export** (`export.py`). Each stance text and title is re-guarded (name rules, NER, quotes,
   offices, em dash, and every name masked in its own source passage). A flagged text drops the row;
   a flagged 4-word title is replaced by the fixed topic label. A final verify aborts before writing.

## Outputs (`derived/`)

| File                                      | Shape                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `press_sources.jsonl`                     | `@sv/contracts` `Source`: `kind: "press"`, institution `{code, nameDe, glossEn, role}` (codes from `AGENT_CATALOG`, Wahlärzte `WA`), `date`, `datePrecision`, `outlet`, `title`, `licence`, `personFiltered: true`, `corpusRevision: press-v1`, plus `topic`, `stance`, `sourceRef {pageId, pageNo, doc, date, outlet}` |
| `press_segments.jsonl`                    | `Segment`, one per source, `text` = the institution-voice paraphrase                                                                                                                                                                                                                                                    |
| `press_stances.jsonl`                     | `{institution, role, date, topic, about, stance_text_de, stance, source_ref}`                                                                                                                                                                                                                                           |
| `persona_press_sft.jsonl`                 | chat rows in the `models/` format, `{messages:[system, user, assistant], meta}`; system = the role card from `models/configs/institutions.yaml` (fallback cards for `industry_pharma`)                                                                                                                                  |
| `sft/<role>.{train,heldout}.jsonl`        | split at 2023-01-01 like `models/`                                                                                                                                                                                                                                                                                      |
| `sft/backtest.bt_train.jsonl`             | everything dated before 2018-09-14 (SV-OG backtest)                                                                                                                                                                                                                                                                     |
| `press_masking_summary.json`, `COUNTS.md` | counts only (not gitignored; commit after the real run)                                                                                                                                                                                                                                                                 |

`pnpm db:import` loads `press_sources.jsonl` and `press_segments.jsonl` when present and only if
`press_masking_summary.json` reports `leak_hits: 0`; `--no-press` skips them.

## Tests (synthetic archive)

`sv_press/synth.py` builds a `presse.db` with the real schema and FTS tokenizer: 22 daily reviews,
44 pages, invented statements by the real institutions, invented persons (Quastenhuber,
Moosbrugger-Fink, ...), direct quotes, office nouns, two-column layout, an OCR page, a byte-identical
reprint (`dup_of`), a near-duplicate reprint four days later, and a yearly compilation. The tests
check that every institution is found, no invented name, quote, office noun, first-person sentence or
em dash reaches `derived/`, a leaking model answer is dropped, the reprint keeps the earlier date,
compilations date nothing, sources and segments have the contract shape, and the splits are right.

## Counts

Real archive: pending (the database arrives tonight); `derived/COUNTS.md` is rewritten by every run.
Synthetic archive with the real model (`gpt-6-sol`, 37 calls, 0.23 USD at the assumed prices):

| Institution                 | passages | rows | pre 2018-09-14 |
| --------------------------- | -------: | ---: | -------------: |
| Sozialversicherung (SV)     |        8 |    5 |              3 |
| Gesundheitsministerium (GM) |        2 |    2 |              1 |
| Ärztekammer (ÄK)            |        5 |    5 |              3 |
| Vertragsärzt:innen (VÄ)     |        1 |    1 |              1 |
| Wahlärzt:innen (WA)         |        2 |    2 |              1 |
| Krankenanstalten (KA)       |        2 |    2 |              1 |
| Pflegevertretung (PF)       |        2 |    1 |              0 |
| Patientenvertretung (PV)    |        2 |    2 |              1 |
| Bundesländer (BL)           |        2 |    2 |              2 |
| Finanzministerium (FM)      |        4 |    4 |              3 |
| Arbeiterkammer (AK)         |        3 |    3 |              1 |
| Wirtschaftskammer (WK)      |        3 |    3 |              1 |
| Industrie/Pharma (IP)       |        1 |    1 |              0 |

## Cost and runtime on the real archive (estimate)

Measured on the synthetic run: about 500 prompt and 185 completion tokens per passage. Real windows
are longer (up to 1,500 chars), so about 700 + 200. At the default cap of 200 passages for 13
institutions (at most 2,600 calls; rare institutions such as Wahlärzte will have fewer) that is about
1.8 M prompt and 0.5 M completion tokens, roughly 19 USD at the assumed 5 / 20 USD per million.
The deployment's real price is not published here; set `PRESS_USD_PER_M_IN` and
`PRESS_USD_PER_M_OUT` so the ledger and the 25 USD stop use real prices. Runtime: extraction
about 7 ms per hit page (single process, likely 10 to 25 min over the archive), spaCy masking 1 to 2
min, rewrite about 30 to 45 min with 8 workers. `python -I` throughout; the DB is opened read-only.

## Known limits

- Masking is best effort, as in `data/`: a rare surname with no title, first name or NER hit can
  survive into the model input. The model is instructed not to name persons and the output guard
  re-checks, but the model input itself is not proven person-free.
- Column reflow is heuristic; spanning headlines and irregular layouts can still interleave text.
  Garbled windows mostly come back `relevant: false`.
- Outlet is only set when the clipping header names a known outlet.
- Stance is relative to `about` (the measure named by the model), not to a fixed proposal.
