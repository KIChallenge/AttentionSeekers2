# Quality report ensemble-wartezeiten-gpt

Rubric debate-quality-rubric-v1. Judge: bedrock/zai.glm-5 (cross-family: Azure GPT turns judged by Bedrock Nova, Bedrock turns judged by Azure GPT); temperature 0, reasoning none, seed 20261106 (Azure), fixed rubric, batches of up to 6 utterances per exchange. 30 calls, 0 failed, about 0.1496 USD (estimate from list prices).
Scores are 0 to 100 (100 = no problem). Flagged = a major issue, a dimension at or below 33, or overall below 80; minor issues alone do not flag.

Overall 98; 9 of 124 utterances flagged. Issues by dimension: grounding 59, responsiveness 16.
Gate: 98 turns gated, 0 regenerated, 0 accepted with a flag; 0 moderation decisions (none).

## By agent
| | n | gesamt | relevanceMandate | relevanceExchange | responsiveness | grounding | repetition | consistency | register | con | markiert |
|---|---|---|---|---|---|---|---|---|---|---|---|
| moderator (Moderation) | 21 | 100 | 100 | 100 | 98 | 100 | - | 100 | 100 | 100 | 0 |
| ka (Krankenanstalten) | 7 | 97 | 100 | 100 | 81 | 94 | 100 | 100 | 100 | 100 | 1 |
| fm (Finanzministerium) | 15 | 97 | 100 | 100 | 87 | 90 | 100 | 100 | 100 | 100 | 4 |
| gm (Gesundheitsministerium) | 8 | 97 | 100 | 100 | 96 | 80 | 100 | 100 | 100 | 100 | 1 |
| bl (Bundesländer) | 11 | 98 | 100 | 100 | 94 | 88 | 100 | 100 | 100 | 100 | 0 |
| ak (Ärztekammer) | 13 | 99 | 100 | 100 | 100 | 93 | 100 | 100 | 100 | 100 | 0 |
| va (Vertragsärzt:innen) | 10 | 99 | 100 | 100 | 97 | 97 | 100 | 100 | 100 | 100 | 0 |
| pv (Patientenvertretung) | 16 | 97 | 100 | 100 | 85 | 90 | 100 | 100 | 100 | 100 | 3 |
| sv (Sozialversicherung) | 12 | 98 | 100 | 100 | 92 | 90 | 100 | 100 | 100 | 100 | 0 |
| pf (Pflegevertretung) | 6 | 98 | 100 | 100 | 95 | 87 | 100 | 100 | 100 | 100 | 0 |
| expert (Experte) | 5 | 100 | 100 | 100 | 100 | 100 | - | 100 | 100 | 100 | 0 |

## By model
| | n | gesamt | relevanceMandate | relevanceExchange | responsiveness | grounding | repetition | consistency | register | con | markiert |
|---|---|---|---|---|---|---|---|---|---|---|---|
| azure/gpt-6-sol | 124 | 98 | 100 | 100 | 93 | 92 | 100 | 100 | 100 | 100 | 9 |

## By round
| | n | gesamt | relevanceMandate | relevanceExchange | responsiveness | grounding | repetition | consistency | register | con | markiert |
|---|---|---|---|---|---|---|---|---|---|---|---|
| R1 | 23 | 100 | 100 | 100 | 100 | 98 | 100 | 100 | 100 | 100 | 0 |
| R2 | 32 | 98 | 100 | 100 | 84 | 96 | 100 | 100 | 100 | 100 | 4 |
| R3 | 30 | 98 | 100 | 100 | 94 | 88 | 100 | 100 | 100 | 100 | 5 |
| R4 | 27 | 98 | 100 | 100 | 95 | 89 | 100 | 100 | 100 | 100 | 0 |
| R5 | 12 | 98 | 100 | - | 94 | 89 | 100 | 100 | 100 | 100 | 0 |

## By exchange
| | n | gesamt | relevanceMandate | relevanceExchange | responsiveness | grounding | repetition | consistency | register | con | markiert |
|---|---|---|---|---|---|---|---|---|---|---|---|
| x1-01 | 10 | 100 | 100 | - | 100 | 98 | 100 | 100 | 100 | 100 | 0 |
| x1-02 | 5 | 100 | 100 | 100 | 100 | 96 | 100 | 100 | 100 | 100 | 0 |
| x1-03 | 5 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 0 |
| x1-04 | 3 | 100 | 100 | - | 100 | 100 | - | 100 | 100 | 100 | 0 |
| x2-01 | 1 | 100 | 100 | - | 100 | 100 | - | 100 | 100 | 100 | 0 |
| x2-02 | 6 | 98 | 100 | 100 | 83 | 100 | 100 | 100 | 100 | 100 | 1 |
| x2-03 | 6 | 97 | 100 | 100 | 78 | 98 | 100 | 100 | 100 | 100 | 1 |
| x2-04 | 2 | 94 | 100 | 100 | 50 | 100 | 100 | 100 | 100 | 100 | 1 |
| x2-05 | 3 | 93 | 100 | 100 | 45 | 97 | 100 | 100 | 100 | 100 | 1 |
| x2-06 | 14 | 99 | 100 | - | 100 | 92 | 100 | 100 | 100 | 100 | 0 |
| x3-01 | 1 | 98 | 100 | - | 100 | 90 | - | 100 | 100 | 100 | 0 |
| x3-02 | 6 | 98 | 100 | 100 | 100 | 79 | 100 | 100 | 100 | 100 | 3 |
| x3-03 | 5 | 99 | 100 | 100 | 93 | 95 | 100 | 100 | 100 | 100 | 0 |
| x3-04 | 2 | 98 | 100 | 100 | 100 | 78 | 100 | 100 | 100 | 100 | 1 |
| x3-05 | 2 | 94 | 100 | 100 | 50 | 100 | 100 | 100 | 100 | 100 | 1 |
| x3-06 | 14 | 98 | 100 | 100 | 97 | 89 | 100 | 100 | 100 | 100 | 0 |
| x4-01 | 2 | 100 | 100 | - | 100 | 100 | - | 100 | 100 | 100 | 0 |
| x4-02 | 6 | 98 | 100 | 100 | 95 | 88 | 100 | 100 | 100 | 100 | 0 |
| x4-03 | 3 | 97 | 100 | 100 | 100 | 76 | 100 | 100 | 100 | 100 | 0 |
| x4-04 | 2 | 96 | 100 | 100 | 84 | 83 | 100 | 100 | 100 | 100 | 0 |
| x4-05 | 14 | 99 | 100 | 100 | 95 | 92 | 100 | 100 | 100 | 100 | 0 |
| x5-01 | 12 | 98 | 100 | - | 94 | 89 | 100 | 100 | 100 | 100 | 0 |

## Flagged utterances
- u2-02 Patientenvertretung (gpt-6-sol, overall 88): [responsiveness, major, judge] Der Beitrag antwortet auf u1-14 (Bundesländer/Ärztekammer), thematisiert aber ausschließlich die Terminzusage und ignoriert das dort behandelte Thema RSG und Stellenplanung vollständig.
- u2-08 Krankenanstalten (gpt-6-sol, overall 88): [responsiveness, major, judge] Der Beitrag antwortet auf u1-20 (Finanzministerium), thematisiert aber inhaltlich die Patientenvertretung und Terminzusage statt auf den dortigen Beitrag zu reagieren.
- u2-14 Patientenvertretung (gpt-6-sol, overall 88): [responsiveness, major, judge] Der Beitrag antwortet auf u2-13 (Finanzministerium), thematisiert aber ausschließlich die Terminzusage und die Kooperation mit dem Gesundheitsministerium, ohne auf die Äußerung des Finanzministeriums einzugehen.
- u2-16 Finanzministerium (gpt-6-sol, overall 88): [responsiveness, major, judge] Der Beitrag antwortet auf u2-12 (Krankenanstalten), thematisiert aber ausschließlich die Terminzusage und greift die dortigen Argumente zu Mangelregionen und Ambulanzfrequenzen nicht auf.
- u3-02 Patientenvertretung (gpt-6-sol, overall 95): [grounding, deterministic] Expertenhinweis: Die vorgeschlagene Obergrenze wird auf 120 Mio. EUR pro Jahr geschätzt. / Für die Erprobung wird ein jährlicher Höchstbetrag von 80 Mio. EUR vorgeschlagen.: 120 Mio. EUR als vorgeschlagene Obergrenze sind mit dem zuvor v / [grounding, major, judge] Die vorgeschlagene Obergrenze von 80 Mio. EUR widerspricht dem Expertenhinweis, der 120 Mio. EUR als geschätzte Obergrenze ausweist; der Unterschied wird nicht erklärt oder als Annahme gekennzeichnet.
- u3-04 Finanzministerium (gpt-6-sol, overall 95): [grounding, deterministic] Expertenhinweis: Die angebotene Erprobung ist auf höchstens 80 Mio. EUR jährlich begrenzt. / Geschätzte jährliche Maßnahmenkosten: 120 Mio. EUR.: Widersprüchliche Kostenangaben: 80 Mio. EUR vs. 120 Mio. EUR in früheren Aussagen. Mögliche / [grounding, major, judge] Die Angabe von höchstens 80 Mio. EUR jährlich widerspricht dem Expertenhinweis mit geschätzten 120 Mio. EUR; der Widerspruch wird nicht thematisiert oder begründet.
- u3-07 Finanzministerium (gpt-6-sol, overall 95): [grounding, deterministic] Expertenhinweis: Für die Erprobung wird ein Höchstbetrag von 80 Mio. EUR jährlich angeboten. / Geschätzte jährliche Kosten der ersten Staffel: 120 Mio. EUR.: Widersprüchliche Kostenangaben: 80 Mio. EUR vs. 120 Mio. EUR in früheren Aussag / [grounding, major, judge] Der Höchstbetrag von 80 Mio. EUR steht im Widerspruch zum Expertenhinweis mit 120 Mio. EUR; ohne Beleg oder Erläuterung bleibt die Zahl unplausibel.
- u3-14 Gesundheitsministerium (gpt-6-sol, overall 95): [grounding, deterministic] Expertenhinweis: Die vorgeschlagene Obergrenze wird auf 120 Mio. EUR pro Jahr geschätzt. / Für die Erprobung wird ein jährlicher Höchstbetrag von 80 Mio. EUR vorgeschlagen.: 120 Mio. EUR als vorgeschlagene Obergrenze sind mit dem zuvor v / [grounding, major, judge] Die genannte Obergrenze von 120 Mio. EUR pro Jahr widerspricht dem Expertenhinweis, der für die Erprobung einen Höchstbetrag von 80 Mio. EUR vorsieht; eine Begründung für die Abweichung fehlt.
- u3-15 Finanzministerium (gpt-6-sol, overall 88): [responsiveness, major, judge] Der Beitrag antwortet auf u3-12 (Ärztekammer), richtet sich aber an die Vertragsärzt:innen und thematisiert nicht die dortige Prüfung nach sechs Monaten, sondern einen eigenen Vorschlag zur Erprobung.
