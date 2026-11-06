# Backtest: SV-OG 2018 (Kassenfusion)

FR-H7. One historical episode, replayed with evidence cut off the day before the first draft, compared with the legislative record. One data point, not a validation.

## Setup

- Episode: Sozialversicherungs-Organisationsgesetz, ME 75/ME XXVI (first draft 2018-09-14), RV 329 d.B., BGBl I Nr. 100/2018, partial repeal by VfGH G 67-71/2019. Record: `forecasting/data/fixtures/sv-og-2018.json`, `research/data-sources.md` section 8.
- Template `backtest_svog_2018` (`packages/engine/config/templates.json`): neutral question of the time, seven topics taken from the government's announced key points (public before the cutoff, not the draft text), nine seats as of 2018: BMASGK (`gm`), BMF (`fm`), the ÖVP-FPÖ majority in the Nationalrat (`nr`), Hauptverband and Gebietskrankenkassen (`sv`, with an employer and an employee delegate), Arbeiterkammer, Wirtschaftskammer, Länder, Ärztekammer, Patientenanwaltschaften. 2018 profiles replace the 2026 ones; red lines and persona dossiers are off because they postdate the cutoff (`SV_PERSONA_MODE=profile`).
- As-of 2018-09-13. Checked in both records: 78 distinct sources were referenced, the latest dated 2018-08-14; all 975 passage dates shown in prompts are on or before the cutoff. Parametric memory is not cut, see the recall probe.
- Two variants, default seat plan (four families: gpt-6-sol for `gm fm nr abk wk`, moderator and Experte; Qwen3 for `sv ak`; GLM-5 for `bl`; Devstral 2 for `pv`), seed 20180913, five rounds:
  - `government`: veto players are `gm fm nr`, quorum a third of the table, so the government side can pass a package alone (the real 2018 setting).
  - `consensus`: the standard consensus rule (`--rule consensus`).
- Hypothesis stated in advance (papers-addendum Part II tension 1): the reform was adopted unilaterally, so a compromise-seeking simulator comes out softer than the law.

## Result

Neither variant passed a package (`max_rounds`, outcome `no_result`). The real government passed the draft unchanged in substance three months later. The hypothesis holds, more strongly than expected: even with the power to pass the reform alone, the simulated government seats never tabled it. All tabled proposals came from the Länder or the patient advocates and asked for more regional autonomy.

Per provision, stance on the drafted measure (-2 rejected, +2 as drafted). Simulated value: final-round median of the seats the rule needs (`gm fm nr` for `government`, all nine for `consensus`).

| Provision                                | Draft | Law 2018                     | After VfGH 2019          | Sim government | Sim consensus | Proposals (cited)             |
| ---------------------------------------- | ----- | ---------------------------- | ------------------------ | -------------- | ------------- | ----------------------------- |
| 21 carriers to at most five              | +2    | +2                           | +2                       | 1.75           | 1.0           | none                          |
| Nine GKK into one national fund          | +2    | +2                           | +2                       | 2.0            | 0.75          | regional-office variants only |
| Employer/employee parity                 | +2    | +2                           | +2 (upheld)              | 0.75           | 0.5           | 1 (uncited), rejected 2:7     |
| Smaller bodies, Dachverband, supervision | +2    | +2                           | +1 (fitness test struck) | 1.25           | 0.25          | none                          |
| Contribution audit to tax administration | +2    | +2                           | -2 (struck)              | 1.25           | 0.5           | none                          |
| One billion savings claim                | +2    | +2 (RH 2022: not achievable) | +2                       | 0.0            | 0.5           | none                          |
| Central budget, limited regional offices | +2    | +2                           | +2                       | 1.0            | 1.5           | 7 (2 cited), none adopted     |

Every simulated value except the fund merger under the government rule lies below the law. The consensus rule is softer than the government rule on five of seven provisions. The softest points (savings claim, parity) are not the ones the court struck; the overlap with the court on the audit and the governing bodies is weak evidence at best.

Preference attainment per institution: mean over topics of |ideal - draft| - |ideal - outcome|, ideal = the institution's own round-1 stance. Positive means the outcome moved towards it relative to the draft.

| Institution             | Opening mean | Law 2018 | After VfGH | Sim government | Sim consensus |
| ----------------------- | ------------ | -------- | ---------- | -------------- | ------------- |
| Arbeiterkammer          | -1.29        | 0        | +0.43      | +0.89          | +1.29         |
| Ärztekammer             | -0.21        | 0        | +0.14      | +0.68          | +1.14         |
| Länder                  | -0.43        | 0        | +0.14      | +0.68          | +1.14         |
| Hauptverband/GKK        | -0.21        | 0        | +0.71      | +0.04          | +1.14         |
| Patientenanwaltschaften | +0.50        | 0        | 0.00       | +0.46          | +0.86         |
| Wirtschaftskammer       | +0.14        | 0        | +0.14      | +0.46          | +0.64         |
| BMF                     | +0.89        | 0        | -0.43      | +0.54          | +0.57         |
| BMASGK                  | +1.21        | 0        | -0.14      | +0.61          | +0.29         |
| NR majority             | +1.07        | 0        | -0.14      | +0.82          | 0.00          |

Opening means are from the `government` run. In reality nobody gained against the draft until the court, which helped the SV side and AK and cost the finance ministry. In the simulation everyone "gains", because the government seats themselves open well below their own draft (BMASGK at +1.21, not +2): the models do not play a government determined to legislate over the table. That is the main miss.

Cited versus uncited: 7 proposals across both runs, 2 cited a Stellungnahme or press passage, none was adopted, so a cited-versus-uncited hit rate cannot be computed from these runs.

## Recall probe

`pnpm --filter @sv/engine recall`, no context, three samples per family, keyword grading (`runs/backtest-svog-2018-recall.json`).

| Family     | Seats                               | Outcome detail (ÖGK or VfGH)                                              |
| ---------- | ----------------------------------- | ------------------------------------------------------------------------- |
| gpt-6-sol  | gm fm nr abk wk, moderator, Experte | 3 of 3, names the five carriers, ÖGK and the VfGH repeal                  |
| GLM-5      | bl                                  | 1 of 3; an earlier ad hoc sample confabulated a 2023 watered-down version |
| Qwen3 235B | sv ak                               | 0 of 3                                                                    |
| Devstral 2 | pv                                  | 0 of 3 (answers partly degenerate)                                        |

The government seats run on the contaminated family and still did not reproduce the outcome, so contamination did not produce a hit here. A future hit with these seats would be weak evidence; Qwen3 is the cleanest family for a replay.

## Limits

One episode, one seed per variant. Topic measures and the per-provision coding of the law are ours, from the record summary; the law column treats the RV as unchanged in substance. Positions are LLM-stated stances, not measured ones. FR-J14 applies: this measures outcome plausibility for one case, not process realism.

## Files

- `runs/backtest-svog-2018-government.ndjson`, `.quality.md`, `.quality.json` (overall 96, 18 of 115 turns flagged)
- `runs/backtest-svog-2018-consensus.ndjson`, `.quality.md`, `.quality.json` (overall 97, 20 of 113 turns flagged)
- `runs/backtest-svog-2018-recall.json`
- Cost: 3.34 USD for both runs, 0.36 USD for the audits, 0.02 USD for the probe.
