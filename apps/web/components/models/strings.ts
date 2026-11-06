// Dictionary for /models. German is the source, English must satisfy its shape. Static
// explanation lives here; every measured number comes from the models/ result files.
import type { Lang } from "@sv/contracts";

type Cmp = "more" | "less" | "same";

const de = {
  title: "Modelle",
  sub: "Neun LoRA-Adapter auf Qwen3-8B, je einer pro Institution mit genug Stellungnahmen, und ein Klassifikator, der misst, wie sehr ein Text nach dieser Institution klingt. Ein gemessenes Experiment: die Agenten im Simulator laufen standardmäßig nicht darauf.",
  missing: "Folgende Ergebnisdateien fehlen oder sind ungültig",
  notMeasured: "nicht gemessen",
  verdict: {
    title: "Ergebnis in einem Satz",
    text: (wins: number, total: number) =>
      `Die Adapter schlagen das gepromptete Basismodell nur bei ${wins} von ${total} Institutionen im In-Character-Score und verlieren insgesamt bei Register und Stance-Richtung.`,
    decision:
      "Deshalb sprechen die Agenten standardmäßig über Frontier-Modelle mit gefitteten Stance-Profilen. Die Adapter bleiben ein gemessenes, offen dokumentiertes Experiment.",
    kpis: {
      inChar: "In-Character (Mittel)",
      sign: "Stance-Richtung getroffen",
      within1: "Stance innerhalb einer Stufe",
      loops: "Adapter-Ausgaben in Schleife",
    },
    adapter: "Adapter",
    base: "Basis",
    of: "von",
  },
  why: {
    title: "Was trainiert wurde und warum",
    items: [
      {
        name: "Ziel: Personatreue",
        text: "Ein Agent soll im Register und mit den typischen Forderungen seiner Institution sprechen, nicht wie ein allgemeiner Assistent. Die Frage war, ob ein kleines offenes Modell das aus echten Stellungnahmen lernt.",
      },
      {
        name: "Nur Institutionen mit genug Daten",
        text: "Ein Adapter braucht mindestens 100 Trainingszeilen aus 30 Stellungnahmen und 10 Held-out-Zeilen. Das erfüllen neun Rollen. Ministerium, Wahlärzt:innen und Vertragsärzt:innen bleiben gepromptet.",
      },
      {
        name: "Messbar statt behauptet",
        text: "Jede Institution wird auf Stellungnahmen ab 2023 getestet, die kein Modell gesehen hat, und mit demselben Basismodell plus Rollenkarte verglichen. Das Ergebnis steht unten, auch wo es gegen die Adapter spricht.",
      },
    ],
  },
  pipeline: {
    title: "Pipeline",
    steps: [
      {
        name: "Maskierte Stellungnahmen",
        text: "Begutachtungs-Stellungnahmen aus Parlament Open Data. Ein Personennamen-Guard (spaCy, Titel-Regel, Namenslisten) maskiert satzweise, prüft erneut und bricht den Build ab, wenn etwas übrig bleibt.",
      },
      {
        name: "Zeitschnitt",
        text: "Training vor dem 1. 1. 2023, Test ab diesem Datum. Kein zufälliger Split, damit das Modell keine späteren Positionen derselben Verfahren kennt.",
      },
      {
        name: "SFT auf SageMaker",
        text: "Ein Trainingsjob, neun Adapter nacheinander: LoRA Rang 16, alpha 32, 3 Epochen, Verlust nur auf dem Positionsabsatz, Qwen3 ohne Thinking.",
      },
      {
        name: "Ein Endpoint, neun Adapter",
        text: "Ein Endpoint lädt Basisgewichte und alle Adapter; die Anfrage wählt den Adapter. Ein lokaler Proxy macht daraus eine OpenAI-kompatible API mit den Modellen sv-<rolle> und sv-base.",
      },
    ],
  },
  table: {
    title: "Je Institution: Adapter gegen Basis",
    sub: "In-Character: mittlere Wahrscheinlichkeit des Klassifikators, dass der Text von dieser Institution stammt (Zufall etwa 0,10). Stance: Anteil der Held-out-Zeilen, bei denen ein LLM-Judge dieselbe Richtung wie im echten Absatz sieht. Urteil nach In-Character, Gleichstand unter 0,05 Abstand.",
    institution: "Institution",
    train: "Training",
    heldout: "Held-out",
    evalLoss: "Eval-Loss",
    trainLoss: "Train-Loss",
    seconds: "Sekunden",
    inChar: "In-Character",
    sign: "Stance-Richtung",
    within1: "± 1 Stufe",
    verdict: "Urteil",
    note: "Einordnung",
    adapter: "A",
    base: "B",
    legend: "A = Adapter sv-<rolle>, B = Basis sv-base mit derselben Rollenkarte",
    verdicts: { better: "besser", worse: "schlechter", tie: "gleich" },
    all: "Alle (mikro)",
    noteText: (v: "better" | "worse" | "tie", stance: Cmp) => {
      const reg = {
        better: "Klingt deutlich mehr nach der Institution als die Basis",
        worse: "Klingt weniger nach der Institution als die Basis",
        tie: "Im Register kein klarer Unterschied",
      }[v];
      const st = {
        more: "trifft die Stance-Richtung öfter",
        less: "trifft die Stance-Richtung seltener",
        same: "Stance-Richtung etwa gleich oft",
      }[stance];
      return `${reg}; ${st}.`;
    },
    caveat:
      "Kleine n bei Patientenvertretung und Finanzministerium. Der Klassifikator wurde auf demselben Zeitraum ausgewählt, absolute In-Character-Werte sind daher leicht optimistisch.",
  },
  classifier: {
    title: "In-Character-Klassifikator",
    sub: "TF-IDF über Zeichen-n-Gramme mit logistischer Regression, auf personen- und institutionsmaskierten Absätzen. Er misst Register, nicht Richtigkeit, und ist ein relatives Signal, kein Tor.",
    macro: "Macro-F1 out-of-time",
    chance: "Zufall",
    classes: "Klassen",
    paragraphs: "Absätze",
    train: "Training",
    heldout: "Held-out",
    heads: "Verglichene Köpfe",
    headNames: {
      char: "Zeichen-n-Gramme (ausgeliefert)",
      ensemble: "Mittel aus SetFit und Zeichen",
      frozen: "Eingefrorene Embeddings",
      setfit: "SetFit",
    },
    perClass: "F1 je Institution",
    reading:
      "Register (Schreibweise, Abkürzungen, Rechtssprache) trägt mehr Signal als Satzbedeutung. Verwechslungen vor allem mit den Ländern, der größten Klasse mit allgemeinem Verwaltungsstil.",
  },
  playground: {
    title: "Ausprobieren",
    sub: "Institution wählen, Entwurfsauszug oder Frage eingeben, und beide Modelle antworten nebeneinander: der Adapter und die Basis mit derselben Rollenkarte. Jede Ausgabe läuft vor der Anzeige durch den Personennamen-Guard.",
    institution: "Institution",
    prompt: "Entwurfsauszug oder Frage",
    placeholder:
      "z. B. § 15a: Diplomierte Pflegekräfte dürfen Heilbehelfe und Medizinprodukte für bis zu sechs Monate verordnen.",
    samples: "Beispiele",
    sampleTexts: [
      "§ 15a: Diplomierte Pflegekräfte dürfen Heilbehelfe und Medizinprodukte für bis zu sechs Monate verordnen.",
      "Die Länder sollen 300 Mio. Euro jährlich aus dem Finanzausgleich für den Ausbau von Primärversorgungseinheiten zweckwidmen.",
      "Wahlarztkosten werden nur noch erstattet, wenn binnen 14 Tagen kein Kassentermin angeboten wurde.",
    ],
    run: "Generieren",
    running: "Generiert",
    adapter: "Adapter",
    base: "Basis",
    inChar: "In-Character",
    scorerOff: "Scorer nicht erreichbar",
    loops: "Schleife",
    masked: (n: number) => `${n} Ausgabe(n) vom Namens-Guard maskiert`,
    offline: "Endpoint offline",
    offlineText:
      "Der SageMaker-Endpoint oder der lokale Proxy ist nicht erreichbar. Unten stehen vorberechnete Ausgaben aus der Held-out-Evaluation: je Institution die Zeile nahe dem Median, keine Auswahl der besten.",
    online: "Endpoint online",
    checking: "Prüfe Endpoint",
    error: "Generierung fehlgeschlagen",
    examples: "Vorberechnete Beispiele aus der Evaluation",
    draft: "Entwurf",
    stance: "Stance",
    refStance: "echter Absatz",
    note: "Temperatur 0,3, höchstens 400 Tokens, wie in der Evaluation. Antworten sind Simulation, keine Positionen der Institutionen.",
    seconds: "s",
  },
  infra: {
    title: "Kosten und Infrastruktur",
    job: "Trainingsjob",
    billable: "abgerechnete Sekunden",
    endpoint: "Endpoint",
    instance: "Instanz",
    region: "Region",
    base: "Basismodell",
    serving: "Serving",
    servingText: "LMI-Container (vLLM), alle neun Adapter beim Start geladen, Auswahl je Anfrage",
    item: "Posten",
    duration: "Dauer",
    usd: "USD",
    teardown:
      "Nach der Jury wird der Endpoint gelöscht; Hosting kostet pro Stunde auch im Leerlauf.",
  },
  licences: {
    title: "Lizenzen",
    rows: [
      {
        what: "Basismodell Qwen/Qwen3-8B",
        licence: "Apache-2.0; Adapter dürfen mit Lizenzhinweis weitergegeben werden",
      },
      {
        what: "Trainingstexte (Stellungnahmen)",
        licence:
          "Rechte bei den Institutionen; nie veröffentlicht, weder roh noch als Trainingsdaten",
      },
      {
        what: "Adapter-Gewichte",
        licence:
          "Apache-2.0 (Basis Qwen3-8B); privat auf Hugging Face unter Aryt3, mit Modellkarte, ohne Trainingsdaten",
      },
      {
        what: "Klassifikator-Basis (für den SetFit-Vergleich)",
        licence: "paraphrase-multilingual-mpnet-base-v2, Apache-2.0",
      },
    ],
    what: "Was",
    licence: "Lizenz und Umgang",
  },
  hf: {
    title: "Hugging Face: neun Adapter, privat",
    link: "https://huggingface.co/Aryt3",
    linkLabel: "huggingface.co/Aryt3",
    text: "Je Adapter ein privates Repository (Aryt3/sv-persona-<rolle>-qwen3-8b-lora) mit Modellkarte: diese Zahlen, die Grenzen (Schleifen, insgesamt schwächer als die Basis) und der Zweck als reine Forschungsdemo, nicht zur Vertretung echter Institutionen. Hochgeladen sind nur Adaptergewichte, Konfiguration und Karte, nie Trainingsdaten.",
  },
  versions: {
    title: "Versionen: v1, v1 mit Inferenz-Fix, v2",
    sub: "Gleiche Held-out-Zeilen, gleicher Richter. v1-fix: dieselben v1-Adapter mit Wiederholungsstrafe, Stopp nach einem Absatz und Schnitt bei Wiederholung. v2: Haltung zuerst im Trainingsziel, Presse-Zeilen dazu, 2 Epochen. Basis: gepoolt über alle Läufe.",
    sign: "Haltungsrichtung",
    inChar: "In-Character",
    base: "Basis",
    source: "models/out/eval_v2.md",
  },
  sources: "Zahlen aus",
};

export type Dict = typeof de;

const en: Dict = {
  title: "Models",
  sub: "Nine LoRA adapters on Qwen3-8B, one per institution with enough consultation statements, and a classifier that measures how much a text sounds like that institution. A measured experiment: the simulator's agents do not run on it by default.",
  missing: "These result files are missing or invalid",
  notMeasured: "not measured",
  verdict: {
    title: "The result in one sentence",
    text: (wins, total) =>
      `The adapters beat the prompted base model on the in-character score for only ${wins} of ${total} institutions and lose overall on register and stance direction.`,
    decision:
      "So the agents speak through frontier models with fitted stance profiles by default. The adapters remain a measured, openly documented experiment.",
    kpis: {
      inChar: "In-character (mean)",
      sign: "Stance direction matched",
      within1: "Stance within one step",
      loops: "Adapter outputs that loop",
    },
    adapter: "Adapter",
    base: "Base",
    of: "of",
  },
  why: {
    title: "What was trained and why",
    items: [
      {
        name: "Goal: persona fidelity",
        text: "An agent should speak in its institution's register and with its typical demands, not like a generic assistant. The question was whether a small open model learns this from real consultation statements.",
      },
      {
        name: "Only institutions with enough data",
        text: "An adapter needs at least 100 training rows from 30 statements and 10 held-out rows. Nine roles qualify. The ministry, elective and contract physicians stay prompted.",
      },
      {
        name: "Measured, not claimed",
        text: "Each institution is tested on statements from 2023 on that no model saw, against the same base model with the same role card. The result is below, including where it goes against the adapters.",
      },
    ],
  },
  pipeline: {
    title: "Pipeline",
    steps: [
      {
        name: "Masked statements",
        text: "Consultation statements from Parliament Open Data. A person-name guard (spaCy, title rule, name lists) masks whole sentences, re-verifies and aborts the build if anything survives.",
      },
      {
        name: "Time split",
        text: "Train before 1 Jan 2023, test from that date. No random split, so the model never sees later positions in the same procedures.",
      },
      {
        name: "SFT on SageMaker",
        text: "One training job, nine adapters in sequence: LoRA rank 16, alpha 32, 3 epochs, loss on the position paragraph only, Qwen3 in non-thinking mode.",
      },
      {
        name: "One endpoint, nine adapters",
        text: "One endpoint loads the base weights and all adapters; each request picks one. A local proxy exposes an OpenAI-compatible API with models sv-<role> and sv-base.",
      },
    ],
  },
  table: {
    title: "Per institution: adapter vs base",
    sub: "In-character: the classifier's mean probability that the text comes from this institution (chance about 0.10). Stance: share of held-out rows where an LLM judge sees the same direction as in the real paragraph. Verdict by in-character, tie below a 0.05 difference.",
    institution: "Institution",
    train: "Train",
    heldout: "Held-out",
    evalLoss: "Eval loss",
    trainLoss: "Train loss",
    seconds: "Seconds",
    inChar: "In-character",
    sign: "Stance direction",
    within1: "± 1 step",
    verdict: "Verdict",
    note: "Reading",
    adapter: "A",
    base: "B",
    legend: "A = adapter sv-<role>, B = base sv-base with the same role card",
    verdicts: { better: "better", worse: "worse", tie: "tie" },
    all: "All (micro)",
    noteText: (v, stance) => {
      const reg = {
        better: "Sounds clearly more like the institution than the base",
        worse: "Sounds less like the institution than the base",
        tie: "No clear difference in register",
      }[v];
      const st = {
        more: "matches the stance direction more often",
        less: "matches the stance direction less often",
        same: "stance direction about as often",
      }[stance];
      return `${reg}; ${st}.`;
    },
    caveat:
      "Small n for patients and the finance ministry. The classifier was selected on the same period, so absolute in-character values are slightly optimistic.",
  },
  classifier: {
    title: "In-character classifier",
    sub: "Character n-gram TF-IDF with logistic regression, on paragraphs with persons and institution names masked. It measures register, not correctness, and is a relative signal, not a gate.",
    macro: "Out-of-time macro F1",
    chance: "chance",
    classes: "classes",
    paragraphs: "Paragraphs",
    train: "train",
    heldout: "held-out",
    heads: "Heads compared",
    headNames: {
      char: "Character n-grams (shipped)",
      ensemble: "Mean of SetFit and character",
      frozen: "Frozen embeddings",
      setfit: "SetFit",
    },
    perClass: "F1 per institution",
    reading:
      "Register (spelling, abbreviations, legal phrasing) carries more signal than sentence meaning. Most confusions are with the Länder, the largest class with a generic administrative style.",
  },
  playground: {
    title: "Try it",
    sub: "Pick an institution, enter a draft excerpt or a question, and both models answer side by side: the adapter and the base with the same role card. Every output passes the person-name guard before it is shown.",
    institution: "Institution",
    prompt: "Draft excerpt or question",
    placeholder:
      "e.g. § 15a: Registered nurses may prescribe medical aids and devices for up to six months.",
    samples: "Examples",
    sampleTexts: [
      "§ 15a: Diplomierte Pflegekräfte dürfen Heilbehelfe und Medizinprodukte für bis zu sechs Monate verordnen.",
      "Die Länder sollen 300 Mio. Euro jährlich aus dem Finanzausgleich für den Ausbau von Primärversorgungseinheiten zweckwidmen.",
      "Wahlarztkosten werden nur noch erstattet, wenn binnen 14 Tagen kein Kassentermin angeboten wurde.",
    ],
    run: "Generate",
    running: "Generating",
    adapter: "Adapter",
    base: "Base",
    inChar: "In-character",
    scorerOff: "scorer not reachable",
    loops: "loop",
    masked: (n) => `${n} output(s) masked by the name guard`,
    offline: "Endpoint offline",
    offlineText:
      "The SageMaker endpoint or the local proxy is not reachable. Below are precomputed outputs from the held-out evaluation: per institution the row nearest the median, not the best ones.",
    online: "Endpoint online",
    checking: "Checking endpoint",
    error: "Generation failed",
    examples: "Precomputed examples from the evaluation",
    draft: "Draft",
    stance: "Stance",
    refStance: "real paragraph",
    note: "Temperature 0.3, at most 400 tokens, as in the evaluation. Answers are simulation, not the institutions' positions. The models answer in German.",
    seconds: "s",
  },
  infra: {
    title: "Cost and infrastructure",
    job: "Training job",
    billable: "billable seconds",
    endpoint: "Endpoint",
    instance: "Instance",
    region: "Region",
    base: "Base model",
    serving: "Serving",
    servingText: "LMI container (vLLM), all nine adapters loaded at start, chosen per request",
    item: "Item",
    duration: "Duration",
    usd: "USD",
    teardown: "The endpoint is deleted after the jury; hosting bills per hour even when idle.",
  },
  licences: {
    title: "Licences",
    rows: [
      {
        what: "Base model Qwen/Qwen3-8B",
        licence: "Apache-2.0; adapters may be redistributed with the licence notice",
      },
      {
        what: "Training text (consultation statements)",
        licence:
          "Rights stay with the institutions; never published, neither raw nor as training data",
      },
      {
        what: "Adapter weights",
        licence:
          "Apache-2.0 (base Qwen3-8B); private on Hugging Face under Aryt3, with model card, no training data",
      },
      {
        what: "Classifier base (for the SetFit comparison)",
        licence: "paraphrase-multilingual-mpnet-base-v2, Apache-2.0",
      },
    ],
    what: "What",
    licence: "Licence and handling",
  },
  hf: {
    title: "Hugging Face: nine adapters, private",
    link: "https://huggingface.co/Aryt3",
    linkLabel: "huggingface.co/Aryt3",
    text: "One private repository per adapter (Aryt3/sv-persona-<role>-qwen3-8b-lora) with a model card: these numbers, the limitations (loops, weaker than the base overall) and the intended use as a research demo only, not for representing real institutions. Only adapter weights, config and card are uploaded, never training data.",
  },
  versions: {
    title: "Versions: v1, v1 with the inference fix, v2",
    sub: "Same held-out rows, same judge. v1-fix: the same v1 adapters with a repetition penalty, a stop after one paragraph and a cut at the first repeat. v2: stance first in the training target, press rows added, 2 epochs. Base: pooled over all runs.",
    sign: "Stance direction",
    inChar: "In-character",
    base: "Base",
    source: "models/out/eval_v2.md",
  },
  sources: "Numbers from",
};

export function modelsT(lang: Lang): Dict {
  return lang === "en" ? en : de;
}
