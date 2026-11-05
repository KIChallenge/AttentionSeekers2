# Methodennotiz für die Jury

HealthPolicy Simulator, KI Challenge Use Case 2. Stand 2026-11-06. Im Prototyp unter `/method`,
Messwerte dort aus `runs/method-note.json`.

Diese Notiz sagt, was der Simulator misst, woher seine Positionen und Labels kommen und wo er
nicht belastbar ist. Sie ist bewusst kürzer als die Anforderungen (PRD v2.11) und nennt die
Grenzen vor den Stärken, wo beides auf denselben Punkt zielt.

## 1. Drei getrennte Behauptungen

Der Simulator macht drei Aussagen, und jede wird anders geprüft. Sie werden nie zu einem
"realistisch" zusammengefasst.

| Behauptung                                                                              | Wie gemessen                                                                                                    | Status                               |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| **Ergebnisplausibilität**: Ist das ausgehandelte Paket historisch plausibel?            | Referenzklassen-Prognose über Erstentwürfe, Labels aus dem Gesetzgebungsprotokoll                               | gemessen als Basisrate mit Intervall |
| **Positionstreue**: Vertritt jeder Agent, was die Institution historisch vertreten hat? | Abstand der simulierten Position zum gefitteten Stance-Profil; Persona-Klassifikator "klingt wie Institution X" | berechnet pro Agent                  |
| **Prozessrealismus**: Verläuft die Verhandlung wie eine echte?                          | nicht gemessen                                                                                                  | ausdrücklich offen                   |

## 2. Woher die Positionen kommen

**Quelle.** Begutachtungs-Stellungnahmen aus Parlament Open Data (Liste 142): formelle, datierte,
institutionelle Positionen zu Ministerialentwürfen. 21.588 Stellungnahmen sind 60 Institutionen und
den Simulator-Agenten zugeordnet, 2.667 gesundheitsbezogene Texte sind extrahiert und in 91.820
Absätze mit Paragraphenbezug segmentiert.

**Warum nicht primär Presse.** Die Aufgabenstellung verlangt Standpunkte aus Medienberichten und
Pressestatements, nachvollziehbar. Presseartikel transportieren Positionen meist als Zitat einer
Person, die wir nicht zitieren dürfen (CON-2). Stellungnahmen sind institutionell gezeichnet und
datiert. Der Pressespiegel dient als Kontext und lokale Volltextsuche.

**Maskierung.** Vor jedem Modellschritt werden Sätze mit Personennamen maskiert (spaCy NER, Titel-
Regel, Listen "Nachname, Vorname", Vornamen-Regel, "e.h."). 5.301 von 147.697 Sätzen wurden maskiert;
ein zweiter Lauf mit denselben Regeln findet 0 Treffer. Die Engine prüft jede Ausgabe noch einmal
mit einem eigenen Guard und schlägt bei einem Treffer fehl. Für den Persona-Klassifikator werden
auch Institutionsnamen durch `[INSTITUTION]` ersetzt, sonst lernt er nur den Briefkopf.

**Gewichtung nach Aktualität.** Jeder Lauf hat ein as-of-Datum. Retrieval liefert nur Quellen mit
Datum vor diesem Stichtag; das Gewicht fällt exponentiell mit einer Halbwertszeit von zwei Jahren
(Untergrenze 0,05). Alter und Gewicht stehen an jedem Zitat.

**Lücken.** Wahlärzt:innen haben keine einzige Stellungnahme (2006 bis 2026), das Gesundheits-
ministerium nur 4, weil es die Entwürfe selbst schreibt. Diese Agenten sind im Setup-Raum als
"prompted" markiert, nicht als "fitted".

## 3. Verhandlung und Spieltheorie

- Moderator ohne eigene Position: Mandat, Akteursauswahl mit Begründung, Entscheidungsregel,
  Rundenlimit. Zusammenfassungen nennen offene Konflikte vor Einigungen, weil Moderator-Summaries
  in der Literatur Konsens herbeischreiben.
- Sprechreihenfolge pro Runde zufällig und protokolliert (der letzte Sprecher hat sonst einen
  messbaren Vorteil).
- Pro Agent und Runde eine strategische Einschätzung: Verhandlungsmacht, Vetostatus, BATNA,
  Koalitionsoptionen, Abhängigkeiten, Anreize je Vorschlag, Kooperation oder Blockade.
- Koalitionskalkül als reine Funktion ohne Modellaufruf: Vetospieler, minimale Gewinnkoalitionen,
  Blockierer. Daraus folgt, welcher Kompromiss auf den Tisch kommt.
- Lessons: Jeder Agent hält nach jeder Runde fest, was er gelernt hat; die nächste Runde sieht das.

## 4. Zahlen und Prüfung

- **Claim-Ebene.** Aussagen werden in atomare Claims zerlegt. Der Experte prüft jeden gegen die
  zitierte Passage und gegen frühere Claims anderer Akteure.
- **Zwei Prüfaufrufe.** Zwei unabhängige Verifier; bei Uneinigkeit bleibt ein Claim "ungeprüft",
  jeder Widerspruch macht ihn "widersprochen". Ziel ist eine zweite Modellfamilie als zweiter
  Verifier, weil gleichartige Modelle dieselben Fehler teilen. Welche Modelle im Referenzlauf
  liefen, steht auf `/method`.
- **Getrennte Zustände.** geprüft, teilweise, ungeprüft, widersprochen, Annahme. Nie ein
  gemeinsames "ok".
- **Impact-Modell.** Deterministische, getestete Arithmetik mit sichtbaren Eingaben. Eine offizielle
  Wartezeitenreihe existiert in Österreich nicht; der Wartezeiteffekt ist deshalb als Annahme
  (Kapazitätsgewinn mal angenommene Elastizität) gekennzeichnet.

## 5. Prognose: Referenzklassen statt trainiertem Modell

**Warum kein Modell.** Über 18 Jahre gibt es 30 bis 60 echte Verhandlungsepisoden; das Register
enthält 165 gesundheitsbezogene Ministerialentwürfe in 156 Episoden. Dazwischen liegt mit der
Kassenfusion 2019/2020 ein Strukturbruch, der die Akteure selbst verändert hat. Ein Klassifikator
auf diesem n ist nicht validierbar, jede Genauigkeitszahl wäre Rauschen.

**Einheit.** Der erste öffentliche Entwurf (Ministerialentwurf), nicht die Regierungsvorlage: rund
97 % der eingebrachten gesundheitsbezogenen Regierungsvorlagen werden beschlossen. Die echte Varianz
liegt davor (Entwürfe, die in der Begutachtung sterben) und danach (VfGH-Aufhebungen).

**Label.** Mechanisch aus Parlament Open Data und RIS, Horizont 730 Tage: umgesetzt, teilweise
umgesetzt (Textähnlichkeit Entwurf zu Endfassung unter 0,75 oder VfGH-Aufhebung), abgelehnt,
versandet, ersetzt, unbekannt (zensiert). Kein LLM, keine Presse. Beschreibung und Label kommen
aus getrennten Quellen; Leakage ist damit strukturell ausgeschlossen.

**Verfahren.** Feinste Klasse mit n ≥ 5 in der Reihenfolge (Ressort + Koalition), Koalition,
Ressort, alle. Jeffreys-Posterior mit festem Prior, 90-%-Intervalle (Jeffreys und Wilson).
Zeitlich sauber: Eine Episode gelangt erst in den Pool, wenn ihr Label bekannt sein konnte.
Bewertet wird mit dem Brier-Score gegen die Status-quo-Basisrate. Alle Regeln standen in
`forecasting/PREREGISTRATION.md`, bevor ein Score berechnet wurde.

**Ausgabe.** "Umgesetzt in k von n vergleichbaren Fällen (90 % Intervall a bis b)", bei n < 5 eine
Small-n-Warnung statt einer Zahl. Nie als Urteil formuliert.

**Erwartung an die Ablation.** Ob Presse-Merkmale die Basis schlagen, wird bei diesem n
voraussichtlich nicht entscheidbar sein. Das wird als "kein nachweisbarer Unterschied bei diesem n"
berichtet, nicht als "die Presse hilft nicht".

## 6. Backtest SV-OG 2018

Fall: Sozialversicherungs-Organisationsgesetz (ME 75/XXVI. GP, Kassenfusion). Ersatzfall:
Primärversorgungsgesetz 2017. Stichtag des Laufs vor Ende der Begutachtung, Retrieval nur bis dahin.

**Vorab formulierte Erwartung.** Die SV-OG wurde von der damaligen Regierungsmehrheit einseitig
beschlossen, gegen den Großteil der 75 Stellungnahmen, nicht ausverhandelt. Ein Simulator, der
Kompromisse sucht, wird deshalb erwartbar weicher ausfallen als das tatsächliche Gesetz. Diese
Abweichung ist die Hypothese, nicht eine nachträgliche Ausrede. Sinnvoll ist zusätzlich ein Lauf
mit der Entscheidungsregel "nur Vetospieler zählen".

**Bewertung.** Nicht Treffer oder Fehlschlag, sondern Präferenzerreichung pro Institution: Abstand
zur Endfassung relativ zum Erstentwurf, als Rangfolge von Gewinnern und Verlierern.

Ergebnisse, sobald gemessen, auf `/method`.

## 7. Grenzen

1. **Kleines n.** 30 bis 60 Episoden. Intervalle sind breit, Klassen oft dünn. Der Prognosewert ist
   eine Basisrate, keine Vorhersage eines einzelnen Falls.
2. **Lookahead der Frontier-Modelle.** Die Modelle kennen den Ausgang vergangener Reformen
   einschließlich der teilweisen VfGH-Aufhebung der SV-OG 2019. Das as-of-Retrieval begrenzt die
   Quellen, nicht das parametrische Wissen. Ein Backtest-Treffer ist schwache Evidenz. Register und
   Labels sind deshalb regelbasiert.
3. **SV-OG 2018 war einseitig.** Siehe 6: der Simulator wird weicher sein.
4. **Stance-Labels teilweise LLM-abgeleitet.** Für deutschsprachige Gesundheitspolitik existiert
   kein gelabelter Stance-Datensatz. Labels sind stichprobenartig geprüft; eine Prüfung durch
   Fachleute an rund 200 Passagen steht aus.
5. **Stellungnahmen sind Eröffnungspositionen.** Was eine Institution in der Begutachtung fordert,
   ist nicht ihre rote Linie. Rote Linien brauchen eine zweite Quelle.
6. **Maskierung best effort.** Regel- und NER-basiert ohne gemessenen Recall. Seltene Nachnamen ohne
   Titel oder Vorname können durchrutschen.
7. **Temperament-Wirkung.** Studien finden, dass selbst extreme Persona-Einstellungen Positionen
   kaum verschieben. Der Temperament-Regler ist erst belastbar, wenn gegensätzliche Einstellungen
   nachweislich andere Ergebnisse liefern.
8. **Debattenqualität.** Übliche Qualitätsindizes liegen für LLM-Debatten fast immer am Maximum.
   Wir zeigen Veränderung über Runden, keinen absoluten Qualitätswert.
9. **Prozessrealismus nicht gemessen.** Siehe 1.

## 8. Übernommen und gebaut (CON-6)

UI-Bausteine, Design-Tokens, das NDJSON-Streaming-Muster und das Muster des Gateway-Clients stammen
aus medlyn, dem früheren Projekt eines Teammitglieds. Verhandlungs-Engine, Agentenkonstruktion,
Koalitionskalkül, Experte-Prüfung, Datenkorpus, Prognose, Persona-Modelle und alle Ansichten der
Verhandlung sind in dieser Challenge entstanden. Tabelle im README, Abschnitt 1.6.

## 9. Literatur, die eine Entscheidung geändert hat

| Befund                                                                      | Konsequenz                                              |
| --------------------------------------------------------------------------- | ------------------------------------------------------- |
| Frontier-Modelle haben Lookahead-Bias auf historische Ausgänge              | regelbasierte Labels, Backtest nur als schwache Evidenz |
| Letzter Sprecher hat bis zu 22 % Vorteil                                    | Reihenfolge pro Runde zufällig und protokolliert        |
| Moderator-Zusammenfassungen erzeugen Scheinkonsens                          | offene Konflikte zuerst                                 |
| Homogene Debatten schlagen ein Einzelmodell nicht                           | zwei Modellfamilien als Untergrenze                     |
| Kein deutschsprachiger Stance-Datensatz für Gesundheitspolitik              | Labels als LLM-abgeleitet deklariert                    |
| Kein Agentensystem hat bisher einen echten Verhandlungsausgang reproduziert | Backtest als ein Datenpunkt, nicht als Beweis           |
| Für die österreichische Begutachtung als Einflusskanal fehlt Forschung      | der Stellungnahmen-Korpus ist selbst ein Beitrag        |

Vollständige Bibliographie im Projektordner (`research/papers.md`, `research/papers-addendum.md`).
