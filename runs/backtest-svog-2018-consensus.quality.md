# Quality report backtest-svog-2018-consensus

Rubric debate-quality-rubric-v1. Judge: bedrock/zai.glm-5, azure/gpt-6-sol (cross-family: Azure GPT turns judged by Bedrock Nova, Bedrock turns judged by Azure GPT); temperature 0, reasoning none, seed 20261106 (Azure), fixed rubric, batches of up to 6 utterances per exchange. 36 calls, 0 failed, about 0.1733 USD (estimate from list prices).
Scores are 0 to 100 (100 = no problem). Flagged = a major issue, a dimension at or below 33, or overall below 80; minor issues alone do not flag.

Overall 97; 20 of 113 utterances flagged. Issues by dimension: grounding 34, responsiveness 26, register 15, relevanceExchange 5, consistency 3.
Gate: 87 turns gated, 0 regenerated, 0 accepted with a flag; 0 moderation decisions (none).

## By agent
| | n | gesamt | relevanceMandate | relevanceExchange | responsiveness | grounding | repetition | consistency | register | con | markiert |
|---|---|---|---|---|---|---|---|---|---|---|---|
| moderator (Moderation) | 21 | 99 | 100 | 100 | 100 | 97 | - | 100 | 100 | 100 | 0 |
| sv (Sozialversicherung) | 12 | 96 | 100 | 100 | 95 | 92 | 100 | 97 | 89 | 100 | 2 |
| wk (Wirtschaftskammer) | 7 | 97 | 100 | 100 | 81 | 98 | 100 | 100 | 100 | 100 | 1 |
| bl (Bundesländer) | 6 | 93 | 100 | 100 | 89 | 81 | 100 | 100 | 72 | 100 | 4 |
| fm (Finanzministerium) | 10 | 98 | 100 | 95 | 90 | 98 | 100 | 100 | 100 | 100 | 1 |
| pv (Patientenvertretung) | 12 | 94 | 100 | 96 | 81 | 90 | 100 | 94 | 89 | 100 | 3 |
| abk (Arbeiterkammer) | 7 | 100 | 100 | 100 | 100 | 98 | 100 | 100 | 100 | 100 | 0 |
| nr (Gesetzgeber (Nationalratsmehrheit)) | 5 | 98 | 100 | 100 | 93 | 93 | 100 | 100 | 100 | 100 | 0 |
| ak (Ärztekammer) | 12 | 95 | 100 | 100 | 86 | 93 | 100 | 97 | 86 | 100 | 2 |
| gm (Gesundheitsministerium) | 16 | 95 | 100 | 97 | 63 | 98 | 100 | 100 | 100 | 100 | 6 |
| expert (Experte) | 5 | 97 | 100 | 100 | 80 | 100 | - | 100 | 100 | 100 | 1 |

## By model
| | n | gesamt | relevanceMandate | relevanceExchange | responsiveness | grounding | repetition | consistency | register | con | markiert |
|---|---|---|---|---|---|---|---|---|---|---|---|
| azure/gpt-6-sol | 73 | 98 | 100 | 98 | 86 | 98 | 100 | 100 | 100 | 100 | 9 |
| bedrock/qwen.qwen3-235b-a22b-2507-v1:0 | 24 | 96 | 100 | 100 | 90 | 92 | 100 | 97 | 88 | 100 | 4 |
| bedrock/zai.glm-5 | 6 | 93 | 100 | 100 | 89 | 81 | 100 | 100 | 72 | 100 | 4 |
| bedrock/mistral.devstral-2-123b | 10 | 93 | 100 | 96 | 77 | 88 | 100 | 93 | 87 | 100 | 3 |

## By round
| | n | gesamt | relevanceMandate | relevanceExchange | responsiveness | grounding | repetition | consistency | register | con | markiert |
|---|---|---|---|---|---|---|---|---|---|---|---|
| R1 | 22 | 98 | 100 | 96 | 90 | 96 | 100 | 100 | 95 | 100 | 2 |
| R2 | 28 | 96 | 100 | 100 | 81 | 96 | 100 | 100 | 93 | 100 | 7 |
| R3 | 25 | 95 | 100 | 97 | 81 | 92 | 100 | 97 | 92 | 100 | 5 |
| R4 | 26 | 98 | 100 | 100 | 91 | 96 | 100 | 97 | 97 | 100 | 3 |
| R5 | 12 | 97 | 100 | - | 91 | 92 | 100 | 100 | 97 | 100 | 3 |

## By exchange
| | n | gesamt | relevanceMandate | relevanceExchange | responsiveness | grounding | repetition | consistency | register | con | markiert |
|---|---|---|---|---|---|---|---|---|---|---|---|
| x1-01 | 10 | 99 | 100 | - | 100 | 96 | 100 | 100 | 100 | 100 | 0 |
| x1-02 | 4 | 98 | 100 | 100 | 92 | 94 | 100 | 100 | 100 | 100 | 0 |
| x1-03 | 4 | 90 | 100 | 92 | 59 | 96 | 100 | 100 | 75 | 100 | 2 |
| x1-04 | 4 | 100 | 100 | - | 100 | 100 | - | 100 | 100 | 100 | 0 |
| x2-01 | 1 | 98 | 100 | - | 100 | 90 | - | 100 | 100 | 100 | 0 |
| x2-02 | 4 | 93 | 100 | 100 | 58 | 98 | 100 | 100 | 84 | 100 | 2 |
| x2-03 | 4 | 97 | 100 | 100 | 75 | 100 | 100 | 100 | 100 | 100 | 1 |
| x2-04 | 2 | 94 | 100 | 100 | 50 | 100 | 100 | 100 | 100 | 100 | 1 |
| x2-05 | 3 | 95 | 100 | 100 | 78 | 83 | 100 | 100 | 100 | 100 | 1 |
| x2-06 | 14 | 97 | 100 | - | 95 | 96 | 100 | 100 | 90 | 100 | 2 |
| x3-01 | 1 | 96 | 100 | - | 100 | 75 | - | 100 | 100 | 100 | 0 |
| x3-02 | 4 | 94 | 100 | 100 | 75 | 100 | 100 | 92 | 84 | 100 | 1 |
| x3-03 | 4 | 90 | 100 | 100 | 58 | 92 | 100 | 92 | 75 | 100 | 2 |
| x3-04 | 2 | 90 | 100 | 67 | 50 | 100 | 100 | 100 | 100 | 100 | 1 |
| x3-05 | 14 | 98 | 100 | 100 | 92 | 90 | 100 | 100 | 98 | 100 | 1 |
| x4-01 | 1 | 97 | 100 | - | 100 | 80 | - | 100 | 100 | 100 | 0 |
| x4-02 | 4 | 97 | 100 | 100 | 75 | 100 | 100 | 100 | 100 | 100 | 1 |
| x4-03 | 4 | 93 | 100 | 100 | 84 | 87 | 100 | 83 | 92 | 100 | 1 |
| x4-04 | 3 | 97 | 100 | 100 | 78 | 100 | 100 | 100 | 100 | 100 | 1 |
| x4-05 | 14 | 99 | 100 | 100 | 100 | 98 | 100 | 100 | 98 | 100 | 0 |
| x5-01 | 12 | 97 | 100 | - | 91 | 92 | 100 | 100 | 97 | 100 | 3 |

## Flagged utterances
- u1-15 Patientenvertretung (mistral.devstral-2-123b, overall 81): [relevanceExchange, judge] Der Beitrag behandelt zentrale Steuerung, aber nicht die konkrete Zuständigkeit der Landesstellen. / [responsiveness, major, judge] Auf die angesprochene regionale Flexibilität der Gesamtverträge und die Ablehnung einheitlicher Honorare geht der Beitrag nicht ein. / [grounding, judge] Die Verweise auf „E1 und E4“ sind ohne Erläuterung nicht nachvollziehbar. / [register, judge] Die internen Belegkennungen „E1 und E4“ passen nicht zu einem institutionellen Redebeitrag.
- u1-18 Ärztekammer (qwen.qwen3-235b-a22b-2507-v1:0, overall 88): [responsiveness, judge] Der Beitrag bekräftigt regionale Vertragshoheit, ohne auf die geforderten Regeln zu Datenschutz und Informationspflichten einzugehen. / [register, major, judge] Das fremdsprachige Zeichen in „Steuerung危险 der flächendeckenden Versorgung“ macht den Satz sprachlich fehlerhaft.
- u2-02 Gesundheitsministerium (gpt-6-sol, overall 87): [grounding, deterministic] Bezifferte Annahme ohne Beleg und ohne Kennzeichnung im Text: Die Verhandlungsfrage betrifft die Zusammenführung von neun Gebietskrankenkassen. / [responsiveness, major, judge] Der Beitrag antwortet auf u1-18 (Patientenvertretung), thematisiert aber die Ärztekammer und deren Bedenken zur Budgetsteuerung, ohne auf den Inhalt von u1-18 einzugehen.
- u2-04 Gesundheitsministerium (gpt-6-sol, overall 92): [responsiveness, major, judge] Der Beitrag gibt die Aussage von u2-03 falsch wieder: Die Ärztekammer hatte sich gegen Honorarvereinheitlichung ausgesprochen, nicht über „einheitliche Honorare“ geklagt, und das Gesundheitsministerium übernimmt diese Formulierung unkritisch.
- u2-06 Wirtschaftskammer (gpt-6-sol, overall 88): [responsiveness, major, judge] Der Beitrag antwortet nicht auf u1-07, sondern eröffnet ein neues Thema; die inhaltliche Verbindung zum angeblichen Vorgängerbeitrag fehlt vollständig.
- u2-10 Gesundheitsministerium (gpt-6-sol, overall 88): [responsiveness, major, judge] Der Beitrag antwortet auf die Arbeiterkammer (u2-09), thematisiert aber ausschließlich die Abstimmung mit dem Finanzministerium und geht auf das Argument der Arbeiterkammer zur Mitentscheidung der Dienstgeber nicht ein.
- u2-12 Bundesländer (zai.glm-5, overall 90): [responsiveness, major, judge] Der Beitrag geht nicht auf das Argument zur Mitentscheidung der Dienstgeber und zur Parität ein, auf das er laut Gesprächsverlauf antwortet. / [grounding, judge] Die Möglichkeit regionaler Zu- und Abschläge wird als konkrete Vertragsgestaltung vorgeschlagen, ohne ihre rechtliche Grundlage zu erläutern.
- u2-21 Bundesländer (zai.glm-5, overall 88): [grounding, judge] Die mögliche Mehrheitsfähigkeit wird aus den Gesprächen abgeleitet, obwohl noch kein mehrheitsfähiger Vorschlag festgestellt wurde. / [register, major, judge] Das Wort „预算sspielräume“ enthält chinesische Schriftzeichen und verletzt das geforderte deutsche Register.
- u2-24 Sozialversicherung (qwen.qwen3-235b-a22b-2507-v1:0, overall 83): [relevanceExchange, judge] Der Beitrag nimmt zum eingebrachten Vorschlag der Bundesländer nicht ausdrücklich Stellung. / [responsiveness, judge] Die Moderation bittet um eine Stimme zu offenen Vorschlägen, doch der Beitrag gibt keine ausdrückliche Stimme ab. / [grounding, judge] Die Ablehnung der vollständigen Fusion wird mit „E1 und E2“ begründet, ohne deren Inhalt im Beitrag darzulegen. / [register, major, judge] „E1 und E2“ sind interne Kennungen und gehören nicht in einen institutionellen Redebeitrag.
- u3-02 Gesundheitsministerium (gpt-6-sol, overall 92): [responsiveness, major, judge] Der Beitrag ignoriert den Inhalt von u2-24 (Ablehnung der vollständigen Fusion mit Forderung nach regionaler Kompetenz) und antwortet mit einem Zustimmungsangebot, ohne auf das konkrete Argument einzugehen.
- u3-06 Patientenvertretung (mistral.devstral-2-123b, overall 85): [responsiveness, major, judge] Der Beitrag geht nicht auf die Forderung nach regionalen Gesamtverträgen und die Ablehnung einheitlicher Honorare ein. / [grounding, judge] Die Aussage, nur gestärkte regionale Kompetenzen könnten gleiche Leistungen unabhängig vom Wohnort gewährleisten, ist nicht belegt. / [register, judge] „Klarzustimmung“ ist als Bezeichnung einer Kompetenz unklar.
- u3-09 Ärztekammer (qwen.qwen3-235b-a22b-2507-v1:0, overall 83): [responsiveness, major, judge] Auf die geforderte verbindliche Zustimmungskompetenz antwortet der Beitrag nur mit einer beratenden Rolle und erklärt nicht, wie der Widerspruch aufgelöst werden soll. / [consistency, judge] Der nun geforderte bundeseinheitliche Gesamtvertrag steht in Spannung zur zuvor verlangten Sicherung regionaler Gesamtverträge, ohne dass der Wechsel erläutert wird. / [register, judge] „Kassenstellen-Stellenplan“ ist eine unnötig doppelte und unklare Formulierung.
- u3-10 Gesundheitsministerium (gpt-6-sol, overall 83): [relevanceExchange, judge] Der Beitrag thematisiert die Abstimmung mit dem Finanzministerium statt das eigentliche Thema Kassenfusion, das nur am Rande behandelt wird. / [responsiveness, major, judge] Der Beitrag antwortet auf die Ärztekammer (u3-09), thematisiert aber die Abstimmung mit dem Finanzministerium und greift das Argument der Ärztekammer nicht auf.
- u3-14 Bundesländer (zai.glm-5, overall 92): [grounding, major, judge] Die Zuständigkeit für Zu- und Abschläge wird mit „wie in E1 dargelegt“ als belegt dargestellt, obwohl sie nicht bestätigt ist; auch der Verbleib der Mittel im jeweiligen Bundesland wird ohne Beleg behauptet. / [register, judge] „E1“ ist eine interne Kennung und gehört nicht in einen institutionellen Redebeitrag.
- u4-02 Finanzministerium (gpt-6-sol, overall 88): [responsiveness, major, judge] Der Beitrag antwortet auf u3-17 (Thema bundesweite Kasse, Landesstellen, Parität), thematisiert aber ausschließlich die Beitragsprüfung und Budgetspielräume der Landesstellen, ohne auf die Argumente der Voräußerung einzugehen.
- u4-09 Patientenvertretung (mistral.devstral-2-123b, overall 77): [grounding, deterministic] Zahl ohne Beleg und ohne Kennzeichnung als Annahme: 90 / [grounding, deterministic] Bezifferte Annahme ohne Beleg und ohne Kennzeichnung im Text: Der Finanzrahmen für die primäre Versorgung soll mindestens 90 % des Vorjahresdeckels betragen. / [responsiveness, judge] Der Beitrag geht nicht darauf ein, dass das Ministerium Verwaltungseinsparungen getrennt von den Versorgungsbudgets ausweisen will. / [grounding, major, judge] Für die Grenze von „90 % des Vorjahresdeckels“ wird weder eine Grundlage genannt noch die Zahl ausdrücklich als Annahme gekennzeichnet. / [consistency, major, judge] Das für Verwaltungseinsparungen vorgesehene „letzte Zehntel“ widerspricht der zuvor geforderten Unabhängigkeit der Versorgungsbudgets von diesen Einsparungen, ohne den Kurswechsel zu erklären. / [register, judge] „Wir supporten“ ist eine englisch geprägte Formulierung und passt nicht zur geforderten sachlichen deutschen Institutionssprache.
- u4-10 Gesundheitsministerium (gpt-6-sol, overall 92): [responsiveness, major, judge] Der Beitrag antwortet auf u4-05 (Sozialversicherung), thematisiert aber nicht deren Bedingung zur Umschichtung im Verwaltungsbudget und Einbindung der Selbstverwaltung, sondern präsentiert einen neuen Vorschlag ohne Bezug auf die geäußerten Anliegen.
- u5-02 Bundesländer (zai.glm-5, overall 91): [grounding, major, judge] Die verbindlichen Budgetspielräume und die Zuständigkeit der Landesstellen für die Versorgungsplanung werden als gesichert dargestellt, obwohl die Angaben dazu nicht bestätigt sind. / [register, judge] Die Formulierung „wie wir in E1 dargelegt haben“ verwendet eine interne Kennung.
- u5-10 Sozialversicherung (qwen.qwen3-235b-a22b-2507-v1:0, overall 95): [grounding, major, judge] Der Beitrag stellt die Parität als gesichert und die Deckung der Fusionskosten ohne Beiträge als geklärt dar, obwohl Selbstverwaltung und Finanzierung laut Gesprächsverlauf offen bleiben.
- u5-11 Experte (gpt-6-sol, overall 83): [responsiveness, major, judge] Der Experte antwortet auf u5-02 mit einem reinen Prüfungsstatistik-Statement, ohne auf die inhaltlichen Aussagen der Bundesländer einzugehen oder die drei nicht bestätigten Aussagen zu benennen.
