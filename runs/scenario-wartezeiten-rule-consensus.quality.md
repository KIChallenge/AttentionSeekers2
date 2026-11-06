# Quality report scenario-wartezeiten-rule-consensus

Rubric debate-quality-rubric-v1. Judge: bedrock/zai.glm-5, azure/gpt-6-sol (cross-family: Azure GPT turns judged by Bedrock Nova, Bedrock turns judged by Azure GPT); temperature 0, reasoning none, seed 20261106 (Azure), fixed rubric, batches of up to 6 utterances per exchange. 45 calls, 0 failed, about 0.242 USD (estimate from list prices).
Scores are 0 to 100 (100 = no problem). Flagged = a major issue, a dimension at or below 33, or overall below 80; minor issues alone do not flag.

Overall 95; 22 of 130 utterances flagged. Issues by dimension: grounding 94, responsiveness 35, register 26, relevanceExchange 18, relevanceMandate 10, consistency 1.
Gate: 92 turns gated, 2 regenerated, 0 accepted with a flag; 1 moderation decisions (concrete_demand).

## By agent
| | n | gesamt | relevanceMandate | relevanceExchange | responsiveness | grounding | repetition | consistency | register | con | markiert |
|---|---|---|---|---|---|---|---|---|---|---|---|
| moderator (Moderation) | 24 | 99 | 100 | 100 | 96 | 98 | - | 100 | 100 | 100 | 0 |
| pf (Pflegevertretung) | 8 | 95 | 96 | 100 | 92 | 75 | 100 | 100 | 96 | 100 | 2 |
| fm (Finanzministerium) | 14 | 97 | 100 | 97 | 88 | 95 | 100 | 100 | 95 | 100 | 2 |
| bl (Bundesländer) | 9 | 93 | 96 | 100 | 100 | 71 | 100 | 100 | 82 | 100 | 2 |
| pv (Patientenvertretung) | 12 | 93 | 97 | 88 | 84 | 85 | 100 | 97 | 89 | 100 | 2 |
| sv (Sozialversicherung) | 14 | 92 | 93 | 80 | 79 | 88 | 100 | 100 | 93 | 100 | 5 |
| gm (Gesundheitsministerium) | 9 | 98 | 100 | 100 | 93 | 93 | 100 | 100 | 100 | 100 | 0 |
| ka (Krankenanstalten) | 6 | 94 | 95 | 100 | 95 | 79 | 100 | 100 | 84 | 100 | 2 |
| ak (Ärztekammer) | 16 | 94 | 98 | 86 | 79 | 92 | 100 | 100 | 90 | 100 | 3 |
| va (Vertragsärzt:innen) | 13 | 92 | 95 | 85 | 90 | 78 | 100 | 100 | 87 | 100 | 4 |
| expert (Experte) | 5 | 99 | 100 | 100 | 100 | 96 | - | 100 | 100 | 100 | 0 |

## By model
| | n | gesamt | relevanceMandate | relevanceExchange | responsiveness | grounding | repetition | consistency | register | con | markiert |
|---|---|---|---|---|---|---|---|---|---|---|---|
| azure/gpt-6-sol | 52 | 98 | 100 | 99 | 94 | 96 | 100 | 100 | 99 | 100 | 2 |
| bedrock/qwen.qwen3-235b-a22b-2507-v1:0 | 44 | 93 | 96 | 87 | 83 | 86 | 100 | 100 | 91 | 100 | 12 |
| bedrock/zai.glm-5 | 22 | 93 | 96 | 91 | 94 | 75 | 100 | 100 | 85 | 100 | 6 |
| bedrock/mistral.devstral-2-123b | 12 | 93 | 97 | 88 | 84 | 85 | 100 | 97 | 89 | 100 | 2 |

## By round
| | n | gesamt | relevanceMandate | relevanceExchange | responsiveness | grounding | repetition | consistency | register | con | markiert |
|---|---|---|---|---|---|---|---|---|---|---|---|
| R1 | 23 | 97 | 99 | 96 | 92 | 92 | 100 | 100 | 94 | 100 | 2 |
| R2 | 30 | 96 | 100 | 82 | 86 | 93 | 100 | 100 | 99 | 100 | 3 |
| R3 | 27 | 96 | 100 | 97 | 82 | 90 | 100 | 100 | 94 | 100 | 3 |
| R4 | 27 | 93 | 89 | 89 | 94 | 78 | 100 | 100 | 89 | 100 | 9 |
| R5 | 23 | 95 | 100 | - | 93 | 86 | 100 | 99 | 87 | 100 | 5 |

## By exchange
| | n | gesamt | relevanceMandate | relevanceExchange | responsiveness | grounding | repetition | consistency | register | con | markiert |
|---|---|---|---|---|---|---|---|---|---|---|---|
| x1-01 | 10 | 98 | 100 | - | 100 | 91 | 100 | 100 | 97 | 100 | 0 |
| x1-02 | 4 | 95 | 100 | 100 | 84 | 79 | 100 | 100 | 92 | 100 | 1 |
| x1-03 | 5 | 94 | 93 | 93 | 80 | 97 | 100 | 100 | 87 | 100 | 1 |
| x1-04 | 4 | 100 | 100 | - | 100 | 100 | - | 100 | 100 | 100 | 0 |
| x2-01 | 1 | 100 | 100 | - | 100 | 100 | - | 100 | 100 | 100 | 0 |
| x2-02 | 5 | 98 | 100 | 100 | 87 | 97 | 100 | 100 | 100 | 100 | 0 |
| x2-03 | 4 | 91 | 100 | 58 | 75 | 92 | 100 | 100 | 100 | 100 | 2 |
| x2-04 | 3 | 90 | 100 | 67 | 56 | 100 | 100 | 100 | 100 | 100 | 1 |
| x2-05 | 3 | 95 | 100 | 100 | 78 | 91 | 100 | 100 | 89 | 100 | 0 |
| x2-06 | 14 | 98 | 100 | - | 97 | 91 | 100 | 100 | 100 | 100 | 0 |
| x3-01 | 1 | 97 | 100 | - | 100 | 80 | - | 100 | 100 | 100 | 0 |
| x3-02 | 6 | 95 | 100 | 100 | 72 | 94 | 100 | 100 | 95 | 100 | 2 |
| x3-03 | 3 | 97 | 100 | 100 | 78 | 100 | 100 | 100 | 100 | 100 | 0 |
| x3-04 | 3 | 95 | 100 | 89 | 78 | 93 | 100 | 100 | 100 | 100 | 1 |
| x3-05 | 14 | 95 | 100 | 98 | 87 | 86 | 100 | 100 | 91 | 100 | 0 |
| x4-01 | 2 | 99 | 100 | - | 100 | 95 | - | 100 | 100 | 100 | 0 |
| x4-02 | 6 | 92 | 100 | 73 | 89 | 71 | 100 | 100 | 100 | 100 | 3 |
| x4-03 | 2 | 86 | 67 | 67 | 84 | 65 | 100 | 100 | 100 | 100 | 1 |
| x4-04 | 3 | 98 | 100 | 100 | 89 | 97 | 100 | 100 | 100 | 100 | 0 |
| x4-05 | 14 | 92 | 84 | 98 | 97 | 77 | 100 | 100 | 79 | 100 | 5 |
| x5-01 | 12 | 92 | 100 | - | 85 | 81 | 100 | 97 | 81 | 100 | 5 |
| x5-02 | 11 | 98 | 100 | - | 100 | 93 | 100 | 100 | 94 | 100 | 0 |

## Flagged utterances
- u1-13 Pflegevertretung (qwen.qwen3-235b-a22b-2507-v1:0, overall 96): [grounding, major, judge] Die pauschale Behauptung, medizinische Assistenzberufe hätten keine ausreichende Ausbildung für einen sicheren Erstkontakt, bleibt unbelegt; auch die zugesagte lückenlose Versorgung wird nicht gestützt.
- u1-17 Sozialversicherung (qwen.qwen3-235b-a22b-2507-v1:0, overall 79): [relevanceMandate, judge] Der Beitrag nennt Finanzierungsgrenzen, aber keinen Ansatz zur Verkürzung der Facharztwartezeiten. / [relevanceExchange, judge] Die verbindliche Terminzusage wird nicht ausdrücklich behandelt. / [responsiveness, major, judge] Auf den Vorschlag einer regional begrenzten Terminzusage mit konkreten Umschichtungen und Evaluation geht der Beitrag nicht ein. / [register, judge] Die Anrede „Finanzministerium, Sozialversicherung:“ ist für einen Beitrag der Sozialversicherung unklar.
- u2-09 Sozialversicherung (qwen.qwen3-235b-a22b-2507-v1:0, overall 88): [relevanceExchange, major, judge] Der Beitrag behandelt Zugangsziele und Honorare, nicht mehr den pflegerischen Erstkontakt als Thema des Gesprächs. / [responsiveness, judge] Der Einwand gegen höhere Kassentarife wird aufgegriffen, die geforderte Abgrenzung zur ärztlichen Erstdiagnose jedoch nicht.
- u2-10 Ärztekammer (qwen.qwen3-235b-a22b-2507-v1:0, overall 92): [relevanceExchange, major, judge] Der Beitrag verhandelt ausschließlich Zugangsziele und Honorierung und lässt den pflegerischen Erstkontakt als Gesprächsthema aus.
- u2-11 Ärztekammer (qwen.qwen3-235b-a22b-2507-v1:0, overall 79): [relevanceExchange, major, judge] Der Beitrag behandelt Kassenstellen und Honorare, aber nicht die Terminzusage binnen vier Wochen oder deren regionale Erprobung. / [responsiveness, major, judge] Auf die Forderung nach Transparenz und Finanzierung durch Umschichtung sowie den Vorschlag einer Pilotregion geht der Beitrag nicht ein.
- u3-04 Sozialversicherung (qwen.qwen3-235b-a22b-2507-v1:0, overall 92): [responsiveness, major, judge] Der Beitrag wiederholt die eigenen Haushaltsbedingungen, ohne auf die geforderte Umschichtung vor dem Beschluss oder den Kostenrahmen des regionalen Versuchs einzugehen.
- u3-05 Vertragsärzt:innen (zai.glm-5, overall 85): [responsiveness, major, judge] Der Beitrag schlägt eine Verknüpfung mit 1450 vor, beantwortet aber nicht, wie die von der Sozialversicherung geforderte Einhaltung der Gebarungsvorschau ohne Beitragserhöhung gesichert wird. / [grounding, judge] Die Aussage „Das bündelt die Kosten“ behauptet eine Kostenwirkung, ohne sie zu belegen oder als Erwartung zu kennzeichnen. / [register, judge] Die Formulierung „verletzt der Vorschlag unsere rote Linie“ verwendet eine interne Verhandlungskategorie statt einer praxisnahen Begründung.
- u3-11 Finanzministerium (gpt-6-sol, overall 88): [relevanceExchange, judge] Der Beitrag thematisiert Pflegefachpersonen in PVE, obwohl das Gesprächsthema die Terminzusage (t-4wo) ist. / [responsiveness, major, judge] Der Beitrag geht nicht auf die Bedingungen von u3-06 ein (Tarifpositionen, Stellenplanung, Verknüpfung mit 1450) und schlägt stattdessen eine neue gemeinsame Linie vor.
- u4-05 Ärztekammer (qwen.qwen3-235b-a22b-2507-v1:0, overall 98): [grounding, major, deterministic] Vom Experten als widersprüchlich markiert: Stellenplanung erfolgt nur im Gesamtvertrag.
- u4-06 Vertragsärzt:innen (zai.glm-5, overall 89): [grounding, deterministic] Zahl ohne Beleg und ohne Kennzeichnung als Annahme: 15 / [grounding, deterministic] Expertenhinweis: Die Finanzierung erfolgt durch Umschichtung von 40 Millionen Euro aus ambulanten Ausgaben. / P-01 kostet 45 Mio. EUR pro Jahr: Wert widerspricht früherer Aussage c-3-20-2 (45 Mio. EUR); kein Beleg für abweichende Zahl / [relevanceExchange, judge] Der Beitrag konkretisiert die Finanzierung, aber nicht die gestaffelte Besetzung zusätzlicher Kassenstellen. / [grounding, major, judge] Die Umschichtung von 40 Millionen Euro wird ohne Beleg beziffert und steht im Konflikt mit dem Expertenhinweis auf 30 Millionen Euro jährlich; auch die behauptete Beitragsstabilität ist damit nicht belegt.
- u4-07 Sozialversicherung (qwen.qwen3-235b-a22b-2507-v1:0, overall 91): [grounding, major, deterministic] Vom Experten als widersprüchlich markiert: Die Mittel stammen aus bestehenden ambulanten Ausgaben. / [relevanceExchange, judge] Die Antwort setzt Finanzierungsbedingungen, ohne auf die zusätzlichen Kassenstellen einzugehen. / [grounding, judge] Die unbelegte Summe von 40 Millionen Euro wird als Bedingung übernommen, obwohl die Expertenhinweise einen abweichenden Betrag nennen.
- u4-09 Sozialversicherung (qwen.qwen3-235b-a22b-2507-v1:0, overall 81): [grounding, major, deterministic] Vom Experten als widersprüchlich markiert: Die Sozialversicherung fordert eine Kürzung um 40 Mio. EUR bei ambulanten Ausgaben. / [relevanceMandate, judge] Der Beitrag behandelt die Finanzierung neuer Tarifpositionen, aber nicht, wie zusätzliche Kassenstellen gestaffelt geschaffen werden. / [relevanceExchange, judge] Für die gemeinsame Linie zu Kassenstellen bleibt offen, welche Stellen durch die vorgeschlagene Umschichtung ermöglicht werden. / [responsiveness, judge] Die Forderung, Mittel für späte Erstkonsultationen zu binden und neue Selbstbehalte auszuschließen, wird nicht ausdrücklich aufgegriffen. / [grounding, major, judge] Die Kürzung bisheriger ambulanter Ausgaben um 40 Millionen Euro wird ohne Beleg eingeführt; der Expertenhinweis unterscheidet sie ausdrücklich von einer Umschichtung.
- u4-16 Patientenvertretung (mistral.devstral-2-123b, overall 85): [grounding, deterministic] Zahl ohne Beleg und ohne Kennzeichnung als Annahme: 342 / [grounding, deterministic] Expertenhinweis: p-09 "Verbindliche Terminzusage binnen vier Wochen durch Tarifpositionen und Terminvermittlung": Rechtsgrundlage: ASVG § 342 Abs. 2 und 2a; im geltenden Recht umsetzbar (Gesamtvertrag, RSG oder Vereinbarung). / [relevanceMandate, judge] Der Gegenvorschlag betrifft die Terminzusage, nicht die zusätzlichen Kassenstellen. / [grounding, major, judge] Für die vorgeschlagenen Tarifpositionen wird § 342b ASVG als Rechtsgrundlage genannt, während der Expertenhinweis § 342 Abs. 2 und 2a ASVG nennt; auch die Finanzierung durch Umschichtung bleibt unbelegt. / [register, judge] Die interne Vorschlagskennung „p-02“ steht im Redebeitrag.
- u4-19 Finanzministerium (gpt-6-sol, overall 84): [grounding, deterministic] Zahl ohne Beleg und ohne Kennzeichnung als Annahme: 15 / [responsiveness, judge] Der Beitrag antwortet auf u4-13 statt auf die Moderationsaufforderung u4-14 und geht damit an der konkreten Abstimmungsaufforderung vorbei. / [grounding, judge] Die Aussagen zu 40 Millionen Euro und zur angespannten Gebarung werden ohne Beleg als Annahmen geführt. / [register, major, judge] Die Aussagen sind in englischer Sprache formuliert („The talks advanced contractual remuneration...“), was dem institutionellen Register widerspricht.
- u4-21 Bundesländer (zai.glm-5, overall 83): [grounding, deterministic] Zahl ohne Beleg und ohne Kennzeichnung als Annahme: 15 / [grounding, deterministic] Expertenhinweis: p-12 "Kompromisspaket: Pilotregion Terminzusage mit ausgewiesener Gegenfinanzierung": Rechtsgrundlage: ASVG § 342 Abs. 1 Z 3, G-ZG § 23, G-ZG § 21, 15a-OF Art. 5; erfordert Änderung ASVG § 342. / [relevanceMandate, judge] Das Kompromisspaket betrifft Terminvermittlung und Finanzierung, nicht die Staffelung zusätzlicher Kassenstellen. / [grounding, major, judge] Die behauptete Mehrheitsfähigkeit ist nicht hinreichend belegt, und weder die Verfügbarkeit der 40 Mio. EUR noch die Deckung von Kostenverschiebungen durch einen 15a-Ausgleich ist nachgewiesen. / [register, judge] Die interne Vorschlagskennung „p-02“ steht im Redebeitrag.
- u4-22 Krankenanstalten (qwen.qwen3-235b-a22b-2507-v1:0, overall 88): [relevanceMandate, judge] Der Beitrag behandelt die Finanzierung und Entlastung von Spitalsambulanzen, aber keine zusätzlichen Kassenstellen. / [grounding, major, judge] Die behauptete Möglichkeit, jährlich 40 Mio. EUR aus ineffizienten spitalsambulanten Ausgaben umzuschichten, wird nicht belegt. / [register, judge] Die interne Vorschlagskennung „p-02“ steht im Redebeitrag.
- u4-23 Vertragsärzt:innen (zai.glm-5, overall 82): [grounding, deterministic] Zahl ohne Beleg und ohne Kennzeichnung als Annahme: 15 / [relevanceMandate, judge] Der Beitrag behandelt Honorierung und Finanzierung, aber nicht die zusätzlichen Kassenstellen als Thema des Plenums. / [relevanceExchange, judge] Die Stimme zu p-02 wird abgegeben, doch der Beitrag geht nicht auf die gestaffelte Schaffung zusätzlicher Kassenstellen ein. / [grounding, major, judge] Die gesicherte Honorierung und die Finanzierung des Pilotvorschlags werden als Tatsachen dargestellt, obwohl die Finanzierung laut Gesprächsverlauf offen und die Aussage zum Pilotvorschlag nicht bestätigt ist. / [register, judge] Die internen Vorschlagskennungen „p-02“ und „p-07“ stehen im Redebeitrag.
- u5-03 Patientenvertretung (mistral.devstral-2-123b, overall 80): [grounding, deterministic] Zahl ohne Beleg und ohne Kennzeichnung als Annahme: 15 / [responsiveness, judge] Der Beitrag benennt nicht ausdrücklich, welche Fragen offen bleiben. / [grounding, major, judge] Die Finanzierung wird als durch Umschichtung und 15a-Ausgleich „abgesichert“ dargestellt, obwohl ein beschlossener Finanzierungspfad nicht belegt ist. / [consistency, judge] Die Ablehnung von p-05 und p-06 wird mit fehlender Honorierung begründet, ohne den Bezug zu den eigenen Zielen Terminzusage und Wartezeittransparenz zu erklären. / [register, judge] Interne Vorschlagskennungen wie „p-12“ und „p-05“ werden im Redebeitrag verwendet.
- u5-05 Vertragsärzt:innen (zai.glm-5, overall 87): [grounding, deterministic] Zahl ohne Beleg und ohne Kennzeichnung als Annahme: 15 / [grounding, judge] Die Aussage, p-10 sichere eine Tarifposition im Gesamtvertrag, ist nicht verifiziert und wird nicht als Annahme gekennzeichnet. / [register, major, judge] Neben internen Vorschlagskennungen beeinträchtigen Formulierungen wie „Wir stimmen p-05 ab“ und „P-10 unterstützt wir“ die Verständlichkeit deutlich.
- u5-07 Krankenanstalten (qwen.qwen3-235b-a22b-2507-v1:0, overall 84): [grounding, deterministic] Expertenhinweis: Die Umschichtung beträgt 30 Mio. EUR jährlich. / Die Finanzierung erfolgt durch Umschichtung von 40 Millionen Euro aus ambulanten Ausgaben.: Die Beträge sind unvereinbar, sofern dieselbe Umschichtung gemeint ist. Untersc / [responsiveness, judge] Eine endgültige Stimme zu den übrigen zur Entscheidung stehenden Vorschlägen fehlt. / [grounding, major, judge] Die Umschichtung von 30 Mio. EUR wird ohne Beleg oder Kennzeichnung als Annahme genannt und nicht gegenüber der ebenfalls genannten Finanzierung von 40 Millionen Euro abgegrenzt. / [register, judge] Mit „p-12“ wird eine interne Vorschlagskennung im Redebeitrag verwendet.
- u5-09 Bundesländer (zai.glm-5, overall 87): [grounding, deterministic] Zahl ohne Beleg und ohne Kennzeichnung als Annahme: 15, 9 / [grounding, major, judge] Die gesamtvertragliche Honorierung beider Vorschläge und die Tragfähigkeit der Finanzierung werden als gegeben dargestellt, obwohl die Finanzierung vor Umsetzung laut Beitrag erst konkretisiert werden muss. / [register, judge] Interne Vorschlagskennungen wie „p-05“ und „p-12“ werden im Redebeitrag verwendet.
- u5-10 Pflegevertretung (qwen.qwen3-235b-a22b-2507-v1:0, overall 91): [relevanceExchange, judge] Der Beitrag benennt nicht, welche Fragen nach der Schlussabstimmung offen bleiben. / [responsiveness, judge] Die erbetene endgültige Stimme bleibt für p-06, p-09 und p-10 aus; zu p-12 wird nur eine mögliche Umsetzungsform genannt. / [grounding, major, judge] Die Entlastung der Fachambulanzen ist unbelegt, und die Finanzierung wird als „bedeckt“ dargestellt, obwohl die Umschichtung nur als Annahme geführt wird.
