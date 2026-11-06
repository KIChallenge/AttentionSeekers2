# Quality report backtest-svog-2018-government

Rubric debate-quality-rubric-v1. Judge: bedrock/zai.glm-5, azure/gpt-6-sol (cross-family: Azure GPT turns judged by Bedrock Nova, Bedrock turns judged by Azure GPT); temperature 0, reasoning none, seed 20261106 (Azure), fixed rubric, batches of up to 6 utterances per exchange. 39 calls, 0 failed, about 0.1864 USD (estimate from list prices).
Scores are 0 to 100 (100 = no problem). Flagged = a major issue, a dimension at or below 33, or overall below 80; minor issues alone do not flag.

Overall 96; 18 of 115 utterances flagged. Issues by dimension: responsiveness 37, grounding 28, register 14, relevanceExchange 10, relevanceMandate 4, consistency 2.
Gate: 90 turns gated, 1 regenerated, 1 accepted with a flag; 2 moderation decisions (concrete_demand, concrete_demand).

## By agent
| | n | gesamt | relevanceMandate | relevanceExchange | responsiveness | grounding | repetition | consistency | register | con | markiert |
|---|---|---|---|---|---|---|---|---|---|---|---|
| moderator (Moderation) | 20 | 98 | 100 | 100 | 93 | 99 | - | 95 | 100 | 100 | 1 |
| sv (Sozialversicherung) | 15 | 94 | 100 | 92 | 76 | 91 | 100 | 100 | 93 | 100 | 4 |
| wk (Wirtschaftskammer) | 8 | 95 | 100 | 87 | 71 | 100 | 100 | 100 | 100 | 100 | 2 |
| bl (Bundesländer) | 9 | 92 | 96 | 89 | 85 | 89 | 100 | 100 | 78 | 100 | 3 |
| fm (Finanzministerium) | 11 | 98 | 100 | 100 | 88 | 100 | 100 | 100 | 100 | 100 | 1 |
| pv (Patientenvertretung) | 7 | 89 | 91 | 83 | 67 | 88 | 100 | 100 | 81 | 100 | 3 |
| abk (Arbeiterkammer) | 9 | 99 | 100 | 100 | 93 | 100 | 100 | 100 | 100 | 100 | 0 |
| nr (Gesetzgeber (Nationalratsmehrheit)) | 5 | 97 | 100 | 100 | 87 | 92 | 100 | 100 | 100 | 100 | 0 |
| ak (Ärztekammer) | 11 | 94 | 97 | 92 | 82 | 91 | 100 | 100 | 88 | 100 | 2 |
| gm (Gesundheitsministerium) | 15 | 98 | 100 | 100 | 82 | 100 | 100 | 98 | 100 | 100 | 2 |
| expert (Experte) | 5 | 99 | 100 | 100 | 93 | 100 | - | 100 | 100 | 100 | 0 |

## By model
| | n | gesamt | relevanceMandate | relevanceExchange | responsiveness | grounding | repetition | consistency | register | con | markiert |
|---|---|---|---|---|---|---|---|---|---|---|---|
| azure/gpt-6-sol | 73 | 98 | 100 | 98 | 87 | 99 | 100 | 98 | 100 | 100 | 6 |
| bedrock/qwen.qwen3-235b-a22b-2507-v1:0 | 26 | 94 | 99 | 92 | 78 | 91 | 100 | 100 | 91 | 100 | 6 |
| bedrock/zai.glm-5 | 9 | 92 | 96 | 89 | 85 | 89 | 100 | 100 | 78 | 100 | 3 |
| bedrock/mistral.devstral-2-123b | 7 | 89 | 91 | 83 | 67 | 88 | 100 | 100 | 81 | 100 | 3 |

## By round
| | n | gesamt | relevanceMandate | relevanceExchange | responsiveness | grounding | repetition | consistency | register | con | markiert |
|---|---|---|---|---|---|---|---|---|---|---|---|
| R1 | 22 | 99 | 99 | 100 | 97 | 98 | 100 | 100 | 97 | 100 | 0 |
| R2 | 28 | 96 | 100 | 100 | 80 | 98 | 100 | 96 | 98 | 100 | 4 |
| R3 | 27 | 96 | 100 | 96 | 81 | 95 | 100 | 99 | 96 | 100 | 5 |
| R4 | 26 | 94 | 96 | 89 | 83 | 95 | 100 | 100 | 90 | 100 | 6 |
| R5 | 12 | 94 | 100 | - | 73 | 90 | 100 | 100 | 94 | 100 | 3 |

## By exchange
| | n | gesamt | relevanceMandate | relevanceExchange | responsiveness | grounding | repetition | consistency | register | con | markiert |
|---|---|---|---|---|---|---|---|---|---|---|---|
| x1-01 | 10 | 98 | 97 | - | 96 | 96 | 100 | 100 | 97 | 100 | 0 |
| x1-02 | 4 | 99 | 100 | 100 | 92 | 100 | 100 | 100 | 100 | 100 | 0 |
| x1-03 | 4 | 99 | 100 | 100 | 100 | 100 | 100 | 100 | 92 | 100 | 0 |
| x1-04 | 4 | 100 | 100 | - | 100 | 100 | - | 100 | 100 | 100 | 0 |
| x2-01 | 1 | 98 | 100 | - | 100 | 90 | - | 100 | 100 | 100 | 0 |
| x2-02 | 4 | 99 | 100 | 100 | 100 | 100 | 100 | 100 | 92 | 100 | 0 |
| x2-03 | 4 | 97 | 100 | 100 | 75 | 100 | 100 | 100 | 100 | 100 | 1 |
| x2-04 | 2 | 94 | 100 | 100 | 50 | 100 | 100 | 100 | 100 | 100 | 1 |
| x2-05 | 3 | 96 | 100 | 100 | 67 | 100 | 100 | 100 | 100 | 100 | 1 |
| x2-06 | 14 | 95 | 100 | - | 82 | 96 | 100 | 93 | 98 | 100 | 1 |
| x3-01 | 1 | 98 | 100 | - | 100 | 90 | - | 100 | 100 | 100 | 0 |
| x3-02 | 4 | 97 | 100 | 100 | 84 | 100 | 100 | 92 | 100 | 100 | 0 |
| x3-03 | 4 | 91 | 100 | 75 | 67 | 85 | 100 | 100 | 100 | 100 | 2 |
| x3-04 | 2 | 94 | 100 | 100 | 50 | 100 | 100 | 100 | 100 | 100 | 1 |
| x3-05 | 3 | 96 | 100 | 100 | 67 | 100 | 100 | 100 | 100 | 100 | 1 |
| x3-06 | 13 | 97 | 100 | 100 | 92 | 95 | 100 | 100 | 92 | 100 | 1 |
| x4-01 | 1 | 100 | 100 | - | 100 | 100 | - | 100 | 100 | 100 | 0 |
| x4-02 | 4 | 99 | 100 | 100 | 100 | 100 | 100 | 100 | 92 | 100 | 0 |
| x4-03 | 4 | 95 | 100 | 100 | 67 | 93 | 100 | 100 | 100 | 100 | 1 |
| x4-04 | 3 | 78 | 78 | 33 | 33 | 89 | 100 | 100 | 89 | 100 | 3 |
| x4-05 | 14 | 96 | 98 | 95 | 92 | 95 | 99 | 100 | 86 | 100 | 2 |
| x5-01 | 12 | 94 | 100 | - | 73 | 90 | 100 | 100 | 94 | 100 | 3 |

## Flagged utterances
- u2-06 Wirtschaftskammer (gpt-6-sol, overall 88): [responsiveness, major, judge] Der Beitrag antwortet mit einem Vorschlag zur Parität, geht aber auf die in u1-07 geäußerte Sorge vor Machtverschiebung zulasten der Versicherten nicht substantiell ein und wiederholt Positionen zur Kassenfusion statt auf das Paritätsthema einzugehen.
- u2-10 Gesundheitsministerium (gpt-6-sol, overall 88): [responsiveness, major, judge] Der Beitrag antwortet auf die Arbeiterkammer (u2-09), thematisiert aber ausschließlich die Abstimmung mit dem Finanzministerium und geht auf das Vetorecht-Argument der Arbeiterkammer nicht ein.
- u2-12 Sozialversicherung (qwen.qwen3-235b-a22b-2507-v1:0, overall 92): [responsiveness, major, judge] Der Beitrag geht nicht auf das konkrete Argument zum Vetorecht der Dienstgeberseite und zur Mitwirkung in der Selbstverwaltung ein, auf das er antwortet.
- u2-15 Moderation (gpt-6-sol, overall 67): [responsiveness, major, judge] Der Beitrag antwortet auf u2-14 (Ärztekammer) mit inhaltlicher Stellungnahme zur Zentralisierung, obwohl die Moderation neutral die Plenumsrunde eröffnen sollte. / [consistency, major, judge] Die Moderation ergreift mit der Aussage "Wir teilen die Sorge..." Partei für eine Position und verletzt damit ihre neutrale Rolle.
- u3-06 Sozialversicherung (qwen.qwen3-235b-a22b-2507-v1:0, overall 84): [grounding, deterministic] Expertenhinweis: Die Sozialversicherung sieht keine Handlungsnotwendigkeit bei der paritätischen Selbstverwaltung. / Die Sozialversicherung warnt vor einer Re-Verstaatlichung durch die Kassenfusion.: Die Sozialversicherung kritisiert akt / [relevanceExchange, judge] Der Beitrag behandelt Parität nur kurz und verlagert den Schwerpunkt auf regionale Finanzautonomie und bundesweite Gremien. / [responsiveness, major, judge] Auf die geforderte Mehrheit der Versichertenvertretung bei Leistungen und Beitragsmitteln geht der Beitrag nicht konkret ein. / [grounding, judge] Die Aussage, regionale Versorgung und finanzielle Steuerung verblieben bei den bestehenden Kassen, stellt einen umstrittenen Ausgang der geplanten Fusion als feststehend dar.
- u3-08 Sozialversicherung (qwen.qwen3-235b-a22b-2507-v1:0, overall 79): [relevanceExchange, major, judge] Der Beitrag behandelt Fusionskosten und regionale Zuständigkeiten, aber nicht die für dieses Gespräch zentrale Stimmverteilung in der Selbstverwaltung. / [responsiveness, major, judge] Die Bedingung einer Mehrheit der Versichertenvertretung bei Entscheidungen über Leistungen und Beitragsmittel bleibt unbeantwortet. / [grounding, major, judge] Dass die regionale Versorgungsverantwortung bei der Fusion „vollständig erhalten bleibt“, wird ohne tragfähige Grundlage als gesichert dargestellt.
- u3-10 Gesundheitsministerium (gpt-6-sol, overall 88): [responsiveness, major, judge] Der Beitrag antwortet auf u3-09 (Arbeiterkammer), thematisiert aber im Text ausschließlich das Finanzministerium und greift die dort genannten Punkte zu Fusionskosten und Versichertenvertretung nicht auf.
- u3-12 Patientenvertretung (mistral.devstral-2-123b, overall 92): [responsiveness, major, judge] Der Beitrag geht auf den konkreten Einwand gegen Fusionskosten aus laufenden Beiträgen nicht ein und behandelt auch die angesprochene Mehrheit der Versichertenvertretung nicht.
- u3-17 Bundesländer (zai.glm-5, overall 89): [grounding, major, deterministic] Vom Experten als widersprüchlich markiert: Landes-Zielsteuerungskommission umfasst Länder, Krankenkasse und Sozialpartner / [responsiveness, judge] Der Vorschlag zur Zustimmung bei Zu- und Abschlägen beantwortet die Forderung nach Budget- und Vertragshoheit der Landesstellen sowie nach Finanzierung der Fusionskosten nur teilweise. / [grounding, major, judge] Die behauptete Zusammensetzung der Landes-Zielsteuerungskommission ist nicht gesichert, und aus ihrer Zustimmung zu Zu- und Abschlägen folgt nicht, dass die Mittel im Land bleiben.
- u4-06 Finanzministerium (gpt-6-sol, overall 88): [responsiveness, major, judge] Der Beitrag antwortet auf u3-20 zur Kassenfusion und Landesstellen, thematisiert aber ausschließlich die Beitragsprüfung und geht am Gegenüber völlig vorbei.
- u4-10 Wirtschaftskammer (gpt-6-sol, overall 79): [relevanceExchange, major, judge] Das Gesprächsthema lautet Parität, der Beitrag thematisiert aber primär Landesstellen und Zielsteuerungskompetenz; Parität wird nur am Rande erwähnt. / [responsiveness, major, judge] Der Beitrag antwortet auf einen nicht vorhandenen Vorgänger (u4-09 Sozialversicherung) und thematisiert Beitragsprüfung statt sich mit dem Caucus-Thema Parität auseinanderzusetzen.
- u4-11 Patientenvertretung (mistral.devstral-2-123b, overall 77): [relevanceMandate, judge] Der Beitrag behandelt Landesstellen, lässt aber die Parität als Verhandlungsthema aus. / [relevanceExchange, major, judge] In der Abstimmung über Parität äußert sich der Beitrag nur zur regionalen Entscheidungshoheit. / [responsiveness, major, judge] Auf die vorgeschlagene paritätische Mitentscheidung der Dienstgeberseite geht der Beitrag nicht ein. / [grounding, judge] Die Aussage, regionale Entscheidungshoheit könne gleiche Leistungen für alle Versicherten gewährleisten, wird nicht begründet.
- u4-12 Ärztekammer (qwen.qwen3-235b-a22b-2507-v1:0, overall 77): [relevanceMandate, judge] Der Beitrag behandelt Landesstellen und Gesamtverträge, nicht aber die Parität in den Verwaltungskörpern. / [relevanceExchange, major, judge] Für die Abstimmung der Paritätsbefürworter bietet der Beitrag keine Position zur paritätischen Mitentscheidung. / [responsiveness, judge] Der Beitrag greift die Landesstellen auf, geht aber nicht darauf ein, wie seine Bedingungen gleiche Leistungen für Versicherte sichern. / [grounding, judge] Die Annahme, regionale Steuerung sei ohne Änderung des ASVG-Gesamtvertrags möglich, bleibt unbegründet. / [register, judge] Die direkte Anrede „Wirtschaftskammer, Patientenvertretung“ wirkt weniger institutionell als eine sachliche Formulierung in der Wir-Form.
- u4-16 Bundesländer (zai.glm-5, overall 65): [responsiveness, deterministic] Verhandlungsphase: weder ein konkreter Vorschlag (mit Betrag, Frist, Umfang oder Bedingung) noch ein begründeter Einwand. / [relevanceMandate, judge] „Regionale Entscheidungshoheit“ berührt das Mandat, lässt aber offen, welche Befugnisse die Landesstellen erhalten sollen. / [relevanceExchange, major, judge] Der Beitrag nennt nur eine Unterstützung für einen anderen Vorschlag und behandelt die zur Abstimmung stehende Kassenfusion nicht konkret. / [responsiveness, major, judge] Auf die Aufforderung, zu den offenen Vorschlägen Stellung zu nehmen, folgt lediglich eine nicht erläuterte Stimme für einen anderen Vorschlag. / [grounding, judge] Die Begründung „Stützt regionale Entscheidungshoheit“ bleibt ohne Erläuterung des Vorschlags nicht nachvollziehbar. / [register, major, judge] Der Beitrag besteht aus einem technischen Datenobjekt mit englischen Feldnamen und einer internen Vorschlagskennung statt aus einer institutionellen Wortmeldung.
- u4-17 Patientenvertretung (mistral.devstral-2-123b, overall 92): [grounding, major, judge] Die Behauptung „Dies gewährleistet gleiche Leistungen für alle Versicherten“ ist durch die genannten Bedingungen nicht belegt. / [register, judge] Die interne Vorschlagskennung „p-02“ gehört nicht in einen institutionellen Redebeitrag.
- u5-02 Bundesländer (zai.glm-5, overall 86): [grounding, major, judge] Die behaupteten bedingten Zustimmungen von drei Institutionen zu p-03 sind nicht belegt und stehen zumindest der ausdrücklichen Ablehnung durch Gesundheitsministerium und Finanzministerium gegenüber. / [register, major, judge] Der Beitrag enthält mit „conditio sine qua non“ eine fremdsprachige Wendung und endet mit dem sachfremden Kürzel „EK“.
- u5-07 Ärztekammer (qwen.qwen3-235b-a22b-2507-v1:0, overall 86): [relevanceExchange, major, judge] Der Beitrag behandelt nur p-03 und benennt weder die Stimmen zu p-04 und p-05 noch ausdrücklich die verbleibenden offenen Fragen. / [responsiveness, major, judge] Die konkrete Aufforderung zur abschließenden Abstimmung über die offenen Vorschläge und zur Benennung offener Punkte wird nur teilweise beantwortet. / [grounding, major, judge] Die Behauptung, ohne die geforderte Garantie könne die Patientenversorgung nicht gewährleistet werden, ist nicht belegt und wird nicht als Einschätzung gekennzeichnet.
- u5-10 Sozialversicherung (qwen.qwen3-235b-a22b-2507-v1:0, overall 89): [grounding, deterministic] Expertenhinweis: Die Aussage zu 70 Prozent Einsparungen war eine Annahme. / 70 Prozent der Verwaltungseinsparungen nach Übergangskosten fließen in die regionale Versorgung: c-4-09-1 stellt die 70 Prozent als geplante Allokation dar, währ / [relevanceExchange, judge] Eine ausdrückliche Stimme zu p-04 und p-05 sowie eine klare Benennung der weiterhin offenen Verhandlungspunkte fehlen. / [responsiveness, judge] Die Moderation verlangt eine abschließende Position zu den drei Vorschlägen, der Beitrag äußert sich jedoch nur zu p-03. / [grounding, major, judge] Die frühere Angabe von 70 Prozent wird pauschal als Annahme bezeichnet, obwohl sie laut Expertenhinweis zuvor als geplante Mittelzuordnung dargestellt wurde.
