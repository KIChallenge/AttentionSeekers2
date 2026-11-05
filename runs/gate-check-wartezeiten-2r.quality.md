# Quality report gate-check-wartezeiten-2r

Rubric debate-quality-rubric-v1. Judge: bedrock/eu.amazon.nova-pro-v1:0, azure/gpt-6-sol (cross-family: Azure GPT turns judged by Bedrock Nova, Bedrock turns judged by Azure GPT); temperature 0, reasoning none, seed 20261106 (Azure), fixed rubric, batches of up to 6 utterances per exchange. 9 calls, 0 failed, about 0.0487 USD (estimate from list prices).
Scores are 0 to 100 (100 = no problem). Flagged = a major issue, a dimension at or below 33, or overall below 80; minor issues alone do not flag.

Overall 96; 6 of 34 utterances flagged. Issues by dimension: grounding 15, responsiveness 6, relevanceExchange 5, register 4, relevanceMandate 2.
Gate: 27 turns gated, 1 regenerated, 0 accepted with a flag; 0 moderation decisions (none).

## By agent
| | n | gesamt | relevanceMandate | relevanceExchange | responsiveness | grounding | repetition | consistency | register | con | markiert |
|---|---|---|---|---|---|---|---|---|---|---|---|
| moderator (Moderation) | 5 | 98 | 100 | - | 100 | 92 | - | 100 | 100 | 100 | 0 |
| pf (Pflegevertretung) | 2 | 92 | 100 | - | 67 | 74 | 100 | 100 | 100 | 100 | 1 |
| gm (Gesundheitsministerium) | 2 | 100 | 100 | - | 100 | 100 | 100 | 100 | 100 | 100 | 0 |
| pv (Patientenvertretung) | 4 | 88 | 100 | 100 | 67 | 82 | 92 | 100 | 59 | 100 | 2 |
| ak (Ärztekammer) | 5 | 94 | 93 | 89 | 80 | 93 | 97 | 100 | 100 | 100 | 2 |
| bl (Bundesländer) | 2 | 93 | 84 | - | 67 | 100 | 100 | 100 | 100 | 100 | 1 |
| ka (Krankenanstalten) | 2 | 99 | 100 | - | 100 | 90 | 100 | 100 | 100 | 100 | 0 |
| fm (Finanzministerium) | 4 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 0 |
| va (Vertragsärzt:innen) | 4 | 98 | 100 | 100 | 100 | 85 | 100 | 100 | 100 | 100 | 0 |
| sv (Sozialversicherung) | 2 | 100 | 100 | - | 100 | 95 | 100 | 100 | 100 | 100 | 0 |
| expert (Experte) | 2 | 100 | 100 | - | 100 | 100 | - | 100 | 100 | 100 | 0 |

## By model
| | n | gesamt | relevanceMandate | relevanceExchange | responsiveness | grounding | repetition | consistency | register | con | markiert |
|---|---|---|---|---|---|---|---|---|---|---|---|
| azure/gpt-6-sol | 21 | 99 | 100 | 100 | 100 | 94 | 100 | 100 | 100 | 100 | 0 |
| bedrock/eu.amazon.nova-pro-v1:0 | 13 | 92 | 95 | 93 | 72 | 88 | 96 | 100 | 87 | 100 | 6 |

## By round
| | n | gesamt | relevanceMandate | relevanceExchange | responsiveness | grounding | repetition | consistency | register | con | markiert |
|---|---|---|---|---|---|---|---|---|---|---|---|
| R1 | 22 | 97 | 97 | 96 | 97 | 91 | 97 | 100 | 96 | 100 | 2 |
| R2 | 12 | 95 | 100 | - | 76 | 92 | 100 | 100 | 94 | 100 | 4 |

## By exchange
| | n | gesamt | relevanceMandate | relevanceExchange | responsiveness | grounding | repetition | consistency | register | con | markiert |
|---|---|---|---|---|---|---|---|---|---|---|---|
| x1-01 | 10 | 98 | 97 | - | 100 | 91 | 100 | 100 | 97 | 100 | 0 |
| x1-02 | 4 | 93 | 100 | 100 | 92 | 82 | 88 | 100 | 84 | 100 | 2 |
| x1-03 | 5 | 97 | 93 | 93 | 93 | 95 | 100 | 100 | 100 | 100 | 0 |
| x1-04 | 3 | 100 | 100 | - | 100 | 100 | - | 100 | 100 | 100 | 0 |
| x2-01 | 12 | 95 | 100 | - | 76 | 92 | 100 | 100 | 94 | 100 | 4 |

## Flagged utterances
- u1-12 Ärztekammer (eu.amazon.nova-pro-v1:0, overall 98): [grounding, major, deterministic] Vom Experten als widersprüchlich markiert: Die ärztliche Erstdiagnose ist unersetzlich.
- u1-13 Patientenvertretung (eu.amazon.nova-pro-v1:0, overall 87): [grounding, major, deterministic] Vom Experten als widersprüchlich markiert: Die Telemedizin soll als ergänzende Leistung etabliert werden. / [grounding, judge] Die Entlastung der Präsenztermine durch Telemedizin wird erneut ohne Beleg als Wirkung dargestellt. / [register, judge] Die direkte Anrede „euren Standpunkt“ passt nur eingeschränkt zur institutionellen Stimme.
- u2-02 Pflegevertretung (eu.amazon.nova-pro-v1:0, overall 83): [grounding, major, deterministic] Vom Experten als widersprüchlich markiert: Competence expansion in nursing / [relevanceExchange, judge] Die Zustimmung zu einem Maßnahmenpaket passt nicht zur Schlussrunde, in der keine Vorschläge zur Abstimmung stehen. / [responsiveness, major, judge] Der Beitrag stimmt einem Maßnahmenpaket zu, obwohl die Moderation ausdrücklich festhält: „Offene Vorschläge: keine“. / [grounding, major, judge] Die Behauptung, das Maßnahmenpaket reduziere Wartezeiten und halte den Budgetdeckel ein, ist nicht belegt; auch für die Kompetenzausweitung fehlt laut Expertenhinweis ein direkter Beleg.
- u2-04 Bundesländer (eu.amazon.nova-pro-v1:0, overall 90): [relevanceExchange, judge] Der Beitrag nennt Bedingungen und offene Fragen, ordnet sie aber nicht ausdrücklich als Ergebnis einer Schlussrunde ohne Beschlussvorlage ein. / [responsiveness, major, judge] Auf die Bitte um eine endgültige Stimme antwortet der Beitrag nur mit bedingter Unterstützung und Ablehnung einzelner Maßnahmen.
- u2-05 Ärztekammer (eu.amazon.nova-pro-v1:0, overall 89): [grounding, deterministic] Bezifferte Annahme ohne Beleg und ohne Kennzeichnung im Text: honorarkuerzungen / [relevanceExchange, judge] Der Beitrag behandelt die offenen Sachfragen, stellt aber nicht klar, dass kein Maßnahmenpaket zur Abstimmung steht. / [responsiveness, major, judge] Trotz der ausdrücklichen Bitte der Moderation gibt der Beitrag keine endgültige Stimme ab.
- u2-06 Patientenvertretung (eu.amazon.nova-pro-v1:0, overall 78): [grounding, deterministic] Zahl ohne Beleg und ohne Kennzeichnung als Annahme: 1.5, 2 / [relevanceExchange, judge] Die Zustimmung zur Terminservicestelle wird als Abstimmung über eine Einzelmaßnahme formuliert, obwohl keine Vorschläge zur Abstimmung stehen. / [responsiveness, major, judge] Der Beitrag gibt keine endgültige Stimme zum Ergebnis ab, sondern stimmt nur der Terminservicestelle zu. / [register, major, judge] Die Formulierung „Unsere Haltung zur Telemedizin als Erstkontakt bleibt bei 1,5, zur Schaffung zusätzlicher Kassenstellen bei 2“ verwendet interne Bewertungswerte statt einer institutionellen Position.
