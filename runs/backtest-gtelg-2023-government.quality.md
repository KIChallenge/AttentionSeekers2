# Quality report backtest-gtelg-2023-government

Rubric debate-quality-rubric-v1. Judge: bedrock/zai.glm-5, azure/gpt-6-sol (cross-family: Azure GPT turns judged by Bedrock Nova, Bedrock turns judged by Azure GPT); temperature 0, reasoning none, seed 20261106 (Azure), fixed rubric, batches of up to 6 utterances per exchange. 42 calls, 0 failed, about 0.2258 USD (estimate from list prices).
Scores are 0 to 100 (100 = no problem). Flagged = a major issue, a dimension at or below 33, or overall below 80; minor issues alone do not flag.

Overall 97; 17 of 124 utterances flagged. Issues by dimension: grounding 53, register 24, responsiveness 23, relevanceExchange 9, consistency 5.
Gate: 87 turns gated, 4 regenerated, 0 accepted with a flag; 4 moderation decisions (concrete_demand, concrete_demand, concrete_demand, concrete_demand).

## By agent
| | n | gesamt | relevanceMandate | relevanceExchange | responsiveness | grounding | repetition | consistency | register | con | markiert |
|---|---|---|---|---|---|---|---|---|---|---|---|
| moderator (Moderation) | 23 | 100 | 100 | 100 | 100 | 99 | - | 100 | 100 | 100 | 0 |
| fm (Finanzministerium) | 17 | 98 | 100 | 100 | 82 | 97 | 100 | 100 | 100 | 100 | 3 |
| abk (Arbeiterkammer) | 6 | 98 | 100 | 100 | 95 | 89 | 100 | 100 | 100 | 100 | 0 |
| gm (Gesundheitsministerium) | 11 | 99 | 100 | 95 | 91 | 100 | 100 | 100 | 100 | 100 | 1 |
| wk (Wirtschaftskammer) | 6 | 99 | 100 | 100 | 95 | 100 | 100 | 100 | 100 | 100 | 0 |
| sv (Sozialversicherung) | 11 | 94 | 100 | 100 | 88 | 85 | 100 | 100 | 82 | 100 | 2 |
| ak (Ärztekammer) | 12 | 94 | 100 | 100 | 86 | 88 | 100 | 100 | 81 | 100 | 2 |
| nr (Gesetzgeber (Nationalratsmehrheit)) | 6 | 99 | 100 | 100 | 95 | 100 | 100 | 100 | 100 | 100 | 0 |
| bl (Bundesländer) | 15 | 92 | 100 | 94 | 93 | 82 | 100 | 84 | 80 | 100 | 7 |
| pv (Patientenvertretung) | 12 | 93 | 100 | 84 | 89 | 88 | 100 | 100 | 81 | 100 | 2 |
| expert (Experte) | 5 | 99 | 100 | 100 | 93 | 100 | - | 100 | 100 | 100 | 0 |

## By model
| | n | gesamt | relevanceMandate | relevanceExchange | responsiveness | grounding | repetition | consistency | register | con | markiert |
|---|---|---|---|---|---|---|---|---|---|---|---|
| azure/gpt-6-sol | 75 | 99 | 100 | 99 | 92 | 98 | 100 | 100 | 100 | 100 | 4 |
| bedrock/qwen.qwen3-235b-a22b-2507-v1:0 | 23 | 94 | 100 | 100 | 87 | 87 | 100 | 100 | 81 | 100 | 4 |
| bedrock/zai.glm-5 | 15 | 92 | 100 | 94 | 93 | 82 | 100 | 84 | 80 | 100 | 7 |
| bedrock/mistral.devstral-2-123b | 11 | 92 | 100 | 84 | 88 | 86 | 99 | 100 | 79 | 100 | 2 |

## By round
| | n | gesamt | relevanceMandate | relevanceExchange | responsiveness | grounding | repetition | consistency | register | con | markiert |
|---|---|---|---|---|---|---|---|---|---|---|---|
| R1 | 22 | 98 | 100 | 100 | 95 | 97 | 100 | 97 | 99 | 100 | 2 |
| R2 | 25 | 97 | 100 | 93 | 88 | 95 | 100 | 99 | 97 | 100 | 2 |
| R3 | 28 | 95 | 100 | 96 | 90 | 87 | 100 | 95 | 88 | 100 | 6 |
| R4 | 26 | 96 | 100 | 97 | 88 | 92 | 100 | 100 | 89 | 100 | 5 |
| R5 | 23 | 97 | 100 | - | 95 | 94 | 100 | 100 | 90 | 100 | 2 |

## By exchange
| | n | gesamt | relevanceMandate | relevanceExchange | responsiveness | grounding | repetition | consistency | register | con | markiert |
|---|---|---|---|---|---|---|---|---|---|---|---|
| x1-01 | 10 | 99 | 100 | - | 100 | 97 | 100 | 100 | 97 | 100 | 0 |
| x1-02 | 4 | 94 | 100 | 100 | 75 | 89 | 100 | 83 | 100 | 100 | 2 |
| x1-03 | 4 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 0 |
| x1-04 | 4 | 100 | 100 | - | 100 | 100 | - | 100 | 100 | 100 | 0 |
| x2-01 | 1 | 100 | 100 | - | 100 | 100 | - | 100 | 100 | 100 | 0 |
| x2-02 | 4 | 98 | 100 | 100 | 100 | 96 | 100 | 92 | 92 | 100 | 0 |
| x2-03 | 3 | 95 | 100 | 100 | 67 | 94 | 100 | 100 | 100 | 100 | 1 |
| x2-04 | 3 | 93 | 100 | 78 | 67 | 100 | 100 | 100 | 100 | 100 | 0 |
| x2-05 | 14 | 98 | 100 | - | 92 | 94 | 100 | 100 | 98 | 100 | 1 |
| x3-01 | 1 | 100 | 100 | - | 100 | 100 | - | 100 | 100 | 100 | 0 |
| x3-02 | 4 | 87 | 100 | 84 | 75 | 73 | 100 | 100 | 67 | 100 | 2 |
| x3-03 | 4 | 93 | 100 | 100 | 92 | 87 | 100 | 84 | 83 | 100 | 1 |
| x3-04 | 2 | 96 | 100 | 100 | 84 | 100 | 100 | 100 | 84 | 100 | 0 |
| x3-05 | 3 | 93 | 100 | 89 | 78 | 74 | 100 | 100 | 100 | 100 | 2 |
| x3-06 | 14 | 97 | 100 | 100 | 97 | 92 | 100 | 95 | 93 | 100 | 1 |
| x4-01 | 1 | 100 | 100 | - | 100 | 100 | - | 100 | 100 | 100 | 0 |
| x4-02 | 4 | 96 | 100 | 100 | 75 | 96 | 100 | 100 | 92 | 100 | 1 |
| x4-03 | 4 | 95 | 100 | 92 | 75 | 92 | 100 | 100 | 100 | 100 | 1 |
| x4-04 | 3 | 90 | 100 | 100 | 78 | 89 | 100 | 100 | 55 | 100 | 2 |
| x4-05 | 14 | 97 | 100 | 98 | 97 | 92 | 99 | 100 | 91 | 100 | 1 |
| x5-01 | 12 | 96 | 100 | - | 91 | 94 | 100 | 100 | 89 | 100 | 1 |
| x5-02 | 11 | 98 | 100 | - | 100 | 95 | 100 | 100 | 91 | 100 | 1 |

## Flagged utterances
- u1-11 Finanzministerium (gpt-6-sol, overall 88): [responsiveness, major, judge] Der Beitrag antwortet auf u1-09 (Bundesländer: datenschutzkonforme Neuregelung, Kostenverteilung, Servicestelle), thematisiert aber ausschließlich die Kostentragung und geht auf die Punkte Datenschutz, Servicestelle und Landessanitätsbehörden nicht ein.
- u1-14 Bundesländer (zai.glm-5, overall 88): [grounding, deterministic] Expertenhinweis: Die Landessanitätsbehörden verfügen über keine freien Personalressourcen. / Landessanitätsdirektionen sind bereits mit aktuellen Aufgaben ausgelastet.: Kein inhaltlicher Widerspruch; c-1-14-1 (u1-07) macht eine allgemein / [grounding, judge] Die Auslastung der Landessanitätsdirektionen wird im Beitrag ohne Beleg angeführt, auch wenn sie mit den Expertenhinweisen vereinbar ist. / [consistency, major, judge] Die angebotene Grundsatzeinigung verlangt nur Schwellenwerte und eine spätere Kostenprüfung, aber keinen Ausgleich für die Kostenverschiebung auf Länderbudgets.
- u2-06 Finanzministerium (gpt-6-sol, overall 88): [responsiveness, major, judge] Der Beitrag antwortet auf u2-05 (Bundesländer), thematisiert aber inhaltlich eine gemeinsame Linie mit Gesundheitsministerium und Sozialversicherung, ohne auf die Ablehnung der Bundesabgeltung durch die Bundesländer einzugehen.
- u2-16 Sozialversicherung (qwen.qwen3-235b-a22b-2507-v1:0, overall 95): [grounding, major, judge] Die Behauptung, die e-card-Infrastruktur ermögliche eine kostengünstige und datenschutzkonforme Umsetzung, wird ohne Beleg oder Kennzeichnung als Annahme vorgebracht.
- u3-02 Ärztekammer (qwen.qwen3-235b-a22b-2507-v1:0, overall 85): [grounding, deterministic] Zahl ohne Beleg und ohne Kennzeichnung als Annahme: 3.5 / [grounding, deterministic] Bezifferte Annahme ohne Beleg und ohne Kennzeichnung im Text: Die Ärztekammer schlägt eine pauschale Abgeltung von 3,50 Euro pro Nachtragung im eImpfpass vor. / [responsiveness, judge] Der Beitrag greift die geforderte Finanzierung auf, lässt aber den angesprochenen kostenlosen und eindeutig zuständigen Auskunftsweg offen. / [grounding, major, judge] Für die Beträge von 3,50 Euro je Eintrag und 1,8 Mio. EUR jährlich fehlt eine Berechnungsgrundlage; auch die Verfügbarkeit der genannten Mittel wird nicht belegt. / [register, judge] Die direkte Anrede „Patientenvertretung“ wirkt weniger institutionell als eine sachliche Bezugnahme auf deren Einwand.
- u3-03 Patientenvertretung (mistral.devstral-2-123b, overall 81): [relevanceExchange, judge] Die Servicestelle und ihre Finanzierung stehen im Vordergrund, während die Beschränkung der Nachtragung auf bestehende Behandlungskontakte unbehandelt bleibt. / [responsiveness, judge] Der Beitrag begrüßt die Abgeltung, geht aber nicht auf die vorgeschlagene Beschränkung der Nachtragung auf Behandlungskontakte ein. / [grounding, judge] Die 1,8 Mio. EUR werden als Finanzierungsrahmen übernommen, ohne dass ihre Herleitung oder Deckung geklärt wird. / [register, major, judge] Das Schriftzeichen in „kostenfrei und低bar“ ist ein deutlicher Sprachfehler und macht die Zugänglichkeitsforderung unklar.
- u3-07 Bundesländer (zai.glm-5, overall 77): [grounding, major, deterministic] Vom Experten als widersprüchlich markiert: Die Landessanitätsbehörden verfügen über keine freien Personalressourcen. / [responsiveness, judge] Der Beitrag nennt einen Kostenrahmen für Nachtragungen, lässt aber die ausdrücklich erfragten Schnittstellenkosten offen. / [grounding, major, judge] Der Kostenrahmen von 1,8 Mio. EUR jährlich wird ohne Beleg oder Kennzeichnung als Schätzung genannt. / [consistency, judge] Die vorgesehene Kostentragung durch Spitalsträger schwächt das Ziel der Entlastung ihrer Budgets ab, ohne diesen Schritt näher zu begründen. / [register, major, judge] Die englischen Ausdrücke „expectieren“ und „documented treatment contacts“ verletzen die Vorgabe einer sachlichen deutschen institutionellen Sprache.
- u3-13 Patientenvertretung (mistral.devstral-2-123b, overall 91): [grounding, deterministic] Bezifferte Annahme ohne Beleg und ohne Kennzeichnung im Text: Eine Umschichtung von 1,8 Mio. EUR jährlich ist notwendig. / [relevanceExchange, judge] Die zusätzliche Forderung nach einer Auskunfts- und Berichtigungsstelle liegt außerhalb des Anlasses Kostentragung. / [grounding, major, judge] Die als notwendig bezeichnete jährliche Umschichtung von 1,8 Mio. EUR wird weder belegt noch ausdrücklich als Annahme gekennzeichnet.
- u3-14 Bundesländer (zai.glm-5, overall 91): [grounding, major, deterministic] Vom Experten als widersprüchlich markiert: Landessanitätsdirektionen sind personell ausgelastet. / [responsiveness, judge] Der Beitrag greift die geforderte Finanzierungsquelle auf, geht aber weder auf die genannten 1,8 Mio. EUR noch auf die Auskunfts- und Berichtigungsstelle ein. / [grounding, judge] Die Aussage zur paritätischen Besetzung nach dem G-ZG bleibt im vorliegenden Material ungeprüft.
- u3-23 Bundesländer (zai.glm-5, overall 88): [grounding, deterministic] Expertenhinweis: p-05 "Kombinierter Kompromiss zur Finanzierung und Zielsteuerung": Rechtsgrundlage: ASVG § 342 Abs. 2 und 2a, G-ZG § 23, G-ZG § 21, 15a-OF Art. 5; im geltenden Recht umsetzbar (Gesamtvertrag, RSG oder Vereinbarung). / [grounding, judge] Die Finanzierung durch Umschichtung von jährlich 1,8 Mio. EUR wird als feststehend dargestellt, obwohl eine konkrete Umschichtung noch nicht benannt ist. / [consistency, major, judge] Die Zusage, dass Spitalsträger Schnittstellen ohne gesonderte Abgeltung tragen, weicht ohne erkennbaren Ausgleich von der roten Linie gegen Kostenverschiebungen auf Länderbudgets ab.
- u4-02 Finanzministerium (gpt-6-sol, overall 88): [responsiveness, major, judge] Der Beitrag antwortet auf u3-17, thematisiert aber die Servicestelle und Kostentragung statt auf die dort genannte pauschale Abgeltung für Nachtragungen mit Finanzierungsumschichtung einzugehen.
- u4-06 Gesundheitsministerium (gpt-6-sol, overall 88): [relevanceExchange, judge] Das Gesprächsthema ist die Servicestelle, der Beitrag thematisiert aber auch die Verantwortung für das Impfregister, was ein anderes Thema des Mandats ist. / [responsiveness, major, judge] Der Beitrag antwortet auf u3-19 zur pauschalen Abgeltung für Nachtragungen, thematisiert im Text aber die Servicestelle und deren Aufgaben - kein inhaltlicher Bezug zum vorherigen Argument.
- u4-11 Bundesländer (zai.glm-5, overall 92): [register, major, judge] Die interne Kennung „p-03“ gehört nicht in einen institutionellen Redebeitrag.
- u4-12 Sozialversicherung (qwen.qwen3-235b-a22b-2507-v1:0, overall 81): [responsiveness, major, judge] Der Beitrag geht nicht auf die konkrete Forderung ein, Landesspitäler von Schnittstellenkosten auszunehmen oder dafür abzugelten. / [grounding, judge] Die Forderung, die Datenqualität über die e-card-Infrastruktur sicherzustellen, setzt deren Eignung dafür ohne Begründung voraus. / [register, major, judge] Der Beitrag verwendet die interne Kennung „p-03“ und nennt das zuständige Ministerium mit einer für den angegebenen Stand veralteten Bezeichnung.
- u4-21 Bundesländer (zai.glm-5, overall 86): [grounding, deterministic] Expertenhinweis: Landesspitäler sind von den Schnittstellenkosten dieser Novelle ausgenommen / Spitalsträger tragen ihre Schnittstellen ohne gesonderte Abgeltung.: Ein unterschiedlicher Stichtag ist nicht erkennbar. Eine andere Abgrenzun / [relevanceExchange, judge] Der Beitrag widmet dem anderen Vorschlag und der Behandlungskontakt-Definition viel Raum, obwohl die Servicestelle zur Abstimmung steht. / [grounding, major, judge] Die behauptete Mehrheitsfähigkeit der Ausnahme für Landesspitäler ist nicht belegt; zudem widerspricht die Ausnahme der genannten Kostentragung durch Spitalsträger, ohne dass eine Abgrenzung erläutert wird. / [register, judge] Die internen Vorschlagskennungen „p-05“ und „p-03“ gehören nicht in einen institutionellen Redebeitrag.
- u5-05 Ärztekammer (qwen.qwen3-235b-a22b-2507-v1:0, overall 86): [relevanceExchange, judge] Der Beitrag behandelt die Nachtragungskosten, gibt aber keine Stimme zu den vier für die Schlussrunde genannten Vorschlägen ab. / [responsiveness, major, judge] Statt über p-04, p-06, p-07 und p-08 abzustimmen, erklärt der Beitrag seine Ablehnung von p-03. / [register, judge] „p-03“ ist eine interne Vorschlagskennung und passt nicht zur institutionellen Rede.
- u5-19 Bundesländer (zai.glm-5, overall 90): [register, major, judge] „mit_evaluierung“ enthält eine interne Kennung, und „evidence-basierte“ ist eine englisch-deutsche Mischform.
