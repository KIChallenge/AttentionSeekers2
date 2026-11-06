# Legal sources (FR-P6)

Status: 2026-11-06. The brief names "Gesetzliche Grundlagen: SOZDOK" as a data source. This
page says what is imported, from where, and how the engine uses it.

## SOZDOK and RIS

SOZDOK (sozdok.at, Dachverband der Sozialversicherungsträger) is a JSF web application with
quick and expert search, a user login and no documented interface: no API path, no OGD dataset,
no bulk export (checked 2026-11-06). Scraping a stateful JSF UI is neither polite nor stable.

The Rechtsinformationssystem des Bundes (RIS) is the authoritative public source for the same
consolidated federal texts (ASVG and the other SV laws, the Art. 15a agreements as published in
the BGBl.). Its OGD API v2.6 (`https://data.bka.gv.at/ris/api/v2.6/Bundesrecht`,
`Applikation=BrKons`) is keyless JSON with document XML, licence CC BY 4.0
("Quelle: RIS, Bundeskanzleramt"); the law texts themselves are free official works (§ 7 UrhG).
SOZDOK-only material (Satzungen, Richtlinien, Verlautbarungen of the SV) is not covered.

## What was imported

`pnpm --filter @sv/db legal:fetch` (packages/db/scripts/fetch-ris.ts) queries every target
twice: once with `Fassung.FassungVom` = today for the version in force, once without for the
version history. One request every 2 s (RIS OGD FAQ: at most 0.5 per second, no parallel
requests), responses cached under `data/cache/ris`. Targets: packages/db/src/legal/targets.ts.

| Key    | Law                                                                                                       | RIS Gesetzesnummer | Provisions                                                                                                                                                                                                              |
| ------ | --------------------------------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ASVG   | Allgemeines Sozialversicherungsgesetz                                                                     | 10008147           | 39: § 131, 131a, 131b (Wahlarzt-Kostenerstattung), §§ 338 to 351a (Vertragspartnerrecht: Gesamtvertrag, Stellenplan, Einzelvertrag, Schiedskommissionen, Zahnärzte, Apotheken); §§ 351b ff. (Erstattungskodex) left out |
| PrimVG | Primärversorgungsgesetz                                                                                   | 20009948           | 18: §§ 1 to 17 with § 14a                                                                                                                                                                                               |
| G-ZG   | Gesundheits-Zielsteuerungsgesetz                                                                          | 20009791           | 44: §§ 1 to 42 with § 9a, § 24a                                                                                                                                                                                         |
| 15a-ZG | Vereinbarung gemäß Art. 15a B-VG Zielsteuerung-Gesundheit (BGBl. I Nr. 1/2025)                            | 20012820           | 31 articles                                                                                                                                                                                                             |
| 15a-OF | Vereinbarung gemäß Art. 15a B-VG Organisation und Finanzierung des Gesundheitswesens (BGBl. I Nr. 2/2025) | 20012819           | 57 articles                                                                                                                                                                                                             |
| ÄrzteG | Ärztegesetz 1998                                                                                          | 10011138           | 4: § 49 (Delegation), § 52a, § 52b (Gruppenpraxen), § 84 (Kurienversammlungen)                                                                                                                                          |
| GuKG   | Gesundheits- und Krankenpflegegesetz                                                                      | 10011026           | 10: §§ 12 to 16 with 14a, 15a, 15b (Kompetenzen, Verordnung von Medizinprodukten und Arzneimitteln), § 83, § 83a                                                                                                        |

In total 203 provisions, 764 Absatz segments, as of 2026-11-06.

## Shape in the database

- One `sources` row per provision, kind `law`, id `law-<law>-<provision>` (`law-asvg-342`,
  `law-15a-of-art-14`, `law-aerzteg-49`), title `ASVG § 342`, `legal_ref` with the promulgation
  (`§ 342 ASVG, BGBl. Nr. 189/1955 zuletzt geändert durch BGBl. I Nr. 191/2023`), `url` = the
  ELI link on ris.bka.gv.at, `date` = Inkrafttretensdatum of the stored version. The jsonb
  carries `law`: heading, RIS document id, validity, last amending act, the version history
  (`versions[]`) and the retrieval date.
- One `segments` row per Absatz (`law-asvg-342#1a`), list items joined to their Absatz,
  offsets into the normalised text (FR-P7). En and em dashes in RIS texts are stored as hyphens.
- Imported with `pnpm db:import --only-law` (data/derived/law_sources.jsonl and
  law_segments.jsonl), embedded with `SV_EMBED_REGIONS=eu-north-1,eu-central-1,eu-west-1,eu-west-3 pnpm db:embed`.

As-of rule: a provision is visible to an agent when its stored version entered into force on or
before the run's as-of date (the same `date <= asOf` predicate as every other source).
`versionAsOf()` in packages/db/src/legal/ris.ts picks the version in force on a date from the
history: start on or before the date, end absent or on or after it, latest start wins.

## Engine

- Retrieval (packages/engine/src/legal/retrieval.ts): a small law branch (top 6 by German
  full text) enters the reciprocal rank fusion as its own list, so a few hundred Absätze are not
  drowned by the press corpus. Statutes in force keep recency weight 1.
- Guardrail (packages/engine/src/legal/guardrail.ts, rules.ts): a deterministic rule table maps
  a proposal's title, components and financing to the provisions it touches and says whether it
  needs a change of the law. The runner emits one Experte note per new proposal, for example
  `p3 "Wahlarzt-Kostenerstattung abschaffen": Rechtsgrundlage: ASVG § 131 Abs. 1; erfordert Änderung ASVG § 131.`
  Every ref in the rule table must exist in the imported corpus (test/legal.test.ts).
  It is a screening aid, not legal advice.
- UI: a small badge on each proposal in the analysis and outcome pages ("erfordert Änderung
  ASVG § 131" in the warning accent, otherwise a quiet "Rechtsgrundlage ASVG § 342"), linking to
  the provision's archive page. The archive has a "Rechtsgrundlage" tab (`/archive?kind=law`);
  a law source page shows the heading, Absatz labels, validity, the RIS version history and a
  link to the RIS original.
