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

**Segmentation.** U+2014 is normalised to an en dash. Paragraphs (line joining with list/heading and short-line breaks). Each segment lists
the provisions it references (`§ 5 Abs. 2 Z 3`, `Art. 15a`, `Z 4`, `Anlage 1`). No stance labels yet.

## Outputs (derived/, person-free)

| File | Rows | Content |
|---|---:|---|
| `me_index.jsonl` | 1,780 | One row per ME: `gp`, `me_inr`, title, Ressort, Einlangen, Frist, topics, Schlagworte, eurovoc, `health_core`, `health_broad`, reasons, document links. **Join key `(gp, me_inr)`** |
| `stellungnahmen_index.jsonl` | 21,588 | Every alias-matched institutional statement on an ME: `gp`, `snme_inr`, citation, date, `institution_id`, `agent`, `co_institutions`, `me_gp`, `me_inr`, ME title/Ressort, health flags, URL |
| `counts_institutions.csv`, `counts_agents.csv` | | counts on all, health_core and health_broad MEs |
| `stellungnahmen.jsonl` | 2,667 | One row per extracted health statement: id, institution, agent, ISO date, GP, ME number/citation/title, pages, `needs_ocr`, `n_chars`, cleaned masked `text` |
| `stellungnahmen_segments.jsonl` | 91,820 | Paragraph segments with `provisions[]`, `references_provision` |
| `extraction_log.jsonl`, `masking_summary.json` | | per-statement extraction and masking stats |
| `COUNTS.md` | | full per-institution table |

## Counts

Statements (SN) by simulator agent, GP XXIII to XXVIII. "health MEs" = distinct `health_core` MEs the
agent commented on. PDFs and texts are for health MEs only. Full per-institution table: `derived/COUNTS.md`.

| Institution | SN all MEs | SN health MEs | health MEs | PDFs | texts (>=500 chars) | needs OCR |
|---|---:|---:|---:|---:|---:|---:|
| **bmsgpk** | 346 | 4 | 4 | 4 | 4 | 0 |
| **sv** | 589 | 131 | 111 | 131 | 113 | 18 |
| **aerztekammer** | 252 | 96 | 91 | 96 | 59 | 37 |
| **contract_physicians** | 17 | 15 | 6 | 14 | 12 | 2 |
| **elective_physicians** | 0 | 0 | 0 | 0 | 0 | 0 |
| **hospitals** | 148 | 114 | 54 | 113 | 76 | 36 |
| **nursing** | 96 | 79 | 37 | 79 | 69 | 4 |
| **patients** | 86 | 50 | 35 | 50 | 44 | 6 |
| **laender** | 9370 | 1026 | 167 | 1024 | 967 | 16 |
| **bmf** | 963 | 91 | 91 | 91 | 91 | 0 |
| **other** | 9721 | 1331 | 167 | 1065 | 861 | 184 |

Key non-agent institutions on health MEs (SN health / texts): AK 152 / 103, WKÖ 126 / 74, Gesundheitsberufe
(MTD, Hebammen, Physio) 126 / 122, Rechnungshof 118 / 106, Freie Wohlfahrt 96 / 87, ÖGB 56 / 32, Städtebund
48 / 45, Apothekerkammer 45 / 45, Seniorenrat 38 / 38, IV 30 / 9, Pharmaindustrie 22 / 9, Zahnärztekammer 32 / 17.

Reading for persona training: SV (Dachverband 114 health statements, 98 texts), ÖÄK (92 / 55),
Länder (each Land 80 to 168), BMF (91) and the hospital operators (114 / 76) have enough material. Nursing
(79 / 69) and patients (50 / 44) are thin but usable. Contract physicians have 15 statements (Hausärzteverband,
ÖGAM, JAMÖ, one ÖÄK Bundeskurie niedergelassene Ärzte) and **elective physicians have zero**: no Wahlärzte
association ever submitted a Stellungnahme on an ME in 2006 to 2026. The **health ministry** has only 4
statements because it authors the drafts: its formal voice is the ME text and Erläuterungen of the 168
health MEs (document links in `me_index.jsonl`), not list 142.
BMF statements are budget-impact notes (91 texts, median about 2,700 chars).

## Licences

| Source | Licence | Note |
|---|---|---|
| Parlament open data (lists 81, 142, detail JSON) | CC BY 4.0 | "Quelle: Parlament Österreich"; index and metadata in `derived/` derive from it |
| Stellungnahme PDFs and their text | belong to the submitting institutions | kept in `raw/` (never published); derived text is for internal model fitting with citation, do not republish wholesale |
| Statistik Austria OGD, Eurostat, BMF budget CSV, Rechnungshof BRA CSV | CC BY 4.0 | attribution required |
| Dachverband Statistisches Handbuch, ÖÄK Ärztestatistik, Zielsteuerung reports | no open licence stated | cite publisher; internal use; ask before redistribution |

## Known gaps

- **OCR**: 303 of 2,667 health statements are scans with no text layer (mostly GP XXIII/XXIV; ÖÄK 37,
  hospital operators 36, AK 44, WKÖ 50). Flagged `needs_ocr`; not OCRed (tesseract not installed).
  `stellungnahmen.jsonl` keeps these rows with empty or near-empty `text`.
- **Not downloaded**: statements on non-health MEs (all agents), and on health MEs for non-agent bodies outside
  the keep-list in `04_fetch_pdfs.py` (BKA-Verfassungsdienst, Datenschutz, Medizinische Universitäten,
  Landwirtschaftskammer, AGES; about 250 statements). `04 --broad` adds the `health_broad` MEs.
- 12 health statements have no PDF on the detail page.
- ME 164/XXVII: 6,066 citizen rows not retrievable (API cap); all institutional rows present.
- Statements on Regierungsvorlagen / Initiativanträge (`BEZUG_ITYP` I, A) are not included, only on MEs.
- Health flag is rule-based; spot checks found it clean after excluding animal-welfare and family items, but
  borderline items (e.g. Bäderhygienegesetz, Lebensmittel) count as health.
- Masking is best-effort: 5,301 of 147,697 sentences masked (NER 4,743, title rule 200, name lists 268,
  first-name rule 90); `check_leaks.py` reports 0 rule hits on derived text.
