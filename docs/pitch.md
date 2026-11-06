# Pitch und Klickpfad

Zwei Fassungen: der Desk-Pitch für die Fachjury (6. November ab 10:00, etwa 15 Minuten pro Team
am Tisch) und die Projektor-Fassung für die Finaljury (12:00 bis 12:45, HDMI). Kriterien-IDs
beziehen sich auf `docs/coverage-matrix.md` Abschnitt 2 (UC2-Fachjury) und 3 (allgemein).

Vor dem Termin: App läuft (`pnpm dev`), Referenzlauf ist geladen, Detailgrad "Analyst", Sprache
DE, Theme passend zum Licht. Ein zweiter Tab mit `/method`. Falls das Gateway hängt: alles unten
läuft als Replay aus `runs/`, ohne Netz.

---

## 1. Fachjury am Tisch (15 Minuten)

Aufteilung: 3 Minuten Pitch, 7 Minuten Klickpfad, 5 Minuten Fragen. Wenn die Jury früher fragt,
den Klickpfad an der Stelle fortsetzen, zu der die Frage passt.

### 1.1 Drei-Minuten-Pitch (gesprochen)

> **Problem (30 s).** Bevor der Dachverband eine Stellungnahme schreibt oder in eine
> Honorarverhandlung geht, muss er wissen, wie Ärztekammer, Länder, Finanzministerium und die
> anderen reagieren werden. Heute passiert das aus Erfahrung und Pressespiegel. Das ist nicht
> wiederholbar und nicht prüfbar.
>
> **Lösung (60 s).** Unser Simulator lässt institutionelle KI-Agenten eine Frage verhandeln, hier
> die Referenzfrage: Wartezeiten auf Facharzttermine minus 20 Prozent in fünf Jahren, Ausgaben
> plus höchstens 5 Prozent. Jede Ausgangsposition stammt aus echten, datierten
> Begutachtungs-Stellungnahmen der Institution, über 21.000 davon haben wir aus den offenen Daten
> des Parlaments erschlossen. Ein Moderator steuert, ein Experte-Agent prüft jede Zahl gegen ihre
> Quelle, ein Koalitionskalkül ohne KI rechnet aus, wer blockieren kann. Am Ende steht das
> achtteilige Ergebnis der Aufgabenstellung, mit offenen Konflikten vor den Einigungen.
>
> **Transparenz (45 s).** Jeder Satz eines Agenten lässt sich aufklappen: Prompt, gefundene
> Passagen, Modell, Begründung. Es kommt keine reale Person vor; Namen werden maskiert, bevor ein
> Modell den Text sieht. Wo wir etwas nicht messen, steht das auf der Methodenseite.
>
> **Ehrlichkeit über das Ergebnis (30 s).** Ob ein Ergebnis historisch plausibel ist, beurteilen
> wir nicht mit einem trainierten Modell, dafür gibt es zu wenige echte Fälle. Wir zählen: In wie
> vielen vergleichbaren Entwürfen wurde so etwas tatsächlich umgesetzt, mit Intervall und
> Fallzahl.
>
> **Nutzen (15 s).** Erster Einsatz: Vorbereitung einer Begutachtungs-Stellungnahme. Dafür braucht
> es einen Archiv-Konnektor, den eigenen Azure-Tenant und eine:n Analyst:in, die das Ergebnis
> prüft. Ich zeige es Ihnen.

### 1.2 Klickpfad (7 Minuten)

| #   | Bildschirm                                                     | Was zeigen, was sagen                                                                                                                                                  | UC2-Kriterium (Matrix 2)                                  | Allgemein (Matrix 3)       |
| --- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------- |
| 1   | `/runs/new` Setup-Raum, Vorlage "Wartezeiten"                  | Abgeleitetes Mandat, ausgewählte Akteure mit Begründung, Entscheidungsregel, as-of-Datum. Ein Agent ist "prompted" markiert (Wahlärzt:innen haben keine Stellungnahme) | Institutionelle Perspektiven realistisch                  | Nutzbarkeit                |
| 2   | `/runs/<ref>` Live-Ansicht, Agentenkarte SV und Ärztekammer    | Ausgangsposition, Zitat-Chip mit Institution, Datum, Alter und Gewicht, rote Linien                                                                                    | Positionen auf Quellen stützen                            | Methodik, Daten            |
| 3   | Transkript, ein direkter Gegenbeitrag                          | Antwortlink auf den Beitrag, auf den er reagiert                                                                                                                       | Dynamische Diskussion                                     | Innovationsgrad            |
| 4   | Inspector auf diesem Beitrag                                   | Deliberation, Prompt, gefundene Passagen, Modell. "Hier hört das System auf, wie ein Chat auszusehen."                                                                 | Transparenz                                               | Transparenz                |
| 5   | Agentenkarte, strategisches Panel; Lesson-Karte                | Verhandlungsmacht, Vetostatus, BATNA, Koalitionsoptionen; was der Agent aus der Runde gelernt hat                                                                      | Nachvollziehbare Kompromisse, Zusammenspiel der Agenten   | Innovationsgrad            |
| 6   | `/runs/<ref>/analysis` Trajektorie, Konsensmatrix, Koalitionen | Runde, in der ein Agent seine Position ändert, und warum; wer blockiert                                                                                                | Positionsänderung visualisiert, Zielkonflikte             | Nutzbarkeit                |
| 7   | `/runs/<ref>/outcome` Wirkungen und Prognose                   | Annahmen aufklappen; "umgesetzt in k von n vergleichbaren Fällen" mit Intervall; Small-n-Warnung                                                                       | Alternative Szenarien, Unsicherheiten nicht verschleiern  | Methodik                   |
| 8   | `/runs/<ref>/result` Ergebnisdokument                          | Acht Teile; offene Streitpunkte und Minderheitspositionen stehen drin                                                                                                  | Kein künstlicher Konsens, konkrete Entscheidungsgrundlage | Nutzen                     |
| 9   | Sprache auf EN, Detailgrad Executive                           | Derselbe Lauf, andere Tiefe                                                                                                                                            | Verständlich                                              | Kommunikation              |
| 10  | `/archive` und `/method`                                       | Stellungnahmen, Entwürfe, Statistiken; Grenzen, übernommen versus gebaut                                                                                               | Geeignete Datenquellen, eigenständige Umsetzung           | Transparenz, Umsetzbarkeit |

Wenn Zeit bleibt: die Jury eine eigene Frage stellen lassen und live starten (`/runs/new`). Bei
Latenz zurück zum Replay und das offen sagen.

**Satz zum Schluss:** "Der Simulator ersetzt keine Verhandlung. Er sagt Ihnen vorher, wo es
knirschen wird, und zeigt Ihnen, warum er das glaubt."

---

## 2. Finaljury am Projektor (8 bis 10 Minuten)

Bildschirm vorher: Browser-Zoom 125 bis 150 %, Theme hell (Beamer), Detailgrad Analyst,
Benachrichtigungen aus, zweiter Tab mit `docs/pitch-deck.html` für Folien. Die Folien rahmen nur;
die Demo ist der Hauptteil.

| Zeit          | Inhalt                                                                                                                                                                  | Projektor-Hinweis                                                                                |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 0:00 bis 1:00 | **Problem.** Vorbereitung von Stellungnahmen und Verhandlungen ist heute Erfahrungswissen. Frage aus der Aufgabenstellung vorlesen                                      | Folie 1 und 2                                                                                    |
| 1:00 bis 2:00 | **Idee.** Agenten, deren Positionen aus über 21.000 echten Stellungnahmen stammen; Moderator, Experte, Koalitionskalkül; keine realen Personen                          | Folie 3, Architekturbild                                                                         |
| 2:00 bis 6:30 | **Demo.** Klickpfad Schritte 1, 2, 4, 6, 7, 8 aus 1.2. Beim Inspector langsam werden, hier entscheidet sich Transparenz                                                 | Zur App wechseln. Zoom so, dass Zitat-Chips lesbar sind. Nicht scrollen, während gesprochen wird |
| 6:30 bis 7:30 | **Methode und Ehrlichkeit.** Zählen statt trainieren; Labels aus dem Gesetzgebungsprotokoll; SV-OG-Backtest mit vorab formulierter Erwartung "weicher als die Realität" | `/method` zeigen, Abschnitt Grenzen                                                              |
| 7:30 bis 8:30 | **Nutzen und Time-to-Impact.** Erster Einsatz, was es braucht, nächste drei Schritte                                                                                    | Folie "Time-to-Impact"                                                                           |
| 8:30 bis 9:00 | **Schluss.** Übernommen versus gebaut in einem Satz; Schlusssatz aus 1.2                                                                                                | Folie "Danke", App bleibt offen für Fragen                                                       |

Ersatzplan bei Ausfall: Replay mit `?speed=4` statt Live-Lauf; ist auch das Netz weg, läuft der
Replay aus `runs/` ohne Datenbank. Bei Beamerproblemen: Laptop zur Jury drehen, Desk-Fassung.

---

## 3. Wahrscheinliche Fragen und kurze ehrliche Antworten

1. **"Woher wissen Sie, dass die Agenten realistisch argumentieren?"**
   Wir trennen drei Dinge. Positionstreue messen wir pro Agent gegen die historischen
   Stellungnahmen. Ergebnisplausibilität zählen wir über vergleichbare Entwürfe. Ob der Verlauf
   einer echten Verhandlung gleicht, messen wir nicht, und das steht so auf der Methodenseite.

2. **"Warum kein trainiertes Prognosemodell?"**
   Es gibt über 18 Jahre nur 30 bis 60 echte Episoden, mit der Kassenfusion als Bruch mittendrin.
   Darauf lässt sich kein Modell validieren. Eine gezählte Basisrate mit Intervall ist ehrlicher
   als eine präzise wirkende Wahrscheinlichkeit.

3. **"Das Modell kennt doch den Ausgang der Reformen. Ist der Backtest nicht wertlos?"**
   Er ist schwache Evidenz, ja. Das as-of-Datum begrenzt die Quellen, nicht das Modellwissen.
   Deshalb kommen unsere Labels regelbasiert aus Parlament und RIS, ohne LLM, und wir haben die
   erwartete Abweichung bei der SV-OG vorher aufgeschrieben.

4. **"Wie verhindern Sie, dass reale Personen zitiert werden?"**
   Personennamen werden satzweise maskiert, bevor ein Modell Text sieht: NER, Titel-Regeln,
   Namenslisten. Ein Guard prüft jede Ausgabe noch einmal und schlägt bei einem Treffer fehl. Das
   ist best effort; einen gemessenen Recall haben wir noch nicht.

5. **"Erzwingt der Moderator nicht einfach Konsens?"**
   Nein. Konsensanteile werden aus den Positionen berechnet, nicht vom Modell behauptet. Offene
   Konflikte stehen in jeder Zusammenfassung vor den Einigungen, und das Ergebnisdokument hat
   eigene Abschnitte für Minderheitspositionen und offene Streitpunkte.

6. **"Wie verlässlich sind die Zahlen?"**
   Jede Zahl ist ein Claim mit Zustand: geprüft, teilweise, ungeprüft, widersprochen oder
   Annahme. Zwei Verifier prüfen gegen die zitierte Passage. Die Wartezeitwirkung ist eine
   gekennzeichnete Annahme, weil es in Österreich keine offizielle Wartezeitenreihe gibt.

7. **"Was davon haben Sie in 24 Stunden gebaut?"**
   UI-Bausteine, Design-Tokens und das Streaming-Muster stammen aus dem früheren Projekt eines
   Teammitglieds. Engine, Agenten, Koalitionskalkül, Experte, Datenkorpus, Prognose und alle
   Verhandlungsansichten sind hier entstanden. Die Tabelle steht im README und auf `/method`.

8. **"Was bräuchte der Dachverband, um das morgen einzusetzen?"**
   Einen Konnektor zum internen Archiv, den eigenen Azure-Tenant hinter dem Gateway (reine
   Konfiguration) und eine:n Analyst:in, die jede Simulation prüft. Erster Einsatz: eine
   Begutachtungs-Stellungnahme vorbereiten und danach mit den tatsächlich eingegangenen
   Stellungnahmen vergleichen.

Reserve, falls gefragt:

- **"Warum Stellungnahmen und nicht die Presse?"** Presse transportiert Positionen meist als
  Personenzitat, das wir nicht verwenden dürfen. Stellungnahmen sind institutionell gezeichnet und
  datiert. Grenze: Sie sind Eröffnungspositionen, rote Linien brauchen eine zweite Quelle.
- **"Bringt das Temperament der Agenten etwas?"** Die Literatur zeigt, dass Persona-Einstellungen
  oft wirkungslos sind. Wir zeigen den Regler erst als belastbar, wenn gegensätzliche
  Einstellungen nachweislich andere Ergebnisse liefern.
