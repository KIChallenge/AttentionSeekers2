# Quality report scenario-wartezeiten-rule-veto

Rubric debate-quality-rubric-v1. Judge: bedrock/zai.glm-5, azure/gpt-6-sol (cross-family: Azure GPT turns judged by Bedrock Nova, Bedrock turns judged by Azure GPT); temperature 0, reasoning none, seed 20261106 (Azure), fixed rubric, batches of up to 6 utterances per exchange. 47 calls, 0 failed, about 0.2495 USD (estimate from list prices).
Scores are 0 to 100 (100 = no problem). Flagged = a major issue, a dimension at or below 33, or overall below 80; minor issues alone do not flag.

Overall 96; 35 of 140 utterances flagged. Issues by dimension: grounding 91, responsiveness 42, register 20, relevanceExchange 8, relevanceMandate 2, consistency 1.
Gate: 102 turns gated, 4 regenerated, 1 accepted with a flag; 4 moderation decisions (concrete_demand, concrete_demand, concrete_demand, concrete_demand).

## By agent
| | n | gesamt | relevanceMandate | relevanceExchange | responsiveness | grounding | repetition | consistency | register | con | markiert |
|---|---|---|---|---|---|---|---|---|---|---|---|
| moderator (Moderation) | 24 | 99 | 100 | 100 | 96 | 97 | - | 100 | 100 | 100 | 1 |
| pf (Pflegevertretung) | 13 | 93 | 100 | 96 | 77 | 77 | 100 | 100 | 95 | 100 | 6 |
| fm (Finanzministerium) | 17 | 98 | 100 | 100 | 92 | 89 | 100 | 100 | 100 | 100 | 1 |
| bl (Bundesländer) | 12 | 95 | 100 | 96 | 89 | 85 | 100 | 97 | 89 | 100 | 4 |
| pv (Patientenvertretung) | 16 | 92 | 100 | 95 | 63 | 90 | 100 | 100 | 86 | 100 | 7 |
| sv (Sozialversicherung) | 9 | 96 | 100 | 100 | 81 | 91 | 100 | 100 | 93 | 100 | 4 |
| gm (Gesundheitsministerium) | 9 | 98 | 100 | 100 | 96 | 83 | 100 | 100 | 100 | 100 | 0 |
| ka (Krankenanstalten) | 7 | 97 | 100 | 100 | 95 | 90 | 100 | 100 | 91 | 100 | 1 |
| ak (Ärztekammer) | 17 | 94 | 96 | 92 | 80 | 86 | 100 | 100 | 94 | 100 | 7 |
| va (Vertragsärzt:innen) | 11 | 94 | 100 | 95 | 82 | 83 | 100 | 100 | 88 | 100 | 4 |
| expert (Experte) | 5 | 100 | 100 | 100 | 100 | 100 | - | 100 | 100 | 100 | 0 |

## By model
| | n | gesamt | relevanceMandate | relevanceExchange | responsiveness | grounding | repetition | consistency | register | con | markiert |
|---|---|---|---|---|---|---|---|---|---|---|---|
| azure/gpt-6-sol | 55 | 98 | 100 | 100 | 95 | 93 | 100 | 100 | 100 | 100 | 2 |
| bedrock/qwen.qwen3-235b-a22b-2507-v1:0 | 46 | 94 | 99 | 96 | 82 | 85 | 100 | 100 | 94 | 100 | 18 |
| bedrock/zai.glm-5 | 23 | 94 | 100 | 96 | 86 | 84 | 100 | 99 | 88 | 100 | 8 |
| bedrock/mistral.devstral-2-123b | 16 | 92 | 100 | 95 | 63 | 90 | 100 | 100 | 86 | 100 | 7 |

## By round
| | n | gesamt | relevanceMandate | relevanceExchange | responsiveness | grounding | repetition | consistency | register | con | markiert |
|---|---|---|---|---|---|---|---|---|---|---|---|
| R1 | 23 | 97 | 100 | 100 | 91 | 90 | 100 | 100 | 99 | 100 | 3 |
| R2 | 31 | 96 | 99 | 98 | 79 | 93 | 100 | 100 | 100 | 100 | 8 |
| R3 | 31 | 94 | 99 | 92 | 77 | 90 | 100 | 100 | 96 | 100 | 12 |
| R4 | 32 | 95 | 100 | 100 | 88 | 82 | 100 | 99 | 89 | 100 | 7 |
| R5 | 23 | 96 | 100 | - | 96 | 86 | 100 | 100 | 88 | 100 | 5 |

## By exchange
| | n | gesamt | relevanceMandate | relevanceExchange | responsiveness | grounding | repetition | consistency | register | con | markiert |
|---|---|---|---|---|---|---|---|---|---|---|---|
| x1-01 | 10 | 99 | 100 | - | 100 | 92 | 100 | 100 | 100 | 100 | 0 |
| x1-02 | 4 | 95 | 100 | 100 | 92 | 75 | 100 | 100 | 92 | 100 | 2 |
| x1-03 | 5 | 96 | 100 | 100 | 80 | 90 | 100 | 100 | 100 | 100 | 0 |
| x1-04 | 4 | 97 | 100 | - | 78 | 100 | - | 100 | 100 | 100 | 1 |
| x2-01 | 1 | 100 | 100 | - | 100 | 100 | - | 100 | 100 | 100 | 0 |
| x2-02 | 6 | 95 | 95 | 95 | 72 | 100 | 100 | 100 | 100 | 100 | 2 |
| x2-03 | 4 | 96 | 100 | 100 | 75 | 92 | 100 | 100 | 100 | 100 | 1 |
| x2-04 | 3 | 92 | 100 | 100 | 44 | 89 | 100 | 100 | 100 | 100 | 3 |
| x2-05 | 3 | 99 | 100 | 100 | 100 | 94 | 100 | 100 | 100 | 100 | 0 |
| x2-06 | 14 | 97 | 100 | - | 85 | 90 | 100 | 100 | 100 | 100 | 2 |
| x3-01 | 1 | 100 | 100 | - | 100 | 100 | - | 100 | 100 | 100 | 0 |
| x3-02 | 6 | 93 | 95 | 83 | 61 | 100 | 100 | 100 | 100 | 100 | 3 |
| x3-03 | 5 | 96 | 100 | 100 | 73 | 91 | 100 | 100 | 100 | 100 | 2 |
| x3-04 | 3 | 92 | 100 | 100 | 56 | 89 | 100 | 100 | 89 | 100 | 2 |
| x3-05 | 2 | 89 | 100 | 100 | 50 | 92 | 100 | 100 | 67 | 100 | 1 |
| x3-06 | 14 | 96 | 100 | 91 | 92 | 85 | 100 | 100 | 98 | 100 | 4 |
| x4-01 | 2 | 100 | 100 | - | 100 | 100 | - | 100 | 100 | 100 | 0 |
| x4-02 | 6 | 97 | 100 | 100 | 100 | 74 | 100 | 100 | 100 | 100 | 0 |
| x4-03 | 5 | 91 | 100 | 100 | 60 | 93 | 100 | 100 | 73 | 100 | 1 |
| x4-04 | 3 | 98 | 100 | 100 | 89 | 93 | 100 | 100 | 100 | 100 | 0 |
| x4-05 | 2 | 92 | 100 | 100 | 50 | 82 | 100 | 100 | 100 | 100 | 2 |
| x4-06 | 14 | 95 | 100 | 100 | 97 | 77 | 100 | 98 | 84 | 100 | 4 |
| x5-01 | 12 | 93 | 100 | - | 97 | 78 | 100 | 100 | 78 | 100 | 5 |
| x5-02 | 11 | 98 | 100 | - | 94 | 95 | 100 | 100 | 100 | 100 | 0 |

## Flagged utterances
- u1-12 Ärztekammer (qwen.qwen3-235b-a22b-2507-v1:0, overall 92): [grounding, major, judge] Die Forderung nach genau 1000 zusätzlichen Kassenstellen wird nicht hergeleitet und nicht mit dem Ausgabenlimit abgeglichen. / [register, judge] Die Formulierung „unser roter Punkt“ klingt nach einer internen Verhandlungsmarkierung statt nach institutioneller Sprache.
- u1-14 Ärztekammer (qwen.qwen3-235b-a22b-2507-v1:0, overall 96): [grounding, major, judge] Die erneut geforderten 1.000 Kassenstellen werden weder hergeleitet noch mit dem Ausgabenlimit abgeglichen.
- u1-22 Moderation (gpt-6-sol, overall 89): [responsiveness, major, judge] Die Moderation fordert einen Beleg für eine leere Aussage ("") und geht damit nicht auf den konkreten Inhalt des Beitrags der Bundesländer ein.
- u2-02 Patientenvertretung (mistral.devstral-2-123b, overall 92): [responsiveness, major, judge] Der Beitrag geht nicht auf den konkret vorgebrachten Organisationsaufwand und die geforderte Honorierung einer Terminpflicht ein.
- u2-07 Ärztekammer (qwen.qwen3-235b-a22b-2507-v1:0, overall 83): [relevanceMandate, judge] Der Beitrag beschränkt sich auf die Stellenplanung und erläutert nicht, wie dies die Wartezeiten oder die Terminzusage beeinflusst. / [relevanceExchange, judge] Die Stellenplanung gehört zum Vorschlag, doch die verhandelte Vierwochenzusage bleibt unerwähnt. / [responsiveness, major, judge] Das Finanzministerium schlägt gezielte Kassenstellen bereits im Gesamtvertrag vor; der Beitrag behandelt stattdessen eine nicht vorgeschlagene Auslagerung der Stellenplanung.
- u2-08 Bundesländer (zai.glm-5, overall 90): [responsiveness, major, judge] Der Beitrag geht weder auf die Einschränkung des pflegerischen Erstkontakts noch auf die geforderten 1.000 Kassenstellen ein und wechselt stattdessen zur Planungshoheit. / [grounding, judge] Die Aussage, der 15a-Mechanismus sichere Honorarerwartungen und Budgetverantwortung, bleibt ohne Erläuterung der Finanzierung unbelegt.
- u2-12 Patientenvertretung (mistral.devstral-2-123b, overall 92): [responsiveness, major, judge] Der Beitrag geht nicht auf den Einwand zur Stellenplanung im Gesamtvertrag und zu bindenden Landesvorgaben ein.
- u2-13 Pflegevertretung (qwen.qwen3-235b-a22b-2507-v1:0, overall 92): [responsiveness, judge] Der Beitrag unterstützt die Vierwochen-Terminzusage, greift aber die geforderte Wartezeittransparenz und die Terminservicestelle über 1450 nicht auf. / [grounding, major, judge] Die Aussage, die Finanzierung erfolge über PVE-Verträge ohne zusätzliche Belastung für Patient:innen oder Länder, wird nicht belegt oder als Annahme gekennzeichnet.
- u2-14 Sozialversicherung (qwen.qwen3-235b-a22b-2507-v1:0, overall 92): [responsiveness, major, judge] Der Beitrag geht nicht auf den Vorschlag ein, Community Nursing auszuweiten und über PVE-Verträge zu finanzieren.
- u2-20 Pflegevertretung (qwen.qwen3-235b-a22b-2507-v1:0, overall 91): [responsiveness, judge] Der Beitrag nennt Positionen, gibt aber keine ausdrückliche Stimme zu den offenen Vorschlägen ab. / [grounding, major, judge] Die ausschließliche Möglichkeit einer Entlastung durch nichtärztliche Kompetenzausweitungen wird ohne Beleg als gesichert dargestellt.
- u2-26 Sozialversicherung (qwen.qwen3-235b-a22b-2507-v1:0, overall 91): [responsiveness, judge] Der Beitrag legt Positionen dar, gibt aber keine ausdrückliche Stimme zu den offenen Vorschlägen ab. / [grounding, major, judge] Die behaupteten Einsparungen bei der Terminkoordination werden ohne Beleg oder Kennzeichnung als Annahme zur Finanzierung der Honorierung herangezogen.
- u3-02 Patientenvertretung (mistral.devstral-2-123b, overall 88): [relevanceExchange, judge] Der Beitrag fordert eine Veröffentlichung von Wartezeiten, klärt aber nicht die im Gespräch strittige verbindliche Terminzusage. / [responsiveness, major, judge] Auf die Bedingungen der Sozialversicherung für eine Terminzusage, insbesondere Honorierung und Finanzierung, geht der Beitrag nicht ein.
- u3-04 Ärztekammer (qwen.qwen3-235b-a22b-2507-v1:0, overall 75): [relevanceMandate, judge] Stellenplanung und ärztliche Erstdiagnose gehören zum Mandat, tragen hier aber kaum zur Klärung der Terminzusage bei. / [relevanceExchange, major, judge] Der Beitrag behandelt weder die vorgeschlagene Veröffentlichung von Wartezeiten noch die Bedingungen für eine Vierwochenzusage. / [responsiveness, major, judge] Die Antwort greift keine der konkreten Aussagen des Finanzministeriums zu reservierten Terminen, Honorierung oder Gegenfinanzierung auf.
- u3-05 Sozialversicherung (qwen.qwen3-235b-a22b-2507-v1:0, overall 92): [responsiveness, major, judge] Der Beitrag knüpft zwar an vertragliche Kassenstellen an, geht aber nicht auf den Einwand gegen eine Stellenplanung außerhalb des Gesamtvertrags oder auf die ärztliche Erstdiagnose ein.
- u3-08 Pflegevertretung (qwen.qwen3-235b-a22b-2507-v1:0, overall 86): [grounding, deterministic] Expertenhinweis: Die zusätzlichen Mittel müssen durch Umschichtungen gegenfinanziert werden. / Die zusätzlichen Mittel belaufen sich auf 273 Mio. EUR pro Jahr.: Frühere Aussage c-3-08-2 nennt 273 Mio.EUR pro Jahr an zusätzlichen Mitteln. / [responsiveness, major, judge] Der Beitrag geht weder auf die Forderung nach Stellenplanung im Gesamtvertrag noch auf die Ablehnung einer Terminzusage ohne Honorierung ein. / [grounding, major, judge] Die Behauptung, 273 Mio. EUR pro Jahr hielten die zusätzlichen Mittel im zulässigen Rahmen, bleibt ohne Gegenfinanzierung oder nachvollziehbaren Bezug zur Ausgabengrenze.
- u3-09 Ärztekammer (qwen.qwen3-235b-a22b-2507-v1:0, overall 92): [responsiveness, deterministic] Verhandlungsphase: weder ein konkreter Vorschlag (mit Betrag, Frist, Umfang oder Bedingung) noch ein begründeter Einwand. / [responsiveness, judge] Die Bedingungen greifen Erstkontakt und Vertragsbindung auf, lassen aber die genannten 273 Mio. EUR pro Jahr ohne konkrete Einordnung.
- u3-13 Patientenvertretung (mistral.devstral-2-123b, overall 88): [responsiveness, major, judge] Der Beitrag geht nicht auf die angesprochene regionale Mitentscheidung bei der Planung von PVE und Community Nursing ein. / [register, judge] Die Formulierung „eine einzigartige und einer gerechte Zugangsplanung“ ist sprachlich misslungen.
- u3-15 Pflegevertretung (qwen.qwen3-235b-a22b-2507-v1:0, overall 92): [responsiveness, judge] Der Beitrag schlägt eine Entlastung durch Pflege vor, geht aber nicht auf die geforderte Honorarabsicherung ein. / [grounding, major, judge] Die Aussage, die Finanzierung erfolge über PVE-Verträge und verursache deshalb keine zusätzlichen Belastungen, ist nicht hinreichend belegt.
- u3-16 Vertragsärzt:innen (zai.glm-5, overall 77): [responsiveness, major, judge] Der Beitrag geht nicht auf die angesprochene pflegerische Triage, die Bindung an den Gesamtvertrag oder die regionale Abstimmung ein. / [grounding, judge] Dass reservierte Termine über 1450 die Honorierung sichern, wird ohne erkennbare vertragliche Grundlage behauptet. / [register, major, judge] Die interne Kennung „p-04“ und die chinesischen Zeichen in „相应的 Vergütung“ verletzen das geforderte institutionelle Register.
- u3-19 Patientenvertretung (mistral.devstral-2-123b, overall 84): [relevanceExchange, judge] Der Beitrag behandelt Terminzusagen und Transparenz, geht aber kaum auf die im Plenum behandelten Kassenstellen ein. / [responsiveness, judge] Die erbetene Stimme zu p-01 bleibt aus. / [grounding, major, judge] Die behauptete Tragfähigkeit der Terminzusage und die angeblich bereits umgesetzte Verknüpfung mit Kapazität und Finanzierung werden nicht belegt oder als Annahmen gekennzeichnet. / [register, judge] Die Formulierung „Unsere Lektion aus Runde 2“ ist eine unpassende Meta-Formulierung für einen institutionellen Redebeitrag.
- u3-20 Pflegevertretung (qwen.qwen3-235b-a22b-2507-v1:0, overall 91): [grounding, deterministic] Zahl ohne Beleg und ohne Kennzeichnung als Annahme: 9 / [relevanceExchange, judge] Der Beitrag stimmt zwar über p-01 ab, verlagert den Schwerpunkt aber von Kassenstellen auf Pflegekompetenzen und PVE-Verträge. / [grounding, major, judge] Die ausschließliche Wirksamkeit nichtärztlicher Kompetenzausweitungen und die kapazitätssteigernde Wirkung von Community Nursing werden ohne Beleg oder Kennzeichnung als Annahme behauptet.
- u3-22 Bundesländer (zai.glm-5, overall 92): [relevanceExchange, judge] Der eigene Vorschlag betrifft vor allem die PVE-Planung statt der Kassenstellen. / [grounding, major, judge] Die Finanzierung des Monitorings über die 15a-Vereinbarung wird als gesichert dargestellt, obwohl sie nicht belegt ist; auch die geschätzten 5 Mio. EUR jährlich haben keine erkennbare Grundlage.
- u3-24 Vertragsärzt:innen (zai.glm-5, overall 88): [relevanceExchange, judge] Der Beitrag konzentriert sich auf reservierte Termine und p-04 statt auf die Kassenstellen und p-01. / [responsiveness, judge] Eine ausdrückliche Stimme zu dem auf dem Tisch liegenden p-01 fehlt. / [grounding, major, judge] Dass die Tarifposition den Koordinationsaufwand deckt, wird ohne Beleg oder Kennzeichnung als Annahme behauptet.
- u4-09 Patientenvertretung (mistral.devstral-2-123b, overall 73): [responsiveness, major, judge] Der Beitrag geht nicht auf die angesprochene PVE-Planung und Ländermitwirkung ein, sondern wechselt zu reservierten Facharztterminen. / [grounding, judge] Die behauptete Wirkung von Zusatzversicherungen auf die Zwei-Klassen-Medizin bleibt unbegründet. / [register, major, judge] Die englische und russische Passage sowie die Formulierung „reserviertere Facharzttermine“ verletzen das sachliche deutsche Register.
- u4-17 Finanzministerium (gpt-6-sol, overall 88): [responsiveness, major, judge] Der Beitrag antwortet auf u4-13 (Bundesländer), thematisiert aber ausschließlich eine gemeinsame Linie mit der Ärztekammer und greift die Ausführungen der Bundesländer zu Finanzausgleich und Landes-Zielsteuerung nicht auf.
- u4-18 Ärztekammer (qwen.qwen3-235b-a22b-2507-v1:0, overall 95): [grounding, major, deterministic] Vom Experten als widersprüchlich markiert: Die zusätzlichen Mittel müssen durch Umschichtungen gegenfinanziert werden. / [grounding, judge] Die genannten 120 Millionen Euro werden nicht eingeordnet, obwohl die Expertenhinweise für zusätzliche Mittel auch 273 Millionen Euro pro Jahr nennen.
- u4-20 Sozialversicherung (qwen.qwen3-235b-a22b-2507-v1:0, overall 92): [grounding, major, judge] Die Finanzierung durch eine 15a-konforme Umschichtung und die Honorierung im Gesamtvertrag werden als gesichert dargestellt, obwohl sie nicht belegt sind und eine konkrete Gegenfinanzierung fehlt. / [register, judge] Die interne Kennung „p-04“ gehört nicht in einen institutionellen Redebeitrag.
- u4-25 Pflegevertretung (qwen.qwen3-235b-a22b-2507-v1:0, overall 92): [grounding, major, judge] Die Finanzierung wird als „sichergestellt“ bezeichnet, obwohl eine konkret benannte Gegenfinanzierung noch fehlt. / [register, judge] Die internen Kennungen „p-04“, „p-06“ und „p-08“ gehören nicht in einen institutionellen Redebeitrag.
- u4-26 Bundesländer (zai.glm-5, overall 88): [grounding, major, judge] Der Beitrag stellt den Ausgleich für Länderbudgets und die verbindliche Steuerungskompetenz als gesichert dar, obwohl die Gegenfinanzierung und die regionale Steuerung noch offen sind. / [consistency, judge] Die vorbehaltlose Zustimmung zu p-04 ist mit der Bedingung eines Ausgleichs für Länderbudgets nur eingeschränkt vereinbar, solange dieser nicht gesichert ist. / [register, judge] Die interne Kennung „p-04“ gehört nicht in einen institutionellen Redebeitrag.
- u4-28 Vertragsärzt:innen (zai.glm-5, overall 88): [grounding, deterministic] Zahl ohne Beleg und ohne Kennzeichnung als Annahme: 200 / [grounding, deterministic] Bezifferte Annahme ohne Beleg und ohne Kennzeichnung im Text: p-07 sieht 200 zusätzliche Kassenstellen vor / [grounding, deterministic] Expertenhinweis: p-04 kostet 120 Mio. EUR pro Jahr / Die diskutierten zusätzlichen 120 Mio. Euro werden mit diesem Angebot nicht freigegeben.: Die Aussage, p-04 koste 120 Mio. EUR pro Jahr, wird durch frühere Aussagen direkt widersproche / [grounding, major, judge] Die Zusage, dass „jede reservierte Terminstunde im Gesamtvertrag vergütet wird“, ist unbelegt; auch die Zahl von 200 zusätzlichen Kassenstellen wird ohne Beleg genannt. / [register, judge] Die Formulierung „unsere rote Linie“ benennt eine interne Verhandlungsgrenze statt sie institutionell zu formulieren.
- u5-02 Ärztekammer (qwen.qwen3-235b-a22b-2507-v1:0, overall 89): [grounding, deterministic] Expertenhinweis: Die Mittel sind zusätzlich / Umschichtung aus Bundesmitteln im Finanzausgleich: Widerspruch innerhalb derselben Akteur-Aussage: 'zusätzlich' und 'Umschichtung' schließen sich aus. Keine unterschiedliche zeitliche oder sa / [grounding, major, judge] Die Mittel werden zugleich als „zusätzlich“ und als Ergebnis einer Umschichtung bezeichnet, ohne diesen Widerspruch aufzulösen. / [register, judge] Die interne Vorschlagskennung „p-04“ steht im Redebeitrag.
- u5-03 Patientenvertretung (mistral.devstral-2-123b, overall 91): [grounding, major, judge] Die Finanzierung mit 120 Mio. Euro jährlich wird als gesichert dargestellt, obwohl keine konkrete Umschichtungsquelle benannt ist. / [register, judge] Die interne Vorschlagskennung „p-04“ steht im Redebeitrag.
- u5-05 Vertragsärzt:innen (zai.glm-5, overall 89): [grounding, deterministic] Expertenhinweis: p-06 kostet 273 Mio. EUR pro Jahr / p-04 kostet 120 Mio. EUR pro Jahr: Wert widerspricht direkt: 273 Mio. EUR (c-5-05-2) vs. 120 Mio. EUR (c-4-21-1) für vergleichbare Pakete; kein Hinweis auf Abgrenzungsunterschiede oder / [grounding, major, judge] Die Kosten von 273 Millionen Euro werden ohne Beleg als feststehend genannt; der Expertenhinweis meldet zudem einen ungeklärten Widerspruch zu einer anderen Paketkostenzahl. / [register, judge] Der Redebeitrag verwendet interne Vorschlagskennungen wie „p-04“ und „p-07“.
- u5-07 Krankenanstalten (qwen.qwen3-235b-a22b-2507-v1:0, overall 91): [grounding, major, judge] Die 15a-konforme Finanzierung und die Entlastung der Spitalsambulanzen werden als gesichert behauptet, obwohl dafür keine Belege vorliegen und die Finanzierung offen ist. / [register, judge] Die interne Vorschlagskennung „p-04“ steht im Redebeitrag.
- u5-09 Bundesländer (zai.glm-5, overall 84): [grounding, deterministic] Expertenhinweis: p-06 kostet 273 Mio. EUR ohne Gegenfinanzierung / Die zusätzlichen Mittel müssen durch Umschichtungen gegenfinanziert werden.: Numerischer und konzeptioneller Widerspruch: Höhere Summe (273 Mio. vs. 120 Mio.) und Behaupt / [grounding, major, judge] Die 15a-konforme Finanzierung und die Kostenneutralität von p-10 werden als feststehend dargestellt, obwohl die konkrete Umschichtung offen bleibt und für die Kostenneutralität kein Beleg genannt wird. / [register, major, judge] Der Redebeitrag verwendet zahlreiche interne Vorschlagskennungen und den englischen Ausdruck „Budgetimpact“.
