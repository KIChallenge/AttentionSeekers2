// Builds runs/fixture-wartezeiten.ndjson (and runs/fixture-sources.json), a believable
// reference run for UI work before the engine exists. Every line is validated with the
// contracts. Illustrative data: numbers and sources are plausible placeholders, not
// verified facts. Institutions only, never a person (CON-1/CON-2).
//
//   pnpm fixture

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  AGENT_CATALOG,
  type AgentConfig,
  type CitationRef,
  type Claim,
  type CoalitionCalculus,
  type Exchange,
  foldRun,
  type LocalizedText,
  type PayoffSign,
  type Position,
  type Proposal,
  type RedLine,
  RedLine as RedLineSchema,
  type RoomConfig,
  type RoundLesson,
  type RoundSummary,
  type Run,
  RunEvent,
  type Segment,
  Segment as SegmentSchema,
  type Source,
  Source as SourceSchema,
  type StrategicAssessment,
  topicStatus,
  type Utterance,
  type UtteranceKind,
} from "../src/index.ts";

const RUN_ID = "fixture-wartezeiten";
const QUESTION =
  "Wie können die Wartezeiten auf Facharzttermine innerhalb von fünf Jahren um 20 % reduziert werden, ohne die Gesundheitsausgaben um mehr als 5 % zu erhöhen?";
const REV = "corpus-2026-10-31";

const L = (de: string, en: string): LocalizedText => ({
  lang: "de",
  text: de,
  translations: { en },
});

const AG = ["gm", "sv", "ak", "va", "ka", "pf", "bl", "pv", "fm"] as const;
type Ag = (typeof AG)[number];

// ---------- sources (side file) ----------

const inst = (id: Ag) => {
  const a = AGENT_CATALOG.find((x) => x.id === id);
  if (!a) throw new Error(id);
  return { code: a.code, nameDe: a.nameDe, glossEn: a.glossEn, role: a.role };
};

const sourceDefs: Array<[string, Ag, Source["kind"], string, string | null, string, string]> = [
  [
    "p-18821",
    "sv",
    "press",
    "2026-09-14",
    "APA-OTS",
    "Sozialversicherung zu unbesetzten Kassenstellen",
    "Mit Stichtag 1. Juli sind österreichweit rund 290 Kassenstellen unbesetzt, zwei Drittel davon in ländlichen Regionen.",
  ],
  [
    "p-19544",
    "ak",
    "stellungnahme",
    "2026-06-02",
    null,
    "Stellungnahme zum Entwurf Gesundheitsreformbegleitgesetz",
    "Von den 650 im Vorjahr ausgeschriebenen Kassenstellen blieben 40 % ohne Bewerbung. Ursache ist die fehlende Attraktivität der Tarife.",
  ],
  [
    "p-20877",
    "va",
    "press",
    "2026-08-21",
    "Der Standard",
    "Vertragsärzt:innen zu Telemedizin",
    "Telemedizinische Erstkontakte als Kassenleistung setzen klare Haftungsregeln und eine eigene Tarifposition voraus.",
  ],
  [
    "p-21003",
    "gm",
    "parliament",
    "2026-05-12",
    null,
    "Regierungsvorlage Zielsteuerung-Gesundheit",
    "Eine nationale Terminservicestelle über die Gesundheitshotline 1450 soll bis 2028 flächendeckend verfügbar sein.",
  ],
  [
    "p-22410",
    "pv",
    "press",
    "2026-10-03",
    "Die Presse",
    "Patientenvertretung zu Wartezeiten",
    "In mehreren Fächern warten Patient:innen länger als acht Wochen auf einen Kassentermin.",
  ],
  [
    "p-23118",
    "fm",
    "stellungnahme",
    "2026-07-08",
    null,
    "Stellungnahme Finanzrahmen Gesundheit",
    "Zusätzliche Dauerausgaben sind nur mit Gegenfinanzierung und Evaluierung vertretbar.",
  ],
  [
    "p-24002",
    "bl",
    "stellungnahme",
    "2026-04-17",
    null,
    "Stellungnahme der Länder zur Primärversorgung",
    "Die Länder fordern eine Mitentscheidung bei der Planung von Primärversorgungseinheiten über die Landes-Zielsteuerungskommissionen.",
  ],
  [
    "p-24390",
    "ka",
    "audit",
    "2025-11-30",
    null,
    "Bericht Spitalsambulanzen",
    "Ein relevanter Anteil der Ambulanzfälle wäre im niedergelassenen Bereich versorgbar.",
  ],
  [
    "p-24711",
    "pf",
    "press",
    "2026-09-29",
    "APA-OTS",
    "Pflegevertretung zu Community Nursing",
    "Pflegerischer Erstkontakt in Primärversorgungseinheiten kann ärztliche Routinekontrollen entlasten.",
  ],
  [
    "p-25001",
    "sv",
    "statistic",
    "2026-10-15",
    null,
    "Gebarungsvorschau Krankenversicherung",
    "Für Spitalsambulanzen sind im Folgejahr Pauschalzahlungen vorgesehen, aus denen 180 Mio. Euro umgeschichtet werden könnten.",
  ],
  [
    "p-30112",
    "sv",
    "statistic",
    "2026-10-28",
    null,
    "Wartezeiten-Erhebung Fachärzt:innen",
    "Median-Wartezeit auf einen Kassentermin: sechs Wochen in Augenheilkunde, fünf Wochen in Dermatologie.",
  ],
  [
    "s-asvg-342",
    "sv",
    "sozdok",
    "2026-01-01",
    null,
    "ASVG § 342",
    "Der Gesamtvertrag regelt insbesondere die Festsetzung der Zahl und der örtlichen Verteilung der Vertragsärzt:innen.",
  ],
];

const sources: Source[] = [];
const segments: Segment[] = [];
for (const [id, ag, kind, date, outlet, title, text] of sourceDefs) {
  sources.push(
    SourceSchema.parse({
      id,
      kind,
      institution: inst(ag),
      date,
      datePrecision: "day",
      outlet,
      title,
      legalRef: kind === "sozdok" ? title : null,
      url: null,
      licence: null,
      personFiltered: true,
      corpusRevision: REV,
    }),
  );
  segments.push(
    SegmentSchema.parse({
      id: `${id}-s1`,
      sourceId: id,
      ordinal: 1,
      start: 0,
      end: text.length,
      text,
      textEn: null,
    }),
  );
}
const cite = (sourceId: string, w = 0.9): CitationRef => ({
  sourceId,
  segmentId: `${sourceId}-s1`,
  start: null,
  end: null,
  recencyWeight: w,
});

const redLines: RedLine[] = [
  {
    id: "rl-ak-1",
    role: "medical_chamber",
    text: L(
      "Keine Stellenplanung außerhalb des Gesamtvertrags",
      "No post planning outside the collective contract",
    ),
    basis: cite("s-asvg-342", 1),
    tier: "deep_core",
    topicKeys: ["pve_planning", "contract_posts"],
  },
  {
    id: "rl-ak-2",
    role: "medical_chamber",
    text: L(
      "Keine Substitution der ärztlichen Erstdiagnose",
      "No substitution of the medical first diagnosis",
    ),
    basis: cite("p-19544", 0.7),
    tier: "policy_core",
    topicKeys: ["nursing_first_contact", "telemedicine"],
  },
  {
    id: "rl-va-1",
    role: "contract_physicians",
    text: L(
      "Keine Terminpflicht ohne Honorierung",
      "No appointment obligation without remuneration",
    ),
    basis: cite("p-20877", 0.86),
    tier: "policy_core",
    topicKeys: ["appointment_guarantee"],
  },
  {
    id: "rl-fm-1",
    role: "ministry_finance",
    text: L(
      "Mehrausgaben nur innerhalb des Deckels und mit Gegenfinanzierung",
      "Extra spending only within the cap and with offsetting finance",
    ),
    basis: cite("p-23118", 0.82),
    tier: "deep_core",
    topicKeys: ["fee_indexation", "contract_posts"],
  },
  {
    id: "rl-bl-1",
    role: "laender",
    text: L(
      "Keine Kostenverschiebung auf Länderbudgets ohne 15a-Ausgleich",
      "No cost shift onto Länder budgets without a 15a settlement",
    ),
    basis: cite("p-24002", 0.74),
    tier: "policy_core",
    topicKeys: ["pve_planning"],
  },
  {
    id: "rl-sv-1",
    role: "social_insurance",
    text: L("Beitragssätze bleiben stabil", "Contribution rates stay stable"),
    basis: cite("p-25001", 0.95),
    tier: "deep_core",
    topicKeys: ["fee_indexation"],
  },
];
for (const r of redLines) RedLineSchema.parse(r);

// ---------- mandate, room, agents ----------

const T = {
  tele: "t-tele",
  stellen: "t-stellen",
  tss: "t-tss",
  wo4: "t-4wo",
  pve: "t-pve",
  hon: "t-honorar",
  pfl: "t-pflege",
} as const;
type TopicId = (typeof T)[keyof typeof T];

const topics = [
  {
    id: T.tele,
    key: "telemedicine",
    label: L("Telemedizin", "Telemedicine"),
    measure: L("Erstkontakt als Kassenleistung", "First contact as an insured benefit"),
  },
  {
    id: T.stellen,
    key: "contract_posts",
    label: L("Kassenstellen", "Contract posts"),
    measure: L("300 Stellen, gestaffelt", "300 posts, staggered"),
  },
  {
    id: T.tss,
    key: "appointment_service",
    label: L("Wartezeiten", "Waiting times"),
    measure: L("Terminservicestelle", "Appointment service centre"),
  },
  {
    id: T.wo4,
    key: "appointment_guarantee",
    label: L("Wartezeiten", "Waiting times"),
    measure: L("4-Wochen-Terminzusage", "4-week appointment guarantee"),
  },
  {
    id: T.pve,
    key: "pve_planning",
    label: L("Primärversorgung", "Primary care"),
    measure: L("Planungshoheit PVE", "Planning authority for primary care units"),
  },
  {
    id: T.hon,
    key: "fee_indexation",
    label: L("Honorar", "Fees"),
    measure: L("Indexierung Gesamtvertrag", "Indexation in the collective contract"),
  },
  {
    id: T.pfl,
    key: "nursing_first_contact",
    label: L("Pflegekompetenz", "Nursing scope"),
    measure: L("Pflegerischer Erstkontakt in PVE", "Nursing first contact in primary care units"),
  },
];

const MODELS = {
  moderator: "azure/gpt-5.1",
  expert: "mistral/mistral-large-2",
  a: "azure/gpt-5-mini",
  b: "mistral/mistral-medium-3",
};
const agentModel: Record<Ag, string> = {
  gm: MODELS.a,
  sv: MODELS.b,
  ak: MODELS.a,
  va: MODELS.b,
  ka: MODELS.a,
  pf: MODELS.b,
  bl: MODELS.a,
  pv: MODELS.b,
  fm: MODELS.a,
};

type AgentText = {
  unit: string;
  goal: [string, string];
  interest: [string, string];
  restriction: [string, string];
  budget: [string, string];
  priorities: Array<[string, string, number]>;
  redLines: string[];
  temperament: [number, number, number, number];
  reason: [string, string];
};

const agentText: Record<Ag, AgentText> = {
  gm: {
    unit: "Sektion Gesundheitssystem",
    goal: ["Messbare Wartezeitreduktion bis 2030", "Measurable waiting-time reduction by 2030"],
    interest: ["Steuerung über Zielsteuerung-Gesundheit", "Steering via target-based governance"],
    restriction: [
      "Gesetzgebung braucht parlamentarische Mehrheit",
      "Legislation needs a parliamentary majority",
    ],
    budget: ["Bundesmittel nur über Finanzausgleich", "Federal funds only via fiscal equalisation"],
    priorities: [
      ["Zugang", "Access", 0.4],
      ["Steuerbarkeit", "Steerability", 0.35],
      ["Kosten", "Cost", 0.25],
    ],
    redLines: [],
    temperament: [0.55, 0.6, 0.7, 0.5],
    reason: [
      "Federführend für Gesetzgebung und Zielsteuerung",
      "Lead on legislation and target-based governance",
    ],
  },
  sv: {
    unit: "Dachverband und ÖGK",
    goal: ["Versorgung in Mangelregionen sichern", "Secure care in shortage regions"],
    interest: ["Beitragsstabilität", "Stable contribution rates"],
    restriction: [
      "Gesamtvertrag mit der Ärztekammer",
      "Collective contract with the Medical Chamber",
    ],
    budget: ["Ausgaben im Rahmen der Gebarungsvorschau", "Spending within the financial forecast"],
    priorities: [
      ["Kosten", "Cost", 0.45],
      ["Versorgungsdichte", "Coverage", 0.35],
      ["Digitalisierung", "Digitalisation", 0.2],
    ],
    redLines: ["rl-sv-1"],
    temperament: [0.5, 0.55, 0.6, 0.45],
    reason: [
      "Kostenträger und Vertragspartner im Gesamtvertrag",
      "Payer and party to the collective contract",
    ],
  },
  ak: {
    unit: "Kurie niedergelassene Ärzte",
    goal: ["Attraktive Kassentarife", "Attractive insurance fees"],
    interest: [
      "Stellenplanung im Gesamtvertrag halten",
      "Keep post planning in the collective contract",
    ],
    restriction: ["Berufsrecht und Kammerautonomie", "Professional law and chamber autonomy"],
    budget: ["Keine Honorarkürzungen", "No fee cuts"],
    priorities: [
      ["Honorar", "Fees", 0.5],
      ["Kompetenz", "Competence", 0.3],
      ["Arbeitslast", "Workload", 0.2],
    ],
    redLines: ["rl-ak-1", "rl-ak-2"],
    temperament: [0.3, 0.8, 0.4, 0.4],
    reason: [
      "Vertragspartner im Gesamtvertrag, Vetospieler bei Stellenplänen",
      "Contract party, veto player on post plans",
    ],
  },
  va: {
    unit: "Vertretung der Kassenordinationen",
    goal: ["Planbare Arbeitslast", "Predictable workload"],
    interest: ["Tarifposition für neue Leistungen", "Fee item for new services"],
    restriction: ["Haftungsfragen bei Telemedizin", "Liability for telemedicine"],
    budget: ["Ordinationskosten gedeckt", "Practice costs covered"],
    priorities: [
      ["Honorar", "Fees", 0.4],
      ["Arbeitslast", "Workload", 0.4],
      ["Rechtssicherheit", "Legal certainty", 0.2],
    ],
    redLines: ["rl-va-1"],
    temperament: [0.5, 0.6, 0.5, 0.45],
    reason: [
      "Trägt die Facharzttermine im niedergelassenen Bereich",
      "Delivers specialist appointments in the community",
    ],
  },
  ka: {
    unit: "Spitalsträger",
    goal: ["Entlastung der Spitalsambulanzen", "Relieve hospital outpatient departments"],
    interest: ["Planbare Budgets", "Predictable budgets"],
    restriction: ["Landesfinanzierung der Spitäler", "Länder financing of hospitals"],
    budget: ["Keine Kürzung ohne messbare Entlastung", "No cuts without measurable relief"],
    priorities: [
      ["Arbeitslast", "Workload", 0.5],
      ["Kosten", "Cost", 0.3],
      ["Qualität", "Quality", 0.2],
    ],
    redLines: [],
    temperament: [0.55, 0.45, 0.6, 0.4],
    reason: [
      "Ambulanzen tragen die Lücken der Kassenversorgung",
      "Outpatient departments absorb gaps in insured care",
    ],
  },
  pf: {
    unit: "Berufsverband Pflege",
    goal: ["Erweiterte Pflegekompetenzen", "Extended nursing scope"],
    interest: ["Community Nursing verankern", "Establish community nursing"],
    restriction: [
      "Berufsrechtliche Abgrenzung zur Ärzteschaft",
      "Professional boundary to physicians",
    ],
    budget: ["Finanzierung über PVE-Verträge", "Funding through primary care contracts"],
    priorities: [
      ["Kompetenz", "Competence", 0.5],
      ["Zugang", "Access", 0.3],
      ["Arbeitslast", "Workload", 0.2],
    ],
    redLines: [],
    temperament: [0.6, 0.55, 0.75, 0.55],
    reason: ["Kann ärztliche Routinekontakte übernehmen", "Can take over routine medical contacts"],
  },
  bl: {
    unit: "Landes-Zielsteuerungskommissionen",
    goal: ["Mitentscheidung bei Versorgungsplanung", "Co-decision on care planning"],
    interest: ["Spitalsbudgets entlasten", "Relieve hospital budgets"],
    restriction: ["15a-Vereinbarung", "15a agreement"],
    budget: ["Keine Kostenverschiebung auf Länder", "No cost shift to the Länder"],
    priorities: [
      ["Planung", "Planning", 0.45],
      ["Kosten", "Cost", 0.35],
      ["Zugang", "Access", 0.2],
    ],
    redLines: ["rl-bl-1"],
    temperament: [0.5, 0.6, 0.65, 0.5],
    reason: [
      "Spitalsträger und Partner der 15a-Vereinbarung",
      "Hospital owners and party to the 15a agreement",
    ],
  },
  pv: {
    unit: "Patientenanwaltschaften",
    goal: ["Verbindliche Terminzusagen", "Binding appointment guarantees"],
    interest: ["Transparenz über Wartezeiten", "Transparency on waiting times"],
    restriction: ["Keine formale Entscheidungsmacht", "No formal decision power"],
    budget: ["Keine Selbstbehalte", "No co-payments"],
    priorities: [
      ["Zugang", "Access", 0.6],
      ["Transparenz", "Transparency", 0.3],
      ["Kosten", "Cost", 0.1],
    ],
    redLines: [],
    temperament: [0.4, 0.75, 0.55, 0.6],
    reason: [
      "Stimme der Betroffenen, misst Erfolg an Terminen",
      "Voice of patients, measures success in appointments",
    ],
  },
  fm: {
    unit: "Budgetsektion",
    goal: ["Ausgabendeckel einhalten", "Keep the spending cap"],
    interest: ["Keine Dauerbelastung ohne Gegenfinanzierung", "No permanent burden without offset"],
    restriction: ["Haushaltsrecht", "Budget law"],
    budget: ["Deckel +5 % für das Gesamtpaket", "Cap +5 % for the whole package"],
    priorities: [
      ["Kosten", "Cost", 0.7],
      ["Evaluierbarkeit", "Evaluability", 0.2],
      ["Zugang", "Access", 0.1],
    ],
    redLines: ["rl-fm-1"],
    temperament: [0.35, 0.65, 0.4, 0.3],
    reason: [
      "Budgethoheit, Vetospieler bei Mehrausgaben",
      "Budget authority, veto player on extra spending",
    ],
  },
};

/**
 * Delegates per institution: fictional, unnamed functional roles (CON-1/CON-2). The first is
 * always the lead negotiator; specialists take rebuttals and caucus work.
 */
const DELEGATES: Record<Ag, Array<[string, string]>> = {
  gm: [
    ["Verhandlungsführung", "Lead negotiator"],
    ["Rechtsabteilung", "Legal department"],
    ["Zielsteuerungsreferat", "Target governance desk"],
  ],
  sv: [
    ["Verhandlungsführung", "Lead negotiator"],
    ["Finanzreferat", "Finance desk"],
    ["Vertragspartnerabteilung", "Contract partner department"],
  ],
  ak: [
    ["Verhandlungsführung", "Lead negotiator"],
    ["Kurienreferat", "Section desk"],
    ["Rechtsabteilung", "Legal department"],
  ],
  va: [
    ["Verhandlungsführung", "Lead negotiator"],
    ["Tarifreferat", "Fee desk"],
  ],
  ka: [
    ["Verhandlungsführung", "Lead negotiator"],
    ["Ambulanzmanagement", "Outpatient management"],
  ],
  pf: [
    ["Verhandlungsführung", "Lead negotiator"],
    ["Fachreferat Community Nursing", "Community nursing desk"],
  ],
  bl: [
    ["Verhandlungsführung", "Lead negotiator"],
    ["Versorgungsplanung", "Care planning"],
  ],
  pv: [
    ["Verhandlungsführung", "Lead negotiator"],
    ["Fallreferat", "Case desk"],
  ],
  fm: [
    ["Verhandlungsführung", "Lead negotiator"],
    ["Budgetreferat", "Budget desk"],
    ["Evaluierungsstelle", "Evaluation unit"],
  ],
};
const delegateId = (ag: Ag, i: number) => `${ag}-d${i + 1}`;

const agents: AgentConfig[] = AG.map((id) => {
  const c = AGENT_CATALOG.find((a) => a.id === id);
  const t = agentText[id];
  if (!c) throw new Error(id);
  const [concession, assertiveness, coalitionAppetite, riskTolerance] = t.temperament;
  return {
    id,
    role: c.role,
    institution: { nameDe: c.nameDe, glossEn: c.glossEn, unit: t.unit },
    mode: "fitted",
    goals: [L(...t.goal)],
    interests: [L(...t.interest)],
    restrictions: [L(...t.restriction)],
    budgetConstraints: [L(...t.budget)],
    priorities: t.priorities.map(([de, en, weight]) => ({ label: L(de, en), weight })),
    redLineIds: t.redLines,
    temperament: {
      concession,
      assertiveness,
      coalitionAppetite,
      riskTolerance,
      modelBaselineConcession: null,
      correctedConcession: null,
      inertnessChecked: false,
    },
    color: c.color,
    code: c.code,
    delegates: DELEGATES[id].map(([de, en], i) => ({ id: delegateId(id, i), role: L(de, en) })),
  };
});

const room: RoomConfig = {
  template: "wartezeiten",
  question: QUESTION,
  lang: "de",
  agents: AG.map((id) => ({
    agentId: id,
    enabled: true,
    origin: "core",
    mode: "fitted",
    suggestedByModerator: true,
    reason: L(...agentText[id].reason),
    model: agentModel[id],
    temperament: {
      concession: agentText[id].temperament[0],
      assertiveness: agentText[id].temperament[1],
      coalitionAppetite: agentText[id].temperament[2],
      riskTolerance: agentText[id].temperament[3],
    },
  })),
  moderatorModel: MODELS.moderator,
  expertModel: MODELS.expert,
  decisionRule: "veto_players",
  qualifiedMajority: null,
  roundLimit: 5,
  budgetCeiling: {
    maxIncreasePct: 5,
    baselineEurBn: null,
    note: L("Deckel gilt für das Gesamtpaket", "Cap applies to the whole package"),
  },
  asOf: "2026-10-31",
  climate: "neutral",
  pressures: { time: "medium", budget: "high", public: "medium" },
  scheduledEvents: [
    {
      id: "ev-1",
      atRound: 4,
      kind: "statistic",
      title: L("Neue Wartezeiten-Erhebung", "New waiting-time survey"),
      body: L(
        "Median-Wartezeit auf einen Kassentermin: sechs Wochen in Augenheilkunde, fünf Wochen in Dermatologie.",
        "Median wait for an insured appointment: six weeks in ophthalmology, five weeks in dermatology.",
      ),
      sourceRef: cite("p-30112", 0.98),
    },
  ],
  coldRatification: false,
  seed: 20261105,
};

const run: Run = {
  id: RUN_ID,
  createdAt: "2026-11-05T21:00:00.000Z",
  mandate: {
    question: QUESTION,
    lang: "de",
    objective: L(
      "Wartezeiten auf Facharzttermine binnen fünf Jahren um 20 % senken",
      "Cut waiting times for specialist appointments by 20 % within five years",
    ),
    constraints: [
      L("Gesundheitsausgaben steigen um höchstens 5 %", "Health spending rises by at most 5 %"),
      L("Keine Erhöhung der Beitragssätze", "No increase in contribution rates"),
    ],
    successMetrics: [
      L(
        "Median-Wartezeit je Fach, gemessen jährlich",
        "Median waiting time per specialty, measured yearly",
      ),
      L("Mehrausgaben in Prozent der Ausgangsbasis", "Extra spending as a percentage of baseline"),
    ],
    topics,
    axes: [
      {
        id: "x",
        label: L("Patientensteuerung", "Patient steering"),
        poles: [
          L("Gegen Patientensteuerung", "Against patient steering"),
          L("Für Patientensteuerung", "For patient steering"),
        ],
        topicWeights: { [T.tss]: 0.3, [T.wo4]: 0.3, [T.pve]: 0.4 },
      },
      {
        id: "y",
        label: L("Kapazitätsausbau", "Capacity expansion"),
        poles: [
          L("Gegen Kapazitätsausbau", "Against capacity expansion"),
          L("Für Kapazitätsausbau", "For capacity expansion"),
        ],
        topicWeights: { [T.stellen]: 0.4, [T.hon]: 0.4, [T.tele]: 0.2 },
      },
    ],
    actors: AG.map((id) => ({ agentId: id, reason: L(...agentText[id].reason) })),
    rules: { rounds: 5, speakingOrder: "randomised_recorded", seed: 20261105 },
    asOf: "2026-10-31",
    coldRatification: false,
  },
  room,
  variant: { kind: "baseline" },
  agents,
  modelAssignment: { moderator: MODELS.moderator, expert: MODELS.expert, ...agentModel },
  status: "running",
  endCondition: null,
  isReference: true,
};

// ---------- event writer ----------

const events: RunEvent[] = [];
let seq = 0;
let t = 0;
let uttSeq = 0;
function emit(type: string, body: Record<string, unknown>, dt = 300) {
  t += dt;
  const ev = RunEvent.parse({ v: 1, runId: RUN_ID, seq: seq++, tMs: t, type, ...body });
  events.push(ev);
  return ev;
}

const claimsById = new Map<string, Claim>();

type ClaimSpec = {
  quote: string;
  atomic: string;
  kind: Claim["kind"];
  state: Claim["state"];
  numeric?: [number, string];
  cites?: string[];
  contradicts?: string;
};

type Speaker = Ag | "moderator" | "expert";

type UttSpec = {
  id: string;
  sp: Speaker;
  kind: UtteranceKind;
  re: string | null;
  de: string;
  en: string;
  claims?: ClaimSpec[];
  rl?: string[];
  props?: string[];
  /** Exchange override, needed while two caucuses run in parallel. */
  x?: string;
  /** Addressees override; default derives from the exchange and respondsTo. */
  to?: Speaker[];
  /** Delegate index override (0 = lead negotiator). */
  dl?: number;
};

// ---------- exchanges and simulated meeting time ----------

/** Simulated meeting clock in minutes since the run opened. */
let clock = 0;
let currentX: string | null = null;
const openXs = new Map<string, { x: Exchange; cursor: number }>();
const speakerOf = new Map<string, Speaker>();

type XSpec = {
  id: string;
  kind: Exchange["kind"];
  participants: Speaker[];
  topicId: TopicId | null;
  trigger: [string, string];
};

/** Opens an exchange at the current clock (or `at` for a parallel caucus). */
function openX(round: number, spec: XSpec, at = clock) {
  const x: Exchange = {
    id: spec.id,
    round,
    phase: round,
    kind: spec.kind,
    participants: spec.participants,
    topicId: spec.topicId,
    trigger: L(...spec.trigger),
    utteranceIds: [],
    outcome: null,
    startMin: at,
  };
  openXs.set(spec.id, { x, cursor: at });
  currentX = spec.id;
  emit("exchange.opened", { exchange: x }, 120);
}

function closeX(id: string, de: string, en: string) {
  const o = openXs.get(id);
  if (!o) throw new Error(`exchange not open: ${id}`);
  // the cursor sits after the trailing pause of the last utterance
  const endMin = Math.round(Math.max(o.x.startMin ?? 0, o.cursor - 0.5) * 10) / 10;
  emit("exchange.closed", { exchange: { ...o.x, outcome: L(de, en), endMin } }, 120);
  openXs.delete(id);
  if (currentX === id) currentX = null;
  // a short hand-over before the next exchange
  clock = Math.max(clock, endMin + 1);
}

/** Break between rounds, in simulated minutes. */
function pause(min: number) {
  clock += min;
}

/** Spoken length in simulated minutes: the texts are condensed statements, not transcripts. */
function minutesFor(text: string): number {
  const words = text.split(/\s+/).length;
  return Math.round((1 + words / 22) * 2) / 2;
}

function addresseesFor(u: UttSpec, x: Exchange | null): Speaker[] {
  if (u.to) return u.to;
  if (x && x.kind !== "plenary") return x.participants.filter((p) => p !== u.sp) as Speaker[];
  const target = u.re ? speakerOf.get(u.re) : undefined;
  if (target && target !== u.sp && target !== "moderator") return [target];
  return [];
}

function speak(round: number, u: UttSpec) {
  const model =
    u.sp === "moderator" ? MODELS.moderator : u.sp === "expert" ? MODELS.expert : agentModel[u.sp];
  emit(
    "utterance.started",
    { utteranceId: u.id, speaker: u.sp, round, respondsTo: u.re, model },
    400,
  );
  const claims: Claim[] = (u.claims ?? []).map((c, i) => {
    const start = u.de.indexOf(c.quote);
    if (start < 0) throw new Error(`claim quote not in ${u.id}: ${c.quote}`);
    const claim: Claim = {
      id: `c-${u.id.slice(1)}-${i + 1}`,
      utteranceId: u.id,
      span: { start, end: start + c.quote.length },
      atomicText: c.atomic,
      kind: c.kind,
      numeric: c.numeric
        ? { value: c.numeric[0], unit: c.numeric[1], low: null, high: null }
        : null,
      citations: (c.cites ?? []).map((s) => cite(s)),
      state: c.state,
      verifyingModels:
        c.kind === "numeric" && c.state !== "assumption"
          ? [
              {
                model: MODELS.a,
                verdict:
                  c.state === "verified"
                    ? "supported"
                    : c.state === "contradicted"
                      ? "contradicted"
                      : "partial",
                reason: "Zahl mit zitierter Passage abgeglichen",
              },
              {
                model: MODELS.expert,
                verdict:
                  c.state === "verified"
                    ? "supported"
                    : c.state === "contradicted"
                      ? "contradicted"
                      : "partial",
                reason: "Unabhängige Zweitprüfung",
              },
            ]
          : [],
      decompositionModel: MODELS.moderator,
      contradiction: c.contradicts
        ? {
            withClaimId: c.contradicts,
            note: L(
              "Abweichende Zahl zu unbesetzten Kassenstellen, unterschiedliche Stichtage",
              "Diverging figure on vacant contract posts, different reference dates",
            ),
            resolution: "unresolved",
          }
        : null,
    };
    claimsById.set(claim.id, claim);
    return claim;
  });
  const isAgent = u.sp !== "moderator" && u.sp !== "expert";
  const tokensOut = Math.round(u.de.length / 3.6);
  const latency = 1800 + ((u.de.length * 7) % 2400);
  const utterance: Utterance = {
    id: u.id,
    round,
    seq: ++uttSeq,
    phase: round,
    speaker: u.sp,
    kind: u.kind,
    respondsTo: u.re,
    text: L(u.de, u.en),
    claimIds: claims.map((c) => c.id),
    redLinesTouched: u.rl ?? [],
    proposalIds: u.props ?? [],
    model,
    telemetry: {
      model,
      latencyMs: latency,
      tokensIn: 2600 + round * 900,
      tokensOut,
      costEur: Math.round((2600 + round * 900 + tokensOut * 4) * 0.0000012 * 10000) / 10000,
      retries: 0,
      fallbackFrom: null,
      cacheHit: false,
      gatewayRequestId: `gw-${u.id}`,
      params: { temperature: isAgent ? 0.7 : 0.2, maxOutputTokens: 800, seed: 20261105 },
    },
    deliberationSummary: isAgent
      ? {
          read: "Eigene Stellungnahmen, letzte Runde, Zusammenfassung des Moderators",
          weighed: "Zustimmung gegen Blockade, Kosten gegen Zugang",
          wouldMoveIt: "Gegenfinanzierung oder belegte Entlastung",
        }
      : null,
    degraded: null,
  };
  const xid = u.x ?? currentX;
  const slot = xid ? openXs.get(xid) : undefined;
  if (xid && !slot) throw new Error(`${u.id}: exchange ${xid} is not open`);
  const durationMin = minutesFor(u.de);
  const startMin = slot ? slot.cursor : clock;
  if (slot) {
    slot.x.utteranceIds.push(u.id);
    slot.cursor = startMin + durationMin + 0.5;
  } else {
    clock = startMin + durationMin + 0.5;
  }
  if (xid) utterance.exchangeId = xid;
  if (isAgent) utterance.delegateId = delegateId(u.sp as Ag, u.dl ?? defaultDelegate(u));
  utterance.addressedTo = addresseesFor(u, slot?.x ?? null);
  utterance.timing = { startMin: Math.round(startMin * 10) / 10, durationMin };
  speakerOf.set(u.id, u.sp);
  emit("utterance.completed", { utterance, claims }, latency);
}

function defaultDelegate(u: UttSpec): number {
  if (u.sp === "moderator" || u.sp === "expert") return 0;
  const count = DELEGATES[u.sp].length;
  // leads table positions and proposals; specialists argue rebuttals
  if (u.kind === "rebuttal" || u.kind === "justification_demand") return Math.min(1, count - 1);
  return 0;
}

function trace(
  utteranceId: string,
  agent: Ag,
  query: string,
  used: string[],
  discarded: Array<[string, string]>,
  decisionDe: string,
  decisionEn: string,
  respondsTo: string,
) {
  const candidates = [
    ...used.map((sid, i) => ({
      segmentId: `${sid}-s1`,
      bm25Rank: i + 1,
      vectorRank: i + 2,
      fused: Math.round((0.032 - i * 0.004) * 1000) / 1000,
      recencyWeight: 0.9 - i * 0.05,
      used: true,
      discardReason: null,
    })),
    ...discarded.map(([sid, why], i) => ({
      segmentId: `${sid}-s1`,
      bm25Rank: used.length + i + 1,
      vectorRank: null,
      fused: 0.012,
      recencyWeight: 0.4,
      used: false,
      discardReason: why,
    })),
  ];
  emit(
    "utterance.trace",
    {
      trace: {
        utteranceId,
        prompt: [
          {
            role: "system",
            title: "Rolle und Mandat",
            tokens: 820,
            text: `Du vertrittst die Institution ${agentText[agent].unit}. Keine Personen nennen. Beziehe dich auf eine konkrete Vorgängeräußerung.`,
          },
          {
            role: "user",
            title: "Runde, Lektionen, Quellen",
            tokens: 2140,
            text: `Runde ${utteranceId.slice(1, 2)}. Antworte auf ${respondsTo}. Lektion der Vorrunde und ${used.length} Passagen im Kontext.`,
          },
        ],
        retrieval: [{ query, asOf: room.asOf, corpusRevision: REV, candidates }],
        deliberation: {
          utteranceId,
          sourcesRead: used
            .map((sid) => ({ ref: cite(sid), use: "cited" }))
            .concat(discarded.map(([sid]) => ({ ref: cite(sid, 0.4), use: "read_not_cited" }))),
          priorUtterances: [{ id: respondsTo, relation: "responds_to" }],
          lessonsUsed: [`${agent}@r2`],
          options: [
            {
              key: "a",
              label: L(decisionDe, decisionEn),
              pros: [L("Hält den Deckel ein", "Keeps the cap")],
              cons: [L("Ärzteseite skeptisch", "Physicians sceptical")],
              status: "chosen",
              rejectReason: null,
            },
            {
              key: "b",
              label: L("Position halten ohne Vorschlag", "Hold position without proposal"),
              pros: [L("Kein Risiko", "No risk")],
              cons: [L("Keine Bewegung im Raum", "No movement in the room")],
              status: "rejected",
              rejectReason: L(
                "Lektion aus Runde 2: Blockade isoliert",
                "Round 2 lesson: blockade isolates",
              ),
            },
          ],
          decision: L(decisionDe, decisionEn),
          wouldChangeMind: [
            L("Belegte Besetzungsquote unter 50 %", "Evidence of a fill rate below 50 %"),
          ],
          providerTrace: {
            available: false,
            text: null,
            note: "Gateway liefert keine Reasoning-Spur",
          },
          schemaVersion: 2,
        },
      },
    },
    40,
  );
}

// ---------- positions ----------

// R1 and R5 stances, columns gm sv ak va ka pf bl pv fm
const R1: Record<TopicId, number[]> = {
  [T.tele]: [1.5, 1.8, -0.5, -1.0, 1.0, 1.2, 0.6, 1.4, 0.9],
  [T.stellen]: [1.0, 0.4, 1.2, 1.4, 0.6, 0.5, 1.0, 1.6, -1.2],
  [T.tss]: [1.4, 1.2, -0.8, -0.6, 0.8, 0.6, 0.9, 1.8, 0.7],
  [T.wo4]: [1.0, -0.6, -1.6, -1.5, 0.2, 0.4, 0.3, 2.0, -0.8],
  [T.pve]: [1.2, 0.8, -1.8, -1.2, 0.2, 1.0, 1.5, 0.8, 0.2],
  [T.hon]: [0.0, -1.0, 1.8, 1.9, 0.0, 0.2, 0.0, 0.3, -1.8],
  [T.pfl]: [1.2, 0.9, -1.4, -1.0, 0.6, 2.0, 0.8, 1.2, 0.4],
};
const R5: Record<TopicId, number[]> = {
  [T.tele]: [1.8, 1.9, -0.3, 1.0, 1.2, 1.4, 0.8, 1.7, 1.3],
  [T.stellen]: [1.3, 1.6, 0.8, 1.1, 0.8, 0.6, 1.2, 1.7, 0.6],
  [T.tss]: [1.6, 1.5, 0.2, 0.6, 1.0, 0.8, 1.1, 1.9, 1.0],
  [T.wo4]: [0.9, 0.3, -1.5, -1.2, 0.4, 0.5, 0.4, 2.0, -0.5],
  [T.pve]: [1.0, 1.0, -1.7, -0.9, 0.4, 1.2, 1.6, 1.0, 0.5],
  [T.hon]: [0.2, -0.6, 1.6, 1.7, 0.0, 0.3, 0.1, 0.4, -1.6],
  [T.pfl]: [1.4, 1.1, -1.0, -0.4, 0.8, 2.0, 1.0, 1.4, 0.6],
};
/** Explicit multi-step paths: [round, stance, trigger, note de, note en]. */
const PATHS: Partial<Record<`${Ag}:${TopicId}`, Array<[number, number, string, string, string]>>> =
  {
    [`va:${T.tele}`]: [
      [
        2,
        -0.8,
        "u2-07",
        "Nachweispflicht des Moderators schwächt die eigene Ablehnung",
        "Moderator's justification demand weakens its own rejection",
      ],
      [
        3,
        0.8,
        "u3-02",
        "Beschränkung auf Kontrolltermine und eigene Tarifposition im SV-Vorschlag",
        "SV proposal limits it to follow-ups with its own fee item",
      ],
      [4, 1.0, "u4-02", "Paket übernimmt die Tarifposition", "Package adopts the fee item"],
    ],
    [`fm:${T.stellen}`]: [
      [
        3,
        -0.2,
        "u3-02",
        "Staffelung über vier Jahre und Umschichtung von 180 Mio. Euro",
        "Staggering over four years and reallocation of 180 m EUR",
      ],
      [
        4,
        0.6,
        "u4-02",
        "Paket mit Evaluierung und Stopp-Klausel bleibt unter dem Deckel",
        "Package with evaluation and stop clause stays below the cap",
      ],
    ],
    [`sv:${T.stellen}`]: [
      [
        3,
        1.6,
        "u2-08",
        "Eigener Vorschlag mit regionalen Zuschlägen",
        "Own proposal with regional supplements",
      ],
    ],
    [`ak:${T.pfl}`]: [
      [
        3,
        -1.0,
        "u3-08",
        "Pflege-Erstkontakt nur als Ergänzung denkbar",
        "Nursing first contact conceivable only as a supplement",
      ],
      [
        5,
        -0.4,
        "u5-05",
        "Erstkontakt nach ärztlicher Erstdiagnose wahrt die eigene rote Linie",
        "First contact after a medical first diagnosis respects its own red line",
      ],
    ],
    [`ak:${T.stellen}`]: [
      [
        3,
        0.8,
        "u3-02",
        "Stellen ohne Gesamtvertragsplanung abgelehnt, Zahl selbst nicht",
        "Posts outside contract planning rejected, not the number itself",
      ],
    ],
  };
const triggerFor: Record<TopicId, [number, string]> = {
  [T.tele]: [3, "u3-02"],
  [T.stellen]: [3, "u3-02"],
  [T.tss]: [4, "u4-02"],
  [T.wo4]: [4, "u4-06"],
  [T.pve]: [3, "u3-06"],
  [T.hon]: [4, "u4-07"],
  [T.pfl]: [3, "u3-08"],
};
const agentSource: Record<Ag, string> = {
  gm: "p-21003",
  sv: "p-18821",
  ak: "p-19544",
  va: "p-20877",
  ka: "p-24390",
  pf: "p-24711",
  bl: "p-24002",
  pv: "p-22410",
  fm: "p-23118",
};

function positionEventsForRound(round: number) {
  for (const [ti, topicId] of Object.values(T).entries()) {
    void ti;
    for (const [ai, ag] of AG.entries()) {
      const r1 = R1[topicId][ai] ?? 0;
      const r5 = R5[topicId][ai] ?? 0;
      const base: Omit<Position, "round" | "stance" | "trigger" | "rationale"> = {
        runId: RUN_ID,
        agentId: ag,
        topicId,
        strength: Math.min(1, 0.4 + Math.abs(r1) / 4),
        arguments: [],
        citations: [cite(agentSource[ag], 0.85)],
      };
      if (round === 1) {
        emit(
          "position.updated",
          {
            position: {
              ...base,
              round,
              stance: r1,
              trigger: null,
              rationale: L(
                "Ausgangsposition aus Stellungnahmen und Konfiguration",
                "Starting position from statements and configuration",
              ),
            },
          },
          20,
        );
        continue;
      }
      const path = PATHS[`${ag}:${topicId}`];
      if (path) {
        for (const [r, stance, trig, de, en] of path) {
          if (r !== round) continue;
          emit(
            "position.updated",
            {
              position: {
                ...base,
                round,
                stance,
                trigger: { utteranceId: trig, note: L(de, en) },
                rationale: L(de, en),
              },
            },
            20,
          );
        }
        continue;
      }
      const [changeRound, trig] = triggerFor[topicId];
      if (round === changeRound && Math.abs(r5 - r1) >= 0.05) {
        const note = L(
          "Reaktion auf den Vorschlag dieser Runde",
          "Response to this round's proposal",
        );
        emit(
          "position.updated",
          {
            position: {
              ...base,
              round,
              stance: r5,
              trigger: { utteranceId: trig, note },
              rationale: note,
            },
          },
          20,
        );
      }
    }
  }
}

// ---------- proposals ----------

const proposalBase: Record<
  string,
  Omit<
    Proposal,
    | "status"
    | "rejectionReason"
    | "outcomeClass"
    | "supporters"
    | "opponents"
    | "conditional"
    | "acceptance"
  >
> = {
  "p-01": {
    id: "p-01",
    originAgent: "pv",
    round: 2,
    topicIds: [T.wo4],
    title: L(
      "Verbindliche 4-Wochen-Terminzusage mit Kostenerstattung",
      "Binding 4-week appointment guarantee with reimbursement",
    ),
    cost: { value: 220, low: 150, high: 340, unit: "Mio. EUR p.a." },
    feasibility: 0.35,
    alternativeTo: null,
  },
  "p-02": {
    id: "p-02",
    originAgent: "ak",
    round: 2,
    topicIds: [T.hon],
    title: L(
      "Lineare Honorarerhöhung 8 % für alle Kassenfächer",
      "Across-the-board 8 % fee increase for all specialties",
    ),
    cost: { value: 260, low: 230, high: 300, unit: "Mio. EUR p.a." },
    feasibility: 0.5,
    alternativeTo: null,
  },
  "p-03": {
    id: "p-03",
    originAgent: "sv",
    round: 3,
    topicIds: [T.stellen, T.tele],
    title: L(
      "300 Kassenstellen gestaffelt, Telemedizin-Erstkontakt, Umschichtung 180 Mio.",
      "300 staggered posts, telemedicine first contact, reallocation of 180 m",
    ),
    cost: { value: 310, low: 250, high: 390, unit: "Mio. EUR p.a." },
    feasibility: 0.62,
    alternativeTo: null,
  },
  "p-04": {
    id: "p-04",
    originAgent: "bl",
    round: 3,
    topicIds: [T.pve],
    title: L(
      "Planungshoheit PVE an Landes-Zielsteuerung",
      "PVE planning authority to Länder target governance",
    ),
    cost: null,
    feasibility: 0.4,
    alternativeTo: null,
  },
  "p-05": {
    id: "p-05",
    originAgent: "pf",
    round: 3,
    topicIds: [T.pfl],
    title: L("Pflegerischer Erstkontakt in PVE", "Nursing first contact in primary care units"),
    cost: { value: 45, low: 30, high: 70, unit: "Mio. EUR p.a." },
    feasibility: 0.66,
    alternativeTo: null,
  },
  "p-06": {
    id: "p-06",
    originAgent: "gm",
    round: 4,
    topicIds: [T.tele, T.stellen, T.tss],
    title: L(
      "Wartezeiten-Paket: Telemedizin, 300 Stellen gestaffelt, Terminservice 1450, Dashboard",
      "Waiting-time package: telemedicine, 300 staggered posts, 1450 appointment service, dashboard",
    ),
    cost: { value: 410, low: 340, high: 520, unit: "Mio. EUR p.a." },
    feasibility: 0.66,
    alternativeTo: null,
  },
  "p-07": {
    id: "p-07",
    originAgent: "ak",
    round: 4,
    topicIds: [T.stellen],
    title: L(
      "Wahlarzt-Kostenerstattung auf 100 % statt neuer Stellen",
      "Elective-physician reimbursement to 100 % instead of new posts",
    ),
    cost: { value: 190, low: 140, high: 260, unit: "Mio. EUR p.a." },
    feasibility: 0.45,
    alternativeTo: "p-03",
  },
};
type PState = Pick<
  Proposal,
  | "status"
  | "rejectionReason"
  | "outcomeClass"
  | "supporters"
  | "opponents"
  | "conditional"
  | "acceptance"
>;
const pState = new Map<string, Proposal>();
function proposal(id: string, s: PState) {
  const base = proposalBase[id];
  if (!base) throw new Error(id);
  const p: Proposal = { ...base, ...s };
  pState.set(id, p);
  emit("proposal.updated", { proposal: p }, 50);
}
const open = (
  supporters: Ag[],
  opponents: Ag[],
  conditional: Ag[],
  acceptance: number,
): PState => ({
  status: "open",
  rejectionReason: null,
  outcomeClass: null,
  supporters,
  opponents,
  conditional,
  acceptance,
});

// ---------- strategy ----------

const VETO: Record<Ag, StrategicAssessment["vetoStatus"]> = {
  gm: "co_decider",
  sv: "formal_veto",
  ak: "formal_veto",
  va: "consultative",
  ka: "consultative",
  pf: "consultative",
  bl: "co_decider",
  pv: "consultative",
  fm: "formal_veto",
};
const VETO_PLAYERS: Ag[] = AG.filter((a) => VETO[a] === "formal_veto");
const DIM: Record<Ag, StrategicAssessment["incentives"][number]["dimension"]> = {
  gm: "political_credit",
  sv: "cost",
  ak: "competence",
  va: "revenue",
  ka: "workload",
  pf: "competence",
  bl: "cost",
  pv: "political_credit",
  fm: "cost",
};
// payoff matrix, columns gm sv ak va ka pf bl pv fm
const PAY: Record<string, PayoffSign[]> = {
  "p-01": [1, -1, -1, -1, 0, 0, 0, 1, -1],
  "p-02": [0, -1, 1, 1, 0, 0, 0, 0, -1],
  "p-03": [1, 1, -1, 0, -1, 0, 1, 1, 0],
  "p-04": [1, 0, -1, -1, 0, 1, 1, 0, 0],
  "p-05": [1, 1, -1, 0, 1, 1, 1, 1, 1],
  "p-06": [1, 1, 0, 1, 1, 1, 1, 1, 0],
  "p-07": [0, -1, 1, 0, 0, 0, 0, -1, -1],
};
const payoff = (pid: string, ag: Ag): PayoffSign => (PAY[pid]?.[AG.indexOf(ag)] ?? 0) as PayoffSign;

const strategyText: Record<
  Ag,
  {
    leverage: [string, string];
    vetoBasis: [string, string] | null;
    batna: [string, string, number];
    dep: Array<
      [
        Ag,
        "needs" | "needed_by" | "mutual",
        StrategicAssessment["dependencies"][number]["kind"],
        string,
        string,
      ]
    >;
    coal: [Ag[], TopicId[], number, string, string];
    reason: [string, string];
  }
> = {
  gm: {
    leverage: [
      "Agenda-Setzung über Gesetzgebung und Zielsteuerung",
      "Agenda setting via legislation and target governance",
    ],
    vetoBasis: [
      "Gesetzesinitiative, aber Mehrheit im Nationalrat nötig",
      "Legislative initiative, but needs a parliamentary majority",
    ],
    batna: [
      "Ohne Einigung bleibt nur die Zielsteuerung mit schwachen Sanktionen",
      "Without agreement only weak target governance remains",
      -1,
    ],
    dep: [
      [
        "sv",
        "needs",
        "implementation",
        "Umsetzung über Kassenverträge",
        "Implementation through insurance contracts",
      ],
      ["fm", "needs", "financing", "Bundesmittel", "Federal funds"],
    ],
    coal: [
      ["sv", "pv"],
      [T.tss, T.tele],
      0.8,
      "Gemeinsame Linie bei Terminservice und Telemedizin",
      "Shared line on appointment service and telemedicine",
    ],
    reason: [
      "Profitiert politisch von jedem sichtbaren Ergebnis",
      "Gains politically from any visible result",
    ],
  },
  sv: {
    leverage: [
      "Kontrolle über Kassenstellen und Tarife im Gesamtvertrag",
      "Control over posts and fees in the collective contract",
    ],
    vetoBasis: ["Vertragspartei nach ASVG § 342", "Contract party under ASVG § 342"],
    batna: [
      "Status quo mit steigendem Druck auf Spitalsambulanzen",
      "Status quo with rising pressure on outpatient departments",
      -0.5,
    ],
    dep: [
      [
        "ak",
        "mutual",
        "self_governance",
        "Gesamtvertrag braucht beide Seiten",
        "Collective contract needs both sides",
      ],
      [
        "fm",
        "needs",
        "financing",
        "Kein Defizit ohne Bundeszuschuss",
        "No deficit without federal subsidy",
      ],
    ],
    coal: [
      ["gm", "bl", "pv"],
      [T.stellen, T.tele],
      0.7,
      "Breite Mehrheit für gezielte Stellen",
      "Broad majority for targeted posts",
    ],
    reason: [
      "Kann das Paket gestalten, solange Beitragssätze stabil bleiben",
      "Can shape the package as long as rates stay stable",
    ],
  },
  ak: {
    leverage: [
      "Zustimmungspflicht zu Stellenplänen im Gesamtvertrag",
      "Consent required for post plans in the collective contract",
    ],
    vetoBasis: ["Vertragspartei nach ASVG § 342", "Contract party under ASVG § 342"],
    batna: [
      "Status quo: Wahlarztsektor wächst, Honorardruck bleibt",
      "Status quo: elective sector grows, fee pressure remains",
      0.5,
    ],
    dep: [
      [
        "sv",
        "mutual",
        "self_governance",
        "Tarife nur im Gesamtvertrag",
        "Fees only in the collective contract",
      ],
      ["va", "needed_by", "competence", "Vertritt die Kurie", "Represents the section"],
    ],
    coal: [
      ["va"],
      [T.hon, T.wo4],
      0.9,
      "Gemeinsame Abwehr von Terminpflicht und für Honorar",
      "Joint opposition to appointment duties, for fees",
    ],
    reason: ["Gute Rückfallposition macht Blockade billig", "A good fallback makes blockade cheap"],
  },
  va: {
    leverage: [
      "Liefern die Termine, ohne sie keine Wirkung",
      "Deliver the appointments; no effect without them",
    ],
    vetoBasis: null,
    batna: ["Status quo mit steigender Arbeitslast", "Status quo with rising workload", -0.3],
    dep: [
      [
        "ak",
        "needs",
        "self_governance",
        "Vertretung über die Kammer",
        "Represented through the chamber",
      ],
      ["sv", "needs", "financing", "Tarifpositionen", "Fee items"],
    ],
    coal: [
      ["ak"],
      [T.hon],
      0.85,
      "Honorarfrage gemeinsam mit der Kammer",
      "Fee question jointly with the chamber",
    ],
    reason: [
      "Kooperation lohnt sich, wenn neue Leistungen honoriert werden",
      "Cooperation pays if new services are remunerated",
    ],
  },
  ka: {
    leverage: ["Belegbare Ambulanzlast", "Documented outpatient load"],
    vetoBasis: null,
    batna: ["Ambulanzen bleiben überlastet", "Outpatient departments stay overloaded", -1],
    dep: [
      [
        "bl",
        "needs",
        "financing",
        "Spitalsfinanzierung durch Länder",
        "Hospital financing by the Länder",
      ],
      [
        "sv",
        "needed_by",
        "implementation",
        "Umschichtung aus Ambulanzpauschalen",
        "Reallocation from outpatient lump sums",
      ],
    ],
    coal: [
      ["bl", "pf"],
      [T.pfl, T.tele],
      0.6,
      "Entlastung durch Pflege und Telemedizin",
      "Relief via nursing and telemedicine",
    ],
    reason: ["Kooperiert, wenn Entlastung messbar ist", "Cooperates if relief is measurable"],
  },
  pf: {
    leverage: [
      "Verfügbare Pflegekapazität in PVE",
      "Available nursing capacity in primary care units",
    ],
    vetoBasis: null,
    batna: ["Kompetenzerweiterung bleibt aus", "No scope extension", -0.8],
    dep: [
      ["gm", "needs", "legislation", "Berufsrecht", "Professional law"],
      ["bl", "needs", "financing", "PVE-Förderung", "Primary care funding"],
    ],
    coal: [
      ["gm", "bl", "ka"],
      [T.pfl, T.pve],
      0.7,
      "Mehrheit für Pflege-Erstkontakt",
      "Majority for nursing first contact",
    ],
    reason: ["Jede Einigung erweitert den eigenen Spielraum", "Any agreement widens its scope"],
  },
  bl: {
    leverage: [
      "Spitalsträger und Partner der 15a-Vereinbarung",
      "Hospital owners and party to the 15a agreement",
    ],
    vetoBasis: ["Zustimmung zur 15a-Vereinbarung", "Consent to the 15a agreement"],
    batna: [
      "Ambulanzkosten steigen weiter in den Landesbudgets",
      "Outpatient costs keep rising in Länder budgets",
      -0.6,
    ],
    dep: [
      [
        "sv",
        "mutual",
        "financing",
        "Finanzierungsströme Spital und Kasse",
        "Hospital and insurance funding flows",
      ],
      ["gm", "mutual", "legislation", "15a-Vereinbarung", "15a agreement"],
    ],
    coal: [["gm", "pf"], [T.pve], 0.75, "Planungshoheit PVE", "PVE planning authority"],
    reason: ["Kooperiert, verlangt aber Mitsprache", "Cooperates but demands a say"],
  },
  pv: {
    leverage: ["Öffentliche Aufmerksamkeit für Wartezeiten", "Public attention on waiting times"],
    vetoBasis: null,
    batna: [
      "Weiter lange Wartezeiten, Druck über Medien",
      "Continued long waits, pressure via media",
      -1.5,
    ],
    dep: [
      ["gm", "needs", "legislation", "Gesetzliche Terminzusage", "Statutory appointment guarantee"],
      ["sv", "needs", "implementation", "Terminservice", "Appointment service"],
    ],
    coal: [
      ["gm", "sv"],
      [T.tss, T.wo4],
      0.65,
      "Terminservice und Monitoring",
      "Appointment service and monitoring",
    ],
    reason: [
      "Schlechte Rückfallposition: jedes Ergebnis ist besser als keines",
      "Weak fallback: any result beats none",
    ],
  },
  fm: {
    leverage: ["Budgethoheit und Deckel", "Budget authority and cap"],
    vetoBasis: [
      "Haushaltsrecht, Zustimmung zu Bundesmitteln",
      "Budget law, consent to federal funds",
    ],
    batna: ["Keine Mehrausgaben", "No extra spending", 1],
    dep: [
      ["gm", "needed_by", "financing", "Bundesmittel für Reform", "Federal funds for the reform"],
      ["sv", "needed_by", "financing", "Defizitabdeckung", "Deficit coverage"],
    ],
    coal: [
      ["sv"],
      [T.stellen],
      0.5,
      "Umschichtung statt neuer Mittel",
      "Reallocation instead of new money",
    ],
    reason: [
      "Starke Rückfallposition, kooperiert nur gegen Gegenfinanzierung",
      "Strong fallback, cooperates only with offsetting finance",
    ],
  },
};

function assess(
  round: number,
  lean: Record<Ag, [StrategicAssessment["cooperationVsBlockade"]["lean"], number]>,
) {
  const tabled = [...pState.values()].filter((p) => p.round <= round);
  for (const ag of AG) {
    const s = strategyText[ag];
    const a: StrategicAssessment = {
      runId: RUN_ID,
      agentId: ag,
      round,
      leverage: [{ text: L(...s.leverage), sourceRef: cite(agentSource[ag], 0.8) }],
      vetoStatus: VETO[ag],
      vetoBasis: s.vetoBasis ? L(...s.vetoBasis) : null,
      batna: { text: L(s.batna[0], s.batna[1]), value: s.batna[2] },
      coalitionOptions: [
        {
          withAgents: s.coal[0],
          topicIds: s.coal[1],
          overlap: s.coal[2],
          note: L(s.coal[3], s.coal[4]),
        },
      ],
      dependencies: s.dep.map(([agentId, direction, kind, de, en]) => ({
        agentId,
        direction,
        kind,
        note: L(de, en),
      })),
      incentives: tabled.map((p) => {
        const sign = payoff(p.id, ag);
        return {
          proposalId: p.id,
          dimension: DIM[ag],
          sign,
          magnitude: sign === 0 ? "low" : p.id === "p-06" || p.id === "p-02" ? "high" : "medium",
          note:
            sign > 0
              ? L("Nutzen für die eigene Institution", "Benefit for own institution")
              : sign < 0
                ? L("Belastung für die eigene Institution", "Burden for own institution")
                : L("Kaum betroffen", "Barely affected"),
          sourceRef: sign === 0 ? null : cite(agentSource[ag], 0.8),
        };
      }),
      cooperationVsBlockade: {
        lean: lean[ag][0],
        blockadeRisk: lean[ag][1],
        reason: L(...s.reason),
      },
    };
    emit("strategy.assessed", { assessment: a }, 30);
  }
}

function calculus(round: number, nextTabled: [string, string, string] | null) {
  const props = [...pState.values()].filter(
    (p) =>
      p.round <= round && (p.status === "open" || p.round === round || p.status === "accepted"),
  );
  const needed = 5;
  const rows: CoalitionCalculus["proposals"] = props.map((p) => {
    const yes = new Set<Ag>([...(p.supporters as Ag[]), ...(p.conditional as Ag[])]);
    const missing = VETO_PLAYERS.filter((v) => !yes.has(v));
    const blockers = VETO_PLAYERS.filter((v) => (p.opponents as string[]).includes(v));
    const others = (p.supporters as Ag[]).filter((a) => !VETO_PLAYERS.includes(a));
    const mwc =
      missing.length === 0
        ? others.slice(0, 3).map((o) => [...VETO_PLAYERS, o].slice(0, needed))
        : [];
    return {
      proposalId: p.id,
      supporters: p.supporters,
      conditional: p.conditional,
      opponents: p.opponents,
      containsAllVetoPlayers: missing.length === 0,
      missingVetoPlayers: missing,
      passes: missing.length === 0 && yes.size >= needed,
      blockers,
      minimalWinningCoalitions: mwc,
      payoffs: Object.fromEntries(AG.map((a) => [a, payoff(p.id, a)])),
    };
  });
  const c: CoalitionCalculus = {
    runId: RUN_ID,
    round,
    decisionRule: "veto_players",
    quorum: { needed, of: AG.length },
    vetoPlayers: VETO_PLAYERS,
    proposals: rows,
    coalitions: [
      {
        id: `co-${round}-1`,
        members: ["ak", "va"],
        topicIds: [T.hon, T.wo4],
        kind: "blocking",
        note: L(
          "Ärzteseite blockiert Terminpflicht und verlangt Honorar",
          "Physicians block appointment duty and demand fees",
        ),
      },
      {
        id: `co-${round}-2`,
        members: round >= 4 ? ["gm", "sv", "bl", "pv", "pf", "ka", "fm"] : ["gm", "sv", "bl", "pv"],
        topicIds: [T.tele, T.stellen, T.tss],
        kind: "supporting",
        note: L(
          "Mehrheit für Telemedizin, Stellen und Terminservice",
          "Majority for telemedicine, posts and appointment service",
        ),
      },
    ],
    nextTabled: nextTabled
      ? { proposalId: nextTabled[0], reason: L(nextTabled[1], nextTabled[2]) }
      : null,
  };
  emit("coalition.computed", { calculus: c }, 80);
}

// ---------- lessons ----------

const lessonText: Partial<Record<`${Ag}@${number}`, [string, string, string, string]>> = {
  "va@2": [
    "Ablehnung ohne Gegenvorschlag isoliert uns; der Moderator verlangt Belege.",
    "Rejection without a counter-offer isolates us; the moderator demands evidence.",
    "Telemedizin unter Bedingungen (Kontrolltermine, Tarif) anbieten.",
    "Offer telemedicine with conditions (follow-ups, fee item).",
  ],
  "fm@3": [
    "Die Staffelung hat Mehrheit; Blockade kostet politisches Kapital.",
    "Staggering has a majority; blocking costs political capital.",
    "Zustimmung gegen Evaluierung und Stopp-Klausel.",
    "Consent in exchange for evaluation and a stop clause.",
  ],
  "pv@3": [
    "Die Terminzusage scheiterte an drei Vetospielern.",
    "The guarantee failed on three veto players.",
    "Monitoring statt Sanktionen fordern, Ziel beibehalten.",
    "Demand monitoring instead of sanctions, keep the goal.",
  ],
  "ak@3": [
    "Lineare Honorarerhöhung hat keine Mehrheit; FM blockiert.",
    "Across-the-board fee rise has no majority; FM blocks.",
    "Alternative über Wahlarzt-Erstattung testen, Gesamtvertrag verteidigen.",
    "Test an alternative via elective reimbursement, defend the contract.",
  ],
  "sv@2": [
    "Die Ärztekammer bindet Stellen an Honorar.",
    "The chamber ties posts to fees.",
    "Gezielte Zuschläge nur in Mangelregionen vorschlagen.",
    "Propose targeted supplements in shortage regions only.",
  ],
  "gm@3": [
    "Einzelmaßnahmen scheitern an Vetospielern; ein Paket bündelt Nutzen.",
    "Single measures fail on veto players; a package bundles benefits.",
    "Paket mit Nutzen für jeden Vetospieler schnüren.",
    "Assemble a package with a benefit for every veto player.",
  ],
  "ak@4": [
    "Wahlarzt-Alternative abgelehnt, Paket hat Mehrheit.",
    "Elective alternative rejected, package has a majority.",
    "Zustimmung unter Vorbehalt, Honorar im Gesamtvertrag offen halten.",
    "Conditional consent, keep fees open in the contract.",
  ],
};

function lessons(round: number) {
  const resolved = [...pState.values()];
  const passed = resolved
    .filter((p) => p.status === "accepted" && p.round <= round)
    .map((p) => p.id);
  const failedP = resolved.filter((p) => p.status === "rejected");
  for (const ag of AG) {
    const txt = lessonText[`${ag}@${round}`];
    const lesson: RoundLesson = {
      runId: RUN_ID,
      agentId: ag,
      round,
      passed,
      failed: failedP.map((p) => p.id),
      blockedBy: failedP.flatMap((p) =>
        (p.opponents as Ag[])
          .filter((o) => VETO_PLAYERS.includes(o))
          .map((o) => ({ agentId: o, proposalId: p.id })),
      ),
      implication: txt
        ? L(txt[0], txt[1])
        : L("Keine neue Lage für die eigene Position.", "No new situation for its own position."),
      nextMove: txt
        ? L(txt[2], txt[3])
        : L(
            "Linie halten und auf Vorschläge reagieren.",
            "Hold the line and respond to proposals.",
          ),
      redLineExpectations:
        ag === "ak"
          ? []
          : [
              {
                agentId: "ak",
                redLineId: "rl-ak-1",
                text: L(
                  "Ärztekammer gibt Stellenplanung nicht aus dem Gesamtvertrag",
                  "Chamber will not release post planning from the contract",
                ),
                confidence: 0.85,
              },
            ],
      priorEpisodeIds: round >= 3 ? ["ep-0217"] : [],
    };
    emit("lesson.recorded", { lesson }, 20);
  }
}

function summary(
  round: number,
  text: [string, string],
  failed: Array<[string, string, string]>,
  newOptions: Array<[string, string]>,
  boundBy: Partial<Record<TopicId, string[]>>,
  notes: Partial<Record<TopicId, [string, string]>>,
) {
  const snap = foldRun(events);
  const openConflicts: RoundSummary["openConflicts"] = [];
  const consensus: RoundSummary["consensus"] = [];
  for (const topic of topics) {
    const st = topicStatus(snap, topic.id, round);
    if (st.status === "consensus" || (st.status === "majority" && st.oppose === 0)) {
      consensus.push({
        topicId: topic.id,
        share: [st.support, st.of],
        note: L(
          `${topic.label.text}: ${topic.measure.text}`,
          `${topic.label.translations.en}: ${topic.measure.translations.en}`,
        ),
      });
    } else {
      const pos = (id: Ag) =>
        snap.positions[id]?.[topic.id]?.filter((p) => p.round <= round).at(-1)?.stance ?? 0;
      const n = notes[topic.id as TopicId];
      openConflicts.push({
        topicId: topic.id,
        sides: [AG.filter((a) => pos(a) >= 0.5), AG.filter((a) => pos(a) <= -0.5)],
        boundBy: boundBy[topic.id as TopicId] ?? [],
        note: n
          ? L(n[0], n[1])
          : L(
              `${topic.measure.text}: keine Einigung`,
              `${topic.measure.translations.en}: no agreement`,
            ),
      });
    }
  }
  const s: RoundSummary = {
    round,
    openConflicts,
    consensus,
    failedProposals: failed.map(([proposalId, de, en]) => ({ proposalId, reason: L(de, en) })),
    newOptions: newOptions.map(([de, en]) => L(de, en)),
    text: L(...text),
  };
  emit("round.summary", { summary: s }, 200);
}

const BOUND: Partial<Record<TopicId, string[]>> = {
  [T.wo4]: ["rl-va-1"],
  [T.pve]: ["rl-ak-1", "rl-bl-1"],
  [T.hon]: ["rl-fm-1", "rl-sv-1"],
  [T.pfl]: ["rl-ak-2"],
};
const NOTES: Partial<Record<TopicId, [string, string]>> = {
  [T.wo4]: [
    "Terminzusage gegen Kapazität: Ärzteseite und Finanz gegen Patientenvertretung",
    "Guarantee versus capacity: physicians and finance against patient advocacy",
  ],
  [T.pve]: [
    "Planungshoheit: Länder gegen Gesamtvertrag",
    "Planning authority: Länder versus collective contract",
  ],
  [T.hon]: [
    "Honorarindexierung: Ärzteseite gegen Budgetdeckel",
    "Fee indexation: physicians versus budget cap",
  ],
  [T.pfl]: [
    "Pflege-Erstkontakt: Ärztekammer sieht Substitution",
    "Nursing first contact: chamber sees substitution",
  ],
};

// ================= the run =================

emit("run.started", { run, source: "live" }, 0);

// ---- round 1: position formation ----
emit("round.started", {
  round: 1,
  phase: 1,
  speakingOrder: ["sv", "pv", "ak", "gm", "fm", "bl", "va", "ka", "pf"],
});
openX(1, {
  id: "x1-1",
  kind: "plenary",
  participants: [...AG],
  topicId: null,
  trigger: ["Mandat und Ausgangspositionen", "Mandate and opening positions"],
});
speak(1, {
  id: "u1-01",
  sp: "moderator",
  kind: "round_opening",
  re: null,
  de: "Mandat: Wartezeiten auf Facharzttermine binnen fünf Jahren um 20 % senken, Mehrausgaben höchstens 5 %. Sieben Themen, fünf Runden, Entscheidungsregel: Vetospieler müssen zustimmen. Runde 1: Jede Institution legt ihre Ausgangsposition mit Quelle dar.",
  en: "Mandate: cut specialist waiting times by 20 % within five years, extra spending at most 5 %. Seven topics, five rounds, decision rule: veto players must agree. Round 1: each institution states its starting position with a source.",
});
speak(1, {
  id: "u1-02",
  sp: "sv",
  kind: "position",
  re: null,
  de: "Die Sozialversicherung setzt auf telemedizinischen Erstkontakt und gezielte Kassenstellen in Mangelregionen. Derzeit sind rund 290 Kassenstellen unbesetzt; zusätzliche Stellen ohne Besetzungsstrategie verkürzen keine Wartezeit.",
  en: "Social insurance relies on telemedicine first contact and targeted contract posts in shortage regions. About 290 contract posts are currently vacant; extra posts without a staffing strategy shorten no waiting time.",
  claims: [
    {
      quote: "rund 290 Kassenstellen unbesetzt",
      atomic: "Rund 290 Kassenstellen sind unbesetzt.",
      kind: "numeric",
      state: "verified",
      numeric: [290, "Stellen"],
      cites: ["p-18821"],
    },
  ],
});
speak(1, {
  id: "u1-03",
  sp: "pv",
  kind: "position",
  re: null,
  de: "Für Patient:innen zählt die Terminzusage. In mehreren Fächern wird länger als acht Wochen gewartet; wir fordern eine verbindliche Terminzusage binnen vier Wochen und ein öffentliches Wartezeiten-Monitoring.",
  en: "For patients the appointment guarantee is what counts. Several specialties wait longer than eight weeks; we demand a binding appointment within four weeks and public waiting-time monitoring.",
  claims: [
    {
      quote: "länger als acht Wochen gewartet",
      atomic: "In mehreren Fächern beträgt die Wartezeit mehr als acht Wochen.",
      kind: "factual",
      state: "unverified",
      cites: ["p-22410"],
    },
  ],
});
speak(1, {
  id: "u1-04",
  sp: "ak",
  kind: "position",
  re: null,
  de: "Die Ärztekammer sieht die Ursache im Honorarsystem: 40 % der 650 ausgeschriebenen Kassenstellen fanden keine Bewerbung. Ohne attraktivere Tarife im Gesamtvertrag bleiben neue Stellen leer.",
  en: "The Medical Chamber sees the cause in the fee system: 40 % of the 650 advertised contract posts drew no applicant. Without more attractive fees in the collective contract new posts stay empty.",
  claims: [
    {
      quote: "40 % der 650 ausgeschriebenen Kassenstellen fanden keine Bewerbung",
      atomic: "40 % von 650 ausgeschriebenen Kassenstellen blieben ohne Bewerbung.",
      kind: "numeric",
      state: "verified",
      numeric: [260, "Stellen"],
      cites: ["p-19544"],
    },
  ],
});
speak(1, {
  id: "u1-05",
  sp: "gm",
  kind: "position",
  re: null,
  de: "Das Gesundheitsministerium will eine nationale Terminservicestelle über 1450 bis 2028 und mehr Primärversorgung. Die Reform muss im Rahmen der Zielsteuerung-Gesundheit messbar sein.",
  en: "The Ministry of Health wants a national appointment service via 1450 by 2028 and more primary care. The reform must be measurable within target-based governance.",
  claims: [
    {
      quote: "nationale Terminservicestelle über 1450 bis 2028",
      atomic: "Eine nationale Terminservicestelle über 1450 ist bis 2028 vorgesehen.",
      kind: "legal",
      state: "verified",
      cites: ["p-21003"],
    },
  ],
});
speak(1, {
  id: "u1-06",
  sp: "fm",
  kind: "position",
  re: null,
  de: "Das Finanzministerium akzeptiert keine Dauerbelastung ohne Gegenfinanzierung. Der Ausgabendeckel von 5 % gilt für das Gesamtpaket, nicht pro Maßnahme.",
  en: "The Ministry of Finance accepts no permanent burden without offsetting finance. The 5 % spending cap applies to the whole package, not per measure.",
  rl: ["rl-fm-1"],
  claims: [
    {
      quote: "Der Ausgabendeckel von 5 % gilt für das Gesamtpaket",
      atomic: "Der Deckel von 5 % bezieht sich auf das Gesamtpaket.",
      kind: "normative",
      state: "assumption",
    },
  ],
});
speak(1, {
  id: "u1-07",
  sp: "bl",
  kind: "position",
  re: null,
  de: "Die Bundesländer wollen die Planungshoheit für Primärversorgungseinheiten über die Landes-Zielsteuerung. Spitalsambulanzen tragen heute die Lücken der Kassenversorgung.",
  en: "The Länder want planning authority for primary care units via Länder target governance. Hospital outpatient departments currently absorb the gaps in insured care.",
  claims: [
    {
      quote: "Spitalsambulanzen tragen heute die Lücken der Kassenversorgung",
      atomic: "Spitalsambulanzen versorgen Fälle, die im Kassenbereich versorgbar wären.",
      kind: "factual",
      state: "verified",
      cites: ["p-24390"],
    },
  ],
});
speak(1, {
  id: "u1-08",
  sp: "va",
  kind: "position",
  re: null,
  de: "Die Vertragsärzt:innen lehnen telemedizinische Erstkontakte als Kassenleistung derzeit ab, solange Haftung und Honorierung offen sind. Bereits heute entfallen rund 15 % der Termine auf Nichterscheinen.",
  en: "Contracted physicians currently reject telemedicine first contacts as an insured benefit while liability and remuneration are open. About 15 % of appointments are already lost to no-shows.",
  claims: [
    {
      quote: "rund 15 % der Termine auf Nichterscheinen",
      atomic: "Rund 15 % der Facharzttermine werden nicht wahrgenommen.",
      kind: "numeric",
      state: "assumption",
      numeric: [15, "%"],
    },
  ],
});
speak(1, {
  id: "u1-09",
  sp: "ka",
  kind: "position",
  re: null,
  de: "Die Krankenanstalten fordern eine messbare Entlastung der Ambulanzen. Ein Teil der Facharztnachfrage landet mangels Kassenangebot in den Spitalsambulanzen.",
  en: "Hospital operators demand measurable relief for outpatient departments. Part of specialist demand ends up there for lack of insured supply.",
});
speak(1, {
  id: "u1-10",
  sp: "pf",
  kind: "position",
  re: null,
  de: "Die Pflegevertretung bietet pflegerischen Erstkontakt in Primärversorgungseinheiten an. Community Nurses können Routinekontrollen übernehmen und ärztliche Termine freimachen.",
  en: "Nursing representation offers nursing first contact in primary care units. Community nurses can take over routine checks and free up physician appointments.",
  claims: [
    {
      quote: "Community Nurses können Routinekontrollen übernehmen",
      atomic: "Pflegepersonen in PVE können Routinekontrollen übernehmen.",
      kind: "factual",
      state: "verified",
      cites: ["p-24711"],
    },
  ],
});
positionEventsForRound(1);
assess(1, {
  gm: ["cooperate", 0.15],
  sv: ["conditional", 0.3],
  ak: ["block", 0.7],
  va: ["block", 0.6],
  ka: ["cooperate", 0.2],
  pf: ["cooperate", 0.1],
  bl: ["conditional", 0.35],
  pv: ["cooperate", 0.2],
  fm: ["conditional", 0.55],
});
speak(1, {
  id: "u1-11",
  sp: "moderator",
  kind: "round_summary",
  re: null,
  de: "Offene Konflikte zuerst: Ursache unbesetzter Stellen (Honorar gegen Verteilung), Terminzusage, Planungshoheit PVE. Breite Zustimmung zu Telemedizin und Terminservice, aber nicht bei der Ärzteseite.",
  en: "Open conflicts first: cause of vacant posts (fees versus distribution), appointment guarantee, PVE planning authority. Broad support for telemedicine and the appointment service, but not from the physicians.",
});
closeX(
  "x1-1",
  "Neun Ausgangspositionen mit Quellen; drei Konflikte gehen in bilaterale Runden",
  "Nine opening positions with sources; three conflicts go to bilateral talks",
);
summary(
  1,
  [
    "Offene Konflikte: Ursache unbesetzter Stellen, Terminzusage, Planungshoheit. Zustimmung zu Terminservice und Telemedizin außerhalb der Ärzteseite.",
    "Open conflicts: cause of vacancies, appointment guarantee, planning authority. Support for appointment service and telemedicine outside the physicians.",
  ],
  [],
  [["Gezielte Zuschläge in Mangelregionen", "Targeted supplements in shortage regions"]],
  BOUND,
  NOTES,
);
lessons(1);

// ---- round 2: discussion ----
emit(
  "round.started",
  { round: 2, phase: 2, speakingOrder: ["ak", "fm", "pv", "va", "sv", "bl", "ka", "pf", "gm"] },
  1200,
);
pause(6);
openX(2, {
  id: "x2-1",
  kind: "plenary",
  participants: [...AG],
  topicId: null,
  trigger: ["Eröffnung Runde 2", "Round 2 opening"],
});
speak(2, {
  id: "u2-01",
  sp: "moderator",
  kind: "round_opening",
  re: "u1-11",
  de: "Runde 2: Diskussion. Beiträge beziehen sich auf eine konkrete Vorgängeräußerung. Offene Fragen: Ursache unbesetzter Stellen, Finanzierung, Terminzusage.",
  en: "Round 2: discussion. Contributions must refer to a specific prior utterance. Open questions: cause of vacancies, financing, appointment guarantee.",
});
closeX(
  "x2-1",
  "Konflikte zugeteilt: Honorar an ÄK, FM und SV; Terminzusage an PV und VÄ",
  "Conflicts assigned: fees to ÄK, FM and SV; guarantee to PV and VÄ",
);
openX(2, {
  id: "x2-2",
  kind: "bilateral",
  participants: ["ak", "fm", "sv"],
  topicId: T.hon,
  trigger: [
    "Konflikt: Ursache unbesetzter Stellen, Honorar gegen Deckel",
    "Conflict: cause of vacancies, fees versus the cap",
  ],
});
speak(2, {
  id: "u2-02",
  sp: "ak",
  kind: "proposal",
  re: "u1-02",
  props: ["p-02"],
  de: "Die Sozialversicherung verwechselt Ursache und Wirkung. Wir beantragen eine lineare Honorarerhöhung von 8 % für alle Kassenfächer; das kostet rund 260 Mio. Euro jährlich und besetzt Stellen wieder.",
  en: "Social insurance confuses cause and effect. We propose an across-the-board 8 % fee increase for all specialties; it costs about 260 m EUR a year and refills posts.",
  claims: [
    {
      quote: "rund 260 Mio. Euro jährlich",
      atomic: "Eine Honorarerhöhung von 8 % kostet rund 260 Mio. Euro pro Jahr.",
      kind: "numeric",
      state: "unverified",
      numeric: [260, "Mio. EUR"],
      cites: ["p-19544"],
    },
  ],
});
proposal("p-02", open(["ak", "va"], ["sv", "fm"], ["pv"], 0.3));
speak(2, {
  id: "u2-03",
  sp: "fm",
  kind: "rebuttal",
  re: "u2-02",
  rl: ["rl-fm-1"],
  de: "Eine lineare Erhöhung schöpft einen großen Teil des Deckels aus, ohne eine einzige zusätzliche Stelle zu garantieren. Das Finanzministerium lehnt ab.",
  en: "An across-the-board increase uses up a large part of the cap without guaranteeing a single extra post. The Ministry of Finance rejects it.",
});
speak(2, {
  id: "u2-08",
  sp: "sv",
  kind: "rebuttal",
  re: "u2-02",
  de: "Höhere Tarife allein lösen das Verteilungsproblem nicht: Unbesetzt sind vor allem Stellen in ländlichen Regionen. Wir prüfen Zuschläge nur in Mangelregionen.",
  en: "Higher fees alone do not solve the distribution problem: vacancies are mostly rural. We are examining supplements in shortage regions only.",
  claims: [
    {
      quote: "Unbesetzt sind vor allem Stellen in ländlichen Regionen",
      atomic: "Zwei Drittel der unbesetzten Stellen liegen in ländlichen Regionen.",
      kind: "factual",
      state: "verified",
      cites: ["p-18821"],
    },
  ],
});
speak(2, {
  id: "u2-06",
  sp: "expert",
  kind: "contradiction_note",
  re: "u2-02",
  de: "Zwei Zahlen stehen im Widerspruch: Die Sozialversicherung nennt rund 290 unbesetzte Kassenstellen, die Ärztekammer 40 % von 650 Ausschreibungen, also etwa 260. Die Quellen haben unterschiedliche Stichtage; der Widerspruch bleibt vorerst ungeklärt.",
  en: "Two figures contradict each other: social insurance cites about 290 vacant posts, the chamber 40 % of 650 advertised, about 260. The sources have different reference dates; the contradiction stays unresolved for now.",
});
emit("expert.note", {
  utteranceIds: ["u1-02", "u1-04"],
  note: L(
    "Zahl unbesetzter Kassenstellen: 290 gegen etwa 260, unterschiedliche Stichtage",
    "Vacant contract posts: 290 versus about 260, different reference dates",
  ),
  resolution: "unresolved",
});
const c104 = claimsById.get("c-1-04-1");
if (c104)
  emit("claim.updated", {
    claim: {
      ...c104,
      state: "contradicted",
      verifyingModels: [
        { model: MODELS.expert, verdict: "contradicted", reason: "Abweichung zu c-1-02-1" },
      ],
      contradiction: {
        withClaimId: "c-1-02-1",
        note: L(
          "Abweichende Zahl, unterschiedliche Stichtage",
          "Diverging figure, different reference dates",
        ),
        resolution: "unresolved",
      },
    },
  });
closeX(
  "x2-2",
  "Lineare Erhöhung ohne Mehrheit; Zahl unbesetzter Stellen strittig; neue Option regionale Zuschläge",
  "Across-the-board rise without a majority; vacancy figure disputed; new option regional supplements",
);
openX(2, {
  id: "x2-3",
  kind: "bilateral",
  participants: ["pv", "va"],
  topicId: T.wo4,
  trigger: ["Konflikt: Terminzusage gegen Kapazität", "Conflict: guarantee versus capacity"],
});
speak(2, {
  id: "u2-04",
  sp: "pv",
  kind: "proposal",
  re: "u1-08",
  props: ["p-01"],
  de: "Wir legen die verbindliche 4-Wochen-Terminzusage formal vor, mit Kostenerstattung für Wahlarzttermine, wenn die Frist überschritten wird.",
  en: "We formally table the binding 4-week appointment guarantee, with reimbursement for elective-physician appointments if the deadline is missed.",
});
proposal("p-01", open(["pv", "gm"], ["ak", "va", "fm"], ["pf"], 0.3));
speak(2, {
  id: "u2-05",
  sp: "va",
  kind: "rebuttal",
  re: "u2-04",
  rl: ["rl-va-1"],
  de: "Eine Terminpflicht ohne zusätzliche Kapazität verschiebt nur die Warteschlange. Sanktionen gegen Ordinationen lehnen wir ab.",
  en: "An appointment duty without extra capacity only moves the queue. We reject sanctions against practices.",
});
speak(2, {
  id: "u2-07",
  sp: "moderator",
  kind: "justification_demand",
  re: "u1-08",
  to: ["va"],
  de: "Die Vertragsärzt:innen werden gebeten, die Zahl von 15 % Nichterscheinen zu belegen. Ohne Quelle wird sie als Annahme geführt.",
  en: "Contracted physicians are asked to substantiate the 15 % no-show figure. Without a source it is recorded as an assumption.",
});
closeX(
  "x2-3",
  "Terminzusage ohne Kapazität blockiert; VÄ müssen die 15 % Nichterscheinen belegen",
  "Guarantee without capacity blocked; VÄ must substantiate the 15 % no-shows",
);
openX(2, {
  id: "x2-4",
  kind: "plenary",
  participants: [...AG],
  topicId: T.stellen,
  trigger: ["Zwischenstand aus den Gesprächen", "Report back from the talks"],
});
speak(2, {
  id: "u2-09",
  sp: "bl",
  kind: "rebuttal",
  re: "u2-08",
  de: "Die Länder unterstützen regionale Zuschläge, wenn sie bei der Stellenplanung mitentscheiden.",
  en: "The Länder support regional supplements if they co-decide on post planning.",
});
positionEventsForRound(2);
assess(2, {
  gm: ["cooperate", 0.15],
  sv: ["conditional", 0.3],
  ak: ["block", 0.7],
  va: ["conditional", 0.5],
  ka: ["cooperate", 0.2],
  pf: ["cooperate", 0.1],
  bl: ["conditional", 0.35],
  pv: ["cooperate", 0.25],
  fm: ["block", 0.6],
});
calculus(2, [
  "p-03",
  "Kein Vorschlag erreicht alle Vetospieler; ein gestaffelter SV-Vorschlag ist nächster Kandidat",
  "No proposal reaches all veto players; a staggered SV proposal is the next candidate",
]);
speak(2, {
  id: "u2-10",
  sp: "moderator",
  kind: "round_summary",
  re: null,
  de: "Offen: Honorar gegen Budgetdeckel, Terminzusage gegen Kapazität. Widerspruch bei der Zahl unbesetzter Stellen ungeklärt. Neue Option: Zuschläge nur in Mangelregionen.",
  en: "Open: fees versus the cap, guarantee versus capacity. Contradiction on vacant posts unresolved. New option: supplements in shortage regions only.",
});
closeX(
  "x2-4",
  "Länder tragen regionale Zuschläge mit, wenn sie mitplanen",
  "Länder back regional supplements if they co-plan",
);
summary(
  2,
  [
    "Offen: Honorar gegen Deckel, Terminzusage gegen Kapazität. Widerspruch zur Zahl unbesetzter Stellen ungeklärt.",
    "Open: fees versus cap, guarantee versus capacity. Contradiction on vacant posts unresolved.",
  ],
  [],
  [["Zuschläge nur in Mangelregionen", "Supplements in shortage regions only"]],
  BOUND,
  NOTES,
);
lessons(2);

// ---- round 3: negotiation ----
emit(
  "round.started",
  { round: 3, phase: 3, speakingOrder: ["sv", "ak", "va", "fm", "bl", "pv", "pf", "ka", "gm"] },
  1200,
);
pause(6);
openX(3, {
  id: "x3-1",
  kind: "plenary",
  participants: [...AG],
  topicId: T.stellen,
  trigger: ["Vorschlag p-03 der Sozialversicherung", "Proposal p-03 by social insurance"],
});
speak(3, {
  id: "u3-01",
  sp: "moderator",
  kind: "round_opening",
  re: "u2-10",
  de: "Runde 3 ist der Phase Kompromissvorschläge gewidmet. Offen sind zwei Konfliktpunkte: das Honorar für zusätzliche Kassenstellen und die Planungshoheit für Primärversorgungseinheiten. Die Sozialversicherung wird gebeten, einen Vorschlag innerhalb des Budgetdeckels vorzulegen.",
  en: "Round 3 is devoted to compromise proposals. Two conflicts are open: fees for additional contract posts and planning authority for primary care units. Social insurance is asked to table a proposal within the budget cap.",
});
speak(3, {
  id: "u3-02",
  sp: "sv",
  kind: "proposal",
  re: "u2-05",
  props: ["p-03"],
  de: "Kompromissvorschlag: 300 zusätzliche Kassenstellen, gestaffelt über vier Jahre und nur in Mangelregionen; telemedizinischer Erstkontakt für 70 % der Kontrolltermine in ausgewählten Fächern mit eigener Tarifposition; Finanzierung durch Umschichtung von 180 Mio. Euro aus Spitalsambulanzen.",
  en: "Compromise proposal: 300 additional contract posts, staggered over four years and only in shortage regions; telemedicine first contact for 70 % of follow-up appointments in selected specialties with its own fee item; financed by reallocating 180 m EUR from hospital outpatient departments.",
  claims: [
    {
      quote: "Umschichtung von 180 Mio. Euro aus Spitalsambulanzen",
      atomic: "180 Mio. Euro können aus Ambulanzpauschalen umgeschichtet werden.",
      kind: "numeric",
      state: "verified",
      numeric: [180, "Mio. EUR"],
      cites: ["p-25001"],
    },
  ],
});
proposal("p-03", open(["sv", "gm", "bl", "pv"], ["ak"], ["va", "fm", "ka"], 0.55));
trace(
  "u3-02",
  "sv",
  "Kassenstellen Mangelregionen Finanzierung Umschichtung",
  ["p-18821", "p-25001", "p-24390"],
  [
    ["p-19544", "Gegenposition, im Rebuttal adressiert"],
    ["p-22410", "Zielwert, kein Beleg für Kosten"],
  ],
  "Gestaffelter Kompromiss mit Umschichtung",
  "Staggered compromise with reallocation",
  "u2-05",
);
speak(3, {
  id: "u3-03",
  sp: "ak",
  kind: "rebuttal",
  re: "u3-02",
  rl: ["rl-ak-1"],
  de: "Telemedizin ersetzt keine Untersuchung. 300 Stellen sind wertlos, solange 40 % der Ausschreibungen leer bleiben; die Stellenplanung gehört in den Gesamtvertrag.",
  en: "Telemedicine does not replace an examination. 300 posts are worthless while 40 % of tenders stay empty; post planning belongs in the collective contract.",
  claims: [
    {
      quote: "40 % der Ausschreibungen leer bleiben",
      atomic: "40 % der Ausschreibungen von Kassenstellen bleiben ohne Bewerbung.",
      kind: "numeric",
      state: "contradicted",
      numeric: [40, "%"],
      cites: ["p-19544"],
      contradicts: "c-1-02-1",
    },
  ],
});
trace(
  "u3-03",
  "ak",
  "unbesetzte Kassenstellen Ausschreibung Bewerbung Gesamtvertrag",
  ["p-19544", "s-asvg-342"],
  [["p-18821", "Widerspricht der eigenen Zahl"]],
  "Vorschlag zurückweisen, Gesamtvertrag betonen",
  "Reject the proposal, stress the collective contract",
  "u3-02",
);
speak(3, {
  id: "u3-04",
  sp: "va",
  kind: "position_shift",
  re: "u3-02",
  de: "Mit der Beschränkung auf Kontrolltermine und einer eigenen Tarifposition können die Vertragsärzt:innen telemedizinischen Erstkontakt mittragen. Haftungsfragen müssen im Gesamtvertrag geregelt werden.",
  en: "Limited to follow-ups and with its own fee item, contracted physicians can support telemedicine first contact. Liability must be settled in the collective contract.",
  claims: [
    {
      quote: "eigenen Tarifposition",
      atomic: "Telemedizin erhält eine eigene Tarifposition.",
      kind: "factual",
      state: "verified",
      cites: ["p-20877"],
    },
  ],
});
emit("lesson.applied", {
  application: {
    agentId: "va",
    lessonRound: 2,
    utteranceId: "u3-04",
    note: L(
      "Bedingte Zustimmung statt Ablehnung, wie in der Lektion aus Runde 2 festgehalten",
      "Conditional support instead of rejection, as recorded in the round 2 lesson",
    ),
  },
});
speak(3, {
  id: "u3-05",
  sp: "fm",
  kind: "rebuttal",
  re: "u3-02",
  de: "Die Staffelung über vier Jahre und die Umschichtung machen den Vorschlag budgetär darstellbar. Das Finanzministerium verlangt eine jährliche Evaluierung als Bedingung.",
  en: "Staggering over four years and the reallocation make the proposal fiscally feasible. The Ministry of Finance requires a yearly evaluation as a condition.",
});
speak(3, {
  id: "u3-07",
  sp: "pv",
  kind: "rebuttal",
  re: "u3-05",
  de: "Ohne Terminzusage wird der Erfolg nicht sichtbar. Mindestens ein öffentliches Wartezeiten-Dashboard ist Bedingung für unsere Zustimmung.",
  en: "Without a guarantee success stays invisible. A public waiting-time dashboard is at least a condition for our consent.",
});
speak(3, {
  id: "u3-09",
  sp: "ka",
  kind: "rebuttal",
  re: "u3-02",
  de: "Die Umschichtung aus den Ambulanzen tragen wir nur mit, wenn die Entlastung messbar eintritt; sonst braucht es eine Rückfallklausel.",
  en: "We accept reallocation from outpatient departments only if relief measurably materialises; otherwise a fallback clause is needed.",
});
closeX(
  "x3-1",
  "p-03 trägt bei SV, GM, BL und PV; ÄK lehnt ab, VÄ bewegen sich bei Telemedizin",
  "p-03 carries SV, GM, BL and PV; ÄK rejects, VÄ move on telemedicine",
);
openX(3, {
  id: "x3-2",
  kind: "bilateral",
  participants: ["bl", "ak"],
  topicId: T.pve,
  trigger: ["Konflikt: Planungshoheit für PVE", "Conflict: planning authority for PVE"],
});
speak(3, {
  id: "u3-06",
  sp: "bl",
  kind: "proposal",
  re: "u3-03",
  props: ["p-04"],
  rl: ["rl-bl-1"],
  de: "Planungshoheit für Primärversorgungseinheiten an die Landes-Zielsteuerungskommissionen; Kassenstellen bleiben im Gesamtvertrag.",
  en: "Planning authority for primary care units to the Länder target-governance commissions; contract posts stay in the collective contract.",
});
proposal("p-04", open(["bl", "gm", "pf"], ["ak", "va"], ["sv", "pv"], 0.45));
speak(3, {
  id: "u3-11",
  sp: "ak",
  kind: "rebuttal",
  re: "u3-06",
  rl: ["rl-ak-1"],
  dl: 2,
  de: "Planung außerhalb des Gesamtvertrags lehnt die Ärztekammer ab. Primärversorgungseinheiten brauchen Kassenverträge; wer plant, muss auch finanzieren.",
  en: "The Medical Chamber rejects planning outside the collective contract. Primary care units need insurance contracts; whoever plans must also pay.",
});
speak(3, {
  id: "u3-12",
  sp: "bl",
  kind: "rebuttal",
  re: "u3-11",
  de: "Die Länder finanzieren die Spitalsambulanzen mit. Ohne Mitsprache bei der Planung bleibt jede Entlastung Zufall.",
  en: "The Länder co-finance the hospital outpatient departments. Without a say in planning any relief is a matter of chance.",
});
closeX(
  "x3-2",
  "Kein Kompromiss: Planungshoheit bleibt offener Konflikt",
  "No compromise: planning authority stays an open conflict",
);
openX(3, {
  id: "x3-3",
  kind: "bilateral",
  participants: ["pf", "ak"],
  topicId: T.pfl,
  trigger: [
    "Konflikt: pflegerischer Erstkontakt gegen ärztliche Erstdiagnose",
    "Conflict: nursing first contact versus medical first diagnosis",
  ],
});
speak(3, {
  id: "u3-08",
  sp: "pf",
  kind: "proposal",
  re: "u3-04",
  props: ["p-05"],
  rl: ["rl-ak-2"],
  de: "Pflegerischer Erstkontakt in Primärversorgungseinheiten kann freie ärztliche Kontrolltermine verdoppeln, wenn die genannten 15 % Ausfälle mit Pflegeterminen gefüllt werden.",
  en: "Nursing first contact in primary care units can double free physician follow-up slots if the cited 15 % no-shows are filled with nursing appointments.",
  claims: [
    {
      quote: "freie ärztliche Kontrolltermine verdoppeln",
      atomic:
        "Pflege-Erstkontakt verdoppelt freie ärztliche Kontrolltermine; stützt sich auf die unbelegte 15 %-Annahme.",
      kind: "numeric",
      state: "assumption",
      numeric: [2, "Faktor"],
    },
  ],
});
proposal("p-05", open(["pf", "gm", "sv", "ka", "bl", "pv"], ["ak"], ["fm", "va"], 0.62));
speak(3, {
  id: "u3-13",
  sp: "ak",
  kind: "rebuttal",
  re: "u3-08",
  rl: ["rl-ak-2"],
  de: "Pflegerischer Erstkontakt darf die ärztliche Erstdiagnose nicht ersetzen. Als Ergänzung für Routinekontrollen ist die Ärztekammer gesprächsbereit.",
  en: "Nursing first contact must not replace the medical first diagnosis. As a supplement for routine checks the Medical Chamber is open to talks.",
});
closeX(
  "x3-3",
  "Annäherung: Pflege-Erstkontakt als Ergänzung denkbar, Erstdiagnose bleibt ärztlich",
  "Rapprochement: nursing first contact conceivable as a supplement, first diagnosis stays medical",
);
openX(3, {
  id: "x3-4",
  kind: "plenary",
  participants: [...AG],
  topicId: null,
  trigger: ["Abstimmung offener Vorschläge", "Vote on open proposals"],
});
proposal("p-01", {
  status: "rejected",
  rejectionReason: L(
    "Drei Vetospieler dagegen (ÄK, FM, SV); keine Kapazität hinter der Zusage",
    "Three veto players against (ÄK, FM, SV); no capacity behind the guarantee",
  ),
  outcomeClass: "minority",
  supporters: ["pv", "gm"],
  opponents: ["ak", "va", "fm", "sv"],
  conditional: ["pf"],
  acceptance: 0.25,
});
proposal("p-02", {
  status: "rejected",
  rejectionReason: L(
    "Überschreitet den Budgetrahmen ohne Stellengarantie; FM und SV blockieren",
    "Exceeds the budget frame without a post guarantee; FM and SV block",
  ),
  outcomeClass: "minority",
  supporters: ["ak", "va"],
  opponents: ["sv", "fm", "gm"],
  conditional: ["pv"],
  acceptance: 0.22,
});
positionEventsForRound(3);
assess(3, {
  gm: ["cooperate", 0.1],
  sv: ["cooperate", 0.2],
  ak: ["block", 0.65],
  va: ["cooperate", 0.3],
  ka: ["conditional", 0.3],
  pf: ["cooperate", 0.1],
  bl: ["conditional", 0.35],
  pv: ["conditional", 0.35],
  fm: ["conditional", 0.4],
});
calculus(3, [
  "p-06",
  "p-03 fehlt die ÄK als Vetospielerin; ein Paket mit Tarifposition und Evaluierung bindet FM und VÄ",
  "p-03 lacks the chamber as a veto player; a package with a fee item and evaluation binds FM and VÄ",
]);
speak(3, {
  id: "u3-10",
  sp: "moderator",
  kind: "round_summary",
  re: null,
  de: "Offene Konflikte: Planungshoheit PVE (Länder gegen Gesamtvertrag), Honorarindexierung, Terminzusage. Abgelehnt: 4-Wochen-Zusage mit Sanktionen und lineare Honorarerhöhung. Bewegung: Vertragsärzt:innen tragen Telemedizin unter Bedingungen mit.",
  en: "Open conflicts: PVE planning authority (Länder versus contract), fee indexation, guarantee. Rejected: 4-week guarantee with sanctions and across-the-board fee rise. Movement: contracted physicians support telemedicine under conditions.",
});
closeX(
  "x3-4",
  "p-01 und p-02 abgelehnt; Evaluierung mit Stopp-Klausel als neue Option",
  "p-01 and p-02 rejected; evaluation with a stop clause as a new option",
);
summary(
  3,
  [
    "Abgelehnt: Terminzusage mit Sanktionen, lineare Honorarerhöhung. Vertragsärzt:innen bewegen sich bei Telemedizin (Auslöser u3-02).",
    "Rejected: guarantee with sanctions, across-the-board fee rise. Contracted physicians move on telemedicine (trigger u3-02).",
  ],
  [
    ["p-01", "Drei Vetospieler dagegen", "Three veto players against"],
    ["p-02", "Überschreitet den Budgetrahmen", "Exceeds the budget frame"],
  ],
  [
    ["Evaluierung mit Stopp-Klausel", "Evaluation with a stop clause"],
    ["Wartezeiten-Dashboard statt Sanktionen", "Waiting-time dashboard instead of sanctions"],
  ],
  BOUND,
  NOTES,
);
lessons(3);

// ---- round 4: compromise finding ----
emit(
  "round.started",
  { round: 4, phase: 4, speakingOrder: ["gm", "ak", "sv", "fm", "pv", "va", "bl", "ka", "pf"] },
  1200,
);
pause(6);
openX(4, {
  id: "x4-1",
  kind: "plenary",
  participants: [...AG],
  topicId: T.tss,
  trigger: [
    "Neue Wartezeiten-Erhebung und Paket des Ministeriums",
    "New waiting-time survey and the ministry package",
  ],
});
const ev1 = room.scheduledEvents[0];
if (ev1) emit("room.event_injected", { round: 4, event: ev1 });
speak(4, {
  id: "u4-01",
  sp: "moderator",
  kind: "event_injection",
  re: "u3-10",
  de: "Neue Information für Runde 4: Die aktuelle Wartezeiten-Erhebung zeigt einen Median von sechs Wochen in Augenheilkunde und fünf Wochen in Dermatologie. Runde 4 dient der Kompromissfindung.",
  en: "New information for round 4: the current waiting-time survey shows a median of six weeks in ophthalmology and five weeks in dermatology. Round 4 is for finding a compromise.",
  claims: [
    {
      quote: "Median von sechs Wochen in Augenheilkunde",
      atomic: "Median-Wartezeit Augenheilkunde: sechs Wochen.",
      kind: "numeric",
      state: "verified",
      numeric: [6, "Wochen"],
      cites: ["p-30112"],
    },
  ],
});
speak(4, {
  id: "u4-02",
  sp: "gm",
  kind: "proposal",
  re: "u3-02",
  props: ["p-06"],
  de: "Das Gesundheitsministerium legt ein Paket vor: telemedizinischer Erstkontakt für ausgewählte Leistungen mit Tarifposition, 300 Kassenstellen gestaffelt in Mangelregionen, nationale Terminservicestelle über 1450 mit digitaler Ersteinschätzung und ein öffentliches Wartezeiten-Dashboard. Geschätzte Kosten: 410 Mio. Euro pro Jahr.",
  en: "The Ministry of Health tables a package: telemedicine first contact for selected services with a fee item, 300 contract posts staggered in shortage regions, a national appointment service via 1450 with digital triage, and a public waiting-time dashboard. Estimated cost: 410 m EUR a year.",
  claims: [
    {
      quote: "410 Mio. Euro pro Jahr",
      atomic: "Das Paket kostet rund 410 Mio. Euro jährlich.",
      kind: "numeric",
      state: "unverified",
      numeric: [410, "Mio. EUR"],
      cites: ["p-25001"],
    },
  ],
});
proposal("p-06", open(["gm", "sv", "bl", "pv", "pf", "ka", "va"], [], ["ak", "fm"], 0.72));
proposal("p-03", {
  status: "withdrawn",
  rejectionReason: L("In Paket p-06 aufgegangen", "Merged into package p-06"),
  outcomeClass: null,
  supporters: ["sv", "gm", "bl", "pv"],
  opponents: ["ak"],
  conditional: ["va", "fm", "ka"],
  acceptance: 0.55,
});
closeX(
  "x4-1",
  "Paket p-06 liegt vor; die Lager beraten getrennt",
  "Package p-06 is tabled; the camps confer separately",
);
// two caucuses in parallel: the package coalition and the physicians' side
const caucusAt = clock;
openX(
  4,
  {
    id: "x4-2",
    kind: "caucus",
    participants: ["gm", "sv", "pv"],
    topicId: T.tss,
    trigger: ["Paketkoalition: Bedingungen bündeln", "Package coalition: bundle conditions"],
  },
  caucusAt,
);
openX(
  4,
  {
    id: "x4-3",
    kind: "caucus",
    participants: ["ak", "va"],
    topicId: T.hon,
    trigger: [
      "Ärzteseite: gemeinsame Linie zu Stellen und Honorar",
      "Physicians' side: joint line on posts and fees",
    ],
  },
  caucusAt,
);
speak(4, {
  id: "u4-09",
  sp: "sv",
  kind: "position",
  re: "u4-02",
  x: "x4-2",
  dl: 2,
  de: "Die Sozialversicherung trägt das Paket, wenn die Tarifposition für Telemedizin im Gesamtvertrag verhandelt wird und nicht per Verordnung kommt.",
  en: "Social insurance backs the package if the telemedicine fee item is negotiated in the collective contract rather than set by decree.",
});
speak(4, {
  id: "u4-10",
  sp: "va",
  kind: "position",
  re: "u4-02",
  x: "x4-3",
  dl: 1,
  de: "Mit einer fixen Tarifposition für Telemedizin können die Vertragsärzt:innen mit dem Paket leben. Die Stellenfrage sollte das nicht kippen.",
  en: "With a fixed telemedicine fee item contracted physicians can live with the package. The posts question should not topple it.",
});
speak(4, {
  id: "u4-11",
  sp: "pv",
  kind: "rebuttal",
  re: "u4-09",
  x: "x4-2",
  de: "Die Patientenvertretung verlangt, dass das Dashboard Wartezeiten je Fach und Region ausweist. Sonst bleibt der Erfolg unsichtbar.",
  en: "Patient advocacy demands that the dashboard shows waiting times per specialty and region. Otherwise success stays invisible.",
});
speak(4, {
  id: "u4-12",
  sp: "ak",
  kind: "rebuttal",
  re: "u4-10",
  x: "x4-3",
  dl: 0,
  de: "Die Ärztekammer bringt die volle Wahlarzt-Erstattung als Alternative ein. Lehnt der Tisch ab, bleibt nur Zustimmung unter Vorbehalt.",
  en: "The Medical Chamber tables full elective reimbursement as an alternative. If the table refuses, only consent with a reservation remains.",
});
speak(4, {
  id: "u4-13",
  sp: "gm",
  kind: "position",
  re: "u4-11",
  x: "x4-2",
  de: "Das Ministerium nimmt das Dashboard je Fach und Region ins Paket. Linie für den Tisch: Paket als Ganzes, Tarifposition im Gesamtvertrag.",
  en: "The ministry adds the dashboard per specialty and region to the package. Line for the table: the package as a whole, fee item in the collective contract.",
});
closeX(
  "x4-3",
  "Ärzteseite: Wahlarzt-Erstattung als Alternative, sonst Zustimmung unter Vorbehalt",
  "Physicians' side: elective reimbursement as the alternative, otherwise consent with a reservation",
);
closeX(
  "x4-2",
  "Gemeinsame Linie: Paket als Ganzes, Dashboard je Fach und Region, Tarif im Gesamtvertrag",
  "Joint line: the package as a whole, dashboard per specialty and region, fee in the collective contract",
);
openX(4, {
  id: "x4-4",
  kind: "bilateral",
  participants: ["ak", "sv"],
  topicId: T.stellen,
  trigger: [
    "Konflikt: Wahlarzt-Erstattung statt neuer Stellen",
    "Conflict: elective reimbursement instead of new posts",
  ],
});
speak(4, {
  id: "u4-03",
  sp: "ak",
  kind: "proposal",
  re: "u4-02",
  props: ["p-07"],
  de: "Statt neuer Kassenstellen sollte die Kostenerstattung für Wahlarzttermine von 80 % auf 100 % des Kassentarifs steigen. Das wirkt sofort.",
  en: "Instead of new contract posts, reimbursement for elective-physician appointments should rise from 80 % to 100 % of the insurance fee. It works immediately.",
});
proposal("p-07", open(["ak"], ["sv", "pv", "fm"], ["va"], 0.2));
speak(4, {
  id: "u4-04",
  sp: "sv",
  kind: "rebuttal",
  re: "u4-03",
  de: "Höhere Wahlarzt-Erstattung verlagert Versorgung zu jenen, die vorleisten können. Die Sozialversicherung lehnt ab und unterstützt das Paket.",
  en: "Higher elective reimbursement shifts care to those who can pay up front. Social insurance rejects it and supports the package.",
});
closeX("x4-4", "SV lehnt ab; p-07 findet keine Mehrheit", "SV refuses; p-07 finds no majority");
openX(4, {
  id: "x4-5",
  kind: "plenary",
  participants: [...AG],
  topicId: T.tss,
  trigger: ["Paket p-06 vor dem ganzen Tisch", "Package p-06 before the whole table"],
});
speak(4, {
  id: "u4-05",
  sp: "fm",
  kind: "position_shift",
  re: "u4-02",
  de: "Mit Evaluierung nach zwei Jahren und Stopp-Klausel trägt das Finanzministerium das Paket mit. Kosten von 410 Mio. Euro liegen deutlich unter dem Deckel.",
  en: "With an evaluation after two years and a stop clause the Ministry of Finance supports the package. Costs of 410 m EUR are well below the cap.",
});
emit("lesson.applied", {
  application: {
    agentId: "fm",
    lessonRound: 3,
    utteranceId: "u4-05",
    note: L(
      "Zustimmung gegen Evaluierung und Stopp-Klausel, wie in der Lektion aus Runde 3",
      "Consent in exchange for evaluation and a stop clause, as in the round 3 lesson",
    ),
  },
});
speak(4, {
  id: "u4-06",
  sp: "pv",
  kind: "rebuttal",
  re: "u4-02",
  de: "Das Dashboard ist ein Fortschritt. Die Patientenvertretung hält an der 4-Wochen-Zusage als Ziel fest, akzeptiert aber eine Evaluierung statt Sanktionen.",
  en: "The dashboard is progress. Patient advocacy keeps the 4-week guarantee as a goal but accepts evaluation instead of sanctions.",
});
emit("lesson.applied", {
  application: {
    agentId: "pv",
    lessonRound: 3,
    utteranceId: "u4-06",
    note: L(
      "Monitoring statt Sanktionen, Ziel beibehalten",
      "Monitoring instead of sanctions, goal kept",
    ),
  },
});
speak(4, {
  id: "u4-07",
  sp: "ak",
  kind: "rebuttal",
  re: "u4-05",
  rl: ["rl-ak-1"],
  de: "Die Ärztekammer kann dem Paket nur unter Vorbehalt zustimmen: Stellenplanung und Honorar bleiben Sache des Gesamtvertrags.",
  en: "The Medical Chamber can only consent to the package with a reservation: post planning and fees remain matters of the collective contract.",
});
proposal("p-07", {
  status: "rejected",
  rejectionReason: L(
    "Verlagert Kosten auf Patient:innen; SV, PV und FM dagegen",
    "Shifts costs onto patients; SV, PV and FM against",
  ),
  outcomeClass: "minority",
  supporters: ["ak"],
  opponents: ["sv", "pv", "fm"],
  conditional: ["va"],
  acceptance: 0.18,
});
proposal("p-06", open(["gm", "sv", "bl", "pv", "pf", "ka", "va", "fm"], [], ["ak"], 0.81));
positionEventsForRound(4);
assess(4, {
  gm: ["cooperate", 0.05],
  sv: ["cooperate", 0.1],
  ak: ["conditional", 0.45],
  va: ["cooperate", 0.15],
  ka: ["cooperate", 0.15],
  pf: ["cooperate", 0.1],
  bl: ["conditional", 0.3],
  pv: ["conditional", 0.25],
  fm: ["cooperate", 0.2],
});
calculus(4, [
  "p-06",
  "Paket enthält alle Vetospieler, ÄK unter Vorbehalt",
  "Package contains all veto players, chamber with a reservation",
]);
speak(4, {
  id: "u4-08",
  sp: "moderator",
  kind: "round_summary",
  re: null,
  de: "Offen bleiben Honorarindexierung, Planungshoheit PVE und Terminzusage. Das Paket p-06 hat alle Vetospieler an Bord, die Ärztekammer unter Vorbehalt. Abgelehnt: Wahlarzt-Erstattung statt Stellen.",
  en: "Fee indexation, PVE planning authority and the guarantee stay open. Package p-06 has all veto players on board, the chamber with a reservation. Rejected: elective reimbursement instead of posts.",
});
closeX(
  "x4-5",
  "p-06 mit allen Vetospielern, ÄK unter Vorbehalt",
  "p-06 with all veto players, ÄK with a reservation",
);
summary(
  4,
  [
    "Paket p-06 mit allen Vetospielern, ÄK unter Vorbehalt. Offen: Honorar, Planungshoheit, Terminzusage.",
    "Package p-06 with all veto players, chamber with a reservation. Open: fees, planning authority, guarantee.",
  ],
  [["p-07", "Verlagert Kosten auf Patient:innen", "Shifts costs onto patients"]],
  [["Rückfallklausel für Ambulanz-Umschichtung", "Fallback clause for outpatient reallocation"]],
  BOUND,
  NOTES,
);
lessons(4);

// ---- round 5: presentation ----
emit(
  "round.started",
  { round: 5, phase: 5, speakingOrder: ["bl", "va", "ka", "sv", "gm", "pf", "fm", "ak", "pv"] },
  1200,
);
pause(6);
openX(5, {
  id: "x5-1",
  kind: "plenary",
  participants: [...AG],
  topicId: null,
  trigger: ["Abschlusserklärungen", "Closing statements"],
});
speak(5, {
  id: "u5-01",
  sp: "moderator",
  kind: "round_opening",
  re: "u4-08",
  de: "Runde 5: Ergebnisdarstellung. Abschlusserklärungen; Konsens, Mehrheit, Minderheit und offene Konflikte werden getrennt festgehalten.",
  en: "Round 5: presentation of results. Closing statements; consensus, majority, minority and open conflicts are recorded separately.",
});
speak(5, {
  id: "u5-02",
  sp: "bl",
  kind: "closing",
  re: "u5-01",
  rl: ["rl-bl-1"],
  de: "Die Länder tragen das Paket mit. Die Planungshoheit für Primärversorgungseinheiten bleibt für uns offen.",
  en: "The Länder support the package. Planning authority for primary care units remains open for us.",
});
speak(5, {
  id: "u5-03",
  sp: "va",
  kind: "closing",
  re: "u5-01",
  de: "Die Vertragsärzt:innen stimmen zu; die Tarifposition für Telemedizin muss bis zur nächsten Gesamtvertragsrunde stehen.",
  en: "Contracted physicians agree; the telemedicine fee item must be in place by the next contract round.",
});
speak(5, {
  id: "u5-04",
  sp: "sv",
  kind: "closing",
  re: "u5-01",
  de: "Die Sozialversicherung setzt das Paket über Gesamtvertrag und Terminservice um und berichtet jährlich im Dashboard.",
  en: "Social insurance implements the package via the collective contract and the appointment service and reports yearly on the dashboard.",
});
closeX("x5-1", "Länder, VÄ und SV tragen das Paket", "Länder, VÄ and SV back the package");
openX(5, {
  id: "x5-2",
  kind: "bilateral",
  participants: ["pf", "ak"],
  topicId: T.pfl,
  trigger: [
    "Angebot an die Ärztekammer: Erstkontakt nach Erstdiagnose",
    "Offer to the chamber: first contact after first diagnosis",
  ],
});
speak(5, {
  id: "u5-05",
  sp: "pf",
  kind: "closing",
  re: "u4-07",
  props: ["p-05"],
  de: "Als Angebot an die Ärztekammer: Pflegerischer Erstkontakt gilt nur für Routinekontrollen nach ärztlicher Erstdiagnose.",
  en: "As an offer to the chamber: nursing first contact applies only to routine checks after a medical first diagnosis.",
});
speak(5, {
  id: "u5-06",
  sp: "ak",
  kind: "closing",
  rl: ["rl-ak-1"],
  re: "u5-05",
  de: "Zustimmung unter Vorbehalt. Pflegerischen Erstkontakt nach ärztlicher Erstdiagnose tragen wir mit. Die Indexierung im Gesamtvertrag ist ungelöst; das ist ein offener Konflikt, kein Konsens.",
  en: "Consent with a reservation. We support nursing first contact after a medical first diagnosis. Indexation in the collective contract is unresolved; that is an open conflict, not consensus.",
});
closeX(
  "x5-2",
  "Einigung: pflegerischer Erstkontakt nach ärztlicher Erstdiagnose; Indexierung bleibt offen",
  "Agreement: nursing first contact after a medical first diagnosis; indexation stays open",
);
openX(5, {
  id: "x5-3",
  kind: "plenary",
  participants: [...AG],
  topicId: null,
  trigger: ["Ergebnis und offene Konflikte", "Result and open conflicts"],
});
proposal("p-06", {
  status: "accepted",
  rejectionReason: null,
  outcomeClass: "consensus",
  supporters: ["gm", "sv", "bl", "pv", "pf", "ka", "va", "fm"],
  opponents: [],
  conditional: ["ak"],
  acceptance: 0.84,
});
proposal("p-05", {
  status: "accepted",
  rejectionReason: null,
  outcomeClass: "majority",
  supporters: ["pf", "gm", "sv", "ka", "bl", "pv", "fm"],
  opponents: [],
  conditional: ["ak", "va"],
  acceptance: 0.68,
});
proposal("p-04", {
  status: "rejected",
  rejectionReason: L(
    "Mehrheit, aber Vetospielerin ÄK dagegen (Stellenplanung nach § 342 ASVG)",
    "Majority, but veto player ÄK against (post planning under ASVG § 342)",
  ),
  outcomeClass: "majority",
  supporters: ["bl", "gm", "pf", "sv", "pv", "fm"],
  opponents: ["ak", "va"],
  conditional: [],
  acceptance: 0.5,
});
positionEventsForRound(5);
assess(5, {
  gm: ["cooperate", 0.05],
  sv: ["cooperate", 0.1],
  ak: ["conditional", 0.4],
  va: ["cooperate", 0.15],
  ka: ["cooperate", 0.15],
  pf: ["cooperate", 0.1],
  bl: ["conditional", 0.3],
  pv: ["conditional", 0.25],
  fm: ["cooperate", 0.2],
});
calculus(5, null);
speak(5, {
  id: "u5-07",
  sp: "moderator",
  kind: "round_summary",
  re: null,
  de: "Ergebnis: Konsens mit Vorbehalt der Ärztekammer für das Wartezeiten-Paket p-06; Mehrheit für pflegerischen Erstkontakt p-05. Offene Konflikte: Honorarindexierung, Planungshoheit PVE, 4-Wochen-Terminzusage. Das Ziel von minus 20 % wird nach dem Wirkungsmodell nicht sicher erreicht.",
  en: "Result: consensus with the chamber's reservation on waiting-time package p-06; majority for nursing first contact p-05. Open conflicts: fee indexation, PVE planning authority, 4-week guarantee. According to the impact model the minus 20 % target is not reliably reached.",
});
closeX(
  "x5-3",
  "Konsens mit Vorbehalt für p-06, Mehrheit für p-05, drei Konflikte offen",
  "Consensus with reservation on p-06, majority for p-05, three conflicts open",
);
summary(
  5,
  [
    "Konsens mit Vorbehalt für p-06, Mehrheit für p-05. Offen: Honorar, Planungshoheit, Terminzusage. Ziel minus 20 % unsicher.",
    "Consensus with reservation on p-06, majority for p-05. Open: fees, planning authority, guarantee. Minus 20 % target uncertain.",
  ],
  [["p-04", "Vetospielerin dagegen", "Veto player against"]],
  [],
  BOUND,
  NOTES,
);

// ---- outcome ----
emit(
  "impact.computed",
  {
    figures: [
      {
        measureId: "p-06",
        metric: "wait_change_pct",
        value: -14,
        low: -22,
        high: -7,
        unit: "%",
        inputs: [
          {
            name: L("Zusätzliche Kassenstellen, besetzt", "Additional posts, filled"),
            value: "300 x 0,6",
            citation: cite("p-18821"),
            assumption: false,
          },
          {
            name: L("Telemedizin-Anteil Kontrolltermine", "Telemedicine share of follow-ups"),
            value: "70 %",
            citation: null,
            assumption: true,
          },
        ],
        formula: "dWait = -(capacity_gain / demand) * elasticity",
        uncertainty: L(
          "Monte-Carlo über Besetzungsquote und Elastizität, 90 %-Intervall",
          "Monte Carlo over fill rate and elasticity, 90 % interval",
        ),
        modelVersion: "impact-0.1",
        notModelled: false,
      },
      {
        measureId: "p-06",
        metric: "cost_eur_pa",
        value: 410,
        low: 340,
        high: 520,
        unit: "Mio. EUR",
        inputs: [
          {
            name: L("Umschichtung aus Ambulanzen", "Reallocation from outpatient departments"),
            value: "180 Mio.",
            citation: cite("p-25001"),
            assumption: false,
          },
        ],
        formula: "posts * cost_per_post + tele_fee * volume + service_centre",
        uncertainty: L("Bandbreite aus Stellenkosten", "Range from post costs"),
        modelVersion: "impact-0.1",
        notModelled: false,
      },
      {
        measureId: "p-06",
        metric: "sv_spend_pp",
        value: 1.6,
        low: 1.3,
        high: 2.1,
        unit: "pp",
        inputs: [],
        formula: "cost / baseline_spend",
        uncertainty: L("Basis aus Gebarungsvorschau", "Baseline from financial forecast"),
        modelVersion: "impact-0.1",
        notModelled: false,
      },
      {
        measureId: "p-05",
        metric: "wait_change_pct",
        value: null,
        low: null,
        high: null,
        unit: "%",
        inputs: [
          {
            name: L("Ausfallsquote", "No-show rate"),
            value: "15 %",
            citation: null,
            assumption: true,
          },
        ],
        formula: "n/a",
        uncertainty: L(
          "Nicht modelliert: Eingangsgröße ist eine unbelegte Annahme",
          "Not modelled: input is an unsupported assumption",
        ),
        modelVersion: "impact-0.1",
        notModelled: true,
      },
    ],
  },
  900,
);
emit("forecast.computed", {
  extractorVersion: "svforecast-0.1-fixture",
  forecasts: [
    {
      measureId: "p-06",
      status: "ok",
      descriptor: {
        schema_version: "0.1",
        case_id: "sim-fixture-p06",
        origin: "simulated",
        measure_class: "capacity_expansion",
        cost_direction: "increase",
        cost_band: "medium",
        payer: "social_insurance",
        requires_legislation: "yes",
        requires_15a_agreement: "no",
        requires_gesamtvertrag: "yes",
        supporting_roles: [
          "ministry_health",
          "social_insurance",
          "laender",
          "patients",
          "nursing",
          "hospitals",
          "contract_physicians",
          "ministry_finance",
        ],
        opposing_roles: [],
        conditional_roles: ["medical_chamber"],
        budget_authority_stance: "support",
        laender_stance: "support",
        medical_chamber_stance: "conditional",
        contestation: "medium",
        red_line_crossed: "no",
        horizon_years: 5,
        evidence: [
          {
            doc_id: RUN_ID,
            date: "2026-11-05",
            institution_role: "ministry_health",
            field: "measure_class",
          },
        ],
      },
      classKey: "capacity_expansion|gesamtvertrag=yes|chamber=conditional",
      n: 14,
      k: 6,
      interval: { low: 0.21, high: 0.67, method: "wilson", level: 0.9 },
      analogs: [
        {
          caseId: "h-0217-a",
          episodeId: "ep-0217",
          similarity: 0.81,
          outcome: "partially_implemented",
        },
        { caseId: "h-0142-b", episodeId: "ep-0142", similarity: 0.74, outcome: "implemented" },
        { caseId: "h-0309-a", episodeId: "ep-0309", similarity: 0.7, outcome: "lapsed" },
      ],
    },
    {
      measureId: "p-05",
      status: "small_n",
      descriptor: null,
      classKey: "scope_of_practice|chamber=oppose",
      n: 3,
      k: null,
      interval: null,
      analogs: [],
    },
  ],
});
emit(
  "run.completed",
  {
    endCondition: {
      id: "max_rounds",
      note: L(
        "Rundenlimit 5 erreicht; Paket mit Vorbehalt, drei Konflikte offen",
        "Round limit 5 reached; package with reservation, three conflicts open",
      ),
    },
  },
  300,
);

// ---------- write ----------

const root = path.resolve(import.meta.dirname, "../../..");
const outDir = path.join(root, "runs");
mkdirSync(outDir, { recursive: true });
const ndjson = `${events.map((e) => JSON.stringify(e)).join("\n")}\n`;
if (ndjson.includes(String.fromCharCode(0x2014))) throw new Error("em dash in fixture");
writeFileSync(path.join(outDir, `${RUN_ID}.ndjson`), ndjson);
writeFileSync(
  path.join(outDir, "fixture-sources.json"),
  `${JSON.stringify({ corpusRevision: REV, sources, segments, redLines }, null, 2)}\n`,
);
const snap = foldRun(events);
console.log(
  `wrote ${events.length} events, ${snap.utteranceOrder.length} utterances, ${snap.exchanges.length} exchanges, duration ${Math.round(t / 1000)} s, meeting ${Math.round(clock)} min`,
);
