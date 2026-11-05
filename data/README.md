# data/: Stellungnahmen corpus and health statistics

Corpus for the HealthPolicy Simulator: institutional Begutachtungs-Stellungnahmen (formal positions on
Ministerialentwürfe, FR-H13 / FR-C1) and machine-readable health-system statistics (impact inputs).
Owner of this folder: the data track. `forecasting/` (proposal registry, labels) joins on `(gp, me_inr)`.

## Layout

```
data/
  pyproject.toml, uv.lock     uv project (requests, pypdf, spacy + de_core_news_lg)
  scripts/                    pipeline, run in order (see below)
  cache/                      HTTP cache (filter lists, detail JSON, logs)        gitignored
  raw/                        downloads, never published                         gitignored
    parlament/                list 81 + list 142 raw rows (contain citizen names)
    snme_pdf/{GP}/{INR}.pdf   Stellungnahme PDFs + manifest.jsonl
    snme_txt/{GP}/{INR}.txt   pdftotext output + .meta.json
    stats/                    statistics files + manifest.jsonl (see STATS.md)
  derived/                    person-free outputs (see below)
  STATS.md                    statistics catalogue (source, licence, date, URL, contents)
```

## Rerun

```sh
cd data && uv sync
cd scripts
uv run python -I 01_fetch_lists.py         # list 81 (MEs) + list 142 (Stellungnahmen), GP XXIII..XXVIII
uv run python -I 02_fetch_me_details.py    # ME detail JSON (topics, eurovoc, Schlagworte, documents)
uv run python -I 03_build_index.py         # alias matching, health flags, counts CSVs
uv run python -I 04_fetch_pdfs.py          # SNME detail + PDF for health MEs x mapped institutions
uv run python -I 05_extract_clean.py       # pdftotext, furniture stripping, person masking, segmentation
uv run python -I check_leaks.py            # CON-1/2 guard; exits 1 if a name pattern survived
uv run python -I 06_fetch_stats.py         # statistics (optionally: statat eurostat bmf rh_bra dvsv oeak zielst)
uv run python -I 07_report.py              # derived/COUNTS.md
```

Every script is resumable: HTTP responses are cached in `cache/`, files in `raw/` are skipped when present.
Network politeness: one request per 1.1 s per process, User-Agent
`sv-ki-challenge-data/0.1 (hackathon research corpus ...; contact ...)`, retries with backoff.
Parsing of downloaded content runs with `python -I`.
Options: `01 --refresh` refetches the lists; `04 --broad` widens to `health_broad` MEs, `--agents a,b`, `--limit N`.

## Method

**Statement universe.** Parlament filter list 142, body `{"BEZUG_GP_CODE":[gp],"BEZUG_ITYP":["ME"]}` per GP.
GP XXVII exceeds the API's 100,000-row cap (235,863 rows), so it is fetched in batches of ME numbers whose
statement counts (list 81 column) sum below 95,000; ME 164/XXVII (COVID-19-Impfpflichtgesetz, 106,183
statements) is split by the hidden `TYP` column (I = institution, P = person). Only the person part of
that one ME is truncated (6,066 citizen rows lost, all 117 institutional rows kept).

**Institution normalisation** (`scripts/aliases.py`). An ordered regex alias table maps the free-text
"Stellungnahme von" to 60 canonical institutions, each assigned to one of the nine simulator agents or
to `other`. Name drift is covered (Hauptverband to Dachverband, GKKs to ÖGK, BMGFJ/BMG/BMGF/BMASGK/BMSGPK/
BMASGPK for the ministry, sub-departments such as "WKÖ; Abteilung für Sozialpolitik und Gesundheit").
Joint statements keep all matches (`co_institutions`); the primary is the earliest match, except that
specific sub-organisations (ÖGB-FGV Gesundheitsberufe, Patientenanwaltschaft inside an Amt der
Landesregierung) win over their parent. Rows with `TYP=P` count only if the string has no
"Surname, Firstname" or "Name; Organisation" structure. Citizen mass submissions are excluded because
they match no alias, not by frequency.

**Health MEs** (`03_build_index.py`). `health_core`: issued by a health-only ministry (BMGFJ, BMG, BMGF);
or Parlament topic "Gesundheit"; or a merged social+health ministry (BMASGK, BMSGPK, BMASGPK) with a health
keyword in title or tags; or a health keyword in both title and eurovoc/Schlagworte. Animal-welfare,
family and youth items the ministry also owned are excluded. `health_broad` additionally includes all
items of ministries holding the health portfolio and social-insurance law (ASVG, GSVG, BSVG, B-KUVG).
Result: 1,780 MEs in GP XXIII to XXVIII, 168 `health_core`, 267 `health_broad`.

**Text** (`05_extract_clean.py`). pdftotext (poppler), pypdf fallback; `needs_ocr` when < 200 non-space
chars per page (no OCR run). Cleaning: running headers/footers (lines on at least half of >= 3 pages),
the Parliament stamp ("6/SN-75/ME XXVI. GP ..."), page numbers, letterhead/contact lines, salutations, and
closing/signature blocks (cut to the end if in the last 35 percent of the text, else the closing line plus up
to 6 signature lines).

**Person masking (CON-1/CON-2).** Each sentence is masked as `[...]` when any of these fires:
spaCy `de_core_news_lg` NER label PER (single-token hits that look like German common nouns are
ignored, multi-token hits always count); title rule (Dr., Mag., Prof., Präsident(in), Direktor(in),
Bundesminister(in), Landesrat, Herr, Frau, ... followed by a capitalised or all-caps token, excluding
function chains like "Präsident des Nationalrates"); "Surname, Firstname" lists; a list of about 200 common
German first names followed by a capitalised token; "e.h." signature marks. Counts per statement in
`derived/extraction_log.jsonl`, totals in `derived/masking_summary.json`. `scripts/check_leaks.py` rescans
all derived text with the rule set and fails on any hit. NER-only names (rare surnames without title or
first name) can in principle survive where spaCy misses them; spot checks found none, but treat the
corpus as person-stripped by best effort, not by proof. Submitter strings with names stay in `raw/`.

**Segmentation.** Paragraphs (line joining with list/heading and short-line breaks). Each segment lists
the provisions it references (`§ 5 Abs. 2 Z 3`, `Art. 15a`, `Z 4`, `Anlage 1`). No stance labels yet.

## Outputs (derived/, person-free)

| File | Rows | Content |
|---|---:|---|
| `me_index.jsonl` | 1,780 | One row per ME: `gp`, `me_inr`, title, Ressort, Einlangen, Frist, topics, Schlagworte, eurovoc, `health_core`, `health_broad`, reasons, document links. **Join key `(gp, me_inr)`** |
| `stellungnahmen_index.jsonl` | 21,588 | Every alias-matched institutional statement on an ME: `gp`, `snme_inr`, citation, date, `institution_id`, `agent`, `co_institutions`, `me_gp`, `me_inr`, ME title/Ressort, health flags, URL |
| `counts_institutions.csv`, `counts_agents.csv` | | counts on all, health_core and health_broad MEs |
| `stellungnahmen.jsonl` | TEXTS | One row per extracted health statement: id, institution, agent, ISO date, GP, ME number/citation/title, pages, `needs_ocr`, `n_chars`, cleaned masked `text` |
| `stellungnahmen_segments.jsonl` | SEGS | Paragraph segments with `provisions[]`, `references_provision` |
| `extraction_log.jsonl`, `masking_summary.json` | | per-statement extraction and masking stats |
| `COUNTS.md` | | full per-institution table |

## Counts

COUNTS_TABLE

## Licences

| Source | Licence | Note |
|---|---|---|
| Parlament open data (lists 81, 142, detail JSON) | CC BY 4.0 | "Quelle: Parlament Österreich"; index and metadata in `derived/` derive from it |
| Stellungnahme PDFs and their text | belong to the submitting institutions | kept in `raw/` (never published); derived text is for internal model fitting with citation, do not republish wholesale |
| Statistik Austria OGD, Eurostat, BMF budget CSV, Rechnungshof BRA CSV | CC BY 4.0 | attribution required |
| Dachverband Statistisches Handbuch, ÖÄK Ärztestatistik, Zielsteuerung reports | no open licence stated | cite publisher; internal use; ask before redistribution |

## Known gaps

GAPS
