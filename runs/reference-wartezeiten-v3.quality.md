# Quality report reference-wartezeiten-v3

Rubric debate-quality-rubric-v1. Judge: bedrock/zai.glm-5, azure/gpt-6-sol (cross-family: Azure GPT turns judged by Bedrock Nova, Bedrock turns judged by Azure GPT); temperature 0, reasoning none, seed 20261106 (Azure), fixed rubric, batches of up to 6 utterances per exchange. 46 calls, 0 failed, about 0.2507 USD (estimate from list prices).
Scores are 0 to 100 (100 = no problem). Flagged = a major issue, a dimension at or below 33, or overall below 80; minor issues alone do not flag.

Overall 96; 23 of 138 utterances flagged. Issues by dimension: grounding 106, responsiveness 35, register 33, relevanceExchange 12, relevanceMandate 2, consistency 1.
Gate: 100 turns gated, 3 regenerated, 0 accepted with a flag; 3 moderation decisions (concrete_demand, concrete_demand, concrete_demand).

## By agent
| | n | gesamt | relevanceMandate | relevanceExchange | responsiveness | grounding | repetition | consistency | register | con | markiert |
|---|---|---|---|---|---|---|---|---|---|---|---|
| moderator (Moderation) | 24 | 100 | 100 | 100 | 100 | 98 | - | 100 | 100 | 100 | 0 |
| pf (Pflegevertretung) | 9 | 88 | 93 | 74 | 74 | 71 | 100 | 100 | 82 | 100 | 3 |
| fm (Finanzministerium) | 16 | 98 | 100 | 100 | 94 | 90 | 100 | 100 | 100 | 100 | 1 |
| bl (Bundesländer) | 9 | 95 | 100 | 93 | 100 | 75 | 100 | 100 | 93 | 100 | 1 |
| pv (Patientenvertretung) | 14 | 94 | 100 | 100 | 69 | 93 | 100 | 98 | 91 | 100 | 4 |
| sv (Sozialversicherung) | 12 | 93 | 100 | 100 | 81 | 77 | 100 | 100 | 84 | 100 | 4 |
| gm (Gesundheitsministerium) | 11 | 98 | 100 | 100 | 100 | 88 | 100 | 100 | 97 | 100 | 0 |
| ka (Krankenanstalten) | 9 | 94 | 100 | 87 | 85 | 86 | 100 | 100 | 89 | 100 | 1 |
| ak (Ärztekammer) | 16 | 94 | 100 | 95 | 77 | 91 | 100 | 100 | 88 | 100 | 6 |
| va (Vertragsärzt:innen) | 13 | 94 | 100 | 100 | 87 | 82 | 100 | 100 | 85 | 100 | 3 |
| expert (Experte) | 5 | 99 | 100 | 100 | 100 | 96 | - | 100 | 100 | 100 | 0 |

## By model
| | n | gesamt | relevanceMandate | relevanceExchange | responsiveness | grounding | repetition | consistency | register | con | markiert |
|---|---|---|---|---|---|---|---|---|---|---|---|
| azure/gpt-6-sol | 57 | 99 | 100 | 100 | 98 | 94 | 100 | 100 | 99 | 100 | 1 |
| bedrock/qwen.qwen3-235b-a22b-2507-v1:0 | 46 | 92 | 99 | 91 | 79 | 82 | 100 | 100 | 86 | 100 | 14 |
| bedrock/zai.glm-5 | 22 | 95 | 100 | 98 | 92 | 79 | 100 | 100 | 88 | 100 | 4 |
| bedrock/mistral.devstral-2-123b | 13 | 93 | 100 | 100 | 67 | 93 | 100 | 97 | 90 | 100 | 4 |

## By round
| | n | gesamt | relevanceMandate | relevanceExchange | responsiveness | grounding | repetition | consistency | register | con | markiert |
|---|---|---|---|---|---|---|---|---|---|---|---|
| R1 | 22 | 98 | 100 | 100 | 93 | 90 | 100 | 100 | 97 | 100 | 0 |
| R2 | 28 | 97 | 100 | 100 | 84 | 92 | 100 | 100 | 100 | 100 | 5 |
| R3 | 31 | 94 | 100 | 96 | 81 | 83 | 100 | 99 | 88 | 100 | 10 |
| R4 | 34 | 95 | 99 | 95 | 89 | 87 | 100 | 100 | 86 | 100 | 4 |
| R5 | 23 | 95 | 99 | - | 92 | 86 | 100 | 100 | 91 | 100 | 4 |

## By exchange
| | n | gesamt | relevanceMandate | relevanceExchange | responsiveness | grounding | repetition | consistency | register | con | markiert |
|---|---|---|---|---|---|---|---|---|---|---|---|
| x1-01 | 10 | 97 | 100 | - | 100 | 85 | 100 | 100 | 93 | 100 | 0 |
| x1-02 | 4 | 97 | 100 | 100 | 84 | 88 | 100 | 100 | 100 | 100 | 0 |
| x1-03 | 4 | 98 | 100 | 100 | 84 | 96 | 100 | 100 | 100 | 100 | 0 |
| x1-04 | 4 | 100 | 100 | - | 100 | 100 | - | 100 | 100 | 100 | 0 |
| x2-01 | 1 | 100 | 100 | - | 100 | 100 | - | 100 | 100 | 100 | 0 |
| x2-02 | 5 | 97 | 100 | 100 | 73 | 100 | 100 | 100 | 100 | 100 | 1 |
| x2-03 | 5 | 94 | 100 | 100 | 60 | 91 | 100 | 100 | 100 | 100 | 2 |
| x2-04 | 3 | 95 | 100 | 100 | 67 | 94 | 100 | 100 | 100 | 100 | 1 |
| x2-05 | 14 | 98 | 100 | - | 100 | 89 | 100 | 100 | 100 | 100 | 1 |
| x3-01 | 1 | 98 | 100 | - | 100 | 90 | - | 100 | 100 | 100 | 0 |
| x3-02 | 6 | 95 | 100 | 95 | 72 | 96 | 100 | 95 | 100 | 100 | 2 |
| x3-03 | 4 | 88 | 100 | 100 | 59 | 72 | 100 | 100 | 67 | 100 | 3 |
| x3-04 | 3 | 90 | 100 | 78 | 67 | 89 | 100 | 100 | 89 | 100 | 1 |
| x3-05 | 3 | 91 | 100 | 100 | 56 | 80 | 100 | 100 | 89 | 100 | 2 |
| x3-06 | 14 | 96 | 100 | 98 | 100 | 80 | 100 | 100 | 88 | 100 | 2 |
| x4-01 | 2 | 100 | 100 | - | 100 | 100 | - | 100 | 100 | 100 | 0 |
| x4-02 | 6 | 96 | 100 | 100 | 95 | 86 | 100 | 100 | 89 | 100 | 0 |
| x4-03 | 6 | 86 | 100 | 78 | 56 | 78 | 100 | 100 | 78 | 100 | 3 |
| x4-04 | 3 | 100 | 100 | 100 | 100 | 97 | 100 | 100 | 100 | 100 | 0 |
| x4-05 | 3 | 97 | 100 | 100 | 89 | 94 | 100 | 100 | 89 | 100 | 0 |
| x4-06 | 14 | 95 | 98 | 98 | 97 | 85 | 100 | 100 | 84 | 100 | 1 |
| x5-01 | 12 | 95 | 100 | - | 88 | 80 | 100 | 100 | 95 | 100 | 4 |
| x5-02 | 11 | 96 | 97 | - | 97 | 93 | 100 | 100 | 88 | 100 | 0 |

## Flagged utterances
- u2-02 Ärztekammer (qwen.qwen3-235b-a22b-2507-v1:0, overall 88): [responsiveness, major, judge] Der Beitrag geht nicht auf die angesprochene regionale Erprobung der Terminzusage, deren Evaluation oder die geforderte Gegenfinanzierung ein, sondern wechselt zu zusätzlichen Kassenstellen.
- u2-07 Patientenvertretung (mistral.devstral-2-123b, overall 92): [responsiveness, major, judge] Der Beitrag fordert die Vierwochenzusage, ohne auf den Einwand einzugehen, dass dafür zusätzliche Kapazitäten und eine gesicherte Honorierung nötig seien.
- u2-10 Patientenvertretung (mistral.devstral-2-123b, overall 92): [responsiveness, major, judge] Der Beitrag verlangt eine bundesweite Umsetzung, ohne auf den Vorschlag einer regionalen Erprobung und die Bedingung eines 15a-Ausgleichs einzugehen.
- u2-12 Ärztekammer (qwen.qwen3-235b-a22b-2507-v1:0, overall 92): [responsiveness, major, judge] Der Beitrag geht nicht auf die angesprochene gesicherte Honorierung und die Finanzierung der Ordinationskosten vor einer Verpflichtung ein.
- u2-23 Sozialversicherung (qwen.qwen3-235b-a22b-2507-v1:0, overall 95): [grounding, major, judge] Die Machbarkeit zusätzlicher Kassenstellen wird als durch Gespräche bestätigt dargestellt, und die Wahrung der Beitragsstabilität wird zugesichert, obwohl beides unbelegte Annahmen sind.
- u3-02 Patientenvertretung (mistral.devstral-2-123b, overall 88): [responsiveness, major, judge] Der Beitrag geht weder auf die Ablehnung einer bundesweiten Vierwochenzusage vor der regionalen Erprobung noch auf den vorgeschlagenen Pilotversuch ein. / [consistency, judge] Die Patientenvertretung fordert hier nur eine Veröffentlichung binnen vier Wochen und lässt ihr Ziel einer verbindlichen Terminzusage unerwähnt.
- u3-04 Ärztekammer (qwen.qwen3-235b-a22b-2507-v1:0, overall 88): [relevanceExchange, judge] Der Beitrag behandelt die Stellenplanung, nicht die im Gespräch strittige Vierwochenzusage. / [responsiveness, major, judge] Das Finanzministerium hat Facharztstellen ausdrücklich ausschließlich im Gesamtvertrag angeboten; die Zurückweisung einer Planung außerhalb des Gesamtvertrags greift daher kein vorgebrachtes Argument auf.
- u3-08 Sozialversicherung (qwen.qwen3-235b-a22b-2507-v1:0, overall 84): [grounding, deterministic] Zahl ohne Beleg und ohne Kennzeichnung als Annahme: 342 / [responsiveness, major, judge] Der Beitrag geht nicht auf den ausdrücklich abgelehnten Ersatz der ärztlichen Erstdiagnose ein. / [grounding, judge] Die Aussage, die vorgeschlagene Absicherung stelle eine wirksame Versorgung sicher, wird nicht belegt. / [register, judge] Die direkte Anrede „Ärztekammer“ wirkt weniger institutionell als die sonst sachliche Formulierung.
- u3-10 Sozialversicherung (qwen.qwen3-235b-a22b-2507-v1:0, overall 87): [grounding, deterministic] Bezifferte Annahme ohne Beleg und ohne Kennzeichnung im Text: Es ist eine Evaluation der Versorgungswirksamkeit und Kosteneffizienz innerhalb der ersten zwölf Monate nach Einführung erforderlich. / [responsiveness, judge] Der Beitrag behandelt die Honorarstaffel, lässt aber die geforderte ärztliche Erstdiagnose binnen 48 Stunden unbeantwortet. / [grounding, major, judge] Die Behauptung „Ohne diesen Nachweis bleibt die Gebarungsvorschau nicht einhaltbar“ wird ohne Kostenabschätzung als Gewissheit dargestellt. / [register, judge] Die direkte Anrede „Ärztekammer“ wirkt weniger institutionell als die sonst sachliche Formulierung.
- u3-11 Ärztekammer (qwen.qwen3-235b-a22b-2507-v1:0, overall 88): [responsiveness, judge] Der Beitrag akzeptiert eine Evaluation, geht aber nicht ausdrücklich auf die geforderte Prüfung der Kosteneffizienz in den ersten zwölf Monaten ein. / [grounding, major, judge] Die „Regionalen Strukturpläne Gesundheit“ werden ohne Begründung als unabhängige Evaluationsinstanz bezeichnet. / [register, judge] Die direkte Anrede „Sozialversicherung“ wirkt weniger institutionell als die sonst sachliche Formulierung.
- u3-12 Ärztekammer (qwen.qwen3-235b-a22b-2507-v1:0, overall 81): [relevanceExchange, judge] Der Beitrag nennt keine verbindliche Terminzusage binnen vier Wochen, obwohl sie das Thema des Gesprächs ist. / [responsiveness, major, judge] Auf die geforderte Evaluation der Honorarstaffel und die Sorge um die Gebarungsvorschau geht der Beitrag nicht ein. / [grounding, judge] Die Behauptung, nur unter diesen Bedingungen könne die Versorgung in Mangelregionen wirksam und dauerhaft verbessert werden, bleibt unbelegt. / [register, judge] Die interne Kennung „p-03“ gehört nicht in einen institutionellen Redebeitrag.
- u3-15 Finanzministerium (gpt-6-sol, overall 85): [responsiveness, major, judge] Der Beitrag antwortet auf u3-11 (Ärztekammer) zu Telemedizin und Honorarerhöhung, thematisiert aber befristete Facharztstellen und Vierwochenzusage, ohne auf die Argumente der Ärztekammer einzugehen.
- u3-17 Vertragsärzt:innen (zai.glm-5, overall 88): [responsiveness, judge] Der Beitrag geht auf die geforderte Entlastung der Spitalsambulanzen nicht konkret ein. / [grounding, major, judge] Die Behauptung, die Kombination der Maßnahmen bleibe unter der 5-Prozent-Grenze, enthält weder eine Berechnung noch einen Beleg. / [register, judge] Die Formulierung „Zusatzterminfinanziert“ ist sprachlich fehlerhaft und erschwert das Verständnis.
- u3-20 Pflegevertretung (qwen.qwen3-235b-a22b-2507-v1:0, overall 86): [grounding, deterministic] Expertenhinweis: p-05 "Etablierung des pflegerischen Erstkontakts in PVE-Verträgen mit telemedizinischer Steuerung": Rechtsgrundlage: PrimVG § 2, PrimVG § 8, PrimVG § 14, ASVG § 342b, GuKG § 14, GuKG § 15, ÄrzteG § 49 Abs. 3; im geltende / [relevanceExchange, judge] Die Zustimmung zu den Facharztstellen wird kaum erläutert; der Beitrag konzentriert sich stattdessen auf Pflegekompetenzen und andere Vorschläge. / [grounding, major, judge] Die Behauptung, strukturelle Entlastung gelinge „nur über erweiterte Pflegekompetenzen“, ist unbelegt und schließt andere Maßnahmen ohne Begründung aus. / [register, judge] Die internen Vorschlagskennungen „p-03“, „p-01“ und „p-02“ widersprechen dem geforderten Register.
- u3-24 Vertragsärzt:innen (zai.glm-5, overall 95): [grounding, deterministic] Expertenhinweis: p-06 "Kombipaket: Tarifpositionen und Facharztstellen in Mangelregionen": Rechtsgrundlage: ASVG § 342 Abs. 1 Z 3; im geltenden Recht umsetzbar (Gesamtvertrag, RSG oder Vereinbarung). / [grounding, major, judge] Für die behaupteten Gesamtkosten von unter 150 Millionen Euro jährlich fehlt eine Kalkulation, die Facharztstellen und zusätzliche Honorare berücksichtigt.
- u4-12 Vertragsärzt:innen (zai.glm-5, overall 84): [grounding, deterministic] Zahl ohne Beleg und ohne Kennzeichnung als Annahme: 342 / [responsiveness, major, judge] Der Beitrag fordert eine Tarifposition, ohne auf den unmittelbar zuvor erhobenen Einwand gegen Kostenverschiebungen auf Länderbudgets einzugehen. / [grounding, judge] Die pauschale Behauptung „Die Terminvermittlung über 1450 entlastet uns alle“ wird nicht belegt oder als Annahme gekennzeichnet. / [register, judge] Das Wort „Vierwochenzague“ ist ein störender Schreibfehler.
- u4-13 Pflegevertretung (qwen.qwen3-235b-a22b-2507-v1:0, overall 81): [grounding, deterministic] Zahl ohne Beleg und ohne Kennzeichnung als Annahme: 8, 3 / [responsiveness, major, judge] Die Antwort verlangt die Finanzierung pflegerischer Erstkontakte, ohne die konkret geforderte Honorierung der ärztlichen Koordinationsleistung aufzugreifen. / [grounding, major, judge] Die Aussage, die Finanzierung sichere Community Nursing „ohne Mehrkosten für Länder oder Sozialversicherung“, bleibt ohne Beleg oder nachvollziehbare Gegenfinanzierung. / [register, judge] Die direkte Anrede „Vertragsärzt:innen, Krankenanstalten“ weicht von der institutionellen Wir-Stimme ab.
- u4-14 Krankenanstalten (qwen.qwen3-235b-a22b-2507-v1:0, overall 81): [grounding, deterministic] Zahl ohne Beleg und ohne Kennzeichnung als Annahme: 342, 15 / [relevanceExchange, judge] Der Beitrag akzeptiert die Vermittlung über 1450, lässt aber die verbindliche Vierwochenzusage offen. / [responsiveness, major, judge] Die Antwort übernimmt Bedingungen zur ärztlichen Honorierung und zu Länderkosten, geht aber nicht auf die unmittelbar geforderte Finanzierung pflegerischer Erstkontakte ein. / [register, judge] Die direkte Anrede „Vertragsärzt:innen, Pflegevertretung“ weicht von der institutionellen Wir-Stimme ab.
- u4-27 Pflegevertretung (qwen.qwen3-235b-a22b-2507-v1:0, overall 77): [grounding, deterministic] Zahl ohne Beleg und ohne Kennzeichnung als Annahme: 8, 3 / [relevanceMandate, judge] Der Beitrag macht die Zustimmung zur Terminvermittlung von der Finanzierung pflegerischer Erstkontakte abhängig, ohne deren Zusammenhang mit der Vermittlung zu erläutern. / [relevanceExchange, judge] Statt die Ausgestaltung der Terminservicestelle zu behandeln, steht die Finanzierung pflegerischer Erstkontakte im Mittelpunkt. / [responsiveness, judge] Die erbetene Stimme wird abgegeben, die Bedingung zur Pflegefinanzierung aber nicht mit dem zur Abstimmung stehenden Vorschlag verknüpft. / [grounding, major, judge] Die Behauptungen, strukturelle Entlastung gelinge nur durch erweiterte Pflegekompetenzen und Community Nursing werde ohne Mehrkosten verankert, bleiben unbelegt. / [register, judge] Die interne Kennung „p-04“ steht im Redebeitrag.
- u5-02 Ärztekammer (qwen.qwen3-235b-a22b-2507-v1:0, overall 94): [grounding, deterministic] Expertenhinweis: Die Sozialversicherung trägt die Kosten für p-09 / p-08 und p-09 erfordern 60 Mio. EUR jährlich aus Verwaltungsumschichtungen: c-5-02-4 spricht von direkter Kostentragung durch die Sozialversicherung, c-5-07-2 von einer  / [grounding, major, judge] Die behaupteten Garantien für Honorierung und Umschichtung bei p-07 und p-09 sind nicht belegt; insbesondere bleibt die Finanzierung von p-09 ungeklärt.
- u5-03 Patientenvertretung (mistral.devstral-2-123b, overall 86): [relevanceExchange, major, judge] Die Stimme gilt vor allem p-04, obwohl in der Schlussrunde p-05 bis p-09 zur Abstimmung stehen. / [responsiveness, major, judge] Die übrigen zur Abstimmung stehenden Vorschläge werden nur pauschal abgelehnt, statt die erbetenen endgültigen Stimmen und offenen Punkte einzeln zu benennen. / [grounding, major, judge] Die gesicherte Finanzierung und der Ausschluss neuer Selbstbehalte werden ohne Beleg als Tatsachen dargestellt.
- u5-08 Sozialversicherung (qwen.qwen3-235b-a22b-2507-v1:0, overall 89): [grounding, deterministic] Expertenhinweis: Die Sozialversicherung schichtet 100 Mio. EUR aus steuerbaren ambulanten Ausgaben um. / p-08 und p-09 erfordern 60 Mio. EUR jährlich aus Verwaltungsumschichtungen: c-5-08-1 nennt exakt 100 Mio. EUR aus 'steuerbaren ambul / [grounding, major, judge] Die Umschichtung von 100 Mio. EUR und die dadurch gesicherte Beitragsstabilität werden ohne Beleg als feststehend dargestellt; zudem ist die behauptete Deckungsgleichheit von p-08 und p-09 mit p-07 angesichts unterschiedlicher Beträge und Finanzierungsquellen nicht begründet. / [register, judge] Der Beitrag verwendet mit „ab - fehlende Budgetbindung“ ein Gedankenstrich-Zeichen.
- u5-09 Bundesländer (zai.glm-5, overall 94): [grounding, deterministic] Expertenhinweis: p-06 mit 125 Mio. EUR wird von Bundesländern unterstützt / Die Umschichtung muss 60 Mio. EUR betragen.: Numerischer Widerspruch: frühere Aussagen legen 60 Mio. EUR als notwendige Umschichtung fest, neue Aussage nennt 125 / [grounding, major, judge] Die Beträge von 125, 100 und 150 Mio. EUR sowie die gesicherte Honorierung und fehlende Länderbelastung werden ohne Belege oder Kennzeichnung als Annahmen behauptet; zugleich bleiben die Umschichtungsquellen laut Beitrag offen.
