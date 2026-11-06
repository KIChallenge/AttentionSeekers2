# Backtest: eImpfpass 2023 (GTelG-Novelle)

FR-H7, second episode. The most recent decided health draft in the registry that was contested and fits the roster, replayed with evidence cut off before the first draft and compared with the legislative record. One data point, not a validation.

## Episode

Choice. Among the 155 episodes the most recent decided ones are ME 343 MTD-Gesetz 2024, ME 335 SVÄG 2024, ME 309 Psychotherapiegesetz and ME 348 GuKG-Novelle 2024; the MTD and psychotherapy professions have no seat, ME 335 has no Stellungnahme in our corpus, and ME 348 lapsed with an open flag that it may have been absorbed into another law. The Vereinbarungsumsetzungsgesetz 2024 (Finanzausgleich 2024 to 2028) is not in the registry, so it has no first-draft record to forecast from. ME 260/ME XXVII (Gesundheitstelematikgesetz, eImpfpass) is decided (BGBl. I Nr. 105/2024, 2024-07-04), contested (34 Stellungnahmen, 21 in our corpus from Ärztekammer, Dachverband, Arbeiterkammer, WKO, BMF, all nine Länder, Spitalsträger and Pflege), has the lowest text similarity of the recent decided drafts (0.36, label partially implemented), and maps onto nine seats. The positions pull apart: the Ärztekammer welcomes the aim but raises the extra documentation work and its compensation (scan, OCR-damaged), Vienna rejects interface costs for hospital owners and the Tirol hospitals ask to separate the new office from the ELGA ombudsman and find the colon form hard to read, the BMF accepts only costs inside the ministry budget and warns about identification by reading data off documents, while Dachverband and Arbeiterkammer back the draft. The e-health part of the later reform agenda (1450) entered this law between draft and enactment.

- Draft: 260/ME XXVII. GP, first draft 2023-04-05 (sent to consultation 2023-04-04), consultation until 2023-05-09.
- Law: RV 2530 d.B. (2024-04-17), committee 2024-06-26, Nationalrat 2024-07-04 with an amendment (AA-410, editorial), BGBl. I Nr. 105/2024. Vote: ÖVP, SPÖ, Grüne, NEOS for, FPÖ against.
- Draft to law (registry text similarity 0.36; draft and enacted text compared by us): the storage duty, the retro-entry ordinance, the ministry as controller after the pilot and personal-level data use stay; the eHealth service desk is folded into a joint ELGA and eHealth support unit (ombudsman office, service desk, objection office, service line, tasks by ordinance); the colon gender form is dropped (62 colon forms in the draft, none in the law); added: connection of the rescue services and the 1450 hotline to ELGA, identification by reading name and social security number (§ 18 Abs. 4a and 4b). No compensation clause was added.
- Record: `forecasting/data/fixtures/gtelg-2023.json`.

## Setup

- Template `backtest_gtelg_2023` (`packages/engine/config/templates.json`): neutral question of the time ("Stand 3. April 2023"), seven topics that are the measures of the consultation draft (the input on the table, not the outcome), nine seats as of 2023: health ministry (`gm`), BMF (`fm`), the ÖVP-Grüne majority in the Nationalrat (`nr`), Dachverband (`sv`), Ärztekammer (`ak`), Länder and their hospitals (`bl`), Arbeiterkammer (`abk`), Wirtschaftskammer (`wk`), Patientenanwaltschaften (`pv`). 2023 profiles replace the 2026 ones; red lines and persona dossiers are off because they postdate the cutoff (`SV_PERSONA_MODE=profile`).
- Rule: veto players `gm fm nr`, quorum a third of the table, so the government side can pass a package alone (the real setting: a simple federal act).
- As-of 2023-04-03, the day before the draft was sent out. Checked in the record: 59 distinct sources were retrieved or cited, the latest dated 2023-03-28; none of the 480 passage dates shown in prompts is after the cutoff. Parametric memory is not cut, see the recall probe.
- One run, default seat plan (gpt-6-sol for `gm fm nr abk wk`, moderator and Experte; Qwen3 for `sv ak`; GLM-5 for `bl`; Devstral 2 for `pv`), seed 20230403, five rounds.
- Command: `SV_PERSONA_MODE=profile pnpm --filter @sv/engine run:once --template backtest_gtelg_2023 --as-of 2023-04-03 --seed 20230403 --rounds 5 --id backtest-gtelg-2023-government --question "..."`.

## Forecast at the first-draft date

`uv run python -m svforecast.cli forecast --measure-class digitalisation --proposer health_ministry --date 2023-04-05 --k 5` (and `--target three`); pool 113 episodes knowable before 2023-04-05.

| Target | Method | Prediction | 90% interval |
| --- | --- | --- | --- |
| Enacted within 24 months | proposer and coalition (8 drafts) | 0.94 | 0.79 to 1.00 |
| Enacted within 24 months | weighted analogs | 0.87 | 0.80 to 0.93 |
| Three classes | weighted analogs | as drafted 0.40, modified 0.41, not enacted 0.20 | modified 0.30 to 0.52 |

Analogs: IVF-Fonds-Gesetz 2021, Epidemiegesetz 2021 (two), Suchtmittelgesetz 2020, GBRG-Novelle 2020. Reality: enacted after 15 months, modified (text similarity 0.36). Both forecasts hit, the three-class one only by a hair (0.41 against 0.40).

## Result

The run ended at the round limit with no single proposal accepted, but the moderator's compromise package carried in the ratification round: 7 for, 2 conditional (Dachverband, Ärztekammer), none against. Unlike SV-OG 2018, the simulator produced a law. It is a softer law than the real one.

Per provision, stance on the drafted measure (-2 rejected, +2 as drafted). Sim: final-round median of the veto seats `gm fm nr`; package: what the carried compromise says.

| Provision | Draft | Law 2024 | Sim | Package | Match |
| --- | --- | --- | --- | --- | --- |
| Storage duty for all vaccinating providers | +2 | +2 kept | 1.0 | kept | hit |
| Ordinance for mandatory retro entry | +2 | +2 kept | 0.75 | voluntary; duty only once paid for | miss, softer |
| Ministry as controller after the pilot | +2 | +2 kept | 1.5 | kept, plus treatment-contact ordinance | hit |
| eHealth service desk | +2 | +1 merged into a joint support unit with the ombudsman | 1.25 | kept, free, separated from the ombudsman | partial: same concern, opposite fix |
| Personal-level data use | +2 | +2 kept | 0.5 | limited to set purposes, logged | miss, softer |
| Providers bear costs, no compensation | +2 | +2 kept | 0.0 | no new duties without funding, 1.8 M EUR a year, 12-month pilot | miss, softer |
| Colon gender form | +2 | -2 dropped | 0.5 | silent | miss |
| Added in parliament: 1450 and rescue services in ELGA, identification by name and SV number | none | added | none | none | miss; a Dachverband proposal for e-card identity checks was rejected 3:6 |

Two of seven provisions match, one partly. The sim moved on the right provisions in two places (the service desk was the only drafted measure the law changed, and the identification question came up), but the main miss repeats SV-OG: every disputed cost question was resolved in favour of the objectors, while the real government kept the cost allocation and the obligations as drafted. The colon form, the one provision the law dropped outright, came up only in passing: every seat stayed neutral to positive (median +0.5) and nobody argued to drop it; in consultation only the Tirol hospitals had raised it.

Preference attainment per institution: mean over topics of |ideal - draft| - |ideal - outcome|, ideal = the institution's own round-1 stance; outcome = the coded law or the sim column above.

| Institution | Opening mean | Law 2024 | Sim |
| --- | --- | --- | --- |
| Wirtschaftskammer | +0.07 | +0.14 | +1.21 |
| NR majority | +0.36 | 0.00 | +1.21 |
| Arbeiterkammer | +0.71 | -0.14 | +1.07 |
| Ärztekammer | +0.29 | -0.14 | +1.07 |
| Länder | +0.21 | -0.14 | +0.93 |
| BMF | +0.43 | +0.14 | +0.79 |
| Health ministry | +1.07 | 0.00 | +0.57 |
| Patientenanwaltschaften | +1.00 | -0.43 | +0.50 |
| Dachverband | +1.07 | 0.00 | +0.43 |

In reality nobody gained much against the draft; the dropped colon form is what moves the law column. In the sim everyone gains, because the seats open below the draft, the drafting ministry included (+1.07, not +2). Same main miss as in 2018: the models do not play a government that legislates over the table.

Proposals: 8 tabled (Ärztekammer 2, Länder 3, Patientenanwaltschaften 2, Dachverband 1), none cited a source, none accepted; the package reused two of them (treatment contact, free service desk). A cited-versus-uncited hit rate cannot be computed.

## Recall probe

`pnpm --filter @sv/engine recall --episode gtelg`, no context, three samples per family, keyword grading (`runs/backtest-gtelg-2023-recall.json`).

| Family | Seats | Outcome detail (1450, support unit, BGBl) |
| --- | --- | --- |
| gpt-6-sol | gm fm nr abk wk, moderator, Experte | 0 of 3; says it does not reliably know whether or in which form it passed |
| GLM-5 | bl | 0 of 3 |
| Qwen3 235B | sv ak | 0 of 3 ("Ich weiß es nicht") |
| Devstral 2 | pv | 0 of 3 |

The grader marks 4 of 12 answers `adoption_only`, all false positives: "beschlossen" appears in "ob ... beschlossen wurde". No family recalls the outcome. Unlike SV-OG 2018, this episode is clean on parametric memory, so the misses above are the simulator's, not a memory effect, and the hits are not memory either.

## Verdict

| | Forecast | Simulation | Reality |
| --- | --- | --- | --- |
| Enacted | 0.87 to 0.94 | yes, package carried 7:0 with 2 conditional | yes, BGBl. I Nr. 105/2024 |
| As drafted or modified | modified 0.41, as drafted 0.40 | modified, softer: retro entry, data use and costs weakened | modified: service desk merged, colon form dropped, 1450 added |
| Provisions | none | 2 of 7 match, 1 partly | |

The reference class gets the coarse outcome right. The simulator gets enactment and the modified class right but for the wrong reasons: it softens the obligations and the cost allocation that the real government kept, and it misses what parliament actually changed. One episode, one seed.

## Limits

One episode, one run. Topic measures and the per-provision coding of draft and law are ours, from the draft, the government bill, the enacted text and the parliamentary correspondence; the law column treats AA-410 as editorial. The topics are the draft's measures, so the sim negotiated the draft rather than predicting it. Positions are LLM-stated stances. FR-J14 applies: outcome plausibility for one case, not process realism.

## Files

- `runs/backtest-gtelg-2023-government.ndjson`, `.impact.json`, `.quality.md`, `.quality.json` (overall 97, 17 of 124 turns flagged)
- `runs/backtest-gtelg-2023-recall.json`
- `forecasting/data/fixtures/gtelg-2023.json`
- Cost: 1.87 USD for the run, 0.23 USD for the audit, under 0.01 USD for the probe.
