import type { Position } from "./agents.ts";
import type { Claim } from "./claims.ts";
import type { RunEvent } from "./events.ts";
import type { Forecast, ImpactFigure, RatificationVote } from "./outcome.ts";
import type { AgentId, LocalizedText, ModelId, SpeakerId } from "./primitives.ts";
import type { OutcomeClass, Proposal, RoundSummary } from "./proposals.ts";
import type { ScheduledEvent } from "./room.ts";
import type { EndCondition, Run, RunSummary } from "./run.ts";
import type {
  CoalitionCalculus,
  LessonApplication,
  RoundLesson,
  StrategicAssessment,
} from "./strategy.ts";
import type { UtteranceTrace } from "./traces.ts";
import type { Exchange, Utterance } from "./utterance.ts";

// foldRun: the one place where an event changes the screen. Pure, JSON-serialisable
// state, shared by the server (snapshots of finished runs) and the client (streaming).

export interface RoundState {
  round: number;
  phase: number;
  speakingOrder: AgentId[];
  startedAtMs: number;
  utteranceIds: string[];
  injectedEvents: ScheduledEvent[];
}

export interface PendingUtterance {
  utteranceId: string;
  speaker: SpeakerId;
  round: number;
  respondsTo: string | null;
  model: ModelId;
  text: string;
}

export interface RunSnapshot {
  runId: string | null;
  run: Run | null;
  source: "live" | "replay" | null;
  status: "idle" | "running" | "completed" | "failed";
  lastSeq: number;
  lastTMs: number;
  currentRound: number;
  currentPhase: number;
  rounds: RoundState[];
  /** Completed utterances in arrival order. */
  utteranceOrder: string[];
  utterances: Record<string, Utterance>;
  /** Started but not completed (streaming skeletons). */
  pending: Record<string, PendingUtterance>;
  claims: Record<string, Claim>;
  /** Client keeps only availability; the inspector fetches the trace by id. */
  traceAvailable: Record<string, true>;
  /** Filled only with { keepTraces: true } (server, bundle export). */
  traces: Record<string, UtteranceTrace>;
  /** positions[agentId][topicId] sorted by round. */
  positions: Record<string, Record<string, Position[]>>;
  proposalOrder: string[];
  proposals: Record<string, Proposal>;
  summaries: RoundSummary[];
  expertNotes: Array<{
    seq: number;
    utteranceIds: string[];
    note: LocalizedText;
    resolution: "unresolved" | "resolved";
  }>;
  /** assessments[agentId] sorted by round. */
  assessments: Record<string, StrategicAssessment[]>;
  calculi: CoalitionCalculus[];
  lessons: RoundLesson[];
  /** Exchanges in opening order; closed ones carry their outcome. */
  exchanges: Exchange[];
  lessonApplications: LessonApplication[];
  degraded: Array<{ agentId: AgentId; utteranceId: string | null; reason: string }>;
  figures: ImpactFigure[];
  forecasts: Forecast[];
  extractorVersion: string | null;
  votes: Record<string, RatificationVote>;
  activeSpeaker: SpeakerId | null;
  endCondition: EndCondition | null;
  error: { message: string; retryable: boolean } | null;
}

export class RunSequenceError extends Error {
  readonly expected: number;
  readonly got: number;
  constructor(expected: number, got: number) {
    super(`RunEvent out of order: expected seq ${expected}, got ${got}`);
    this.name = "RunSequenceError";
    this.expected = expected;
    this.got = got;
  }
}

export interface ReduceOptions {
  keepTraces?: boolean;
}

export function emptySnapshot(): RunSnapshot {
  return {
    runId: null,
    run: null,
    source: null,
    status: "idle",
    lastSeq: -1,
    lastTMs: 0,
    currentRound: 0,
    currentPhase: 0,
    rounds: [],
    utteranceOrder: [],
    utterances: {},
    pending: {},
    claims: {},
    traceAvailable: {},
    traces: {},
    positions: {},
    proposalOrder: [],
    proposals: {},
    summaries: [],
    expertNotes: [],
    assessments: {},
    calculi: [],
    lessons: [],
    exchanges: [],
    lessonApplications: [],
    degraded: [],
    figures: [],
    forecasts: [],
    extractorVersion: null,
    votes: {},
    activeSpeaker: null,
    endCondition: null,
    error: null,
  };
}

const byRound = <T extends { round: number }>(a: T, b: T) => a.round - b.round;

function upsertByRound<T extends { round: number }>(list: T[] | undefined, item: T): T[] {
  const next = (list ?? []).filter((x) => x.round !== item.round);
  next.push(item);
  return next.sort(byRound);
}

function withClaims(map: Record<string, Claim>, claims: Claim[]): Record<string, Claim> {
  if (claims.length === 0) return map;
  const next = { ...map };
  for (const c of claims) next[c.id] = c;
  return next;
}

/**
 * Applies one event. Duplicates (seq <= lastSeq) are ignored so a reconnect with
 * ?from= can overlap safely; a gap throws RunSequenceError.
 */
export function reduceRun(s: RunSnapshot, e: RunEvent, opts: ReduceOptions = {}): RunSnapshot {
  if (e.seq <= s.lastSeq) return s;
  if (e.seq !== s.lastSeq + 1) throw new RunSequenceError(s.lastSeq + 1, e.seq);
  if (s.runId !== null && e.runId !== s.runId) {
    throw new Error(`RunEvent for run ${e.runId} applied to snapshot of ${s.runId}`);
  }
  const base: RunSnapshot = { ...s, lastSeq: e.seq, lastTMs: e.tMs, runId: e.runId };

  switch (e.type) {
    case "run.started":
      return { ...base, run: e.run, source: e.source, status: "running" };

    case "round.started":
      return {
        ...base,
        currentRound: e.round,
        currentPhase: e.phase,
        activeSpeaker: null,
        rounds: upsertByRound(base.rounds, {
          round: e.round,
          phase: e.phase,
          speakingOrder: e.speakingOrder,
          startedAtMs: e.tMs,
          utteranceIds: [],
          injectedEvents: [],
        }),
      };

    case "room.event_injected":
      return {
        ...base,
        rounds: base.rounds.map((r) =>
          r.round === e.round ? { ...r, injectedEvents: [...r.injectedEvents, e.event] } : r,
        ),
      };

    case "utterance.started":
      return {
        ...base,
        activeSpeaker: e.speaker,
        pending: {
          ...base.pending,
          [e.utteranceId]: {
            utteranceId: e.utteranceId,
            speaker: e.speaker,
            round: e.round,
            respondsTo: e.respondsTo,
            model: e.model,
            text: "",
          },
        },
      };

    case "utterance.delta": {
      const p = base.pending[e.utteranceId];
      if (!p) return base;
      return {
        ...base,
        pending: { ...base.pending, [e.utteranceId]: { ...p, text: p.text + e.text } },
      };
    }

    case "utterance.completed": {
      const u = e.utterance;
      const { [u.id]: _done, ...pending } = base.pending;
      const known = u.id in base.utterances;
      return {
        ...base,
        pending,
        activeSpeaker: null,
        utterances: { ...base.utterances, [u.id]: u },
        utteranceOrder: known ? base.utteranceOrder : [...base.utteranceOrder, u.id],
        claims: withClaims(base.claims, e.claims),
        rounds: known
          ? base.rounds
          : base.rounds.map((r) =>
              r.round === u.round ? { ...r, utteranceIds: [...r.utteranceIds, u.id] } : r,
            ),
      };
    }

    case "utterance.trace":
      return {
        ...base,
        traceAvailable: { ...base.traceAvailable, [e.trace.utteranceId]: true },
        traces: opts.keepTraces ? { ...base.traces, [e.trace.utteranceId]: e.trace } : base.traces,
      };

    case "claim.updated":
      return { ...base, claims: withClaims(base.claims, [e.claim]) };

    case "expert.note":
      return {
        ...base,
        expertNotes: [
          ...base.expertNotes,
          { seq: e.seq, utteranceIds: e.utteranceIds, note: e.note, resolution: e.resolution },
        ],
      };

    case "position.updated": {
      const p = e.position;
      const agent = base.positions[p.agentId] ?? {};
      return {
        ...base,
        positions: {
          ...base.positions,
          [p.agentId]: { ...agent, [p.topicId]: upsertByRound(agent[p.topicId], p) },
        },
      };
    }

    case "proposal.updated": {
      const p = e.proposal;
      const known = p.id in base.proposals;
      return {
        ...base,
        proposals: { ...base.proposals, [p.id]: p },
        proposalOrder: known ? base.proposalOrder : [...base.proposalOrder, p.id],
      };
    }

    case "strategy.assessed": {
      const a = e.assessment;
      return {
        ...base,
        assessments: {
          ...base.assessments,
          [a.agentId]: upsertByRound(base.assessments[a.agentId], a),
        },
      };
    }

    case "coalition.computed":
      return { ...base, calculi: upsertByRound(base.calculi, e.calculus) };

    case "round.summary":
      return { ...base, summaries: upsertByRound(base.summaries, e.summary) };

    case "exchange.opened":
    case "exchange.closed":
      return {
        ...base,
        exchanges: base.exchanges.some((x) => x.id === e.exchange.id)
          ? base.exchanges.map((x) => (x.id === e.exchange.id ? e.exchange : x))
          : [...base.exchanges, e.exchange],
      };

    case "lesson.recorded":
      return {
        ...base,
        lessons: [
          ...base.lessons.filter(
            (l) => !(l.agentId === e.lesson.agentId && l.round === e.lesson.round),
          ),
          e.lesson,
        ],
      };

    case "lesson.applied":
      return { ...base, lessonApplications: [...base.lessonApplications, e.application] };

    case "agent.degraded":
      return {
        ...base,
        degraded: [
          ...base.degraded,
          { agentId: e.agentId, utteranceId: e.utteranceId, reason: e.reason },
        ],
      };

    case "translation.ready": {
      const utterances = { ...base.utterances };
      for (const id of e.utteranceIds) {
        const u = utterances[id];
        const text = e.texts[id];
        if (!u || text === undefined) continue;
        utterances[id] = {
          ...u,
          text: { ...u.text, translations: { ...u.text.translations, [e.lang]: text } },
        };
      }
      return { ...base, utterances };
    }

    case "impact.computed":
      return { ...base, figures: e.figures };

    case "forecast.computed":
      return { ...base, forecasts: e.forecasts, extractorVersion: e.extractorVersion };

    case "ratification.vote":
      return { ...base, votes: { ...base.votes, [e.vote.agentId]: e.vote } };

    case "run.completed":
      return {
        ...base,
        status: "completed",
        activeSpeaker: null,
        endCondition: e.endCondition,
        run: base.run ? { ...base.run, status: "completed", endCondition: e.endCondition } : null,
      };

    case "run.error":
      return {
        ...base,
        status: e.retryable ? base.status : "failed",
        error: { message: e.message, retryable: e.retryable },
      };

    case "heartbeat":
      return base;
  }
}

/** Folds a whole event list (finished run or replay prefix) into a snapshot. */
export function foldRun(events: Iterable<RunEvent>, opts: ReduceOptions = {}): RunSnapshot {
  let s = emptySnapshot();
  for (const e of events) s = reduceRun(s, e, opts);
  return s;
}

// ---------- derived reads ----------

/** Latest position of an agent on a topic at or before a round (default: latest). */
export function positionAt(
  s: RunSnapshot,
  agentId: string,
  topicId: string,
  round = Number.POSITIVE_INFINITY,
): Position | null {
  const list = s.positions[agentId]?.[topicId] ?? [];
  let found: Position | null = null;
  for (const p of list) if (p.round <= round) found = p;
  return found;
}

/** Sum of |stance change| between consecutive rounds over all topics (FR-U4 "who moved"). */
export function pathLength(s: RunSnapshot, agentId: string): number {
  let total = 0;
  for (const list of Object.values(s.positions[agentId] ?? {})) {
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1];
      const b = list[i];
      if (a && b) total += Math.abs(b.stance - a.stance);
    }
  }
  return Math.round(total * 100) / 100;
}

export const SUPPORT_THRESHOLD = 0.5;

/**
 * FR-O2 rule per topic: consensus = nobody opposes and at most one abstains;
 * majority = more than half support; minority = some support; else no_result.
 */
export function topicStatus(
  s: RunSnapshot,
  topicId: string,
  round = Number.POSITIVE_INFINITY,
): { status: OutcomeClass; support: number; oppose: number; of: number } {
  const agents = s.run?.agents.map((a) => a.id) ?? Object.keys(s.positions);
  let support = 0;
  let oppose = 0;
  let of = 0;
  for (const id of agents) {
    const p = positionAt(s, id, topicId, round);
    if (!p) continue;
    of++;
    if (p.stance >= SUPPORT_THRESHOLD) support++;
    else if (p.stance <= -SUPPORT_THRESHOLD) oppose++;
  }
  let status: OutcomeClass = "no_result";
  if (of > 0 && oppose === 0 && support >= of - 1) status = "consensus";
  else if (support > of / 2) status = "majority";
  else if (support > 0) status = "minority";
  return { status, support, oppose, of };
}

/** Dashboard card for a run (FR-U11). */
export function summarizeRun(s: RunSnapshot): RunSummary {
  const run = s.run;
  if (!run) throw new Error("summarizeRun needs a snapshot that saw run.started");
  const topics = run.mandate.topics;
  const agreed = topics.filter((t) => {
    const st = topicStatus(s, t.id).status;
    return st === "consensus" || st === "majority";
  }).length;
  let movedMost: RunSummary["movedMost"] = null;
  for (const a of run.agents) {
    const len = pathLength(s, a.id);
    if (!movedMost || len > movedMost.pathLength) movedMost = { agentId: a.id, pathLength: len };
  }
  const proposals = s.proposalOrder.map((id) => s.proposals[id]).filter((p) => p !== undefined);
  const accepted = proposals.filter((p) => p.status === "accepted");
  const rank: Record<OutcomeClass, number> = {
    consensus: 3,
    majority: 2,
    minority: 1,
    no_result: 0,
  };
  let badge: RunSummary["outcomeBadge"] =
    s.status === "running" || s.status === "idle"
      ? "running"
      : s.status === "failed"
        ? "failed"
        : "no_result";
  if (s.status === "completed") {
    // the package is the accepted proposal touching the most topics
    const pkg = [...accepted].sort((a, b) => b.topicIds.length - a.topicIds.length)[0];
    if (pkg?.outcomeClass) badge = pkg.outcomeClass;
    else if (accepted.length > 0)
      badge = accepted
        .map((p) => p.outcomeClass ?? "no_result")
        .sort((a, b) => rank[b] - rank[a])[0] as OutcomeClass;
  }
  const models = [...new Set(Object.values(run.modelAssignment))];
  return {
    id: run.id,
    question: run.mandate.question,
    template: run.room.template,
    createdAt: run.createdAt,
    variantKind: run.variant.kind,
    status: s.status === "idle" ? "running" : s.status,
    outcomeBadge: badge,
    agreementShare: { agreed, of: topics.length },
    movedMost,
    durationMs: s.lastTMs,
    roundsCompleted: s.summaries.length,
    roundLimit: run.room.roundLimit,
    agents: run.agents.map((a) => a.id),
    models,
    acceptedProposals: accepted.length,
    rejectedProposals: proposals.filter((p) => p.status === "rejected").length,
    isReference: run.isReference,
    endCondition: s.endCondition?.id ?? null,
  };
}
