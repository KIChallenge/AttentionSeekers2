import { z } from "zod";
import { CitationRef } from "./evidence.ts";
import { AgentId, LocalizedText, PayoffSign, UtteranceId } from "./primitives.ts";
import { DecisionRule } from "./room.ts";

// Game-theoretic layer: FR-A8, FR-A10 (per agent per round), FR-A11 (moderator),
// FR-R8 (round lessons).

export const VetoStatus = z.enum(["formal_veto", "co_decider", "consultative"]);
export type VetoStatus = z.infer<typeof VetoStatus>;

export const IncentiveDimension = z.enum([
  "cost",
  "revenue",
  "workload",
  "competence",
  "political_credit",
]);
export type IncentiveDimension = z.infer<typeof IncentiveDimension>;

export const Incentive = z.object({
  proposalId: z.string(),
  dimension: IncentiveDimension,
  sign: PayoffSign,
  magnitude: z.enum(["low", "medium", "high"]),
  note: LocalizedText,
  /** Null means stated as an assumption; the UI marks it so. */
  sourceRef: CitationRef.nullable(),
});
export type Incentive = z.infer<typeof Incentive>;

export const StrategicAssessment = z.object({
  runId: z.string(),
  agentId: AgentId,
  round: z.number().int().min(1),
  /** (a) strategic advantages and leverage. */
  leverage: z.array(z.object({ text: LocalizedText, sourceRef: CitationRef.nullable() })),
  /** (b) negotiation power. */
  vetoStatus: VetoStatus,
  vetoBasis: LocalizedText.nullable(),
  /** (b) what happens to this institution without agreement. */
  batna: z.object({
    text: LocalizedText,
    /** Desirability of no deal for this agent, -2..+2. */
    value: z.number().min(-2).max(2),
  }),
  /** (c) overlapping positions by topic. */
  coalitionOptions: z.array(
    z.object({
      withAgents: z.array(AgentId),
      topicIds: z.array(z.string()),
      overlap: z.number().min(0).max(1),
      note: LocalizedText,
    }),
  ),
  /** (d) whom this agent needs and who needs it. */
  dependencies: z.array(
    z.object({
      agentId: AgentId,
      direction: z.enum(["needs", "needed_by", "mutual"]),
      kind: z.enum([
        "financing",
        "competence",
        "self_governance",
        "legislation",
        "implementation",
        "other",
      ]),
      note: LocalizedText,
    }),
  ),
  /** (e) payoff per proposal, with sign and source. */
  incentives: z.array(Incentive),
  /** (f) */
  cooperationVsBlockade: z.object({
    lean: z.enum(["cooperate", "conditional", "block"]),
    blockadeRisk: z.number().min(0).max(1),
    reason: LocalizedText,
  }),
});
export type StrategicAssessment = z.infer<typeof StrategicAssessment>;

export const Coalition = z.object({
  id: z.string(),
  members: z.array(AgentId),
  topicIds: z.array(z.string()),
  kind: z.enum(["supporting", "blocking", "alignment"]),
  note: LocalizedText,
});
export type Coalition = z.infer<typeof Coalition>;

export const CoalitionCalculus = z.object({
  runId: z.string(),
  round: z.number().int().min(1),
  decisionRule: DecisionRule,
  /** Agents needed to pass a proposal under the rule, out of all seated agents. */
  quorum: z.object({ needed: z.number().int(), of: z.number().int() }),
  vetoPlayers: z.array(AgentId),
  proposals: z.array(
    z.object({
      proposalId: z.string(),
      supporters: z.array(AgentId),
      conditional: z.array(AgentId),
      opponents: z.array(AgentId),
      containsAllVetoPlayers: z.boolean(),
      missingVetoPlayers: z.array(AgentId),
      passes: z.boolean(),
      /** Who can block under the active rule. */
      blockers: z.array(AgentId),
      minimalWinningCoalitions: z.array(z.array(AgentId)),
      /** Incentive matrix row: agentId to payoff sign. */
      payoffs: z.record(AgentId, PayoffSign),
    }),
  ),
  coalitions: z.array(Coalition),
  /** Drives which compromise is tabled next. */
  nextTabled: z.object({ proposalId: z.string(), reason: LocalizedText }).nullable(),
});
export type CoalitionCalculus = z.infer<typeof CoalitionCalculus>;

export const RoundLesson = z.object({
  runId: z.string(),
  agentId: AgentId,
  /** The round the lesson was learned from; it feeds round + 1. */
  round: z.number().int().min(1),
  passed: z.array(z.string()),
  failed: z.array(z.string()),
  blockedBy: z.array(z.object({ agentId: AgentId, proposalId: z.string() })),
  implication: LocalizedText,
  nextMove: LocalizedText,
  redLineExpectations: z.array(
    z.object({
      agentId: AgentId,
      redLineId: z.string().nullable(),
      text: LocalizedText,
      confidence: z.number().min(0).max(1),
    }),
  ),
  /** Lessons from real historical episodes used as priors (FR-H7). */
  priorEpisodeIds: z.array(z.string()),
});
export type RoundLesson = z.infer<typeof RoundLesson>;

/** Inspector link from a lesson to a later utterance it changed (FR-R8). */
export const LessonApplication = z.object({
  agentId: AgentId,
  lessonRound: z.number().int().min(1),
  utteranceId: UtteranceId,
  note: LocalizedText,
});
export type LessonApplication = z.infer<typeof LessonApplication>;

/** Stable key for a lesson: "<agentId>@r<round>". */
export const lessonKey = (agentId: string, round: number) => `${agentId}@r${round}`;
