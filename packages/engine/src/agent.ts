// Institutional agents: turn (utterance + positions + votes + deliberation, FR-A3..A5,
// FR-T1), strategic assessment (FR-A10) and round lesson (FR-R8). Prompts are German.
import {
  catalogAgent,
  type GateCheck,
  type GateDecision,
  type PromptBlock,
  type RoundLesson,
  type StrategicAssessment,
} from "@sv/contracts";
import { z } from "zod";
import { L, profileOf, redLinesOf } from "./config.ts";
import { findPersonNames } from "./guard.ts";
import { DEFAULT_BASELINE_EUR_BN } from "./impact.ts";
import { type CallMeta, estimateTokens, type Message, structured } from "./llm.ts";
import { personaBlock } from "./persona/index.ts";
import { PHASE_NAMES } from "./phases.ts";
import { failedGated, gateFeedback } from "./quality/checks.ts";
import type { Passage } from "./retrieval.ts";
import { lastUtteranceOf, type RunState } from "./state.ts";

const MEASURE_CLASSES = [
  "capacity_expansion",
  "capacity_reduction",
  "fee_change",
  "new_service",
  "service_restriction",
  "digitalisation",
  "structural_reform",
  "scope_of_practice",
  "access_rule",
  "prevention_program",
  "workforce",
  "drug_reimbursement",
  "financing_rule",
  "monitoring_reporting",
  "other",
] as const;

export const TurnOut = z.object({
  respondsTo: z.string().nullable(),
  kind: z.enum(["position", "rebuttal", "proposal", "position_shift", "closing"]),
  textDe: z.string(),
  textEn: z.string(),
  claims: z.array(
    z.object({
      quote: z.string(),
      atomic: z.string(),
      kind: z.enum(["numeric", "factual", "legal", "normative"]),
      value: z.number().nullable(),
      unit: z.string().nullable(),
      evidence: z.array(z.string()),
    }),
  ),
  stances: z.array(
    z.object({
      topicId: z.string(),
      stance: z.number(),
      strength: z.number(),
      rationaleDe: z.string(),
      rationaleEn: z.string(),
      arguments: z.array(z.string()),
      evidence: z.array(z.string()),
      changedBecauseOf: z.string().nullable(),
      changeNote: z.string().nullable(),
    }),
  ),
  votes: z.array(
    z.object({
      proposalId: z.string(),
      vote: z.enum(["support", "conditional", "oppose"]),
      reason: z.string(),
      crossesOwnRedLine: z.boolean(),
    }),
  ),
  proposal: z
    .object({
      titleDe: z.string(),
      titleEn: z.string(),
      topicIds: z.array(z.string()),
      alternativeTo: z.string().nullable(),
      measureClass: z.enum(MEASURE_CLASSES),
      costMioEurPa: z.number(),
      costLow: z.number(),
      costHigh: z.number(),
      financingDe: z.string(),
      components: z.array(z.string()),
      capacityEffectPct: z.number().nullable(),
      capacityLow: z.number().nullable(),
      capacityHigh: z.number().nullable(),
      feasibility: z.number(),
    })
    .nullable(),
  withdraw: z.array(z.string()),
  redLinesTouched: z.array(z.string()),
  lessonApplied: z.object({ applied: z.boolean(), note: z.string() }),
  deliberation: z.object({
    options: z.array(
      z.object({
        label: z.string(),
        pros: z.array(z.string()),
        cons: z.array(z.string()),
        chosen: z.boolean(),
        rejectReason: z.string().nullable(),
      }),
    ),
    decision: z.string(),
    wouldChangeMind: z.array(z.string()),
    read: z.string(),
    weighed: z.string(),
    wouldMoveIt: z.string(),
  }),
});
export type TurnOut = z.infer<typeof TurnOut>;

const StrategyOut = z.object({
  leverage: z.array(z.object({ text: z.string(), evidence: z.string().nullable() })),
  vetoStatus: z.enum(["formal_veto", "co_decider", "consultative"]),
  vetoBasis: z.string(),
  batna: z.string(),
  batnaValue: z.number(),
  coalitionOptions: z.array(
    z.object({
      withAgents: z.array(z.string()),
      topicIds: z.array(z.string()),
      overlap: z.number(),
      note: z.string(),
    }),
  ),
  dependencies: z.array(
    z.object({
      agentId: z.string(),
      direction: z.enum(["needs", "needed_by", "mutual"]),
      kind: z.enum([
        "financing",
        "competence",
        "self_governance",
        "legislation",
        "implementation",
        "other",
      ]),
      note: z.string(),
    }),
  ),
  incentives: z.array(
    z.object({
      proposalId: z.string(),
      dimension: z.enum(["cost", "revenue", "workload", "competence", "political_credit"]),
      sign: z.enum(["plus", "neutral", "minus"]),
      magnitude: z.enum(["low", "medium", "high"]),
      note: z.string(),
      evidence: z.string().nullable(),
    }),
  ),
  lean: z.enum(["cooperate", "conditional", "block"]),
  blockadeRisk: z.number(),
  reason: z.string(),
});

const LessonOut = z.object({
  implicationDe: z.string(),
  implicationEn: z.string(),
  nextMoveDe: z.string(),
  nextMoveEn: z.string(),
  redLineExpectations: z.array(
    z.object({
      agentId: z.string(),
      redLineId: z.string().nullable(),
      text: z.string(),
      confidence: z.number(),
    }),
  ),
});

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const words = (v: number) => (v >= 0.7 ? "hoch" : v <= 0.35 ? "niedrig" : "mittel");

const CLIMATE_DE = {
  cooperative: "kooperativ: man sucht aktiv gemeinsame Lösungen",
  neutral: "neutral: sachlich, aber interessengeleitet",
  confrontational: "konfrontativ: Positionen werden hart vertreten, Zugeständnisse kosten",
} as const;

export function nameOf(agentId: string): string {
  if (agentId === "moderator") return "Moderation";
  if (agentId === "expert") return "Experte";
  return catalogAgent(agentId)?.nameDe ?? agentId;
}

/** System prompt: role, character layers (FR-C1..C4), rules (CON-1/2, FR-P5, FR-A4). */
export function systemPrompt(s: RunState, agentId: string, delegateRole?: string): string {
  const p = profileOf(agentId);
  const room = s.room.agents.find((a) => a.agentId === agentId);
  const t = room?.temperament;
  const red = redLinesOf(agentId);
  const lines = [
    `Du vertrittst die Institution "${nameOf(agentId)}" (${p.unit}) in einer simulierten Verhandlung des österreichischen Gesundheitswesens. Du sprichst als Institution ("wir"), niemals als Person.`,
    delegateRole
      ? `In diesem Beitrag spricht für die Institution die Funktion "${delegateRole}" (eine Rolle, keine Person; nenne keinen Namen).`
      : "",
    `Ziele: ${p.goals.map((g) => g.de).join("; ")}`,
    `Interessen: ${p.interests.map((g) => g.de).join("; ")}`,
    `Restriktionen: ${p.restrictions.map((g) => g.de).join("; ")}`,
    `Budgetvorgaben: ${p.budget.map((g) => g.de).join("; ")}`,
    `Prioritäten: ${p.priorities.map((x) => `${x.de} ${Math.round(x.weight * 100)} %`).join(", ")}`,
    `Verhandlungsmacht: ${p.vetoStatus} (${p.vetoBasis.de})`,
    red.length
      ? `Rote Linien (niemals aufgeben, auch nicht bedingt; Vorschläge, die sie verletzen, lehnst du ab):\n${red.map((r) => `- ${r.id}: ${r.de}`).join("\n")}`
      : "Rote Linien: keine formalen; du hast aber klare Interessen.",
    t
      ? `Temperament: Konzessionsbereitschaft ${words(t.concession)}, Durchsetzungsstärke ${words(t.assertiveness)}, Koalitionsneigung ${words(t.coalitionAppetite)}, Risikobereitschaft ${words(t.riskTolerance)}.`
      : "",
    `Sprachregister: ${p.register}.`,
    `Verhandlungsklima: ${CLIMATE_DE[s.room.climate]}. Druck: Zeit ${s.room.pressures.time}, Budget ${s.room.pressures.budget}, Öffentlichkeit ${s.room.pressures.public}.`,
    // SV_PERSONA_MODE=dossier: the institution's dossier (empty string in profile mode)
    personaBlock(agentId),
    "",
    "Regeln:",
    "- Nenne niemals reale Personen (keine Namen, keine Titel mit Namen, keine Zitate von Personen). Nur Institutionen.",
    '- Stütze Aussagen auf die bereitgestellten Belege (Kennungen E1, E2, ...). Eine Aussage ohne Beleg ist eine Annahme; sag das dann auch so im Text ("wir gehen davon aus").',
    "- Erfinde keine Zahlen. Zahlen nur aus Belegen oder ausdrücklich als Schätzung markiert.",
    "- Beziehe dich auf eine konkrete Vorgängeräußerung (respondsTo = deren id) und greife deren Argument auf, sobald es Vorredner gibt.",
    "- Positionsänderungen nur mit Anlass; nenne dann die Äußerung, die dich bewegt hat.",
    "- Kein Konsens um jeden Preis: Wenn ein Vorschlag deinen Interessen widerspricht, sag es.",
    "- Ein Beschluss in dieser Verhandlung ist eine politische Grundsatzeinigung mit Umsetzungsauftrag (Kostenrahmen, Finanzierungsquelle, Zuständigkeit); Detailpläne, Verordnungen und Verträge folgen danach. Fordere keine Unterlagen, die in einer Verhandlungsrunde nicht entstehen können, sondern verhandle die Eckpunkte.",
    "- Kein Gedankenstrich-Zeichen; nutze Kommas, Doppelpunkte oder Punkte.",
    "- Bleib beim Mandat und beim Thema des Gesprächs. Punkte außerhalb der Verhandlungsfrage nimmt die Moderation nicht auf.",
    "- Wiederhole dich nicht: jeder Beitrag bringt ein neues Argument, eine neue Bedingung, ein Zugeständnis oder eine klare Antwort auf das Gegenüber.",
    "- Im gesprochenen Text keine internen Kennungen von Äußerungen, Themen, Aussagen oder roten Linien (wie u2-03, t-4wo, rl-ak-1, E3); nenne Institution oder Thema beim Namen. Vorschlagskennungen (p-01) sind erlaubt.",
  ];
  return lines.filter(Boolean).join("\n");
}

export function evidenceBlock(passages: Passage[]): string {
  if (passages.length === 0)
    return "Keine Belege verfügbar. Alle Sachaussagen sind als Annahmen zu kennzeichnen (evidence leer).";
  return passages
    .map(
      (p) =>
        `${p.handle} [${p.kind}, ${p.institutionCode}, ${p.date}, Gewicht ${p.recencyWeight}${p.ownInstitution ? ", eigene Institution" : ""}${p.title ? `, "${p.title}"` : ""}]: ${p.text}`,
    )
    .join("\n");
}

function transcriptBlock(s: RunState, round: number): string {
  const recent = s.utterances.filter((u) => u.round >= round - 1).slice(-36);
  const older = s.summaries.filter((x) => x.round < round - 1);
  const parts: string[] = [];
  for (const x of older) parts.push(`[Zusammenfassung Runde ${x.round}] ${x.text.text}`);
  for (const u of recent)
    parts.push(
      `${u.id} (${nameOf(u.speaker)}, Runde ${u.round}${u.respondsTo ? `, auf ${u.respondsTo}` : ""}): ${u.text.text}`,
    );
  return parts.length ? parts.join("\n") : "(noch keine Äußerungen)";
}

function proposalsBlock(s: RunState, agentId: string): string {
  const open = [...s.proposals.values()].filter((p) => p.status === "open");
  if (open.length === 0) return "Keine offenen Vorschläge.";
  return open
    .map((p) => {
      const votes = s.votes.get(p.id);
      const tally = votes
        ? [...votes.entries()]
            .map(([a, v]) => `${a}:${v.vote}${v.reason ? ` (${v.reason.slice(0, 90)})` : ""}`)
            .join("; ")
        : "";
      const mine = votes?.get(agentId)?.vote;
      const cost = p.cost
        ? `${p.cost.value} ${p.cost.unit} (${p.cost.low} bis ${p.cost.high})`
        : "unbeziffert";
      const parts = p.components?.length
        ? ` | Bausteine: ${p.components.map((c) => c.text).join("; ")}`
        : "";
      const fin = p.financing ? ` | Finanzierung: ${p.financing.text}` : "";
      const cap = p.capacityEffect ? ` | Kapazität +${p.capacityEffect.value} %` : "";
      return `${p.id} von ${p.originAgent}${p.alternativeTo ? `, Alternative zu ${p.alternativeTo}` : ""}: "${p.title.text}"${parts} | Themen ${p.topicIds.join(",")} | Kosten ${cost}${fin}${cap} | Stimmen: ${tally || "keine"}${mine ? ` | deine letzte Stimme: ${mine}` : ""}`;
    })
    .join("\n");
}

function phaseInstruction(phase: number, round: number, roundLimit: number): string {
  switch (phase) {
    case 1:
      return "Phase Positionsbildung: Lege deine Ausgangsposition zu allen Themen fest, gestützt auf Belege. Noch keine Vorschläge (proposal = null). Wenn bereits andere gesprochen haben, darfst du auf sie reagieren.";
    case 2:
      return "Phase Diskussion: Reagiere auf ein konkretes Gegenargument einer Vorrednerin, eines Vorredners. Du darfst einen konkreten Vorschlag einbringen, wenn er eine neue Option ist (sonst proposal = null). Stimme über offene Vorschläge ab.";
    case 3:
      return "Phase Verhandlung: Jeder Beitrag enthält einen konkreten Vorschlag (Betrag, Frist, Umfang oder erfüllbare Bedingung) oder einen begründeten Einwand; bloße Bekenntnisse weist die Moderation zurück. Stimme über jeden offenen Vorschlag ab. Du kannst einen eigenen Vorschlag zurückziehen oder eine verbesserte Alternative einbringen (alternativeTo setzen), die die konkreten Bedingungen der Vetospieler (Finanzierung, Zuständigkeit, Honorierung) ausdrücklich erfüllt.";
    case 4:
      return "Phase Kompromissfindung: Jeder Beitrag enthält einen konkreten Vorschlag oder ein Zugeständnis (Betrag, Frist, Umfang oder erfüllbare Bedingung) oder einen begründeten Einwand; bloße Bekenntnisse weist die Moderation zurück. Konzentriere dich auf den von der Moderation auf den Tisch gelegten Vorschlag. Biete Zugeständnisse an, soweit deine roten Linien es erlauben, oder begründe, warum nicht. Neue Vorschläge nur als Alternative zu einem bestehenden (alternativeTo); ein Kompromisspaket darf mehrere Bausteine bündeln (components), die gemeinsam dem 20-%-Ziel näherkommen und den Deckel einhalten. Jetzt muss sich entscheiden, was tragfähig ist: stimme zu, wenn deine Kernbedingungen im Vorschlag erfüllt sind, auch wenn nicht alle Wünsche erfüllt sind.";
    default:
      return `Phase Ergebnisdarstellung (Runde ${round} von ${roundLimit}, letzte Runde): Abschlusserklärung. Gib deine endgültige Stimme zu jedem offenen Vorschlag mit Begründung ab. Keine neuen Vorschläge (proposal = null). Benenne, was offen bleibt.`;
  }
}

/** Fiscal frame in euros so cost and financing conditions can be checked, not just asserted. */
function budgetLine(s: RunState): string {
  const base = s.room.budgetCeiling.baselineEurBn ?? DEFAULT_BASELINE_EUR_BN;
  const capMio = Math.round(base * 1000 * (s.room.budgetCeiling.maxIncreasePct / 100));
  const open = [...s.proposals.values()].filter(
    (p) => p.status === "open" || p.status === "accepted",
  );
  const sum = open.reduce((x, p) => x + (p.cost?.value ?? 0), 0);
  return `Budgetrahmen: Basis rund ${base} Mrd. EUR laufende Gesundheitsausgaben${s.room.budgetCeiling.baselineEurBn === null ? " (Annahme, Größenordnung)" : ""}; der Deckel erlaubt höchstens rund ${capMio} Mio. EUR Mehrausgaben pro Jahr; offene Vorschläge summieren sich auf ${Math.round(sum)} Mio. EUR pro Jahr.`;
}

/** FR-A8: a veto player that blocks everything is reminded of its own BATNA. */
function vetoBlock(s: RunState, agentId: string, phase: number): string {
  if (phase < 3 || phase > 4 || profileOf(agentId).vetoStatus !== "formal_veto") return "";
  const blocked = (s.calculus?.proposals ?? []).filter((p) => p.blockers.includes(agentId));
  if (blocked.length === 0) return "";
  return `Du blockierst als Vetospieler derzeit ${blocked.map((p) => p.proposalId).join(", ")}. Scheitert die Verhandlung, gilt deine BATNA. Bring jetzt eine Fassung ein, die du selbst tragen kannst (proposal mit alternativeTo), mit bezifferter Finanzierung aus einer Quelle, die du verantwortest, oder nenne genau eine erfüllbare Bedingung. Bloße Nachweisforderungen ohne eigenes Angebot gelten als Blockade.`;
}

/** The compromise the coalition calculus tabled, with the open conditions (FR-A11). */
function tabledBlock(s: RunState, agentId: string): string {
  const nt = s.calculus?.nextTabled;
  if (!nt) return "";
  const p = s.proposals.get(nt.proposalId);
  if (p?.status !== "open") return "";
  const votes = s.votes.get(p.id);
  const conditions = [...(votes?.entries() ?? [])]
    .filter(([, v]) => v.vote !== "support")
    .map(([a, v]) => `${nameOf(a)} (${v.vote}): ${v.reason}`);
  const lines = [
    `Von der Moderation auf den Tisch gelegt: ${p.id} "${p.title.text}". Begründung: ${nt.reason.text}`,
    conditions.length ? `Offene Bedingungen und Einwände:\n${conditions.join("\n")}` : "",
  ];
  if (p.originAgent === agentId)
    lines.push(
      "Das ist dein Vorschlag. Prüfe, ob du eine überarbeitete Fassung einbringst (proposal mit alternativeTo = dieser id), die die Bedingungen der Vetospieler aufnimmt, ohne deine roten Linien aufzugeben.",
    );
  else
    lines.push(
      "Sag konkret, unter welcher Bedingung du zustimmen würdest, oder stimme zu, wenn deine Bedingungen erfüllt sind.",
    );
  return lines.filter(Boolean).join("\n");
}

export interface TurnContext {
  round: number;
  phase: number;
  agentId: string;
  passages: Passage[];
  /** Utterance ids available as respondsTo targets. */
  respondable: string[];
  injected: string[];
  /** opening = short phase-1 statement, plenary = vote statement after the exchanges. */
  mode?: "opening" | "plenary";
  delegateRole?: string;
  /** Turn quality gate: deterministic checks on a draft (see quality/checks.ts). */
  gate?: TurnGate;
}

/** Checks a draft's German text; kind is the agent's own utterance kind when known. */
export type TurnGate = (textDe: string, kind?: string) => GateCheck[];

/**
 * Quality gate (prevent, not only measure): when a gated check fails, the turn is
 * regenerated once with the reasons in the prompt; the second draft is then accepted,
 * flagged if it still fails. A retry that names a person falls back to the first draft.
 */
async function applyGate<
  T extends { textDe: string; textEn: string; claims: Array<{ atomic: string }> },
>(
  gate: TurnGate | undefined,
  first: { data: T; meta: CallMeta },
  kindOf: (d: T) => string | undefined,
  regenerate: (feedback: string) => Promise<{ data: T; meta: CallMeta }>,
): Promise<{ r: { data: T; meta: CallMeta }; decision: GateDecision | undefined; extra: number }> {
  if (!gate) return { r: first, decision: undefined, extra: 0 };
  const checks = gate(first.data.textDe, kindOf(first.data));
  const failed = failedGated(checks);
  if (failed.length === 0)
    return { r: first, decision: { action: "accepted", first: checks }, extra: 0 };
  console.warn("quality_gate_regenerate", JSON.stringify({ checks: failed.map((c) => c.check) }));
  let second: { data: T; meta: CallMeta };
  try {
    second = await regenerate(gateFeedback(failed));
  } catch {
    return {
      r: first,
      decision: { action: "flagged", first: checks, retry: [] },
      extra: 0,
    };
  }
  const named = [
    ...findPersonNames(second.data.textDe),
    ...findPersonNames(second.data.textEn),
    ...second.data.claims.flatMap((x) => findPersonNames(x.atomic)),
  ];
  if (named.length)
    return { r: first, decision: { action: "flagged", first: checks, retry: [] }, extra: 1 };
  const retry = gate(second.data.textDe, kindOf(second.data));
  return {
    r: second,
    decision: {
      action: failedGated(retry).length ? "flagged" : "regenerated",
      first: checks,
      retry,
      rejectedText: first.data.textDe,
    },
    extra: 1,
  };
}

export function turnMessages(
  s: RunState,
  c: TurnContext,
): { messages: Message[]; blocks: PromptBlock[] } {
  const lesson = s.lessons.get(c.agentId);
  const demand = s.demands.get(c.agentId);
  const own = lastUtteranceOf(s, c.agentId);
  const myPositions = s.positions.get(c.agentId);
  const topics = s.mandate.topics
    .map((t) => {
      const p = myPositions?.get(t.id);
      return `${t.id} (${t.label.text}: ${t.measure.text})${p ? ` | deine bisherige Haltung ${p.stance}` : ""}`;
    })
    .join("\n");
  const sys = systemPrompt(s, c.agentId, c.delegateRole);
  const mandate = [
    `Verhandlungsfrage: ${s.mandate.question}`,
    `Ziel: ${s.mandate.objective.text}`,
    `Nebenbedingungen: ${s.mandate.constraints.map((x) => x.text).join("; ")}`,
    `Entscheidungsregel: ${s.room.decisionRule}; Budgetdeckel +${s.room.budgetCeiling.maxIncreasePct} % für das Gesamtpaket.`,
    budgetLine(s),
    `Runde ${c.round} von ${s.room.roundLimit}, ${PHASE_NAMES[c.phase - 1]?.de ?? ""}.`,
    phaseInstruction(c.phase, c.round, s.room.roundLimit),
    c.round > 1
      ? "Bewerte jede Haltung neu (Viertelschritte, z. B. 0.75 oder -1.25). Wenn Argumente, Belege, Ereignisse oder Zugeständnisse anderer dich überzeugen, oder wenn du einem Vorschlag zu einem Thema zustimmst oder bedingt zustimmst, dem du bisher skeptisch gegenüberstandest, muss sich die stance dieses Themas entsprechend bewegen (mit changedBecauseOf). Umgekehrt verhärtet ein gescheitertes Entgegenkommen die Haltung. Unveränderte Zahlen über alle Runden sind unglaubwürdig, außer bei roten Linien."
      : "",
    "",
    "Themen (stance -2 stark dagegen bis +2 stark dafür, strength 0..1 Wichtigkeit):",
    topics,
  ].join("\n");
  const situation = [
    c.injected.length ? `Neue Ereignisse:\n${c.injected.join("\n")}` : "",
    tabledBlock(s, c.agentId),
    vetoBlock(s, c.agentId, c.phase),
    lesson
      ? `Deine Lektion aus Runde ${lesson.round}: ${lesson.implication.text} Nächster Zug: ${lesson.nextMove.text}${lesson.blockedBy.length ? ` Blockiert durch: ${lesson.blockedBy.map((b) => `${b.agentId} (${b.proposalId})`).join(", ")}.` : ""}`
      : "",
    demand
      ? `Die Moderation verlangt eine Begründung für deine Aussage "${demand.claim}" (${demand.utteranceId}). Liefere einen Beleg oder kennzeichne sie als Annahme.`
      : "",
    own ? `Deine letzte Äußerung (${own.id}): ${own.text.text}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const user = [
    `Offene Vorschläge:\n${proposalsBlock(s, c.agentId)}`,
    `Verlauf:\n${transcriptBlock(s, c.round)}`,
    `Mögliche respondsTo-Ziele: ${c.respondable.slice(-14).join(", ") || "keine (dann null)"}`,
    "",
    c.mode === "opening"
      ? "Aufgabe: Kurzes Eröffnungsstatement im Plenum (textDe 2 bis 4 Sätze, 40 bis 80 Wörter, textEn = sinngemäße englische Übersetzung): deine Ausgangslage und deine wichtigste Bedingung. Fasse alle übrigen Felder knapp: Stichworte statt Sätze, wo möglich."
      : c.mode === "plenary"
        ? "Aufgabe: Erklärung im Plenum nach den Einzelgesprächen (textDe 2 bis 4 Sätze, 40 bis 80 Wörter, textEn = sinngemäße englische Übersetzung): was die Gespräche für dich ergeben haben, deine Stimme zum Vorschlag auf dem Tisch, gegebenenfalls dein Antrag. Fasse alle übrigen Felder knapp: Stichworte statt Sätze, wo möglich."
        : "Aufgabe: Formuliere deinen Redebeitrag (textDe 50 bis 100 Wörter, textEn = sinngemäße englische Übersetzung). Fasse alle übrigen Felder knapp: Stichworte statt Sätze, wo möglich.",
    "claims: höchstens vier, nur Zahlen und überprüfbare Tatsachenbehauptungen aus dem Text; quote = exakter kurzer Ausschnitt aus textDe; evidence = Belegkennungen (leer = Annahme).",
    `stances: genau ein Eintrag je Thema (${s.mandate.topics.map((t) => t.id).join(", ")}); rationaleDe höchstens 15 Wörter, rationaleEn leer lassen, arguments höchstens zwei Stichworte; changedBecauseOf = id der Äußerung, die eine Änderung um mindestens 0,25 ausgelöst hat, sonst null.`,
    c.phase === 5
      ? "votes: endgültige Stimme je offenem Vorschlag (außer eigenen): nur support oder oppose, keine bedingte Zustimmung mehr; Vorbehalte gehören in reason. crossesOwnRedLine ehrlich angeben."
      : "votes: eine Stimme je offenem Vorschlag (außer eigenen), reason höchstens 15 Wörter; crossesOwnRedLine = true nur, wenn der Vorschlag in der vorliegenden Fassung (inklusive Finanzierung) deine rote Linie verletzt. Prüfe bezifferte Finanzierung gegen den Budgetrahmen, statt pauschal Nachweise zu verlangen. support = du trägst den Vorschlag (Vorbehalte in reason); conditional nur mit einer konkreten Bedingung, die der Vorschlag noch NICHT erfüllt (prüfe Finanzierung und Bausteine); ist deine frühere Bedingung inzwischen erfüllt, stimme support; oppose = Ablehnung in dieser Form.",
    "proposal: nur wenn erlaubt und sinnvoll, und nur als konkrete Maßnahme, die Facharzt-Wartezeiten messbar senkt (capacityEffectPct > 0); reine Prüf-, Evaluierungs- oder Monitoringaufträge sind keine Vorschläge, sondern Bedingungen in votes; Kosten in Mio. EUR pro Jahr mit Bandbreite; capacityEffectPct = geschätzte zusätzliche Facharzt-Terminkapazität in Prozent (realistisch, null wenn nicht zutreffend); financingDe = Finanzierung konkret und beziffert in einem Satz: welche Quelle oder Umschichtung (z. B. aus einem belegten Budgetposten), wie viele Mio. EUR pro Jahr, wer trägt sie (das ist die häufigste Bedingung der Kostenträger und Vetospieler); components = Bausteine bei einem Paket, sonst leer; feasibility 0..1.",
    "withdraw: ids eigener Vorschläge, die du zurückziehst. redLinesTouched: ids roter Linien (eigene oder fremde), die der Beitrag berührt.",
    lesson
      ? `lessonApplied: applied = true nur, wenn deine Lektion aus Runde ${lesson.round} diesen Beitrag tatsächlich verändert; note = wie.`
      : "lessonApplied: applied = false, note leer.",
    "deliberation: zwei erwogene Optionen mit je einem Pro und Contra, genau eine chosen; decision; wouldChangeMind (ein bis zwei Punkte); read/weighed/wouldMoveIt je ein kurzer Satz.",
  ].join("\n");
  const ev = `Belege (Stichtag ${s.room.asOf}, nach Aktualität gewichtet):\n${evidenceBlock(c.passages)}`;
  const blocks: PromptBlock[] = [
    { role: "system", title: "Rolle, Charakter, Regeln", tokens: estimateTokens(sys), text: sys },
    { role: "user", title: "Mandat und Phase", tokens: estimateTokens(mandate), text: mandate },
    { role: "user", title: "Belege", tokens: estimateTokens(ev), text: ev },
    ...(situation
      ? [
          {
            role: "user" as const,
            title: "Lage, Lektion, Moderation",
            tokens: estimateTokens(situation),
            text: situation,
          },
        ]
      : []),
    { role: "user", title: "Verlauf und Aufgabe", tokens: estimateTokens(user), text: user },
  ];
  return {
    messages: [
      { role: "system", content: sys },
      { role: "user", content: [mandate, ev, situation, user].filter(Boolean).join("\n\n") },
    ],
    blocks,
  };
}

/** Runs one turn; regenerates once when the CON guard finds a person name. */
export async function runTurn(
  s: RunState,
  c: TurnContext,
  model: string,
): Promise<{
  out: TurnOut;
  meta: CallMeta;
  blocks: PromptBlock[];
  guardRetries: number;
  gate?: GateDecision;
}> {
  const { messages, blocks } = turnMessages(s, c);
  let guardRetries = 0;
  let r = await structured(model, "agent_turn", TurnOut, messages);
  for (let i = 0; i < 2; i++) {
    const hits = [
      ...findPersonNames(r.data.textDe),
      ...findPersonNames(r.data.textEn),
      ...r.data.claims.flatMap((x) => findPersonNames(x.atomic)),
    ];
    if (hits.length === 0) break;
    guardRetries++;
    console.warn(
      "con_guard_regenerate",
      JSON.stringify({ agentId: c.agentId, round: c.round, hits: hits.length }),
    );
    r = await structured(model, "agent_turn", TurnOut, [
      ...messages,
      {
        role: "user",
        content: `Dein Entwurf nannte Personen (${hits.map((h) => h.rule).join(", ")}). Das ist verboten. Formuliere neu und nenne ausschließlich Institutionen.`,
      },
    ]);
  }
  const g = await applyGate(
    c.gate,
    r,
    (d) => d.kind,
    (feedback) =>
      structured(model, "agent_turn", TurnOut, [
        ...messages,
        { role: "assistant", content: JSON.stringify({ textDe: r.data.textDe }) },
        { role: "user", content: feedback },
      ]),
  );
  r = g.r;
  return {
    out: r.data,
    meta: { ...r.meta, retries: r.meta.retries + guardRetries + g.extra },
    blocks,
    guardRetries,
    gate: g.decision,
  };
}

// ---------- focused exchanges (bilateral, caucus, interjection) ----------

export const ExchangeTurnOut = z.object({
  textDe: z.string(),
  textEn: z.string(),
  claims: TurnOut.shape.claims,
  stance: z.object({
    topicId: z.string(),
    stance: z.number(),
    strength: z.number(),
    rationaleDe: z.string(),
    changeNote: z.string().nullable(),
  }),
  redLinesTouched: z.array(z.string()),
  lessonApplied: z.object({ applied: z.boolean(), note: z.string() }),
  deliberation: z.object({
    decision: z.string(),
    read: z.string(),
    weighed: z.string(),
    wouldMoveIt: z.string(),
  }),
});
export type ExchangeTurnOut = z.infer<typeof ExchangeTurnOut>;

export interface ExchangeTurnContext {
  round: number;
  phase: number;
  agentId: string;
  kind: "bilateral" | "caucus" | "interjection";
  topicId: string | null;
  participants: string[];
  addressedTo: string[];
  trigger: string;
  /** This exchange so far, oldest first. */
  transcript: Array<{ speaker: string; text: string }>;
  /** Current stances inside the exchange (own and counterparts) on the topic. */
  stances: Array<{ agentId: string; stance: number | null }>;
  passages: Passage[];
  delegateRole?: string;
  /** Interjection: the red line that was touched. */
  redLine?: { id: string; text: string };
  gate?: TurnGate;
}

export function exchangeTurnMessages(
  s: RunState,
  c: ExchangeTurnContext,
): { messages: Message[]; blocks: PromptBlock[] } {
  const topic = s.mandate.topics.find((t) => t.id === c.topicId);
  const lesson = s.lessons.get(c.agentId);
  const sys = systemPrompt(s, c.agentId, c.delegateRole);
  const others = c.participants.filter((a) => a !== c.agentId);
  const otherRed = c.participants
    .filter((a) => a !== c.agentId)
    .flatMap((a) => redLinesOf(a).map((r) => `${r.id} (${nameOf(a)}): ${r.de}`));
  const seatedRed = s.agentIds
    .filter((a) => !c.participants.includes(a))
    .flatMap((a) => redLinesOf(a).map((r) => `${r.id} (${nameOf(a)}): ${r.de}`));
  const frame = [
    `Verhandlungsfrage: ${s.mandate.question}`,
    budgetLine(s),
    `Runde ${c.round} von ${s.room.roundLimit}, ${PHASE_NAMES[c.phase - 1]?.de ?? ""}.`,
    topic
      ? `Thema dieses Gesprächs: ${topic.id} (${topic.label.text}: ${topic.measure.text}).`
      : "Thema: der Vorschlag auf dem Tisch.",
    `Haltungen am Tisch zu diesem Thema (-2 bis +2): ${c.stances.map((x) => `${nameOf(x.agentId)} ${x.stance ?? "offen"}`).join(", ")}`,
    tabledBlock(s, c.agentId),
    s.summaries.at(-1)
      ? `Letzter Zwischenstand der Moderation: ${s.summaries.at(-1)?.text.text}`
      : "",
    lesson ? `Deine Lektion aus Runde ${lesson.round}: ${lesson.nextMove.text}` : "",
    otherRed.length ? `Rote Linien deines Gegenübers: ${otherRed.join("; ")}` : "",
    seatedRed.length ? `Rote Linien anderer am Tisch: ${seatedRed.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const history = c.transcript.length
    ? c.transcript.map((t) => `${nameOf(t.speaker)}: ${t.text}`).join("\n")
    : "(Du eröffnest das Gespräch.)";
  const task =
    c.kind === "bilateral"
      ? `Das ist ein Einzelgespräch abseits des Plenums zwischen ${c.participants.map(nameOf).join(", ")}. Anlass: ${c.trigger}\nDu sprichst direkt zu ${others.map(nameOf).join(" und ")}${c.transcript.length ? " und antwortest auf den letzten Zug" : ""}. Greife das konkrete Argument auf, nenne eine erfüllbare Bedingung oder ein Zugeständnis, oder begründe, warum deine rote Linie hält.`
      : c.kind === "caucus"
        ? `Das ist eine interne Abstimmung von Koalitionspartnern (${c.participants.map(nameOf).join(", ")}) vor dem Plenum. Anlass: ${c.trigger}\nArbeitet eine gemeinsame Linie für das Plenum aus: was ihr gemeinsam fordert, was ihr anbietet, wo eure Grenze liegt. Sprich offen mit deinen Partnern.`
        : `Du sitzt nicht in diesem Gespräch (${c.participants.map(nameOf).join(", ")}), aber deine rote Linie ${c.redLine?.id} (${c.redLine?.text}) wurde berührt. Kurzer Einwurf an ${others.map(nameOf).join(" und ")}: sag klar, wo deine Grenze liegt.`;
  const negotiation =
    c.phase >= 3 && c.phase <= 4 && c.kind === "bilateral"
      ? "Verhandlungsphase: dein Zug enthält ein konkretes Angebot oder eine erfüllbare Bedingung (Betrag, Frist, Umfang) oder einen begründeten Einwand; wiederhole nicht, was du schon gesagt hast."
      : "";
  const user = [
    `Gesprächsverlauf:\n${history}`,
    "",
    task,
    negotiation,
    `textDe: ${c.kind === "interjection" ? "1 bis 2 Sätze, höchstens 45 Wörter" : "2 bis 4 Sätze, 35 bis 80 Wörter"}, gesprochene Sprache, kein Aufzählungsstil, sprich dein Gegenüber als Institution an und nenne keine Zug-, Äußerungs- oder Rote-Linien-Kennungen; textEn = sinngemäße englische Übersetzung.`,
    "claims: höchstens zwei, nur Zahlen und überprüfbare Tatsachen aus textDe; quote = exakter kurzer Ausschnitt; atomic = die Aussage als kurzer deutscher Satz; evidence = Belegkennungen (leer = Annahme).",
    `stance: deine Haltung zu ${topic?.id ?? "dem Hauptthema des Vorschlags"} nach diesem Zug (Viertelschritte); wenn das Gespräch dich bewegt hat, ändere sie und nenne in changeNote den Anlass, sonst changeNote null. strength 0..1, rationaleDe höchstens 12 Wörter.`,
    "redLinesTouched: ids roter Linien (eigene oder fremde), die dein Zug berührt.",
    lesson
      ? "lessonApplied: applied = true nur, wenn deine Lektion diesen Zug verändert; note = wie."
      : "lessonApplied: applied = false, note leer.",
    "deliberation: decision, read, weighed, wouldMoveIt je ein kurzer Satz.",
  ].join("\n");
  const ev = `Belege:\n${evidenceBlock(c.passages)}`;
  const blocks: PromptBlock[] = [
    { role: "system", title: "Rolle, Charakter, Regeln", tokens: estimateTokens(sys), text: sys },
    { role: "user", title: "Lage und Thema", tokens: estimateTokens(frame), text: frame },
    { role: "user", title: "Belege", tokens: estimateTokens(ev), text: ev },
    { role: "user", title: "Gespräch und Aufgabe", tokens: estimateTokens(user), text: user },
  ];
  return {
    messages: [
      { role: "system", content: sys },
      { role: "user", content: [frame, ev, user].join("\n\n") },
    ],
    blocks,
  };
}

/** One turn inside a focused exchange; same CON guard as the plenary turn. */
export async function runExchangeTurn(
  s: RunState,
  c: ExchangeTurnContext,
  model: string,
): Promise<{ out: ExchangeTurnOut; meta: CallMeta; blocks: PromptBlock[]; gate?: GateDecision }> {
  const { messages, blocks } = exchangeTurnMessages(s, c);
  let guardRetries = 0;
  let r = await structured(model, "exchange_turn", ExchangeTurnOut, messages, {
    maxOutputTokens: 6000,
  });
  for (let i = 0; i < 2; i++) {
    const hits = [
      ...findPersonNames(r.data.textDe),
      ...findPersonNames(r.data.textEn),
      ...r.data.claims.flatMap((x) => findPersonNames(x.atomic)),
    ];
    if (hits.length === 0) break;
    guardRetries++;
    console.warn(
      "con_guard_regenerate",
      JSON.stringify({ agentId: c.agentId, round: c.round, hits: hits.length }),
    );
    r = await structured(
      model,
      "exchange_turn",
      ExchangeTurnOut,
      [
        ...messages,
        {
          role: "user",
          content: `Dein Entwurf nannte Personen (${hits.map((h) => h.rule).join(", ")}). Das ist verboten. Formuliere neu und nenne ausschließlich Institutionen.`,
        },
      ],
      { maxOutputTokens: 6000 },
    );
  }
  const g = await applyGate(
    c.gate,
    r,
    () => undefined,
    (feedback) =>
      structured(
        model,
        "exchange_turn",
        ExchangeTurnOut,
        [
          ...messages,
          { role: "assistant", content: JSON.stringify({ textDe: r.data.textDe }) },
          { role: "user", content: feedback },
        ],
        { maxOutputTokens: 6000 },
      ),
  );
  r = g.r;
  return {
    out: r.data,
    meta: { ...r.meta, retries: r.meta.retries + guardRetries + g.extra },
    blocks,
    gate: g.decision,
  };
}

export async function runStrategy(
  s: RunState,
  agentId: string,
  round: number,
  passages: Passage[],
  model: string,
): Promise<{ assessment: StrategicAssessment; meta: CallMeta }> {
  const others = s.agentIds
    .filter((a) => a !== agentId)
    .map((a) => `${a}: ${nameOf(a)} (${profileOf(a).vetoStatus})`);
  const open = [...s.proposals.values()].filter((p) => p.status === "open");
  const user = [
    `Verhandlungsfrage: ${s.mandate.question}`,
    `Runde ${round} von ${s.room.roundLimit}. Entscheidungsregel: ${s.room.decisionRule}.`,
    `Andere Akteure:\n${others.join("\n")}`,
    `Themen: ${s.mandate.topics.map((t) => `${t.id} ${t.label.text}`).join("; ")}`,
    `Offene Vorschläge:\n${proposalsBlock(s, agentId)}`,
    s.calculus
      ? `Letztes Koalitionskalkül: ${JSON.stringify(s.calculus.proposals.map((p) => ({ id: p.proposalId, pro: p.supporters, cond: p.conditional, contra: p.opponents, blockers: p.blockers })))}`
      : "",
    `Belege:\n${evidenceBlock(passages)}`,
    "",
    "Erstelle eine strategische Lagebeurteilung (spieltheoretisch, nüchtern, auf Deutsch, je Feld ein bis zwei Sätze):",
    "leverage: Hebel mit Beleg-Kennung oder null; vetoStatus und vetoBasis; batna = was ohne Einigung passiert, batnaValue -2..+2 (Wünschbarkeit des Scheiterns für dich);",
    "coalitionOptions: mit wem überlappen deine Positionen bei welchen Themen (overlap 0..1); dependencies: wen brauchst du, wer braucht dich;",
    open.length
      ? `incentives: je offenem Vorschlag (${open.map((p) => p.id).join(", ")}) die Auszahlung für dich (Dimension, plus/neutral/minus, Stärke, Beleg-Kennung oder null);`
      : `incentives: noch keine Vorschläge; bewerte stattdessen die Themen (proposalId = Themen-id: ${s.mandate.topics.map((t) => t.id).join(", ")});`,
    "lean (cooperate/conditional/block), blockadeRisk 0..1 und reason.",
  ]
    .filter(Boolean)
    .join("\n");
  const r = await structured(model, "strategic_assessment", StrategyOut, [
    { role: "system", content: systemPrompt(s, agentId) },
    { role: "user", content: user },
  ]);
  const o = r.data;
  const byHandle = new Map(passages.map((p) => [p.handle, p]));
  const ref = (h: string | null) => {
    const p = h ? byHandle.get(h) : undefined;
    return p
      ? {
          sourceId: p.sourceId,
          segmentId: p.segmentId,
          start: null,
          end: null,
          recencyWeight: p.recencyWeight,
        }
      : null;
  };
  const valid = new Set(s.agentIds);
  const assessment: StrategicAssessment = {
    runId: s.run.id,
    agentId,
    round,
    leverage: o.leverage.slice(0, 4).map((x) => ({ text: L(x.text), sourceRef: ref(x.evidence) })),
    vetoStatus: o.vetoStatus,
    vetoBasis: L(o.vetoBasis),
    batna: { text: L(o.batna), value: clamp(Math.round(o.batnaValue), -2, 2) },
    coalitionOptions: o.coalitionOptions
      .map((x) => ({
        withAgents: x.withAgents.filter((a) => valid.has(a) && a !== agentId),
        topicIds: x.topicIds.filter((t) => s.mandate.topics.some((tt) => tt.id === t)),
        overlap: clamp(x.overlap, 0, 1),
        note: L(x.note),
      }))
      .filter((x) => x.withAgents.length > 0)
      .slice(0, 5),
    dependencies: o.dependencies
      .filter((d) => valid.has(d.agentId) && d.agentId !== agentId)
      .slice(0, 6)
      .map((d) => ({ agentId: d.agentId, direction: d.direction, kind: d.kind, note: L(d.note) })),
    incentives: o.incentives.slice(0, 16).map((x) => ({
      proposalId: x.proposalId,
      dimension: x.dimension,
      sign: x.sign === "plus" ? 1 : x.sign === "minus" ? -1 : 0,
      magnitude: x.magnitude,
      note: L(x.note),
      sourceRef: ref(x.evidence),
    })),
    cooperationVsBlockade: {
      lean: o.lean,
      blockadeRisk: clamp(o.blockadeRisk, 0, 1),
      reason: L(o.reason),
    },
  };
  return { assessment, meta: r.meta };
}

export async function runLesson(
  s: RunState,
  agentId: string,
  round: number,
  base: Pick<RoundLesson, "passed" | "failed" | "blockedBy">,
  model: string,
): Promise<RoundLesson> {
  const summary = s.summaries.find((x) => x.round === round);
  const red = s.agentIds
    .filter((a) => a !== agentId)
    .flatMap((a) => redLinesOf(a).map((r) => `${r.id} (${a}): ${r.de}`));
  const user = [
    `Runde ${round} ist abgeschlossen. Verhandlungsfrage: ${s.mandate.question}`,
    `Angenommen oder tragfähig: ${base.passed.join(", ") || "nichts"}; gescheitert oder blockiert: ${base.failed.join(", ") || "nichts"}.`,
    `Blockiert durch: ${base.blockedBy.map((b) => `${b.agentId} bei ${b.proposalId}`).join(", ") || "niemand"}.`,
    summary ? `Zusammenfassung der Moderation: ${summary.text.text}` : "",
    `Offene Vorschläge:\n${proposalsBlock(s, agentId)}`,
    `Bekannte rote Linien anderer (aus Stellungnahmen): ${red.join("; ") || "keine"}`,
    "",
    "Schreibe deine Lektion aus dieser Runde: implication (was bedeutet das Teilergebnis für dich, ein Satz), nextMove (dein konkreter nächster Zug, ein Satz), jeweils Deutsch und Englisch,",
    "redLineExpectations: deine aktualisierte Erwartung zu den roten Linien anderer (agentId, redLineId oder null, text, confidence 0..1), höchstens drei.",
  ]
    .filter(Boolean)
    .join("\n");
  const r = await structured(
    model,
    "round_lesson",
    LessonOut,
    [
      { role: "system", content: systemPrompt(s, agentId) },
      { role: "user", content: user },
    ],
    { reasoningEffort: "none" },
  );
  const valid = new Set(s.agentIds);
  return {
    runId: s.run.id,
    agentId,
    round,
    ...base,
    implication: L(r.data.implicationDe, r.data.implicationEn),
    nextMove: L(r.data.nextMoveDe, r.data.nextMoveEn),
    redLineExpectations: r.data.redLineExpectations
      .filter((x) => valid.has(x.agentId) && x.agentId !== agentId)
      .slice(0, 3)
      .map((x) => ({
        agentId: x.agentId,
        redLineId:
          x.redLineId && redLinesOf(x.agentId).some((rl) => rl.id === x.redLineId)
            ? x.redLineId
            : null,
        text: L(x.text),
        confidence: clamp(x.confidence, 0, 1),
      })),
    priorEpisodeIds: [],
  };
}
