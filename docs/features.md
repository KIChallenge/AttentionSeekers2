# HealthPolicy Simulator: Funktionen

Stand: 2026-11-06. Alle Funktionen laufen lokal unter `http://localhost:3000`.

## 1. Startseite und Szenarien

- **Szenario-Karten** (`/`): je Fragestellung eine Karte mit Frage, Anzahl der Läufe, Modellfamilien, Themen mit Einigung in allen Läufen und historischer Basisrate. Prüfläufe und Demo eingeklappt. Hauptaktion "Neue Frage".
- **Überblick** auf der Startseite:
  - **Datenbasis:** Stellungnahmen, Pressepositionen, Originalseiten mit OCR, Rechtsbestimmungen, Abdeckung der semantischen Suche, Quellen je Jahr.
  - **Pressearchiv-Trichter:** alle 4.147 Ausgaben und 223.909 Seiten des SV-Box-Pressespiegels per Stichwortsuche durchsucht, bis zu den 636 personenfreien Positionen.
  - **Eigene Modelle:** trainierte Adapter je Version, bester Ansatz, Vergleich der Ansätze.
  - **Prognose und Historie:** Gesundheits-Erstentwürfe, Episoden, Beschlussquote, Urteil des vorregistrierten Vergleichs, Backtest SV-OG 2018.
  - **Simulation:** Läufe, Modellfamilien, Modellaufrufe, Tokens, Kosten, Debattenqualität, Modell-Rangliste.
- **Szenario-Seite** (`/scenarios/[key]`) mit Tabs:
  - **Läufe:** Datentabelle mit Suche und Filtern (Variante, Vorlage, Status, Modell), Aktionen Öffnen, Abspielen, Bühne, Abzweigen.
  - **Ergebnis:** Themenvergleich über alle Läufe (robust gegen modellabhängig), historische Einordnung je Maßnahmenart, Wirkungen der Pakete.
  - **Szenarien:** dieselbe Frage unter geänderten Rahmenbedingungen nebeneinander (Budget knapp oder großzügig, Klima kooperativ oder konfrontativ, Mehrheit mit Veto oder Konsens): Kompromissvorschlag mit Zustimmung, angenommene Maßnahmen, Wirkung mit Spanne, offene Konflikte, Zustimmung je Thema.
  - **Perspektiven:** je Partei Start- gegen Endhaltung pro Thema, rote Linien und wie oft berührt, Zustimmung und Ablehnung, "Fragen"-Chat.
  - **Koalitionen:** wer mit wem stimmt, kleinste Gewinnkoalitionen, Blockierer je Vorschlag.
  - **Modelle:** Richtung und Abweichung je Modellfamilie (siehe 7).

## 2. Neue Verhandlung (Setup-Raum)

- **Fragestellung** frei oder als Vorlage (Wartezeiten, Honorarverhandlungen, Spitalsplanung, Pflegereform, Primärversorgung, Impfstrategie, neue Leistungen).
- **Teilnehmende:** neun Kern-Institutionen vorausgewählt, optionale Parteien (Gesetzgeber, Public Health, WK, AK, LK, Industrie und Pharma).
- **Je Agent:** Modell und Temperament.
- **Regeln:** Entscheidungsregel (Konsens, qualifizierte Mehrheit, Veto-Spieler), Rundenzahl, Budgetdeckel, Stichtag.
- **Raum-Klima:** kooperativ bis konfrontativ, Zeit-, Budget- und öffentlicher Druck, geplante Ereignisse während der Verhandlung.
- **Voreinstellung "Schnell (ca. 3 Min.)"** für Live-Demos (2 Runden, schnelle Modelle), "Vollständig" mit einem Klick.
- **Tisch-Vorschau** mit den besetzten Plätzen.

## 3. Verhandlungs-Engine

- **Moderator-Agent:** übersetzt die Frage in ein Mandat, wählt Akteure, setzt Regeln, steuert, fordert Begründungen ein, erkennt Widersprüche, fasst Runden zusammen (offene Konflikte zuerst), hält Wortwechsel beim Thema und beendet festgefahrene.
- **Fünf Phasen:** Positionsbildung, Diskussion, Verhandlung, Kompromissfindung, Ergebnis.
- **Wortwechsel statt Reihum-Reden:** Eingangsstatements im Plenum, dann bilaterale und trilaterale Wortwechsel zwischen Konfliktparteien, Koalitions-Absprachen (auch parallel), Plenum für Vorschläge und Abstimmung. Redereihenfolge zufällig und protokolliert.
- **Delegierte:** je Institution zwei bis drei fiktive Funktionsrollen (Verhandlungsführung, Fachreferate), nie reale Personen.
- **Strategische Lagebeurteilung** je Agent und Runde: Hebel, Veto-Status, Rückfalloption ohne Einigung, Koalitionsoptionen, Abhängigkeiten, Anreize je Vorschlag, Kooperation gegen Blockade.
- **Koalitionsrechnung des Moderators:** Unterstützer je Vorschlag, Veto-Spieler, kleinste Gewinnkoalitionen, Blockierer.
- **Runden-Lektionen:** jeder Agent hält fest, was die Runde ergeben hat, und nutzt es in der nächsten.
- **Rote Linien in drei Stufen:** nie verhandelbar, nur nach dokumentiertem Ereignis, verhandelbar.
- **Kompromissvorschlag des Moderators:** am Ende ein bedingtes Paket mit Komponenten und Bedingungen, kurze Ratifikationsrunde (dafür, bedingt, dagegen), Auszählung gegen die Entscheidungsregel. Nie erzwungen.
- **Experte-Agent:** prüft Zahlen und Widersprüche, Prüfung jeder Aussage zusätzlich durch eine andere Modellfamilie.
- **Rechtliche Leitplanke:** für jeden Vorschlag die berührten Bestimmungen und ob er eine Gesetzesänderung braucht ("erfordert Änderung GuKG § 15a" oder "im geltenden Recht umsetzbar").
- **Qualitätsschranke:** Wiederholung, Themenbezug, Register und interne Kennungen werden vor dem Festschreiben geprüft, bei Fehlern wird einmal neu erzeugt.
- **Persona-Dossiers:** je Institution ein belegtes Profil (Ziele, rote Linien, Haltung je Thema mit datierten Belegen, typische Argumente, frühere Reformen) aus Stellungnahmen und Presse.
- **Vier Modellfamilien als Standard:** GPT-6 (Azure), Qwen3 235B, GLM-5, Mistral Devstral (Bedrock); weitere wählbar (DeepSeek, Kimi, Nova).
- **Abzweigen ab Runde N** mit einer Änderung, Vergleich mit dem Ausgangslauf.

## 4. Lauf-Ansichten (`/runs/[runId]`)

- **Verhandlung:** schmale Teilnehmerleiste, Transkript gruppiert nach Wortwechseln, Antwortverweise, Quellen-Chips mit Gewicht und Alter, Prüfstatus je Aussage, Runden-Zusammenfassungen, Lektionen. Rechts "Zwischenstand" (Übereinstimmung je Thema, bindendster Konflikt) oder die gewählte Aussage.
- **Redezeit-Zeitleiste:** eine Zeile je Institution, Balken je Wortmeldung, Bänder je Wortwechsel, Antwortkurven, Abspielkopf; folgt der gewählten Runde.
- **Rundenauswahl:** springt zur Runde und folgt beim Scrollen.
- **Agentenkarte:** Start- und aktuelle Haltung mit Quellen, Strategie-Panel je Runde, Positionswechsel mit Auslöser, rote Linien, Ziele, Prioritäten, Temperament, "Fragen"-Chat.
- **Inspektor:** Begründung, exakter Prompt, abgerufene Quellen, Modell, Token, Prüfmodelle, Qualitätsentscheidung, verwendete Lektionen.
- **Analyse:** Positionsraum über Runden, Konsensmatrix, wer sich bewegt hat und warum, offene Konflikte, Koalitionsgraph, Anreizmatrix, Vorschläge mit Rechts-Badge, Qualitätsprüfung der Debatte.
- **Ergebnis:** Kennzahlen, evidenzbasierte Wirkungen mit Spanne und Quellen, Vergleich mit dem Beispielpaket der Angabe, Kompromissvorschlag, historische Einordnung.
- **Ergebnisdokument:** acht Teile (Frage, Akteure, Verlauf, Konflikte, Kompromisse, Konsens, offene Streitpunkte, Auswirkungen), Druckansicht, Export als HTML (DE und EN), Bundle-Export (ZIP mit Ereignissen, Begründungen, Quellen, Modellzuordnung).
- **Trace:** jeder Modellaufruf als Wasserfall nach Runde, Wortwechsel und Agent, mit Dauer, Tokens, geschätzten Kosten, Status, Ausweichmodell; Kopfzeile mit Summen und Anteil je Modellfamilie.
- **Live abspielen** und **Replay-Player** (`/replay/[runId]`): Tempo, Zeitleiste mit Runden- und Positionsmarken, Sprung, Tastenkürzel.

## 5. Bühne (`/runs/[runId]/stage`)

- **Kacheln, 3D und Meeting** als Ansichten.
- **3D-Figuren** stilisiert oder realistisch (Microsoft Rocketbox, MIT, künstlerisch erstellt), Geschlecht von Figur und Stimme passend, Lippenbewegung zur Stimme, Angesprochene drehen sich zum Sprecher.
- **Meeting-Modus** wie ein Videocall: Sprecher im Spotlight, Galerie, Live-Untertitel Satz für Satz, ausblendende Steuerleiste, Vollbild.
- **Stimmen:** ElevenLabs für jede Partei, erzeugt erst beim Abspielen und dann gespeichert; Azure Speech als Ausweichlösung.
- **Durchgehende Wiedergabe** über den ganzen Lauf, Schutz gegen hängende Audiodateien.

## 6. Fragen an eine Institution

- **"Fragen"-Chat** auf Agentenkarte, Teilnehmerleiste und Perspektiven-Tab: Antworten in der Stimme der Institution, konsistent mit ihren Positionen und roten Linien im Lauf, mit Quellen-Chips, drei vorgeschlagenen Fragen.
- **Ausgabeprüfung:** Sprachdrift, Unsinnswörter und Wiederholungen werden abgeschnitten oder neu erzeugt; Namensprüfung.

## 7. Modelle und Bewertung

- **Modelle-Tab** (`/models`): je Institution selbst trainierter Adapter (v2.1) gegen Basis gegen Dossier-Persona, frühere Versionen ausklappbar, Playground (Adapter und Basis nebeneinander, live über den SageMaker-Endpoint), Link zu Hugging Face.
- **Eigene Persona-Modelle:** 27 LoRA-Adapter auf Qwen3-8B (v1, v2, v2.1 je 9 Institutionen), trainiert auf SageMaker, privat auf huggingface.co/Aryt3.
- **In-Character-Klassifikator:** erkennt, von welcher Institution ein Text stammt.
- **Modellvergleich** (Szenario-Tab Modelle): Richtung je Modell auf jeder Achse, Positionskarte mit Pfeilen, Heatmap Modell mal Institution, Verhandlungs-Temperament gegen Historie, Rangliste "erwartbar bis abseits".
- **Qualitätsprüfung der Debatte** je Lauf durch eine andere Modellfamilie.

## 8. Archiv (`/archive`)

- **Suche** kombiniert, Volltext oder semantisch, mit Filtern (Quellenart, Institution, Datum, Entwurf, Lizenz) und Stichtag-Regler, der spätere Dokumente ausgraut.
- **Quellen:** 2.667 Stellungnahmen aus dem Parlament, 636 personenfreie Pressepositionen, 203 Rechtsbestimmungen aus dem RIS (ASVG, PrimVG, G-ZG, 15a-Vereinbarungen, ÄrzteG, GuKG).
- **Quellenseite:** Lizenz, Link zum Original, maskierte Stellen markiert, ähnliche Passagen, wo die Quelle verwendet wurde.
- **Pressespiegel** (`/archive/presse`): alle 606 Originalseiten zum Durchscrollen, mit OCR-Textebene (Aus, Dezent, Hervorgehoben), Filter, Tastatur, Sprung zu Datum.
- **Original prüfen:** Einzelseite mit markierbarem Text, Suche auf der Seite, verwendete Passage umrandet, Text kopieren.
- **Episoden:** Gesundheitsreformen vom Entwurf über Regierungsvorlage und Gesetz bis zur VfGH-Entscheidung.
- **Agenten-Belege** und **Statistik-Katalog**.
- **Globale Suche** (Strg+K) über alle Entitäten, Vorschau beim Darüberfahren, Rückverweise auf jeder Seite.

## 9. Prognose und Backtest

- **Referenzklassen-Prognose:** 165 Gesundheits-Erstentwürfe 2008 bis 2026, Labels aus dem Parlament, Basisraten mit Intervallen, vorregistriert, zeitlich korrekt bewertet.
- **Backtest SV-OG 2018:** Simulation mit Stichtag des Entwurfs, Vergleich je Bestimmung mit dem beschlossenen Gesetz und der VfGH-Entscheidung, Wissensprüfung der Modelle.
- **Evidenzbasiertes Wirkungsmodell:** Wirkungsspannen je Maßnahmenart mit Quellen (OECD, Reviews, Rechnungshof, Statistik Austria).

## 10. Transparenz und Regeln

- **Keine realen Personen:** Namensmaskierung im Korpus, Namensprüfung bei jeder Ausgabe, nur Institutionen und fiktive Funktionsrollen.
- **Detailstufen:** Executive, Analyst, Engineer.
- **Methodenseite** (`/method`): Methode, Modellpalette, Backtest, übernommen gegen neu gebaut, Forschungsgrundlage mit 43 umgesetzten Papers.
- **Sprachen:** Deutsch und Englisch; helles und dunkles Design; Beamer-Modus.

## 11. Technik

- **Monorepo:** Next.js 16, React 19, Tailwind 4, shadcn, TanStack Table, AI SDK; Postgres mit pgvector; Python für Daten, Presse, Prognose und Modelle.
- **Modelle:** Azure AI Foundry (GPT-6), Amazon Bedrock (Qwen, GLM, Mistral, DeepSeek, Kimi, Nova, Titan Embeddings), SageMaker (Training und Endpoint).
- **Offline-fähige Demo:** Läufe als NDJSON im Repo, Wiedergabe ohne Netz.
