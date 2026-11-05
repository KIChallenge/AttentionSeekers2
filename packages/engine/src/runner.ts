// The negotiation loop. Every step emits RunEvents through RunWriter (NDJSON file,
// database, live listeners).
//
// A round is a sequence of exchanges, not a speaking order: the full table opens
// (phase 1: short opening statements), then the moderator opens focused bilateral or
// trilateral exchanges on the open conflicts and the tabled proposal, coalition partners
// confer in caucuses (in parallel, overlapping in meeting time), and the full table meets
// again to table and vote on proposals. Every utterance carries simulated meeting time.
import path from "node:path";
import {
  type CitationRef,
  type Claim,
  type Exchange,
  foldRun,
  lessonKey,
  type Mandate,
  type PayoffSign,
  type Position,
  type PromptBlock,
  type Proposal,
  type RoomConfig,
  type RoundLesson,
  type Run,
  type RunEvent,
  type RunSnapshot,
  type RunVariant,
  type StrategicAssessment,
  type Utterance,
  type UtteranceTrace,
} from "@sv/contracts";
import {
  nameOf,
  runExchangeTurn,
  runLesson,
  runStrategy,
  runTurn,
  type TurnGate,
  type TurnOut,
} from "./agent.ts";
import { computeCalculus, outcomeClassOf, type Vote } from "./coalition.ts";
import {
  agentConfigOf,
  allRedLines,
  delegatesOf,
  L,
  profileOf,
  REPO_ROOT,
  redLinesOf,
  VERIFIER_MODEL,
} from "./config.ts";
import {
  type Conflict,
  conflictsFromStances,
  type ExchangePlan,
  lanes,
  MeetingClock,
  mergeConflicts,
  type PlanInput,
  pickDelegate,
  pickInterjector,
  selectBilaterals,
  selectCaucuses,
  type TabledInfo,
  touchesInterests,
} from "./exchanges.ts";
import { runExpert } from "./expert.ts";
import { forecast } from "./forecast.ts";
import { DEFAULT_BASELINE_EUR_BN, packageFigures, proposalFigures } from "./impact.ts";
import { type CallMeta, usage } from "./llm.ts";
import { exchangeOutcome, summarizeRound } from "./moderator.ts";
import { PHASE_NAMES, phaseFor, shuffle } from "./phases.ts";
import { gateChecks, noveltyOf, vocabularyOf } from "./quality/checks.ts";
import { type Passage, retrieve } from "./retrieval.ts";
import { buildMandate } from "./room.ts";
import type { RunState } from "./state.ts";
import { type CallParent, CallTracer, type Slot } from "./trace.ts";
import { RunWriter } from "./writer.ts";

export interface RunOptions {
  room: RoomConfig;
  mandate?: Mandate;
  runId?: string;
  isReference?: boolean;
  variant?: RunVariant;
  outDir?: string;
  db?: boolean;
  /** Let the moderator choose the actors (custom questions). */
  selectActors?: boolean;
  onEvent?: (e: RunEvent) => void;
  fork?: {
    baseEvents: RunEvent[];
    fromRound: number;
    edit?: { agentId: string; remove: string[]; add: string[] };
  };
}

export interface RunResult {
  runId: string;
  file: string;
  events: RunEvent[];
  durationMs: number;
  usage: { calls: number; tokensIn: number; tokensOut: number; reasoningTokens: number };
  db: boolean;
}

const MAX_NEW_PROPOSALS_PER_ROUND = 4;
const MAX_OPEN_PROPOSALS = 8;
const SHIFT = 0.25;
const MAX_BILATERALS = 2;
const MAX_CAUCUSES = 2;
/** Turn quality gate on by default; SV_QUALITY_GATE=0 switches it off (A/B runs). */
const GATE_ON = () => process.env.SV_QUALITY_GATE !== "0";
/** An exchange turn below this novelty is stale (no new content stems, quality/checks.ts). */
const STALE_NOVELTY = 0.2;

const pad = (n: number) => String(n).padStart(2, "0");
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

export function newRunId(prefix = "run"): string {
  const d = new Date();
  const stamp = d.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  return `${prefix}-${stamp}-${Math.random().toString(36).slice(2, 6)}`;
}

function telemetry(
  meta: CallMeta,
  seed: number,
  maxOutputTokens = 16000,
): NonNullable<Utterance["telemetry"]> {
  return {
    model: meta.model,
    latencyMs: meta.latencyMs,
    tokensIn: meta.tokensIn,
    tokensOut: meta.tokensOut,
    costEur: null,
    retries: meta.retries,
    fallbackFrom: null,
    cacheHit: meta.tokensCached > 0,
    gatewayRequestId: meta.gatewayRequestId,
    params: { temperature: null, maxOutputTokens, seed },
    reasoningTokens: meta.reasoningTokens,
  };
}

/** Rebuilds the mutable run state from a folded snapshot (fork from round N). */
function stateFromSnapshot(s: RunState, snap: RunSnapshot) {
  for (const id of snap.utteranceOrder) {
    const u = snap.utterances[id];
    if (u) s.utterances.push(u);
  }
  for (const c of Object.values(snap.claims)) s.claims.set(c.id, c);
  for (const [agentId, byTopic] of Object.entries(snap.positions)) {
    const m = new Map<string, Position>();
    for (const [topicId, list] of Object.entries(byTopic)) {
      const last = list.at(-1);
      if (last) m.set(topicId, { ...last, runId: s.run.id });
    }
    s.positions.set(agentId, m);
  }
  for (const id of snap.proposalOrder) {
    const p = snap.proposals[id];
    if (!p) continue;
    s.proposals.set(id, p);
    const votes = new Map<string, { vote: Vote; reason: string; round: number }>();
    for (const v of p.votes ?? [])
      votes.set(v.agentId, { vote: v.vote, reason: v.reason.text, round: v.round });
    s.votes.set(id, votes);
  }
  for (const l of snap.lessons) {
    const prev = s.lessons.get(l.agentId);
    if (!prev || prev.round <= l.round) s.lessons.set(l.agentId, { ...l, runId: s.run.id });
  }
  for (const [agentId, list] of Object.entries(snap.assessments)) {
    const last = list.at(-1);
    if (last) s.assessments.set(agentId, { ...last, runId: s.run.id });
  }
  s.calculus = snap.calculi.at(-1)
    ? { ...(snap.calculi.at(-1) as NonNullable<RunState["calculus"]>), runId: s.run.id }
    : null;
  s.summaries.push(...snap.summaries);
  s.proposalCounter = snap.proposalOrder.length;
}

/** Where an utterance goes: its exchange, the clock that times it, its addressees. */
interface At {
  ex: Exchange;
  clk: MeetingClock;
  addressedTo?: string[];
  delegateId?: string;
}

export async function runNegotiation(opts: RunOptions): Promise<RunResult> {
  const started = performance.now();
  const usage0 = { ...usage };
  let room = opts.room;
  let mandate = opts.mandate;
  let mandateMeta: CallMeta | null = null;
  const runId = opts.runId ?? newRunId();
  // Agent trace: every model call becomes an llm.call event (the mandate call is buffered
  // until the writer exists and then emitted with a negative start time).
  const tracer = new CallTracer(() => Math.round(performance.now() - started));
  if (!mandate) {
    const r0 = room;
    const built = await tracer.run(
      { kind: "mandate", ref: runId, round: null, speaker: "moderator" },
      () => buildMandate(r0, { selectActors: opts.selectActors }),
    );
    mandate = built.mandate;
    room = built.room;
    mandateMeta = built.meta;
  }
  const seated = room.agents.filter((a) => a.enabled);
  const agentIds = seated.map((a) => a.agentId);
  const modelOf = (a: string) => seated.find((x) => x.agentId === a)?.model ?? room.moderatorModel;
  const verifierModel = VERIFIER_MODEL();
  const run: Run = {
    id: runId,
    createdAt: new Date().toISOString(),
    mandate,
    room,
    variant: opts.variant ?? { kind: "baseline" },
    agents: seated.map((a) => agentConfigOf(a.agentId, a.temperament)),
    modelAssignment: {
      moderator: room.moderatorModel,
      expert: room.expertModel,
      ...Object.fromEntries(seated.map((a) => [a.agentId, a.model])),
    },
    status: "running",
    endCondition: null,
    isReference: opts.isReference ?? false,
  };

  const w = new RunWriter(runId, opts.outDir ?? path.join(REPO_ROOT, "runs"), { db: opts.db });
  if (opts.onEvent) w.onEvent(opts.onEvent);
  w.emit({ type: "run.started", run, source: "live" });
  tracer.attach(
    (call) => w.emit({ type: "llm.call", call }),
    () => w.elapsedMs,
  );
  if (mandateMeta)
    console.warn(
      "mandate_built",
      JSON.stringify({ latencyMs: mandateMeta.latencyMs, tokensOut: mandateMeta.tokensOut }),
    );

  const s: RunState = {
    run,
    room,
    mandate,
    agents: run.agents,
    agentIds,
    utterances: [],
    claims: new Map(),
    positions: new Map(),
    proposals: new Map(),
    votes: new Map(),
    lessons: new Map(),
    assessments: new Map(),
    calculus: null,
    summaries: [],
    demands: new Map(),
    passages: new Map(),
    blockedRounds: new Map(),
    proposalCounter: 0,
    uttCounter: 0,
    retrievalEdit: opts.fork?.edit ? { ...opts.fork.edit } : null,
  };

  const clock = new MeetingClock();
  let startRound = 1;
  if (opts.fork) {
    const cut = opts.fork.baseEvents.findIndex(
      (e) => e.type === "round.started" && e.round >= (opts.fork?.fromRound ?? 1),
    );
    const prefix = opts.fork.baseEvents.slice(1, cut < 0 ? undefined : cut);
    for (const e of prefix) {
      if (e.type === "run.completed" || e.type === "run.error") continue;
      w.copy(retag(e, runId));
    }
    const snap = foldRun(w.events);
    stateFromSnapshot(s, snap);
    clock.now = r2(
      Math.max(
        0,
        ...snap.exchanges.map((x) => x.endMin ?? 0),
        ...s.utterances.map((u) => (u.timing ? u.timing.startMin + u.timing.durationMin : 0)),
      ),
    );
    if (clock.now > 0) clock.gap();
    startRound = opts.fork.fromRound;
  }

  const roundUtts = (round: number) => s.utterances.filter((u) => u.round === round);
  const nextUttId = (round: number) => `u${round}-${pad(roundUtts(round).length + 1)}`;
  const lastSummaryUtt = () => [...s.utterances].reverse().find((u) => u.kind === "round_summary");
  const topicById = (id: string | null) => s.mandate.topics.find((t) => t.id === id);
  const redLineOwner = (id: string) => allRedLines().find((r) => r.id === id)?.agentId;
  const stanceNow = (a: string, t: string | null) =>
    t ? (s.positions.get(a)?.get(t)?.stance ?? null) : null;

  /**
   * NFR-9: a call that fails on a seat's own model (for example the second family) is
   * retried once on the default model; the result names the model it fell back from.
   */
  const withFallback = async <T extends object>(
    a: string,
    call: (model: string) => Promise<T>,
    parent: CallParent | Slot,
  ): Promise<(T & { fallbackFrom?: string }) | Error> => {
    const own = modelOf(a);
    try {
      return await tracer.run(parent, () => call(own));
    } catch (error) {
      if (own === room.moderatorModel) return error as Error;
      console.warn("model_fallback", JSON.stringify({ agentId: a, from: own }));
      try {
        const res = await tracer.run(parent, () => call(room.moderatorModel), own);
        return { ...res, fallbackFrom: own };
      } catch (e2) {
        return e2 as Error;
      }
    }
  };

  // ---------- exchanges ----------
  const exCounters = new Map<number, number>();
  const openExchange = (
    round: number,
    phase: number,
    kind: Exchange["kind"],
    participants: string[],
    topicId: string | null,
    trigger: { de: string; en: string },
    clk: MeetingClock,
  ): Exchange => {
    const n = (exCounters.get(round) ?? 0) + 1;
    exCounters.set(round, n);
    const ex: Exchange = {
      id: `x${round}-${pad(n)}`,
      round,
      phase,
      kind,
      participants,
      topicId,
      trigger: L(trigger.de, trigger.en),
      utteranceIds: [],
      outcome: null,
      startMin: r2(clk.now),
    };
    w.emit({ type: "exchange.opened", exchange: { ...ex, utteranceIds: [] } });
    return ex;
  };
  const closeExchange = (
    ex: Exchange,
    outcome: { de: string; en: string } | null,
    clk: MeetingClock,
  ) => {
    ex.outcome = outcome ? L(outcome.de, outcome.en) : null;
    ex.endMin = r2(Math.max(ex.startMin ?? 0, clk.end));
    w.emit({ type: "exchange.closed", exchange: { ...ex, utteranceIds: [...ex.utteranceIds] } });
  };

  // ---------- quality gates ----------
  const vocab = vocabularyOf(mandate);
  const topicIds = new Set(mandate.topics.map((t) => t.id));
  const moderationGate = (g: {
    round: number;
    kind: "agenda_refused" | "exchange_closed_early" | "concrete_demand";
    exchangeId?: string | null;
    topicId?: string | null;
    utteranceId?: string | null;
    de: string;
    en: string;
  }) =>
    w.emit({
      type: "moderation.gate",
      gate: {
        round: g.round,
        kind: g.kind,
        exchangeId: g.exchangeId ?? null,
        topicId: g.topicId ?? null,
        utteranceId: g.utteranceId ?? null,
        reason: L(g.de, g.en),
      },
    });
  /** The moderation keeps the agenda on the mandate: plans on other topics are refused. */
  const onMandate = (round: number, plans: ExchangePlan[]): ExchangePlan[] =>
    plans.filter((p) => {
      if (p.topicId === null || topicIds.has(p.topicId)) return true;
      moderationGate({
        round,
        kind: "agenda_refused",
        topicId: p.topicId,
        de: `Moderation lehnt das Gespräch ${p.participants.map(nameOf).join(" und ")} zu "${p.topicId}" ab: kein Thema des Mandats.`,
        en: `Moderation refuses the talk ${p.participants.join("/")} on "${p.topicId}": not a mandate topic.`,
      });
      return false;
    });

  const pushUtterance = (u: Utterance, claims: Claim[], at: At) => {
    u.exchangeId = at.ex.id;
    if (at.delegateId) u.delegateId = at.delegateId;
    if (at.addressedTo) u.addressedTo = at.addressedTo;
    u.timing = at.clk.place(u.text.text);
    at.ex.utteranceIds.push(u.id);
    s.utterances.push(u);
    for (const c of claims) s.claims.set(c.id, c);
    w.emit({ type: "utterance.completed", utterance: u, claims });
  };

  const moderatorSays = (
    at: At,
    round: number,
    phase: number,
    kind: Utterance["kind"],
    de: string,
    en: string,
    respondsTo: string | null,
    speaker: "moderator" | "expert" = "moderator",
    model = speaker === "moderator" ? room.moderatorModel : room.expertModel,
    meta: CallMeta | null = null,
  ) => {
    const id = nextUttId(round);
    w.emit({ type: "utterance.started", utteranceId: id, speaker, round, respondsTo, model });
    const u: Utterance = {
      id,
      round,
      seq: s.utterances.length + 1,
      phase,
      speaker,
      kind,
      respondsTo,
      text: L(de, en),
      claimIds: [],
      redLinesTouched: [],
      proposalIds: [],
      model,
      telemetry: meta ? telemetry(meta, room.seed) : null,
      deliberationSummary: null,
      degraded: null,
    };
    pushUtterance(u, [], at);
    return u;
  };

  /** A failed model call still leaves a visible, marked turn (NFR-9). */
  const pushDegraded = (
    a: string,
    round: number,
    phase: number,
    kind: Utterance["kind"],
    respondsTo: string | null,
    reason: string,
    at: At,
  ) => {
    const uttId = nextUttId(round);
    w.emit({
      type: "utterance.started",
      utteranceId: uttId,
      speaker: a,
      round,
      respondsTo,
      model: modelOf(a),
    });
    const u: Utterance = {
      id: uttId,
      round,
      seq: s.utterances.length + 1,
      phase,
      speaker: a,
      kind,
      respondsTo,
      text: L(
        "(Beitrag ausgefallen: Modellaufruf fehlgeschlagen)",
        "(Turn degraded: model call failed)",
      ),
      claimIds: [],
      redLinesTouched: [],
      proposalIds: [],
      model: modelOf(a),
      telemetry: null,
      deliberationSummary: null,
      degraded: { reason },
    };
    pushUtterance(u, [], at);
    w.emit({ type: "agent.degraded", agentId: a, utteranceId: uttId, reason });
    return u;
  };

  const citer = (passages: Passage[]) => {
    const handles = new Map(passages.map((p) => [p.handle, p]));
    return (hs: string[]): CitationRef[] =>
      [...new Set(hs)]
        .map((h) => handles.get(h.trim()))
        .filter((p): p is Passage => Boolean(p))
        .map((p) => ({
          sourceId: p.sourceId,
          segmentId: p.segmentId,
          start: null,
          end: null,
          recencyWeight: p.recencyWeight,
        }));
  };

  /** Claims (FR-T10, FR-P5): assumption iff no citation. */
  const buildClaims = (
    round: number,
    uttId: string,
    textDe: string,
    raw: TurnOut["claims"],
    cite: (hs: string[]) => CitationRef[],
    model: string,
    max: number,
  ): Claim[] =>
    raw.slice(0, max).map((c, i) => {
      const citations = cite(c.evidence);
      let start = textDe.indexOf(c.quote);
      let len = c.quote.length;
      if (start < 0 || !c.quote) {
        start = 0;
        len = textDe.length;
      }
      return {
        id: `c-${round}-${uttId.slice(uttId.indexOf("-") + 1)}-${i + 1}`,
        utteranceId: uttId,
        span: { start, end: start + len },
        atomicText: c.atomic,
        kind: c.kind,
        numeric:
          c.value !== null ? { value: c.value, unit: c.unit ?? "", low: null, high: null } : null,
        citations,
        state: citations.length ? "unverified" : "assumption",
        verifyingModels: [],
        decompositionModel: model,
        contradiction: null,
      };
    });

  const buildTrace = (o: {
    a: string;
    round: number;
    uttId: string;
    respondsTo: string | null;
    blocks: PromptBlock[];
    ev: { passages: Passage[]; trace: UtteranceTrace["retrieval"][number] } | undefined;
    usedHandles: Set<string>;
    options: UtteranceTrace["deliberation"]["options"];
    decision: string;
    wouldChangeMind: string[];
    reasoningTokens: number;
  }): UtteranceTrace => {
    const lesson = s.lessons.get(o.a);
    const own = [...s.utterances].reverse().find((u) => u.speaker === o.a && u.id !== o.uttId);
    return {
      utteranceId: o.uttId,
      prompt: o.blocks,
      retrieval: o.ev ? [o.ev.trace] : [],
      deliberation: {
        utteranceId: o.uttId,
        sourcesRead: (o.ev?.passages ?? []).map((p) => ({
          ref: {
            sourceId: p.sourceId,
            segmentId: p.segmentId,
            start: null,
            end: null,
            recencyWeight: p.recencyWeight,
          },
          use: o.usedHandles.has(p.handle) ? ("cited" as const) : ("read_not_cited" as const),
        })),
        priorUtterances: [
          ...(o.respondsTo ? [{ id: o.respondsTo, relation: "responds_to" as const }] : []),
          ...(own ? [{ id: own.id, relation: "own" as const }] : []),
          ...s.utterances
            .filter(
              (u) =>
                u.round >= o.round - 1 &&
                u.id !== o.respondsTo &&
                u.id !== own?.id &&
                u.id !== o.uttId,
            )
            .slice(-8)
            .map((u) => ({ id: u.id, relation: "context" as const })),
        ],
        lessonsUsed: lesson ? [lessonKey(o.a, lesson.round)] : [],
        options: o.options,
        decision: L(o.decision),
        wouldChangeMind: o.wouldChangeMind.slice(0, 3).map((x) => L(x)),
        providerTrace: {
          available: false,
          text: null,
          note: `Reasoning-Tokens (${o.reasoningTokens}) werden über Chat Completions nicht im Klartext geliefert`,
        },
        schemaVersion: 2,
      },
    };
  };

  let endId: "convergence" | "max_rounds" | "deadlock" | null = null;
  let finalNext = false;
  let stillRounds = 0;
  let lastRound = startRound;

  for (let round = startRound; round <= room.roundLimit; round++) {
    lastRound = round;
    const phase = finalNext ? 5 : phaseFor(round, room.roundLimit);
    const final = phase === 5;
    const order = shuffle(agentIds, room.seed + round * 7919);
    w.emit({ type: "round.started", round, phase, speakingOrder: order });
    const phaseName = PHASE_NAMES[phase - 1];
    let newProposals = 0;
    let maxShift = 0;
    let stageClaims: Claim[] = [];
    const expertJobs: Array<Promise<Awaited<ReturnType<typeof runExpert>>>> = [];
    const flushExpert = () => {
      // Experte checks each stage's claims in the background (FR-N1, N2, N7).
      const batch = stageClaims;
      if (batch.length)
        expertJobs.push(
          tracer.run(
            {
              kind: "expert_check",
              ref: batch.map((c) => c.id).join(","),
              round,
              speaker: "expert",
            },
            () => runExpert(s, batch, room.expertModel, verifierModel),
          ),
        );
      stageClaims = [];
    };

    // ---------- planning inputs (moderator, deterministic) ----------
    const tabledInfo = (): TabledInfo | null => {
      const nt = s.calculus?.nextTabled;
      const p = nt ? s.proposals.get(nt.proposalId) : undefined;
      const row = s.calculus?.proposals.find((r) => r.proposalId === nt?.proposalId);
      if (!p || !row || p.status !== "open" || phase < 2 || phase > 4) return null;
      return {
        proposalId: p.id,
        topicIds: p.topicIds,
        origin: p.originAgent,
        supporters: row.supporters,
        conditional: row.conditional,
        opponents: row.opponents,
        blockers: row.blockers,
      };
    };
    const planInput = (): PlanInput => {
      const stanceOf = (a: string, t: string) => {
        const p = s.positions.get(a)?.get(t);
        return p ? { stance: p.stance, strength: p.strength } : undefined;
      };
      const fromSummary: Conflict[] =
        round > 1
          ? (s.summaries.at(-1)?.openConflicts ?? []).map((c) => ({
              topicId: c.topicId,
              sides: c.sides,
              boundBy: c.boundBy,
            }))
          : [];
      const fromStances = conflictsFromStances(
        s.mandate.topics.map((t) => t.id),
        agentIds,
        stanceOf,
      );
      return {
        conflicts: mergeConflicts(fromSummary, fromStances),
        stanceOf,
        vetoPlayers: agentIds.filter((a) => profileOf(a).vetoStatus === "formal_veto"),
        eligible: (a, t) => {
          const topic = topicById(t);
          return touchesInterests({
            origin: seated.find((x) => x.agentId === a)?.origin ?? "optional",
            topicKey: topic?.key ?? t,
            topicLabel: topic?.label.text ?? t,
            redLineTopicKeys: redLinesOf(a).flatMap((r) => r.topicKeys),
            keywords: profileOf(a).keywords,
          });
        },
        redLineOwner,
        labelOf: (t) => {
          const topic = topicById(t);
          return {
            de: topic?.label.text ?? t,
            en: topic?.label.translations.en ?? topic?.label.text ?? t,
          };
        },
        nameOf,
        tabled: tabledInfo(),
        seated: agentIds,
      };
    };
    const affinity = (a: string, b: string) =>
      Math.max(
        0,
        ...(s.assessments.get(a)?.coalitionOptions ?? [])
          .filter((o) => o.withAgents.includes(b))
          .map((o) => o.overlap),
      );
    const describePlans = (plans: ExchangePlan[]) =>
      plans
        .map((p) => {
          const label = topicById(p.topicId)?.label.text ?? "Vorschlag auf dem Tisch";
          return `${p.participants.map(nameOf).join(" und ")} zu ${label}`;
        })
        .join("; ");

    /** Turn gate for one speaker in one setting (deterministic, no model call). */
    const gateFor = (
      a: string,
      topicId: string | null,
      exchangeKind: "plenary" | "bilateral" | "caucus" | "interjection",
    ): TurnGate | undefined =>
      GATE_ON()
        ? (text, kind) =>
            gateChecks({
              text,
              speaker: a,
              phase,
              vocab,
              topicId,
              ownPrior: s.utterances.filter((u) => u.speaker === a).map((u) => u.text.text),
              exchangeKind,
              kind: final ? "closing" : kind,
            })
        : undefined;
    /** A turn the gate sent back for lacking a proposal or objection is a moderation demand. */
    const noteDemand = (u: Utterance) => {
      const neg = u.gate?.first.find((c) => c.check === "negotiation" && !c.passed);
      if (!neg) return;
      moderationGate({
        round,
        kind: "concrete_demand",
        exchangeId: u.exchangeId ?? null,
        utteranceId: u.id,
        de: `Moderation verlangt von ${nameOf(u.speaker)} einen konkreten Vorschlag oder einen begründeten Einwand${u.gate?.action === "regenerated" ? "; der neue Beitrag erfüllt das" : "; auch der neue Beitrag bleibt unkonkret"}.`,
        en: `Moderation asks ${u.speaker} for a concrete proposal or a justified objection${u.gate?.action === "regenerated" ? "; the new turn meets it" : "; the new turn is still vague"}.`,
      });
    };

    // ---------- opening plenary ----------
    let bilaterals: ExchangePlan[] =
      round > 1 && !final ? onMandate(round, selectBilaterals(planInput(), MAX_BILATERALS)) : [];
    const opening = openExchange(
      round,
      phase,
      "plenary",
      [...agentIds],
      null,
      final
        ? { de: "Schlussrunde: Abstimmung und Ergebnis", en: "Final round: vote and result" }
        : round === 1
          ? { de: "Eröffnung: Ausgangspositionen", en: "Opening: starting positions" }
          : { de: `Eröffnung Runde ${round}`, en: `Opening round ${round}` },
      clock,
    );
    const atOpening: At = { ex: opening, clk: clock, addressedTo: [] };

    // Scheduled events (FR-U10).
    const injected: string[] = [];
    for (const ev of room.scheduledEvents.filter((e) => e.atRound === round)) {
      w.emit({ type: "room.event_injected", round, event: ev });
      injected.push(`${ev.title.text}: ${ev.body.text}`);
      moderatorSays(
        atOpening,
        round,
        phase,
        "event_injection",
        `Neue Information (${ev.kind}): ${ev.title.text}. ${ev.body.text}`,
        `New information (${ev.kind}): ${ev.title.translations.en ?? ev.title.text}. ${ev.body.translations.en ?? ev.body.text}`,
        lastSummaryUtt()?.id ?? null,
      );
    }

    // Opening line (templated, so the moderator holds no position, FR-M9).
    const names = order.map(nameOf).join(", ");
    const lastSummary = s.summaries.at(-1);
    const tabled = s.calculus?.nextTabled
      ? s.proposals.get(s.calculus.nextTabled.proposalId)
      : undefined;
    const openIds = [...s.proposals.values()].filter((p) => p.status === "open").map((p) => p.id);
    let openDe: string;
    let openEn: string;
    if (round === 1) {
      openDe = `Runde 1, ${phaseName?.de}. Mandat: ${mandate.objective.text.replace(/\.$/, "")}. Regel: ${room.decisionRule}, höchstens ${room.roundLimit} Runden, Budgetdeckel +${room.budgetCeiling.maxIncreasePct} %. Bitte zuerst kurze Eröffnungsstatements in ausgeloster Reihenfolge (${names}); danach lade ich die Institutionen mit den schärfsten Gegensätzen zu Einzelgesprächen.`;
      openEn = `Round 1, ${phaseName?.en}. Mandate: ${(mandate.objective.translations.en ?? mandate.objective.text).replace(/\.$/, "")}. Rule: ${room.decisionRule}, at most ${room.roundLimit} rounds, budget ceiling +${room.budgetCeiling.maxIncreasePct} %. Short opening statements first in drawn order (${order.join(", ")}); then I invite the institutions furthest apart to focused talks.`;
    } else if (final) {
      openDe = `Letzte Runde, ${phaseName?.de}. Offene Vorschläge: ${openIds.join(", ") || "keine"}. Bitte geben Sie im Plenum Ihre endgültige Stimme mit Begründung ab und benennen Sie, was offen bleibt. Reihenfolge: ${names}.`;
      openEn = `Final round, ${phaseName?.en}. Open proposals: ${openIds.join(", ") || "none"}. Please give your final vote in plenary with reasons and name what remains open. Order: ${order.join(", ")}.`;
    } else {
      const conflicts =
        lastSummary?.openConflicts.map((c) => topicById(c.topicId)?.label.text ?? c.topicId) ?? [];
      const agenda = describePlans(bilaterals);
      openDe = `Runde ${round}, ${phaseName?.de}. Offene Konflikte: ${[...new Set(conflicts)].join(", ") || "keine benannt"}. ${tabled ? `Auf dem Tisch liegt ${tabled.id} (${tabled.title.text}): ${s.calculus?.nextTabled?.reason.text}` : "Noch kein tragfähiger Vorschlag auf dem Tisch."} ${agenda ? `Zuerst Einzelgespräche: ${agenda}.` : ""} Danach Abstimmung im Plenum.`;
      openEn = `Round ${round}, ${phaseName?.en}. Open conflicts: ${[...new Set(lastSummary?.openConflicts.map((c) => c.topicId) ?? [])].join(", ") || "none named"}. ${tabled ? `Tabled: ${tabled.id} (${tabled.title.translations.en ?? tabled.title.text}): ${s.calculus?.nextTabled?.reason.translations.en ?? ""}` : "No viable proposal tabled yet."} ${bilaterals.length ? `Focused talks first: ${bilaterals.map((p) => `${p.participants.join("/")} on ${p.topicId ?? "the tabled proposal"}`).join("; ")}.` : ""} Then a plenary vote.`;
    }
    moderatorSays(
      atOpening,
      round,
      phase,
      "round_opening",
      openDe.replace(/\s+/g, " ").trim(),
      openEn.replace(/\s+/g, " ").trim(),
      lastSummaryUtt()?.id ?? null,
    );

    // Retrieval per agent (FR-P1, FR-H2, FR-P4).
    const evidence = new Map<
      string,
      { passages: Passage[]; trace: UtteranceTrace["retrieval"][number] }
    >();
    await Promise.all(
      agentIds.map(async (a) => {
        const p = profileOf(a);
        const query = [
          p.keywords,
          ...s.mandate.topics.map((t) => `${t.label.text} ${t.measure.text}`),
          tabled?.title.text ?? "",
          ...injected,
        ].join(" ");
        const edit = s.retrievalEdit?.agentId === a ? s.retrievalEdit : null;
        const r = await retrieve({
          query,
          role: agentConfigOf(a).role,
          asOf: room.asOf,
          excludeSegmentIds: edit?.remove,
          includeSegmentIds: edit?.add,
        });
        r.passages.forEach((ps, i) => {
          ps.handle = `E${i + 1}`;
          s.passages.set(ps.segmentId, ps);
        });
        evidence.set(a, { passages: r.passages, trace: r.trace });
      }),
    );

    // Strategic assessments run alongside the opening and the focused exchanges (FR-A10).
    const strategies = new Map(
      agentIds.map((a) => [
        a,
        withFallback(a, (m) => runStrategy(s, a, round, evidence.get(a)?.passages ?? [], m), {
          kind: "assessment",
          ref: lessonKey(a, round),
          round,
          speaker: a,
        }),
      ]),
    );

    // ---------- full turn (opening statement or plenary vote) ----------
    const commitFull = (
      a: string,
      res: (Awaited<ReturnType<typeof runTurn>> & { fallbackFrom?: string }) | Error | undefined,
      at: At,
      slot?: Slot,
    ) => {
      const ev = evidence.get(a);
      if (!res || res instanceof Error) {
        const reason = res instanceof Error ? res.message.slice(0, 200) : "no result";
        const u = pushDegraded(a, round, phase, final ? "closing" : "position", null, reason, at);
        slot?.resolve(u.id);
        return;
      }
      const uttId = nextUttId(round);
      slot?.resolve(uttId);
      const { out, meta, blocks } = res;
      const cite = citer(ev?.passages ?? []);
      const known = new Set(s.utterances.map((u) => u.id));
      let respondsTo = out.respondsTo && known.has(out.respondsTo) ? out.respondsTo : null;
      if (!respondsTo && round > 1) {
        // FR-A4: agents after round 1 must reference a prior utterance.
        respondsTo =
          [...s.utterances]
            .reverse()
            .find((u) => u.speaker !== a && u.speaker !== "moderator" && u.speaker !== "expert")
            ?.id ??
          s.utterances.at(-1)?.id ??
          null;
      }
      w.emit({
        type: "utterance.started",
        utteranceId: uttId,
        speaker: a,
        round,
        respondsTo,
        model: meta.model,
      });
      const claims = buildClaims(round, uttId, out.textDe, out.claims, cite, meta.model, 6);
      stageClaims.push(...claims);

      // Votes; red lines are never conceded (FR-C3).
      const myRed = new Set(redLinesOf(a).map((r) => r.id));
      const touched = new Set(
        out.redLinesTouched.filter((id) => allRedLines().some((r) => r.id === id)),
      );
      for (const v of out.votes) {
        const p = s.proposals.get(v.proposalId);
        if (p?.status !== "open" || p.originAgent === a) continue;
        let vote: Vote = v.vote;
        let reason = v.reason;
        if (v.crossesOwnRedLine && myRed.size > 0) {
          // A red line is never conceded: unconditional support of a proposal that
          // crosses it becomes conditional (final round: opposition).
          if (vote === "support") {
            vote = final ? "oppose" : "conditional";
            reason = `Rote Linie: ${reason}`;
          }
          for (const id of myRed) touched.add(id);
        }
        const m = s.votes.get(p.id) ?? new Map();
        m.set(a, { vote, reason, round });
        s.votes.set(p.id, m);
      }

      // Proposals (FR-R3) and withdrawals.
      const proposalIds: string[] = [];
      const changed: Proposal[] = [];
      for (const id of out.withdraw) {
        const p = s.proposals.get(id);
        if (p && p.originAgent === a && p.status === "open") {
          const np: Proposal = {
            ...p,
            status: "withdrawn",
            rejectionReason: L(`Von ${nameOf(a)} zurückgezogen`, `Withdrawn by ${a}`),
          };
          s.proposals.set(id, np);
          changed.push(np);
        }
      }
      const openCount = [...s.proposals.values()].filter((p) => p.status === "open").length;
      // Off-topic agenda items are refused: a motion must touch at least one mandate topic.
      let offMandate: string | null = null;
      if (
        out.proposal &&
        GATE_ON() &&
        phase >= 2 &&
        phase <= 4 &&
        !out.proposal.topicIds.some((t) => topicIds.has(t))
      ) {
        offMandate = out.proposal.titleDe;
        out.proposal = null;
      }
      if (
        out.proposal &&
        phase >= 2 &&
        phase <= 4 &&
        newProposals < MAX_NEW_PROPOSALS_PER_ROUND &&
        openCount < MAX_OPEN_PROPOSALS
      ) {
        newProposals++;
        const o = out.proposal;
        const id = `p-${pad(++s.proposalCounter)}`;
        const alt = o.alternativeTo && s.proposals.has(o.alternativeTo) ? o.alternativeTo : null;
        const lo = Math.min(o.costLow, o.costMioEurPa, o.costHigh);
        const hi = Math.max(o.costLow, o.costMioEurPa, o.costHigh);
        const cap =
          o.capacityEffectPct !== null && o.capacityEffectPct > 0
            ? {
                value: r2(clamp(o.capacityEffectPct, 0, 60)),
                low: r2(
                  clamp(Math.min(o.capacityLow ?? o.capacityEffectPct, o.capacityEffectPct), 0, 60),
                ),
                high: r2(
                  clamp(
                    Math.max(o.capacityHigh ?? o.capacityEffectPct, o.capacityEffectPct),
                    0,
                    60,
                  ),
                ),
                unit: "%",
              }
            : null;
        const np: Proposal = {
          id,
          originAgent: a,
          round,
          topicIds: o.topicIds.filter((t) => s.mandate.topics.some((x) => x.id === t)),
          title: L(o.titleDe, o.titleEn),
          cost: { value: r2(o.costMioEurPa), low: r2(lo), high: r2(hi), unit: "Mio. EUR p.a." },
          acceptance: 1 / agentIds.length,
          feasibility: clamp(o.feasibility, 0, 1),
          supporters: [a],
          opponents: [],
          conditional: [],
          status: "open",
          rejectionReason: null,
          outcomeClass: null,
          alternativeTo: alt,
          capacityEffect: cap,
          measureClass: o.measureClass,
          financing: o.financingDe.trim() ? L(o.financingDe) : undefined,
          components: o.components.length ? o.components.slice(0, 6).map((x) => L(x)) : undefined,
          votes: [
            { agentId: a, vote: "support", reason: L("Eigener Vorschlag", "Own proposal"), round },
          ],
        };
        s.proposals.set(id, np);
        s.votes.set(id, new Map([[a, { vote: "support", reason: "Eigener Vorschlag", round }]]));
        proposalIds.push(id);
        changed.push(np);
        if (alt) {
          const old = s.proposals.get(alt);
          if (old && old.originAgent === a && old.status === "open") {
            const wd: Proposal = {
              ...old,
              status: "withdrawn",
              rejectionReason: L(`Ersetzt durch ${id}`, `Replaced by ${id}`),
            };
            s.proposals.set(alt, wd);
            changed.push(wd);
          }
        }
      }

      // Positions with triggers (FR-A5).
      const lesson = s.lessons.get(a);
      const mine = s.positions.get(a) ?? new Map<string, Position>();
      const positions: Position[] = [];
      let shifted = false;
      for (const t of s.mandate.topics) {
        const st = out.stances.find((x) => x.topicId === t.id);
        const prev = mine.get(t.id);
        if (!st && !prev) continue;
        const stance = st ? r2(clamp(st.stance, -2, 2)) : (prev?.stance ?? 0);
        const delta = prev ? Math.abs(stance - prev.stance) : 0;
        if (delta > maxShift) maxShift = delta;
        let trigger: Position["trigger"] = null;
        if (prev && delta >= SHIFT) {
          shifted = true;
          const by =
            st?.changedBecauseOf && known.has(st.changedBecauseOf)
              ? st.changedBecauseOf
              : (respondsTo ?? s.utterances.at(-1)?.id);
          if (by) trigger = { utteranceId: by, note: L(st?.changeNote ?? `Anpassung nach ${by}`) };
        }
        const pos: Position = {
          runId,
          agentId: a,
          topicId: t.id,
          round,
          stance,
          strength: st ? r2(clamp(st.strength, 0, 1)) : (prev?.strength ?? 0.5),
          arguments: (st?.arguments ?? []).slice(0, 3).map((x) => L(x)),
          citations: st ? cite(st.evidence) : (prev?.citations ?? []),
          rationale: st
            ? L(st.rationaleDe, st.rationaleEn || undefined)
            : (prev?.rationale ?? L("Unverändert")),
          trigger: trigger ?? (prev?.round === round ? prev.trigger : null),
        };
        mine.set(t.id, pos);
        positions.push(pos);
      }
      s.positions.set(a, mine);

      let kind: Utterance["kind"] = out.kind;
      if (final) kind = "closing";
      else if (proposalIds.length) kind = "proposal";
      else if (kind === "proposal") kind = respondsTo ? "rebuttal" : "position";
      else if (kind === "closing") kind = "rebuttal";
      if (shifted && kind !== "proposal" && !final) kind = "position_shift";
      if (phase === 1 && !shifted) kind = "position";

      const d = out.deliberation;
      const usedHandles = new Set([
        ...out.claims.flatMap((c) => c.evidence),
        ...out.stances.flatMap((x) => x.evidence),
      ]);
      const utterance: Utterance = {
        id: uttId,
        round,
        seq: s.utterances.length + 1,
        phase,
        speaker: a,
        kind,
        respondsTo,
        text: L(out.textDe, out.textEn),
        claimIds: claims.map((c) => c.id),
        redLinesTouched: [...touched],
        proposalIds,
        model: meta.model,
        telemetry: { ...telemetry(meta, room.seed), fallbackFrom: res.fallbackFrom ?? null },
        deliberationSummary: { read: d.read, weighed: d.weighed, wouldMoveIt: d.wouldMoveIt },
        degraded: null,
        ...(res.gate ? { gate: res.gate } : {}),
      };
      pushUtterance(utterance, claims, at);
      noteDemand(utterance);
      if (offMandate)
        moderationGate({
          round,
          kind: "agenda_refused",
          utteranceId: uttId,
          de: `Moderation nimmt den Antrag "${offMandate}" nicht auf die Tagesordnung: er betrifft kein Thema des Mandats.`,
          en: `Moderation does not table the motion "${offMandate}": it touches no mandate topic.`,
        });
      const trace = buildTrace({
        a,
        round,
        uttId,
        respondsTo,
        blocks,
        ev,
        usedHandles,
        options: d.options.slice(0, 4).map((o, i) => ({
          key: `o${i + 1}`,
          label: L(o.label),
          pros: o.pros.slice(0, 3).map((x) => L(x)),
          cons: o.cons.slice(0, 3).map((x) => L(x)),
          status: o.chosen ? ("chosen" as const) : ("rejected" as const),
          rejectReason: o.chosen ? null : L(o.rejectReason ?? "Nicht gewählt"),
        })),
        decision: d.decision,
        wouldChangeMind: d.wouldChangeMind,
        reasoningTokens: meta.reasoningTokens,
      });
      w.emit({ type: "utterance.trace", trace });
      for (const p of changed) w.emit({ type: "proposal.updated", proposal: p });
      for (const p of positions) w.emit({ type: "position.updated", position: p });
      if (lesson && out.lessonApplied.applied && out.lessonApplied.note.trim()) {
        w.emit({
          type: "lesson.applied",
          application: {
            agentId: a,
            lessonRound: lesson.round,
            utteranceId: uttId,
            note: L(out.lessonApplied.note),
          },
        });
      }
      s.demands.delete(a);
    };

    /** All seated institutions speak in the plenary; calls run in parallel. */
    const plenaryTurns = async (mode: "opening" | "plenary", at: At) => {
      const respondable = s.utterances.map((u) => u.id);
      const slots = new Map(
        order.map((a) => [a, tracer.slot({ kind: "utterance", round, speaker: a })]),
      );
      const jobs = new Map(
        order.map((a) => [
          a,
          withFallback(
            a,
            (m) =>
              runTurn(
                s,
                {
                  round,
                  phase,
                  agentId: a,
                  passages: evidence.get(a)?.passages ?? [],
                  respondable,
                  injected,
                  mode: final ? undefined : mode,
                  delegateRole: delegatesOf(a)[0]?.role.de,
                  gate: gateFor(a, null, "plenary"),
                },
                m,
              ),
            slots.get(a) as Slot,
          ),
        ]),
      );
      for (const a of order) {
        const res = await jobs.get(a);
        commitFull(
          a,
          res,
          { ...at, delegateId: pickDelegate(delegatesOf(a), null, "plenary") },
          slots.get(a),
        );
      }
      flushExpert();
    };

    // ---------- light turn inside a focused exchange ----------
    const commitLight = (
      a: string,
      res: (Awaited<ReturnType<typeof runExchangeTurn>> & { fallbackFrom?: string }) | Error,
      o: {
        at: At;
        respondsTo: string | null;
        topicId: string | null;
        kind: "bilateral" | "caucus" | "interjection";
        slot?: Slot;
      },
    ): Utterance => {
      if (res instanceof Error) {
        const u = pushDegraded(
          a,
          round,
          phase,
          "rebuttal",
          o.respondsTo,
          res.message.slice(0, 200),
          o.at,
        );
        o.slot?.resolve(u.id);
        return u;
      }
      const { out, meta, blocks } = res;
      const ev = evidence.get(a);
      const cite = citer(ev?.passages ?? []);
      const uttId = nextUttId(round);
      o.slot?.resolve(uttId);
      w.emit({
        type: "utterance.started",
        utteranceId: uttId,
        speaker: a,
        round,
        respondsTo: o.respondsTo,
        model: meta.model,
      });
      const claims = buildClaims(round, uttId, out.textDe, out.claims, cite, meta.model, 2);
      stageClaims.push(...claims);
      const touched = out.redLinesTouched.filter((id) => allRedLines().some((r) => r.id === id));

      // Position on the exchange topic; a move is triggered by the turn it answers (FR-A5).
      const topicId = topicById(o.topicId)?.id ?? topicById(out.stance.topicId)?.id ?? null;
      const mine = s.positions.get(a) ?? new Map<string, Position>();
      let shifted = false;
      let pos: Position | null = null;
      if (topicId) {
        const prev = mine.get(topicId);
        const stance = r2(clamp(Math.round(out.stance.stance * 4) / 4, -2, 2));
        const delta = prev ? Math.abs(stance - prev.stance) : 0;
        if (delta > maxShift) maxShift = delta;
        let trigger: Position["trigger"] = null;
        if (prev && delta >= SHIFT && o.respondsTo) {
          shifted = true;
          trigger = {
            utteranceId: o.respondsTo,
            note: L(out.stance.changeNote ?? `Anpassung im Gespräch nach ${o.respondsTo}`),
          };
        }
        pos = {
          runId,
          agentId: a,
          topicId,
          round,
          stance,
          strength: r2(clamp(out.stance.strength, 0, 1)),
          arguments: prev?.arguments ?? [],
          citations: prev?.citations ?? [],
          rationale: out.stance.rationaleDe.trim()
            ? L(out.stance.rationaleDe)
            : (prev?.rationale ?? L("Unverändert")),
          trigger: trigger ?? (prev?.round === round ? prev.trigger : null),
        };
        mine.set(topicId, pos);
        s.positions.set(a, mine);
      }

      const kind: Utterance["kind"] = shifted
        ? "position_shift"
        : o.kind === "caucus"
          ? "position"
          : "rebuttal";
      const d = out.deliberation;
      const u: Utterance = {
        id: uttId,
        round,
        seq: s.utterances.length + 1,
        phase,
        speaker: a,
        kind,
        respondsTo: o.respondsTo,
        text: L(out.textDe, out.textEn),
        claimIds: claims.map((c) => c.id),
        redLinesTouched: touched,
        proposalIds: [],
        model: meta.model,
        telemetry: { ...telemetry(meta, room.seed, 6000), fallbackFrom: res.fallbackFrom ?? null },
        deliberationSummary: { read: d.read, weighed: d.weighed, wouldMoveIt: d.wouldMoveIt },
        degraded: null,
        ...(res.gate ? { gate: res.gate } : {}),
      };
      pushUtterance(u, claims, o.at);
      noteDemand(u);
      const trace = buildTrace({
        a,
        round,
        uttId,
        respondsTo: o.respondsTo,
        blocks,
        ev,
        usedHandles: new Set(out.claims.flatMap((c) => c.evidence)),
        options: [],
        decision: d.decision,
        wouldChangeMind: d.wouldMoveIt ? [d.wouldMoveIt] : [],
        reasoningTokens: meta.reasoningTokens,
      });
      w.emit({ type: "utterance.trace", trace });
      if (pos) w.emit({ type: "position.updated", position: pos });
      const lesson = s.lessons.get(a);
      if (lesson && out.lessonApplied.applied && out.lessonApplied.note.trim()) {
        w.emit({
          type: "lesson.applied",
          application: {
            agentId: a,
            lessonRound: lesson.round,
            utteranceId: uttId,
            note: L(out.lessonApplied.note),
          },
        });
      }
      return u;
    };

    /**
     * Runs focused exchanges. Model calls of different exchanges run in parallel; their
     * utterances enter the record exchange by exchange (ordered lanes). Bilaterals follow
     * each other in meeting time; caucuses (overlap) start together on clock branches.
     */
    const runFocused = async (plans: ExchangePlan[], overlap: boolean) => {
      if (plans.length === 0) return;
      clock.gap();
      const ls = lanes(plans.length);
      const clocks = plans.map(() => (overlap ? clock.branch() : clock));
      const lastBy = (who: string[]) =>
        [...s.utterances].reverse().find((u) => who.includes(u.speaker))?.id ??
        s.utterances.at(-1)?.id ??
        null;
      await Promise.all(
        plans.map(async (plan, i) => {
          const lane = ls[i] as NonNullable<(typeof ls)[number]>;
          const clk = clocks[i] as MeetingClock;
          const topic = topicById(plan.topicId);
          const kind = plan.kind === "caucus" ? "caucus" : "bilateral";
          const before = new Map(plan.participants.map((a) => [a, stanceNow(a, plan.topicId)]));
          const local = new Map(before);
          const transcript: Array<{ speaker: string; text: string }> = [];
          const ref: { ex: Exchange | null; prevId: string | null } = { ex: null, prevId: null };
          // The first turn answers the counterpart's latest word before the exchange.
          const outsiders = agentIds.filter((a) => !plan.participants.includes(a));
          const first0 = plan.turns[0] as string;
          const firstRespondsTo =
            kind === "caucus"
              ? lastBy(outsiders)
              : lastBy(plan.participants.filter((a) => a !== first0));
          lane.do(() => {
            if (i > 0 && !overlap) clk.gap();
            ref.ex = openExchange(
              round,
              phase,
              plan.kind,
              plan.participants,
              plan.topicId,
              plan.trigger,
              clk,
            );
          });
          let interjected = false;
          let prevSpeaker: string | null = null;
          const turn = async (
            a: string,
            tkind: "bilateral" | "caucus" | "interjection",
            addressedTo: string[],
            redLine?: { id: string; text: string },
          ) => {
            const delegateId =
              pickDelegate(
                delegatesOf(a),
                topic?.key ?? null,
                tkind === "caucus" ? "caucus" : "bilateral",
              ) ?? undefined;
            const delegateRole = delegatesOf(a).find((d) => d.id === delegateId)?.role.de;
            const participants =
              tkind === "interjection" ? [...plan.participants] : plan.participants;
            const slot = tracer.slot({ kind: "utterance", round, speaker: a });
            const res = await withFallback(
              a,
              (m) =>
                runExchangeTurn(
                  s,
                  {
                    round,
                    phase,
                    agentId: a,
                    kind: tkind,
                    topicId: plan.topicId,
                    participants,
                    addressedTo,
                    trigger: plan.trigger.de,
                    transcript: [...transcript],
                    stances: [...new Set([...plan.participants, a])].map((x) => ({
                      agentId: x,
                      stance: local.get(x) ?? stanceNow(x, plan.topicId),
                    })),
                    passages: (evidence.get(a)?.passages ?? []).slice(0, 5),
                    delegateRole,
                    redLine,
                    gate: gateFor(a, plan.topicId, tkind),
                  },
                  m,
                ),
              slot,
            );
            if (!(res instanceof Error)) {
              transcript.push({ speaker: a, text: res.out.textDe });
              if (plan.topicId && plan.participants.includes(a))
                local.set(a, r2(clamp(Math.round(res.out.stance.stance * 4) / 4, -2, 2)));
            }
            lane.do(() => {
              const u = commitLight(a, res, {
                at: { ex: ref.ex as Exchange, clk, addressedTo, delegateId },
                respondsTo: ref.prevId ?? firstRespondsTo,
                topicId: plan.topicId,
                kind: tkind,
                slot,
              });
              ref.prevId = u.id;
            });
            return res;
          };
          const novelty: number[] = [];
          const moved: boolean[] = [];
          for (const [k, a] of plan.turns.entries()) {
            // Moderation closes a bilateral that stopped producing new arguments: two stale
            // turns in a row (or one full repeat) and no stance moved in them.
            if (GATE_ON() && kind === "bilateral" && k >= 3) {
              const n1 = novelty.at(-1) ?? 1;
              const n2 = novelty.at(-2) ?? 1;
              const still = !moved.at(-1) && !moved.at(-2);
              if (still && (n1 <= 0.05 || (n1 < STALE_NOVELTY && n2 < 0.4))) {
                const left = plan.turns.length - k;
                lane.do(() =>
                  moderationGate({
                    round,
                    kind: "exchange_closed_early",
                    exchangeId: ref.ex?.id ?? null,
                    topicId: plan.topicId,
                    de: `Moderation schließt das Gespräch: die letzten Beiträge bringen kaum neue Argumente (Neuheit ${Math.round(n2 * 100)} % und ${Math.round(n1 * 100)} %), keine Haltung hat sich bewegt; ${left} geplante Beiträge entfallen.`,
                    en: `Moderation closes the talk: the last turns add hardly any new arguments (novelty ${Math.round(n2 * 100)}% and ${Math.round(n1 * 100)}%), no stance moved; ${left} planned turns dropped.`,
                  }),
                );
                break;
              }
            }
            const addressedTo =
              kind === "bilateral" && prevSpeaker && prevSpeaker !== a
                ? [prevSpeaker]
                : plan.participants.filter((x) => x !== a);
            const before0 = local.get(a) ?? null;
            const earlier = transcript.map((t) => t.text);
            const res = await turn(a, kind, addressedTo);
            prevSpeaker = a;
            if (!(res instanceof Error)) {
              novelty.push(noveltyOf(res.out.textDe, earlier));
              const after0 = local.get(a) ?? null;
              moved.push(
                before0 !== null && after0 !== null && Math.abs(after0 - before0) >= SHIFT,
              );
            }
            // Interjection rule: at most one, only by the holder of a touched red line.
            if (kind !== "bilateral" || res instanceof Error) continue;
            const ij = pickInterjector({
              touched: res.out.redLinesTouched,
              participants: plan.participants,
              seated: agentIds,
              redLineOwner,
              alreadyInterjected: interjected,
            });
            if (!ij) continue;
            interjected = true;
            const rl = allRedLines().find((r) => r.id === ij.redLineId);
            await turn(ij.agentId, "interjection", [a], {
              id: ij.redLineId,
              text: rl?.de ?? ij.redLineId,
            });
          }
          const outcomeSlot = tracer.slot({
            kind: "exchange_outcome",
            round,
            speaker: "moderator",
          });
          const outcome = await tracer.run(outcomeSlot, () =>
            exchangeOutcome(
              s,
              {
                kind,
                topicId: plan.topicId,
                participants: plan.participants,
                transcript,
                moves: plan.participants.map((a) => ({
                  agentId: a,
                  from: before.get(a) ?? null,
                  to: local.get(a) ?? null,
                })),
              },
              room.moderatorModel,
            ),
          );
          lane.do(() => {
            closeExchange(ref.ex as Exchange, outcome, clk);
            outcomeSlot.resolve(ref.ex?.id ?? null);
          });
          lane.end();
          await lane.done;
        }),
      );
      if (overlap) clock.join(clocks);
      flushExpert();
    };

    // Phase 1: short opening statements, one per institution, in the plenary.
    if (phase === 1) await plenaryTurns("opening", atOpening);
    if (round === 1 && !final)
      bilaterals = onMandate(round, selectBilaterals(planInput(), MAX_BILATERALS));
    if (!final) {
      const agenda = describePlans(bilaterals);
      closeExchange(
        opening,
        round === 1
          ? {
              de: `${agentIds.length} Ausgangspositionen liegen vor.${agenda ? ` Einzelgespräche: ${agenda}.` : ""}`,
              en: `${agentIds.length} starting positions on record.${bilaterals.length ? ` Focused talks: ${bilaterals.map((p) => p.participants.join("/")).join("; ")}.` : ""}`,
            }
          : {
              de: agenda
                ? `Tagesordnung: Einzelgespräche ${agenda}, danach Plenum.`
                : "Tagesordnung: Plenum.",
              en: bilaterals.length
                ? `Agenda: focused talks ${bilaterals.map((p) => p.participants.join("/")).join("; ")}, then plenary.`
                : "Agenda: plenary.",
            },
        clock,
      );
    }

    // Bilateral and trilateral exchanges on the conflicts.
    if (!final) await runFocused(bilaterals, false);

    // Emit the assessments once they are needed: before the caucuses (partner affinity),
    // otherwise after the plenary statements, which do not wait for them.
    let assessed = false;
    const emitAssessments = async () => {
      if (assessed) return;
      assessed = true;
      for (const a of agentIds) {
        const r = await strategies.get(a);
        if (!r || r instanceof Error) {
          w.emit({
            type: "agent.degraded",
            agentId: a,
            utteranceId: null,
            reason: `strategic assessment failed: ${r instanceof Error ? r.message.slice(0, 160) : "no result"}`,
          });
          continue;
        }
        s.assessments.set(a, r.assessment);
        w.emit({ type: "strategy.assessed", assessment: r.assessment });
      }
    };

    // Caucuses of coalition partners, in parallel.
    if (phase >= 2 && phase <= 4) {
      await emitAssessments();
      await runFocused(onMandate(round, selectCaucuses(planInput(), affinity, MAX_CAUCUSES)), true);
    }

    // ---------- closing plenary: tabling, votes, check, summary ----------
    let plenary = opening;
    if (!final) {
      clock.gap();
      const t = tabledInfo();
      plenary = openExchange(
        round,
        phase,
        "plenary",
        [...agentIds],
        t?.topicIds[0] ?? null,
        phase === 1
          ? { de: "Zwischenbilanz der Runde", en: "Round review" }
          : t
            ? {
                de: `Plenum: Abstimmung, ${t.proposalId} auf dem Tisch`,
                en: `Plenary: vote, ${t.proposalId} tabled`,
              }
            : { de: "Plenum: Anträge und Abstimmung", en: "Plenary: motions and vote" },
        clock,
      );
    }
    const atPlenary: At = { ex: plenary, clk: clock, addressedTo: [] };
    if (phase >= 2 && !final) {
      const t = tabledInfo();
      moderatorSays(
        atPlenary,
        round,
        phase,
        "round_opening",
        `Zurück im Plenum. ${t ? `Auf dem Tisch liegt ${t.proposalId}.` : "Es liegt noch kein mehrheitsfähiger Vorschlag vor."} Bitte berichten Sie kurz aus den Gesprächen, geben Sie Ihre Stimme zu den offenen Vorschlägen ab und bringen Sie gegebenenfalls Anträge ein. Reihenfolge: ${names}.`,
        `Back in plenary. ${t ? `${t.proposalId} is tabled.` : "No viable proposal yet."} Please report briefly from the talks, vote on the open proposals and table motions if any. Order: ${order.join(", ")}.`,
        s.utterances.at(-1)?.id ?? null,
      );
    }
    if (phase >= 2) await plenaryTurns("plenary", atPlenary);
    // The calculus below reads the assessments' payoffs.
    await emitAssessments();

    // Proposal tallies, coalition calculus (FR-A11), rejections with reasons (FR-R4).
    const vetoPlayers = agentIds.filter((a) => profileOf(a).vetoStatus === "formal_veto");
    const tally = (p: Proposal): Proposal => {
      const votes = s.votes.get(p.id) ?? new Map();
      const list = (v: Vote) => agentIds.filter((a) => votes.get(a)?.vote === v);
      const supporters = list("support");
      const conditional = list("conditional");
      return {
        ...p,
        supporters,
        conditional,
        opponents: list("oppose"),
        acceptance: r2((supporters.length + 0.5 * conditional.length) / agentIds.length),
        votes: [...votes.entries()].map(([agentId, v]) => ({
          agentId,
          vote: v.vote,
          reason: L(v.reason),
          round: v.round,
        })),
      };
    };
    const payoffsFor = (proposalId: string): Record<string, PayoffSign> => {
      const out: Record<string, PayoffSign> = {};
      for (const a of agentIds) {
        const inc =
          s.assessments.get(a)?.incentives.filter((i) => i.proposalId === proposalId) ?? [];
        if (inc.length === 0) continue;
        const sum = inc.reduce((x, i) => x + i.sign, 0);
        out[a] = sum > 0 ? 1 : sum < 0 ? -1 : 0;
      }
      return out;
    };
    const topicStances: Record<string, Record<string, number>> = {};
    for (const t of s.mandate.topics) {
      topicStances[t.id] = Object.fromEntries(
        agentIds.map((a) => [a, s.positions.get(a)?.get(t.id)?.stance ?? 0]),
      );
    }
    const before = new Map([...s.proposals.entries()].map(([id, p]) => [id, JSON.stringify(p)]));
    for (const p of s.proposals.values()) if (p.status === "open") s.proposals.set(p.id, tally(p));
    const calcInput = () => ({
      runId,
      round,
      agents: agentIds,
      decisionRule: room.decisionRule,
      qualifiedMajority: room.qualifiedMajority,
      vetoPlayers,
      proposals: [...s.proposals.values()]
        .filter((p) => p.status === "open" || p.status === "accepted")
        .map((p) => ({
          proposalId: p.id,
          topicIds: p.topicIds,
          votes: Object.fromEntries(
            [...(s.votes.get(p.id) ?? new Map()).entries()].map(([a, v]) => [a, v.vote]),
          ),
          payoffs: payoffsFor(p.id),
          acceptance: p.acceptance,
          status: p.status,
        })),
      topicStances,
    });
    let calculus = computeCalculus(calcInput());
    const reasonOf = (pid: string, agents: string[]) =>
      agents
        .map(
          (a) =>
            `${nameOf(a)}: ${(s.votes.get(pid)?.get(a)?.reason ?? "keine Begründung").slice(0, 160)}`,
        )
        .join("; ");
    for (const row of calculus.proposals) {
      const p = s.proposals.get(row.proposalId);
      if (p?.status !== "open") continue;
      const blocked = row.blockers.length > 0 && !row.passes;
      const n = blocked ? (s.blockedRounds.get(p.id) ?? 0) + 1 : 0;
      s.blockedRounds.set(p.id, n);
      const oc = outcomeClassOf(row.supporters.length, row.opponents.length, agentIds.length);
      if (final) {
        if (row.passes)
          s.proposals.set(p.id, {
            ...p,
            status: "accepted",
            outcomeClass: oc,
            feasibility: r2(p.feasibility),
          });
        else {
          const who = row.blockers.length
            ? row.blockers
            : row.missingVetoPlayers.length
              ? row.missingVetoPlayers
              : row.opponents;
          s.proposals.set(p.id, {
            ...p,
            status: "rejected",
            outcomeClass: oc,
            rejectionReason: L(
              `Entscheidungsregel nicht erfüllt (${row.supporters.length} von ${agentIds.length}${row.missingVetoPlayers.length ? `, fehlende Vetospieler ${row.missingVetoPlayers.join(", ")}` : ""}). ${reasonOf(p.id, who)}`,
              `Decision rule not met (${row.supporters.length} of ${agentIds.length}${row.missingVetoPlayers.length ? `, missing veto players ${row.missingVetoPlayers.join(", ")}` : ""}).`,
            ),
          });
        }
      } else if (round >= 3 && n >= 2 && calculus.nextTabled?.proposalId !== p.id) {
        s.proposals.set(p.id, {
          ...p,
          status: "rejected",
          outcomeClass: oc,
          rejectionReason: L(
            `Zwei Runden in Folge blockiert durch ${row.blockers.join(", ")}. ${reasonOf(p.id, row.blockers)}`,
            `Blocked two rounds in a row by ${row.blockers.join(", ")}.`,
          ),
        });
      } else {
        const feas = r2(clamp(p.feasibility * (row.containsAllVetoPlayers ? 1 : 0.85), 0, 1));
        s.proposals.set(p.id, { ...p, feasibility: feas });
      }
    }
    if (final) calculus = computeCalculus(calcInput());
    for (const [id, p] of s.proposals) {
      if (before.get(id) !== JSON.stringify(p)) w.emit({ type: "proposal.updated", proposal: p });
    }
    s.calculus = calculus;
    w.emit({ type: "coalition.computed", calculus });

    // Moderator summary and lessons start now and run while the Experte finishes (FR-M6, FR-R8).
    const lessonBase = (a: string): Pick<RoundLesson, "passed" | "failed" | "blockedBy"> => ({
      passed: calculus.proposals.filter((r) => r.passes).map((r) => r.proposalId),
      failed: [...s.proposals.values()]
        .filter(
          (p) =>
            p.status === "rejected" ||
            (p.status === "open" &&
              calculus.proposals.find((r) => r.proposalId === p.id)?.blockers.length),
        )
        .map((p) => p.id),
      blockedBy: calculus.proposals.flatMap((r) =>
        r.blockers.filter((b) => b !== a).map((b) => ({ agentId: b, proposalId: r.proposalId })),
      ),
    });
    const lessonJobs = final
      ? []
      : agentIds.map((a) =>
          withFallback(a, (m) => runLesson(s, a, round, lessonBase(a), m), {
            kind: "lesson",
            ref: lessonKey(a, round),
            round,
            speaker: a,
          }),
        );
    const summaryJob = tracer.run(
      { kind: "summary", ref: `r${round}`, round, speaker: "moderator" },
      () => summarizeRound(s, round, final, room.moderatorModel),
    );
    // Experte results.
    const expertResults = await Promise.all(expertJobs);
    const notes = expertResults.flatMap((r) => r.notes);
    const updatedClaims = expertResults.flatMap((r) => r.updated);
    for (const c of updatedClaims) {
      s.claims.set(c.id, c);
      w.emit({ type: "claim.updated", claim: c });
    }
    for (const n of notes) {
      w.emit({
        type: "expert.note",
        utteranceIds: n.utteranceIds,
        note: L(n.note, n.noteEn ?? undefined),
        resolution: "unresolved",
      });
    }
    const checked = expertResults.reduce((x, r) => x + r.checked, 0);
    if (checked > 0) {
      const cnt = (st: Claim["state"]) => updatedClaims.filter((c) => c.state === st).length;
      const target =
        notes.at(-1)?.utteranceIds.at(-1) ??
        updatedClaims.find((c) => c.state !== "verified")?.utteranceId ??
        null;
      const metas = expertResults.flatMap((r) => r.metas);
      moderatorSays(
        atPlenary,
        round,
        phase,
        "contradiction_note",
        `Prüfung Runde ${round}: ${checked} Aussagen geprüft, ${cnt("verified")} bestätigt, ${cnt("unverified")} nicht bestätigt, ${cnt("contradicted")} widersprüchlich, ${cnt("assumption")} als Annahme geführt.${notes.length ? ` Widerspruch: ${notes.map((n) => n.note).join(" | ")}` : ""}`,
        `Check round ${round}: ${checked} claims checked, ${cnt("verified")} verified, ${cnt("unverified")} unverified, ${cnt("contradicted")} contradicted, ${cnt("assumption")} kept as assumptions.`,
        target,
        "expert",
        room.expertModel,
        metas[0]
          ? {
              ...metas[0],
              tokensIn: metas.reduce((x, m) => x + m.tokensIn, 0),
              tokensOut: metas.reduce((x, m) => x + m.tokensOut, 0),
            }
          : null,
      );
    }

    // Justification demands (FR-M4), at most two per round.
    if (!final) {
      const asked = new Set<string>();
      for (const c of [...s.claims.values()].filter(
        (c) => c.state === "assumption" && (c.kind === "numeric" || c.kind === "factual"),
      )) {
        const u = s.utterances.find((x) => x.id === c.utteranceId);
        if (!u || u.round !== round || asked.has(u.speaker) || asked.size >= 2) continue;
        asked.add(u.speaker);
        s.demands.set(u.speaker, { utteranceId: u.id, claim: c.atomicText });
        moderatorSays(
          { ...atPlenary, addressedTo: [u.speaker] },
          round,
          phase,
          "justification_demand",
          `Moderation an ${nameOf(u.speaker)}: Die Aussage "${c.atomicText}" ist ohne Beleg und wird als Annahme geführt. Bitte belegen Sie sie in der nächsten Runde oder kennzeichnen Sie sie als Annahme.`,
          `Moderator to ${u.speaker}: the statement "${c.atomicText}" has no source and is recorded as an assumption. Please support it next round or mark it as an assumption.`,
          u.id,
        );
      }
    }

    const { summary, meta: sumMeta } = await summaryJob;
    s.summaries.push(summary);
    moderatorSays(
      atPlenary,
      round,
      phase,
      "round_summary",
      summary.text.text,
      summary.text.translations.en ?? summary.text.text,
      null,
      "moderator",
      room.moderatorModel,
      sumMeta,
    );
    w.emit({ type: "round.summary", summary });
    closeExchange(plenary, plenaryOutcome(s, calculus.proposals, summary.text), clock);
    clock.gap();
    const lessons = await Promise.all(lessonJobs);
    for (const [i, l] of lessons.entries()) {
      const a = agentIds[i] as string;
      if (l instanceof Error) {
        w.emit({
          type: "agent.degraded",
          agentId: a,
          utteranceId: null,
          reason: `lesson failed: ${l.message.slice(0, 160)}`,
        });
        continue;
      }
      const { fallbackFrom: _from, ...lesson } = l;
      s.lessons.set(a, lesson);
      w.emit({ type: "lesson.recorded", lesson });
    }

    // End conditions (FR-M8).
    if (final) {
      endId = endId ?? (round >= room.roundLimit ? "max_rounds" : "convergence");
      break;
    }
    // Early end only after the compromise phase has run, so all five phases appear.
    const passing = calculus.proposals.some((r) => r.passes);
    stillRounds = maxShift < SHIFT ? stillRounds + 1 : 0;
    if (phase >= 4 && round < room.roundLimit - 1) {
      if (passing && stillRounds >= 1) {
        endId = "convergence";
        finalNext = true;
      } else if (!passing && stillRounds >= 2) {
        endId = "deadlock";
        finalNext = true;
      }
    }
  }

  // Outcome: impact figures (FR-N3, FR-U6) and forecasts (FR-J).
  const accepted = [...s.proposals.values()].filter((p) => p.status === "accepted");
  const measures = accepted.length
    ? accepted
    : [...s.proposals.values()]
        .filter((p) => p.status !== "withdrawn")
        .sort((a, b) => b.acceptance - a.acceptance)
        .slice(0, 1);
  const baseline = room.budgetCeiling.baselineEurBn ?? DEFAULT_BASELINE_EUR_BN;
  const baselineIsAssumption = room.budgetCeiling.baselineEurBn === null;
  const figures = [
    ...measures.flatMap((p) => proposalFigures(p, baseline, baselineIsAssumption)),
    ...packageFigures(measures, baseline, baselineIsAssumption, room.budgetCeiling.maxIncreasePct),
  ];
  w.emit({ type: "impact.computed", figures });
  const fc = await forecast(runId, mandate.question, room.asOf, measures);
  w.emit({
    type: "forecast.computed",
    forecasts: fc.forecasts,
    extractorVersion: fc.extractorVersion,
  });

  const openConflicts = s.summaries.at(-1)?.openConflicts.length ?? 0;
  // The named condition must match the outcome: a deadlock cannot end with an accepted package.
  let id = endId ?? "max_rounds";
  if (id === "deadlock" && accepted.length > 0) id = "max_rounds";
  if (id === "convergence" && accepted.length === 0) id = "deadlock";
  const noteDe =
    id === "max_rounds"
      ? `Rundenlimit ${room.roundLimit} erreicht; ${accepted.length} Vorschläge angenommen, ${openConflicts} Konflikte offen`
      : id === "convergence"
        ? `Konvergenz nach Runde ${lastRound}; ${accepted.length} Vorschläge angenommen, ${openConflicts} Konflikte offen`
        : `Blockade: keine Bewegung und kein tragfähiger Vorschlag; ${openConflicts} Konflikte offen`;
  const noteEn =
    id === "max_rounds"
      ? `Round limit ${room.roundLimit} reached; ${accepted.length} proposals accepted, ${openConflicts} conflicts open`
      : id === "convergence"
        ? `Convergence after round ${lastRound}; ${accepted.length} proposals accepted, ${openConflicts} conflicts open`
        : `Deadlock: no movement and no viable proposal; ${openConflicts} conflicts open`;
  tracer.flush();
  w.emit({ type: "run.completed", endCondition: { id, note: L(noteDe, noteEn) } });
  const { db } = await w.close();
  const u = {
    calls: usage.calls - usage0.calls,
    tokensIn: usage.tokensIn - usage0.tokensIn,
    tokensOut: usage.tokensOut - usage0.tokensOut,
    reasoningTokens: usage.reasoningTokens - usage0.reasoningTokens,
  };
  return {
    runId,
    file: w.file,
    events: w.events,
    durationMs: Math.round(performance.now() - started),
    usage: u,
    db,
  };
}

/** Outcome sentence of the closing plenary: the vote tally, else the summary's first sentence. */
function plenaryOutcome(
  s: RunState,
  rows: NonNullable<RunState["calculus"]>["proposals"],
  summary: { text: string; translations: { en?: string } },
): { de: string; en: string } {
  const open = rows.filter((r) => s.proposals.has(r.proposalId));
  if (open.length) {
    const de = open
      .map((r) => {
        const st = s.proposals.get(r.proposalId)?.status;
        const tallyDe = `${r.supporters.length} dafür, ${r.conditional.length} bedingt, ${r.opponents.length} dagegen`;
        const verdict =
          st === "accepted"
            ? "angenommen"
            : st === "rejected"
              ? "abgelehnt"
              : r.passes
                ? "mehrheitsfähig"
                : r.blockers.length
                  ? `blockiert durch ${r.blockers.map(nameOf).join(", ")}`
                  : "noch nicht mehrheitsfähig";
        return `${r.proposalId} ${verdict} (${tallyDe})`;
      })
      .join("; ");
    const en = open
      .map(
        (r) =>
          `${r.proposalId}: ${r.supporters.length} for, ${r.conditional.length} conditional, ${r.opponents.length} against${r.passes ? ", passes" : r.blockers.length ? `, blocked by ${r.blockers.join(", ")}` : ""}`,
      )
      .join("; ");
    return { de: `Abstimmung: ${de}.`, en: `Vote: ${en}.` };
  }
  const first = (t: string) => (t.match(/^.*?[.!?](\s|$)/)?.[0] ?? t).trim();
  return { de: first(summary.text), en: first(summary.translations.en ?? summary.text) };
}

/** Rewrites runId fields inside copied fork events. */
function retag(e: RunEvent, runId: string): RunEvent {
  const json = JSON.parse(JSON.stringify(e)) as Record<string, unknown>;
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.runId === "string") o.runId = runId;
      for (const x of Object.values(o)) walk(x);
    }
  };
  walk(json);
  return json as unknown as RunEvent;
}

export type { StrategicAssessment, TurnOut };
