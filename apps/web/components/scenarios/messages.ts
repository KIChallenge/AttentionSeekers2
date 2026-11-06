// Strings for the scenario grid and the scenario page (DE/EN). Kept local like the topic
// strings so the shared message files stay small.
import { TEMPLATES, type Template } from "@sv/contracts";
import { topicT } from "@/components/topics/messages";
import type { ScenarioKind } from "@/lib/scenarios";
import type { RunColumn } from "@/lib/topic-compare";

type Lang = "de" | "en";

/** Display names per scenario key; anything else falls back to the template name or question. */
const TITLES: Record<string, { de: string; en: string }> = {
  wartezeiten: {
    de: "Wartezeiten auf Facharzttermine",
    en: "Waiting times for specialist appointments",
  },
  backtest_svog_2018: { de: "SV-OG 2018 Backtest", en: "SV-OG 2018 backtest" },
};

/** Title of a scenario: the mapped name, else the template name, else the question itself. */
export function scenarioTitleOf(
  c: { baseKey: string; template: Template; question: string; kind: ScenarioKind },
  lang: Lang,
): string {
  const tpl = TEMPLATES.find((x) => x.id === c.template);
  const base = TITLES[c.baseKey]?.[lang] ?? (tpl ? (lang === "de" ? tpl.de : tpl.en) : c.question);
  const kind = scenarioT(lang).kind[c.kind];
  return kind ? `${base}: ${kind}` : base;
}

const de = {
  title: "Szenarien",
  open: "Öffnen",
  back: "Szenarien",
  runs: (n: number) => (n === 1 ? "1 Lauf" : `${n} Läufe`),
  families: "Modellfamilien",
  kind: { main: "", checks: "Prüfläufe", demo: "Demo" } as Record<ScenarioKind, string>,
  sideGroups: "Prüfläufe und Demo",
  sideGroupsHint:
    "Kurze Kontrollläufe und das handgeschriebene Fixture, nicht Teil des Vergleichs.",
  agreedAll: (names: string, k: number, n: number) =>
    `In allen ${n} Läufen geeinigt: ${names} (${k} Themen).`,
  agreedAllOne: (names: string) => `In jedem Lauf geeinigt: ${names}.`,
  agreedNone: (n: number) => `Kein Thema wurde in allen ${n} Läufen geeinigt.`,
  agreedSingle: (k: number, of: number) => `${k} von ${of} Themen geeinigt.`,
  baseRate: (k: number, n: number) =>
    `Historisch: ${k} von ${n} vergleichbaren Entwürfen umgesetzt.`,
  noRuns: "Noch keine Läufe. Lege unter runs/ eine NDJSON-Datei ab oder starte eine neue Frage.",
  reference: "Referenzlauf",
  tabs: {
    laeufe: "Läufe",
    ergebnis: "Ergebnis",
    perspektiven: "Perspektiven",
    koalitionen: "Koalitionen",
    modelle: "Modelle",
  },
  question: "Frage",
  stage: "Bühne",
  scenario: "Szenario",
  impact: {
    title: "Wirkung der angenommenen Maßnahmen je Lauf",
    run: "Lauf",
    wait: "Wartezeit",
    cost: "Kosten p.a.",
    none: "ohne Schätzung",
  },
  perspectives: {
    institution: "Institution",
    stances: "Haltung je Thema",
    stancesHint: "Ring = Start, Punkte = Ende je Lauf, Skala −2 bis +2",
    redLines: "Rote Linien",
    touched: (n: number, runs: number) =>
      n === 1 ? "1× berührt" : `${n}× berührt in ${runs} Läufen`,
    untouched: "nie berührt",
    noRedLines: "keine",
    votes: "Abstimmungen",
    supported: "unterstützt",
    opposed: "abgelehnt",
    accepted: "angenommen",
    rejected: "abgelehnt",
    openProposal: "offen",
    withdrawn: "zurückgezogen",
    ask: "Fragen",
    card: "Agentenkarte",
    cardIn: "Agentenkarte im Lauf",
    moved: "Bewegung",
    start: "Start",
    end: "Ende",
  },
  coalitions: {
    matrix: "Wer stimmt mit wem",
    matrixHint:
      "Anteil der Vorschläge, bei denen beide Institutionen auf derselben Seite standen, über alle Läufe.",
    pairs: "Häufigste Allianzen",
    pairsOf: (same: number, both: number) => `${same} von ${both} Abstimmungen gemeinsam`,
    blockers: "Häufigste Blockierer",
    blockersOf: (count: number, of: number) => `blockiert ${count} von ${of} Vorschlägen`,
    proposals: "Mehrheiten und Blockierer je Vorschlag",
    proposal: "Vorschlag",
    status: "Status",
    mwc: "Minimale Gewinnkoalitionen",
    blockedBy: "Blockierer",
    none: "keine",
    noCalculus: "nicht bewertet",
    accepted: "angenommen",
    rejected: "abgelehnt",
    round: (r: number) => `Runde ${r}`,
    noData: "Keine Abstimmungen in diesen Läufen.",
    runs: (n: number) => (n === 1 ? "1 Vorschlag" : `${n} Vorschläge`),
    cellTitle: (a: string, b: string, same: number, both: number) =>
      `${a} und ${b}: ${same} von ${both} Abstimmungen auf derselben Seite`,
  },
  models: {
    placeholder: "Die Modellanalyse für dieses Szenario entsteht gerade auf einem eigenen Zweig.",
    link: "Themenvergleich öffnen",
  },
};

export type ScenarioMessages = typeof de;

const en: ScenarioMessages = {
  title: "Scenarios",
  open: "Open",
  back: "Scenarios",
  runs: (n) => (n === 1 ? "1 run" : `${n} runs`),
  families: "Model families",
  kind: { main: "", checks: "Check runs", demo: "Demo" },
  sideGroups: "Check runs and demo",
  sideGroupsHint: "Short control runs and the hand-written fixture, not part of the comparison.",
  agreedAll: (names, k, n) => `Agreed in all ${n} runs: ${names} (${k} topics).`,
  agreedAllOne: (names) => `Agreed in every run: ${names}.`,
  agreedNone: (n) => `No topic was agreed in all ${n} runs.`,
  agreedSingle: (k, of) => `${k} of ${of} topics agreed.`,
  baseRate: (k, n) => `Historically: ${k} of ${n} comparable drafts implemented.`,
  noRuns: "No runs yet. Drop an NDJSON file under runs/ or start a new question.",
  reference: "Reference run",
  tabs: {
    laeufe: "Runs",
    ergebnis: "Result",
    perspektiven: "Perspectives",
    koalitionen: "Coalitions",
    modelle: "Models",
  },
  question: "Question",
  stage: "Stage",
  scenario: "Scenario",
  impact: {
    title: "Impact of the accepted measures per run",
    run: "Run",
    wait: "Waiting time",
    cost: "Cost p.a.",
    none: "no estimate",
  },
  perspectives: {
    institution: "Institution",
    stances: "Stance per topic",
    stancesHint: "Ring = start, dots = end per run, scale −2 to +2",
    redLines: "Red lines",
    touched: (n, runs) => (n === 1 ? "touched once" : `touched ${n} times in ${runs} runs`),
    untouched: "never touched",
    noRedLines: "none",
    votes: "Votes",
    supported: "supported",
    opposed: "opposed",
    accepted: "accepted",
    rejected: "rejected",
    openProposal: "open",
    withdrawn: "withdrawn",
    ask: "Ask",
    card: "Agent card",
    cardIn: "Agent card in run",
    moved: "Movement",
    start: "Start",
    end: "End",
  },
  coalitions: {
    matrix: "Who votes with whom",
    matrixHint:
      "Share of proposals on which both institutions stood on the same side, over all runs.",
    pairs: "Most frequent alliances",
    pairsOf: (same, both) => `${same} of ${both} votes together`,
    blockers: "Most frequent blockers",
    blockersOf: (count, of) => `blocks ${count} of ${of} proposals`,
    proposals: "Majorities and blockers per proposal",
    proposal: "Proposal",
    status: "Status",
    mwc: "Minimal winning coalitions",
    blockedBy: "Blockers",
    none: "none",
    noCalculus: "not scored",
    accepted: "accepted",
    rejected: "rejected",
    round: (r) => `Round ${r}`,
    noData: "No votes in these runs.",
    runs: (n) => (n === 1 ? "1 proposal" : `${n} proposals`),
    cellTitle: (a, b, same, both) => `${a} and ${b}: ${same} of ${both} votes on the same side`,
  },
  models: {
    placeholder: "The model analysis for this scenario is being built on its own branch.",
    link: "Open topic comparison",
  },
};

export const scenarioT = (lang: Lang): ScenarioMessages => (lang === "de" ? de : en);

/** Same reading of a run column as the topic comparison: reference, ensemble label or variant. */
export function runLabelOf(r: RunColumn, lang: Lang): string {
  const t = topicT(lang);
  if (r.isReference) return `${t.reference}${r.id.endsWith("presse") ? " + Presse" : ""}`;
  const all = r.label.match(/^all_(.+)$/)?.[1];
  return t.label[r.label] ?? (all ? t.allSeats(t.fam[all] ?? all) : r.label);
}
