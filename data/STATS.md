# Health-system statistics catalogue

Machine-readable statistics usable as agent evidence (impact inputs, number verification).
All files are fetched by `scripts/06_fetch_stats.py` into `data/raw/stats/<source>/` (gitignored);
`data/raw/stats/manifest.jsonl` records URL, local path, size, SHA-256 and fetch date for every file.
Fetched 2026-11-05. Total: 142 files, 229 MB.

| Source (dir) | Publisher | Licence | What it contains | Coverage | Format | URL |
|---|---|---|---|---|---|---|
| `statat/OGD_gesausgaben01_HVD_HCHF_1` | Statistik Austria | CC BY 4.0 | Laufende Gesundheitsausgaben (System of Health Accounts) by function HC x **financing scheme HF** (Staat, SV, private Haushalte, PKV ...): the "who pays" table | about 1995 to 2024, annual | CSV + classification CSVs | https://data.statistik.gv.at/ogd/json?dataset=OGD_gesausgaben01_HVD_HCHF_1 |
| `statat/OGD_gesausgaben02_HVD_HCHP_1` | Statistik Austria | CC BY 4.0 | Health expenditure by function HC x **provider HP** (Krankenhäuser, ambulante Anbieter, Apotheken ...) | about 1995 to 2024 | CSV | same pattern |
| `statat/OGD_gesausgaben03_HVD_HPHF_1` | Statistik Austria | CC BY 4.0 | Health expenditure by provider HP x financing HF | about 1995 to 2024 | CSV | same pattern |
| `statat/OGD_krankenbewegungen_ex_ENTLASSUNGEN_KA_1`, `_KA_2` | Statistik Austria | CC BY 4.0 | Spitalsentlassungen (discharges) and Belagstage from all Krankenanstalten by diagnosis (ISHMT), sex, age, Wohnbundesland, Versorgungssektor | 1989 to 2019/2020 (older series; newer years in the 2021 editions below) | CSV | https://data.statistik.gv.at/ogd/json?dataset=OGD_krankenbewegungen_ex_ENTLASSUNGEN_KA_1 |
| `statat/..._ENTLASSUNGEN_AKUTKA_2`, `_AKUTKA_3` | Statistik Austria | CC BY 4.0 | Discharges from acute hospitals (Akutkrankenanstalten) | 1989 to 2019/2020 | CSV | same pattern |
| `statat/..._ENTLASSUNGEN_VSEKT_20211`, `_PERSMERK_2021` | Statistik Austria | CC BY 4.0 | Discharges by Versorgungssektor; by person characteristics (2021 editions) | PERSMERK up to 2025 | CSV | same pattern |
| `statat/..._LEISTUNGEN_1` | Statistik Austria | CC BY 4.0 | Medizinische Leistungen during in-patient stays (procedure catalogue chapters) | 2009 to 2020 | CSV | same pattern |
| `statat/OGD_bevstandjbab2002_BevStand_2026` | Statistik Austria | CC BY 4.0 | Population on 1.1.2026 by municipality, age, sex (per-capita denominators) | 2026 | CSV | same pattern |
| `statat/OGD_ind003_HVD_IND_1` | Statistik Austria | CC BY 4.0 | Remaining life expectancy by age, Austria and NUTS regions | annual | CSV | same pattern |
| `statat/OGD_gestorbene_ext_GES_1` | Statistik Austria | CC BY 4.0 | Deaths by age, sex, region | 1962 to 2025 | CSV | same pattern |
| `eurostat/hlth_sha11_hf.json` | Eurostat | CC BY 4.0 | Health expenditure by financing scheme, AT plus DE, CH, CZ, SI, NL, DK, SE, EU27 | up to 2025 (AT years vary by indicator) | JSON-stat | https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/hlth_sha11_hf |
| `eurostat/hlth_sha11_hchf.json` | Eurostat | CC BY 4.0 | Expenditure by function x financing scheme, same countries | up to 2025 | JSON-stat | .../data/hlth_sha11_hchf |
| `eurostat/hlth_rs_bds1.json`, `hlth_rs_bds2.json` | Eurostat | CC BY 4.0 | Hospital beds by function/type of care; by ownership | 1960 to 2025 | JSON-stat | .../data/hlth_rs_bds1 |
| `eurostat/hlth_co_disch1.json`, `hlth_co_inpst.json` | Eurostat | CC BY 4.0 | Hospital discharges by diagnosis; in-patient average length of stay | 1995 to 2021 | JSON-stat | .../data/hlth_co_disch1 |
| `eurostat/hlth_rs_prs2.json`, `hlth_rs_physcat.json`, `hlth_rs_spec.json`, `hlth_rs_grd2.json` | Eurostat | CC BY 4.0 | Health personnel (physicians, nurses, midwives ...), physicians by category and by speciality, medical graduates | 1960 to 2025 (speciality to 2021) | JSON-stat | .../data/hlth_rs_prs2 |
| `bmf/UG24_Verzeichnis_veranschlagter_Konten_{2020..2024}.csv` | BMF (via data.gv.at) | CC BY 4.0 | Federal budget **UG 24 Gesundheit** at account level: Bundesvoranschlag of the year and previous year, Erfolg two years back, by Global-/Detailbudget and account (e-health, Krankenanstaltenfinanzierung, Zweckzuschüsse, Impfungen ...) | BVA 2020 to 2024 (Erfolg 2018 to 2022) | CSV `;` | https://service.bmf.gv.at/Budget/Budgets/{Jahr}/bfg/teilhefte/UG24/ |
| `rh_bra/{2020..2025}/*UG_MVAG*.csv` | Rechnungshof, Bundesrechnungsabschluss (via data.gv.at) | CC BY 4.0 | Voranschlagsvergleichsrechnung Finanzierungs- and Ergebnishaushalt by Untergliederung: actual outturn per UG including UG 24 Gesundheit (e.g. 2025: Auszahlungen aus Transfers 2.60 bn EUR) | actuals 2020 to 2025 | CSV `;` UTF-8 | https://www.data.gv.at (search "Bundesrechnungsabschluss") |
| `dvsv/Statistisches_Handbuch_{2017..2025}_excel.zip` | Dachverband der Sozialversicherungsträger | not stated, "© Dachverband"; use with attribution, ask before redistribution | Statistisches Handbuch der österreichischen Sozialversicherung, 8 chapters as Excel: insured persons, contributions, Gebarung of the KV/PV/UV, Leistungen, **Vertragsärzte and Vertragszahnärzte by Bundesland and Fachrichtung** (Kassenstellen), Krankenstände, Heilmittel | editions 2017 to 2025 (data years about t-1) | XLSX in ZIP | https://www.sozialversicherung.at/cdscontent/?contentid=10007.888557&portal=svportal |
| `oeak/Aerztestatistik_{2019..2022,2024,2025}.pdf` | Österreichische Ärztekammer | not stated; cite ÖÄK | Physician headcounts by Tätigkeit (**Kassenvertrag vs Wahlarzt**, angestellt), Fachrichtung, Bundesland, age, sex; Stichtag 31.12. 2023 edition not linked on its page (skipped) | 2019 to 2025 | PDF (tables need extraction) | https://www.aerztekammer.at/daten-fakten |
| `zielst/*.pdf` (26 files) | BMSGPK / GÖG, Bundes-Zielsteuerungskommission | not stated; federal publication, cite BMSGPK and GÖG | Zielsteuerung-Gesundheit Monitoringberichte 2020 to Stichtag 31.12.2025 (indicator targets vs values, Ausgabenobergrenzen vs actual public health spending), Kurzberichte Finanzzielsteuerung Oct 2020 to Oct 2025, the Länder's formal Stellungnahmen der Landes-Zielsteuerungskommissionen, and the Bundes-Zielsteuerungsvertrag 2024 to 2028 | 2020 to 2026 | PDF | https://www.sozialministerium.gv.at/Themen/Gesundheit/Gesundheitssystem/Gesundheitsreform-(Zielsteuerung-Gesundheit)/Zielsteuerung-Gesundheit---Monitoringberichte.html |

## Gaps and notes

- **Physicians Kasse vs Wahlarzt** exists only in the ÖÄK Ärztestatistik PDFs (headcounts) and the Dachverband Handbuch (Vertragsärzte, i.e. Kassenstellen). Statistik Austria has no physician OGD dataset (STATcube needs registration; not used).
- **BMF UG 24** CSVs exist on the predictable URL only for BFG 2020 to 2024 (2013 to 2019 and 2025 to 2026 returned 404). Older and newer actuals are covered by the Rechnungshof BRA files; RH BRA 2013 to 2019 use differently titled distributions and were not matched (to add if needed).
- **Hospital beds** for Austria by hospital: Eurostat gives national totals; per-hospital data (kaz.bmg.gv.at "Krankenanstalten in Zahlen") did not respond on 2026-11-05.
- **Waiting times**: no official series (see research/data-sources.md section 6).
- Statistik Austria discharge files are the large ones (up to 20 MB each); size cap in the script is 300 MB per file.
- Eurostat cubes `hlth_sha11_hchf`, `hlth_co_disch1`, `hlth_co_inpst` intermittently return HTTP 413 for multi-country requests; the script retries and falls back to an AT-only request.
