# Stellungnahmen counts

GP XXIII to XXVIII (2006-10 to 2026-11). Health MEs = `health_core` flag in `me_index.jsonl`.

## Per simulator agent

| Institution | SN all MEs | SN health MEs | health MEs | PDFs | texts (>=500 chars) | needs OCR |
|---|---:|---:|---:|---:|---:|---:|
| **bmsgpk** | 346 | 4 | 4 | 4 | 4 | 0 |
| **sv** | 589 | 131 | 111 | 0 | 0 | 0 |
| **aerztekammer** | 252 | 96 | 91 | 96 | 50 | 0 |
| **contract_physicians** | 17 | 15 | 6 | 14 | 12 | 2 |
| **elective_physicians** | 0 | 0 | 0 | 0 | 0 | 0 |
| **hospitals** | 148 | 114 | 54 | 16 | 0 | 0 |
| **nursing** | 96 | 79 | 37 | 79 | 69 | 4 |
| **patients** | 86 | 50 | 35 | 50 | 44 | 0 |
| **laender** | 9370 | 1026 | 167 | 0 | 0 | 0 |
| **bmf** | 963 | 91 | 91 | 91 | 91 | 0 |
| **other** | 9721 | 1331 | 167 | 0 | 0 | 0 |

## Per canonical institution (sorted by health-ME statements)

| Institution | SN all MEs | SN health MEs | health MEs | PDFs | texts (>=500 chars) | needs OCR |
|---|---:|---:|---:|---:|---:|---:|
| Land Tirol (`land_tirol`, laender) | 1676 | 168 | 165 | 0 | 0 | 0 |
| Land Niederösterreich (`land_noe`, laender) | 1709 | 165 | 163 | 0 | 0 | 0 |
| Land Vorarlberg (`land_vbg`, laender) | 1664 | 163 | 161 | 0 | 0 | 0 |
| Land Salzburg (`land_sbg`, laender) | 1474 | 155 | 150 | 0 | 0 | 0 |
| Arbeiterkammer (BAK und Länderkammern) (`ak`, other) | 1474 | 152 | 144 | 0 | 0 | 0 |
| Wirtschaftskammer (WKÖ und Landeskammern) (`wko`, other) | 1276 | 126 | 123 | 0 | 0 | 0 |
| Gesundheitsberufe (MTD-Austria, Hebammengremium, Physio Austria, Ergotherapie) (`mtd_hebammen`, other) | 171 | 126 | 41 | 0 | 0 | 0 |
| Land Wien (`land_wien`, laender) | 908 | 123 | 122 | 0 | 0 | 0 |
| Rechnungshof (`rechnungshof`, other) | 1265 | 118 | 118 | 0 | 0 | 0 |
| Hauptverband/Dachverband der Sozialversicherungsträger (`sv_dachverband`, sv) | 429 | 114 | 111 | 0 | 0 | 0 |
| Bundeskanzleramt-Verfassungsdienst (`bka_vd`, other) | 1087 | 113 | 111 | 0 | 0 | 0 |
| Freie Wohlfahrt (Caritas, Diakonie, Hilfswerk, Volkshilfe, Rotes Kreuz, Samariterbund) (`free_welfare`, other) | 433 | 96 | 44 | 0 | 0 | 0 |
| Landes-Spitalsträger (KAGes, KABEG, Tirol Kliniken, SALK, NÖ LGA, OÖG/gespag, KRAGES, KHBG, WIGEV) (`hospitals_land`, hospitals) | 124 | 95 | 51 | 14 | 0 | 0 |
| Österreichische Ärztekammer (`oeak`, aerztekammer) | 241 | 92 | 91 | 92 | 46 | 0 |
| Finanzministerium (BMF) (`bmf`, bmf) | 963 | 91 | 91 | 91 | 91 | 0 |
| Land Burgenland (`land_bgld`, laender) | 807 | 81 | 80 | 0 | 0 | 0 |
| Land Steiermark (`land_stmk`, laender) | 475 | 81 | 76 | 0 | 0 | 0 |
| Land Kärnten (`land_ktn`, laender) | 498 | 79 | 73 | 0 | 0 | 0 |
| Medizinische Universitäten (`meduni`, other) | 203 | 62 | 38 | 0 | 0 | 0 |
| Österreichischer Gewerkschaftsbund (`oegb`, other) | 702 | 56 | 54 | 0 | 0 | 0 |
| Datenschutzbehörde / Datenschutzrat (`datenschutz`, other) | 456 | 49 | 37 | 0 | 0 | 0 |
| Österreichischer Städtebund (`staedtebund`, other) | 407 | 48 | 48 | 0 | 0 | 0 |
| Österreichische Apothekerkammer (`apothekerkammer`, other) | 97 | 45 | 44 | 0 | 0 | 0 |
| Patientenanwaltschaften (ARGE und Länder) (`patients_pa`, patients) | 66 | 40 | 31 | 40 | 34 | 0 |
| Österreichischer Seniorenrat (`seniorenrat`, other) | 175 | 38 | 38 | 0 | 0 | 0 |
| Psychotherapie- und Psychologenverbände (ÖBVP, BÖP) (`psych_professions`, other) | 99 | 37 | 25 | 0 | 0 | 0 |
| Österreichischer Gemeindebund (`gemeindebund`, other) | 420 | 36 | 34 | 0 | 0 | 0 |
| Behindertenrat / ÖAR / KOBV (`disability`, other) | 243 | 34 | 28 | 0 | 0 | 0 |
| Österreichische Zahnärztekammer (`zahnaerztekammer`, other) | 58 | 32 | 31 | 0 | 0 | 0 |
| Österreichischer Gesundheits- und Krankenpflegeverband (ÖGKV) (`nursing_oegkv`, nursing) | 45 | 32 | 27 | 32 | 31 | 1 |
| Pflegeheim- und Sozialträgerverbände (Lebenswelt Heim, Sozialwirtschaft) (`care_providers`, other) | 88 | 32 | 26 | 0 | 0 | 0 |
| Sonstige Pflege-Berufsverbände (BKKÖ, Pflegekonferenz, Pflegedirektionen, Pflegewissenschaft) (`nursing_other`, nursing) | 34 | 31 | 12 | 31 | 27 | 3 |
| Industriellenvereinigung (`iv`, other) | 478 | 30 | 29 | 0 | 0 | 0 |
| Landwirtschaftskammer Österreich (`lwk`, other) | 373 | 27 | 27 | 0 | 0 | 0 |
| Gesundheit Österreich GmbH (`goeg`, other) | 33 | 25 | 23 | 0 | 0 | 0 |
| Pharmaindustrie (Pharmig, FOPI, Generikaverband) (`pharma_industry`, other) | 30 | 22 | 19 | 0 | 0 | 0 |
| Ordens- und Privatspitäler (konfessionelle Spitalserhalter, Privatkrankenanstalten) (`hospitals_other`, hospitals) | 24 | 19 | 16 | 2 | 0 | 0 |
| ÖGB-Fachgruppenvereinigung Gesundheits- und Sozialberufe (`nursing_union`, nursing) | 17 | 16 | 16 | 16 | 11 | 0 |
| Kassenärztliche Vertretungen (Bundeskurie niedergelassene Ärzte, Hausärzte, Allgemeinmedizin, PVE) (`contract_physicians`, contract_physicians) | 17 | 15 | 6 | 14 | 12 | 2 |
| Volksanwaltschaft (`volksanwaltschaft`, other) | 101 | 14 | 14 | 0 | 0 | 0 |
| Land Oberösterreich (`land_ooe`, laender) | 147 | 9 | 9 | 0 | 0 | 0 |
| Allgemeine Unfallversicherungsanstalt (`sv_auva`, sv) | 72 | 8 | 8 | 0 | 0 | 0 |
| Selbsthilfe-Dachverbände (`patients_selbsthilfe`, patients) | 8 | 8 | 8 | 8 | 8 | 0 |
| AGES (`ages`, other) | 13 | 7 | 7 | 0 | 0 | 0 |
| ÖGK und Gebiets-/Betriebskrankenkassen (`sv_oegk_gkk`, sv) | 44 | 6 | 2 | 0 | 0 | 0 |
| Gewerkschaften vida / younion / GPA (`union_health`, other) | 27 | 6 | 6 | 0 | 0 | 0 |
| Gesundheitsministerium (BMGFJ/BMG/BMGF/BMASGK/BMSGPK/BMASGPK) (`bmsgpk`, bmsgpk) | 346 | 4 | 4 | 4 | 4 | 0 |
| Landesärztekammern (`aek_land`, aerztekammer) | 11 | 4 | 3 | 4 | 4 | 0 |
| VertretungsNetz (Patientenanwaltschaft Psychiatrie) (`patients_vertretungsnetz`, patients) | 12 | 2 | 2 | 2 | 2 | 0 |
| Verbindungsstelle der Bundesländer (`laender_vst`, laender) | 12 | 2 | 2 | 0 | 0 | 0 |
| SVS / SVA der gewerblichen Wirtschaft / SVB (`sv_svs`, sv) | 9 | 1 | 1 | 0 | 0 | 0 |
| BVAEB / BVA / VAEB (`sv_bvaeb`, sv) | 12 | 1 | 1 | 0 | 0 | 0 |
| Pensionsversicherungsanstalt (`sv_pva`, sv) | 8 | 1 | 1 | 0 | 0 | 0 |
| Sonstige SV-Träger (VA Notariat, KFA) (`sv_other`, sv) | 15 | 0 | 0 | 0 | 0 | 0 |
| Verein für Konsumenteninformation (`vki`, other) | 12 | 0 | 0 | 0 | 0 | 0 |

Aliases with zero matches: `elective_physicians`
