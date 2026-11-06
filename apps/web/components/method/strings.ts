// Dictionary for /method. German is the source, English must satisfy its shape.
// Static method text lives here; measured values come from runs/method-note.json.
import type { Lang } from "@sv/contracts";

const de = {
  title: "Methode",
  sub: "Was der Simulator misst, woher Positionen und Labels kommen, welche Modelle laufen und wo er nicht belastbar ist. Langfassung: docs/method.md.",
  notMeasured: "noch nicht gemessen",
  notSet: "noch nicht festgelegt",
  yes: "ja",
  no: "nein",
  claims: {
    title: "Drei getrennte Behauptungen",
    items: [
      {
        name: "Ergebnisplausibilität",
        how: "Referenzklassen-Prognose über Erstentwürfe, Labels aus dem Gesetzgebungsprotokoll",
        state: "gemessen als Basisrate mit Intervall",
        tone: "measured",
      },
      {
        name: "Positionstreue",
        how: "Abstand der simulierten Position zum gefitteten Stance-Profil je Agent",
        state: "berechnet pro Agent",
        tone: "measured",
      },
      {
        name: "Prozessrealismus",
        how: "Ob der Verlauf einer echten Verhandlung gleicht",
        state: "nicht gemessen",
        tone: "open",
      },
    ],
  },
  approach: {
    title: "Ansatz",
    items: [
      {
        name: "Positionen aus Stellungnahmen",
        text: "Begutachtungs-Stellungnahmen aus Parlament Open Data: datiert, formell, institutionell gezeichnet. 21.588 zugeordnet, 2.667 gesundheitsbezogene Texte in 91.820 Absätzen. Presse dient als Kontext, weil sie Positionen meist als Personenzitat transportiert.",
      },
      {
        name: "as-of-Retrieval",
        text: "Jeder Lauf hat einen Stichtag. Nur Quellen davor sind abrufbar; das Gewicht fällt mit zwei Jahren Halbwertszeit. Alter und Gewicht stehen an jedem Zitat.",
      },
      {
        name: "Namensmaskierung",
        text: "Personennamen werden satzweise maskiert, bevor ein Modell Text sieht (NER, Titel-Regel, Namenslisten). Ein Guard in der Engine prüft jede Ausgabe erneut. Für den Persona-Klassifikator werden auch Institutionsnamen maskiert.",
      },
      {
        name: "Spieltheorie ohne LLM",
        text: "Vetospieler, minimale Gewinnkoalitionen und Blockierer berechnet eine reine Funktion aus Vetostatus und Stimmen. Sie bestimmt, welcher Kompromiss auf den Tisch kommt.",
      },
      {
        name: "Prüfung auf Claim-Ebene",
        text: "Aussagen werden in atomare Claims zerlegt und gegen die zitierte Passage und frühere Claims geprüft. Zwei Verifier; Uneinigkeit heißt ungeprüft, Widerspruch heißt widersprochen. Nie ein gemeinsames ok.",
      },
      {
        name: "Referenzklassen statt Modell",
        text: "30 bis 60 echte Episoden über einen Strukturbruch hinweg sind kein Trainingsdatensatz. Gezählte Basisraten mit Jeffreys- und Wilson-Intervall, Small-n-Warnung bei n < 5, Regeln vor dem ersten Score präregistriert.",
      },
    ],
  },
  palette: {
    title: "Modellpalette und Gateway-Smoke-Test",
    sub: "NFR-10: Ein Modell, das strukturierte Ausgabe nicht besteht, bekommt keine Agentenrolle.",
    model: "Modell",
    family: "Familie",
    roles: "Rollen",
    streaming: "Streaming",
    structured: "Strukturierte Ausgabe",
    reasoning: "Reasoning-Feld",
    latency: "Latenz",
    concession: "Konzessions-Basis",
    checked: "Geprüft",
    roleNames: {
      agents: "Agenten",
      moderator: "Moderator",
      expert: "Experte",
      verifier: "Zweiter Verifier",
    } as Record<string, string>,
  },
  run: {
    title: "Referenzlauf",
    models: "Modelle im Lauf",
    rounds: "Runden",
    utterances: "Beiträge",
    claimStates: {
      verified: "geprüft",
      partial: "teilweise",
      unverified: "ungeprüft",
      contradicted: "widersprochen",
      assumption: "ohne Beleg",
    },
    open: "Lauf öffnen",
  },
  forecast: {
    title: "Prognose: Register und Bewertung",
    registry: "Register der Erstentwürfe",
    drafts: "Ministerialentwürfe",
    episodes: "Episoden",
    asOf: "Stand",
    labels: {
      implemented: "umgesetzt",
      partially_implemented: "teilweise umgesetzt",
      lapsed: "versandet",
      superseded: "ersetzt",
      rejected: "abgelehnt",
      unknown: "zensiert (noch offen)",
    } as Record<string, string>,
    brier: "Brier-Score (niedriger ist besser)",
    brierRc: "Referenzklasse",
    brierSq: "Status quo",
    brierN: "Episoden bewertet",
    ablation: "Ablation Presse-Merkmale gegen Basis",
    ablationPending:
      "Noch nicht gelaufen. Erwartung bei diesem n: kein nachweisbarer Unterschied; das wird so berichtet.",
    regime: "Strukturbruch",
    labelSource:
      "Labels mechanisch aus Parlament Open Data und RIS, Horizont 730 Tage. Kein LLM, keine Presse.",
  },
  backtest: {
    title: "Backtest",
    status: {
      pending: "ausstehend",
      running: "läuft",
      done: "abgeschlossen",
      cut: "gestrichen",
    },
    hypothesis: "Vorab formulierte Erwartung",
    result: "Ergebnis",
    cols: { case: "Fall", forecast: "Prognose", simulation: "Simulation", reality: "Realität" },
    scoring:
      "Bewertet nach Präferenzerreichung je Institution relativ zum Erstentwurf, nicht nach Treffer oder Fehlschlag.",
  },
  boundary: {
    title: "Übernommen und gebaut (CON-6)",
    sentence:
      "UI-Bausteine, Design-Tokens, das NDJSON-Streaming-Muster und das Gateway-Client-Muster stammen aus medlyn, dem früheren Projekt eines Teammitglieds. Engine, Agenten, Koalitionskalkül, Experte, Datenkorpus, Prognose, Persona-Modelle und alle Verhandlungsansichten sind in dieser Challenge entstanden.",
    inherited: "Übernommen (eigene Vorarbeit)",
    built: "In der Challenge gebaut",
    inheritedItems: [
      "shadcn/ui-Primitive und Design-Tokens, Hell- und Dunkelmodus",
      "NDJSON-über-fetch als Streaming-Muster",
      "Gateway-Client mit striktem JSON-Schema",
      "Konvention: nichts erreicht die UI ohne geprüfte Quelle",
    ],
    builtItems: [
      "Moderator, Agenten, Runden, Lessons, strategische Einschätzung",
      "RunEvent-Protokoll, foldRun, Replay",
      "Koalitionskalkül, Impact-Modell, Personen-Guard",
      "Experte mit zwei Verifiern und Claim-Zuständen",
      "Stellungnahmen-Korpus mit Maskierung, Statistik-Katalog",
      "Register der Erstentwürfe, Labels, Referenzklassen-Prognose",
      "Persona-Klassifikator und Fine-Tuning-Kit",
      "Alle Screens der Verhandlung, Archiv und diese Seite",
    ],
    licence:
      "medlyn steht unter CC BY-NC 4.0; der Urheber ist Teammitglied und gewährt die Nutzung für dieses Repository. shadcn/ui: MIT.",
  },
  sources: {
    title: "Datenquellen und Lizenzen",
    source: "Quelle",
    use: "Verwendung",
    licence: "Lizenz",
    rows: [
      {
        source: "Parlament Österreich Open Data (Listen 81, 101, 142)",
        use: "Stellungnahmen-Index, Prognoseregister, Labels",
        licence: "CC BY 4.0",
      },
      {
        source: "RIS (Bundesgesetzblatt, VfGH-Kundmachungen)",
        use: "Labels: Inkrafttreten, Aufhebungen",
        licence: "CC BY 4.0",
      },
      {
        source: "Texte der Begutachtungs-Stellungnahmen",
        use: "Positionen, Persona-Fitting, maskierte Zitate",
        licence:
          "Rechte bei den Institutionen; PDFs nicht veröffentlicht, Text nur mit Zitat verwendet",
      },
      {
        source: "Statistik Austria OGD, Eurostat, BMF UG 24, Rechnungshof",
        use: "Impact-Eingaben, Zahlenprüfung",
        licence: "CC BY 4.0",
      },
      {
        source: "DVSV Statistisches Handbuch, ÖÄK Ärztestatistik, Zielsteuerung",
        use: "Kassenstellen, Ärzt:innenzahlen, Zielwerte",
        licence: "keine offene Lizenz angegeben; zitiert, interne Nutzung",
      },
      {
        source: "Pressespiegel (SV-Box)",
        use: "lokale Volltextsuche, Kontext",
        licence: "laut Veranstalter frei verteilbar; nicht als Ganzes im Repo, kein APA-OTS-Crawl",
      },
    ],
  },
  limits: {
    title: "Grenzen",
    items: [
      "Kleines n: 30 bis 60 Episoden. Intervalle sind breit, eine Basisrate ist keine Einzelfallvorhersage.",
      "Lookahead: Frontier-Modelle kennen den Ausgang vergangener Reformen. as-of begrenzt die Quellen, nicht das Modellwissen. Ein Backtest-Treffer ist schwache Evidenz.",
      "SV-OG 2018 wurde einseitig beschlossen. Der Simulator wird erwartbar weicher ausfallen als das Gesetz.",
      "Stance-Labels sind teilweise LLM-abgeleitet und nur stichprobenartig geprüft; einen deutschsprachigen Referenzdatensatz gibt es nicht.",
      "Stellungnahmen sind Eröffnungspositionen. Rote Linien brauchen eine zweite Quelle.",
      "Wahlärzt:innen haben keine Stellungnahme, das Ministerium nur 4. Diese Agenten sind als prompted markiert.",
      "Maskierung ist best effort, ohne gemessenen Recall.",
      "Prozessrealismus ist nicht gemessen.",
    ],
  },
  refs: {
    title: "Forschungsgrundlage",
    full: "Vollständige Liste mit Datei je Mechanismus und geprüften, nicht umgesetzten Arbeiten:",
  },
  fileNote: "Messwerte aus",
  fileError: "Messwerte konnten nicht gelesen werden",
  updated: "aktualisiert",
};

type Dict = typeof de;

const en: Dict = {
  title: "Method",
  sub: "What the simulator measures, where positions and labels come from, which models run, and where it is not reliable. Long form: docs/method.md.",
  notMeasured: "not measured yet",
  notSet: "not set yet",
  yes: "yes",
  no: "no",
  claims: {
    title: "Three separate claims",
    items: [
      {
        name: "Outcome plausibility",
        how: "Reference-class forecast over first drafts, labels from the legislative record",
        state: "measured as a base rate with interval",
        tone: "measured",
      },
      {
        name: "Position fidelity",
        how: "Distance of the simulated position to the fitted stance profile per agent",
        state: "computed per agent",
        tone: "measured",
      },
      {
        name: "Process realism",
        how: "Whether the course resembles a real negotiation",
        state: "not measured",
        tone: "open",
      },
    ],
  },
  approach: {
    title: "Approach",
    items: [
      {
        name: "Positions from Stellungnahmen",
        text: "Formal consultation statements from Parliament open data: dated, formal, signed by the institution. 21,588 mapped, 2,667 health texts in 91,820 paragraphs. Press serves as context because it usually carries positions as a person's quote.",
      },
      {
        name: "As-of retrieval",
        text: "Every run has a cutoff date. Only sources before it can be retrieved; weight decays with a two-year half-life. Age and weight are shown on every citation.",
      },
      {
        name: "Name masking",
        text: "Person names are masked per sentence before any model sees text (NER, title rule, name lists). An engine guard checks every output again. For the persona classifier, institution names are masked too.",
      },
      {
        name: "Game theory without an LLM",
        text: "Veto players, minimal winning coalitions and blockers come from a pure function over veto status and votes. It decides which compromise is tabled.",
      },
      {
        name: "Claim-level verification",
        text: "Statements are split into atomic claims and checked against the cited passage and earlier claims. Two verifiers; disagreement means unverified, contradiction means contradicted. Never a single ok.",
      },
      {
        name: "Reference classes, not a model",
        text: "30 to 60 real episodes across a structural break are not a training set. Counted base rates with Jeffreys and Wilson intervals, a small-n warning below n = 5, rules preregistered before the first score.",
      },
    ],
  },
  palette: {
    title: "Model palette and gateway smoke test",
    sub: "NFR-10: a model that fails structured output gets no agent role.",
    model: "Model",
    family: "Family",
    roles: "Roles",
    streaming: "Streaming",
    structured: "Structured output",
    reasoning: "Reasoning field",
    latency: "Latency",
    concession: "Concession baseline",
    checked: "Checked",
    roleNames: {
      agents: "Agents",
      moderator: "Moderator",
      expert: "Experte",
      verifier: "Second verifier",
    },
  },
  run: {
    title: "Reference run",
    models: "Models in the run",
    rounds: "Rounds",
    utterances: "Utterances",
    claimStates: {
      verified: "verified",
      partial: "partial",
      unverified: "unverified",
      contradicted: "contradicted",
      assumption: "unsourced",
    },
    open: "Open run",
  },
  forecast: {
    title: "Forecast: registry and scoring",
    registry: "Registry of first drafts",
    drafts: "Ministerial drafts",
    episodes: "Episodes",
    asOf: "As of",
    labels: {
      implemented: "implemented",
      partially_implemented: "partially implemented",
      lapsed: "lapsed",
      superseded: "superseded",
      rejected: "rejected",
      unknown: "censored (still open)",
    },
    brier: "Brier score (lower is better)",
    brierRc: "Reference class",
    brierSq: "Status quo",
    brierN: "Episodes scored",
    ablation: "Ablation press features vs baseline",
    ablationPending:
      "Not run yet. Expected at this n: no detectable difference; that is how it will be reported.",
    regime: "Structural break",
    labelSource:
      "Labels mechanically from Parliament open data and RIS, horizon 730 days. No LLM, no press.",
  },
  backtest: {
    title: "Backtest",
    status: { pending: "pending", running: "running", done: "done", cut: "cut" },
    hypothesis: "Expectation stated in advance",
    result: "Result",
    cols: { case: "Case", forecast: "Forecast", simulation: "Simulation", reality: "Reality" },
    scoring:
      "Scored by preference attainment per institution relative to the first draft, not as hit or miss.",
  },
  boundary: {
    title: "Inherited and built (CON-6)",
    sentence:
      "UI primitives, design tokens, the NDJSON streaming pattern and the gateway client pattern come from medlyn, a team member's earlier project. Engine, agents, coalition calculus, Experte, data corpus, forecasting, persona models and all negotiation views were built in this challenge.",
    inherited: "Inherited (own prior work)",
    built: "Built in the challenge",
    inheritedItems: [
      "shadcn/ui primitives and design tokens, light and dark mode",
      "NDJSON over fetch as the streaming pattern",
      "Gateway client with strict JSON schema",
      "Convention: nothing reaches the UI without a checked source",
    ],
    builtItems: [
      "Moderator, agents, rounds, lessons, strategic assessment",
      "RunEvent protocol, foldRun, replay",
      "Coalition calculus, impact model, person guard",
      "Experte with two verifiers and claim states",
      "Stellungnahmen corpus with masking, statistics catalogue",
      "Registry of first drafts, labels, reference-class forecast",
      "Persona classifier and fine-tuning kit",
      "All negotiation screens, the archive and this page",
    ],
    licence:
      "medlyn is CC BY-NC 4.0; its author is on the team and grants use for this repository. shadcn/ui: MIT.",
  },
  sources: {
    title: "Data sources and licences",
    source: "Source",
    use: "Use",
    licence: "Licence",
    rows: [
      {
        source: "Parliament of Austria open data (lists 81, 101, 142)",
        use: "Statement index, forecast registry, labels",
        licence: "CC BY 4.0",
      },
      {
        source: "RIS (Federal Law Gazette, Constitutional Court notices)",
        use: "Labels: entry into force, repeals",
        licence: "CC BY 4.0",
      },
      {
        source: "Texts of the consultation statements",
        use: "Positions, persona fitting, masked citations",
        licence: "Rights with the institutions; PDFs not published, text used with citation only",
      },
      {
        source: "Statistics Austria OGD, Eurostat, BMF UG 24, Court of Audit",
        use: "Impact inputs, number checks",
        licence: "CC BY 4.0",
      },
      {
        source: "DVSV statistical handbook, ÖÄK physician statistics, Zielsteuerung",
        use: "Contract positions, physician counts, targets",
        licence: "no open licence stated; cited, internal use",
      },
      {
        source: "Press review (SV-Box)",
        use: "local full-text search, context",
        licence:
          "declared freely distributable by the organizers; not in the repo as a whole, no APA-OTS crawl",
      },
    ],
  },
  limits: {
    title: "Limits",
    items: [
      "Small n: 30 to 60 episodes. Intervals are wide; a base rate is not a single-case prediction.",
      "Lookahead: frontier models know how past reforms ended. As-of limits the sources, not the model's knowledge. A backtest hit is weak evidence.",
      "SV-OG 2018 was adopted unilaterally. The simulator is expected to come out softer than the law.",
      "Stance labels are partly LLM-derived and only spot-checked; no German reference dataset exists.",
      "Stellungnahmen are opening positions. Red lines need a second source.",
      "Elective physicians have no statement, the ministry only 4. These agents are marked prompted.",
      "Masking is best effort, without a measured recall.",
      "Process realism is not measured.",
    ],
  },
  refs: {
    title: "Research basis",
    full: "Full list with the file per mechanism and the examined papers that were not built:",
  },
  fileNote: "Measured values from",
  fileError: "Measured values could not be read",
  updated: "updated",
};

export function methodT(lang: Lang): Dict {
  return lang === "en" ? en : de;
}
