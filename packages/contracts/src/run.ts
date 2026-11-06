import { z } from "zod";
import { AgentConfig, Axis, Topic } from "./agents.ts";
import { AgentId, IsoDate, Lang, LocalizedText, ModelId, SpeakerId } from "./primitives.ts";
import { OutcomeClass } from "./proposals.ts";
import { Climate, DecisionRule, RoomConfig, Template } from "./room.ts";

// Mandate and run (FR-M1..M3, M8, X1, X2, K1, K2, V1, H2)

export const Mandate = z.object({
  question: z.string(),
  lang: Lang,
  objective: LocalizedText,
  constraints: z.array(LocalizedText),
  successMetrics: z.array(LocalizedText),
  topics: z.array(Topic),
  axes: z.tuple([Axis, Axis]),
  /** FR-M2: why each actor is seated. */
  actors: z.array(z.object({ agentId: AgentId, reason: LocalizedText })),
  rules: z.object({
    rounds: z.number().int().min(1).max(8),
    speakingOrder: z.literal("randomised_recorded"),
    seed: z.number().int(),
  }),
  asOf: IsoDate,
  coldRatification: z.boolean(),
  /** Added 2026-11-05 (engine): rules of the room restated in the mandate (FR-M1, FR-U10). */
  decisionRule: DecisionRule.optional(),
  budgetCeilingPct: z.number().optional(),
  climate: Climate.optional(),
  /** Added 2026-11-05 (engine): end conditions the moderator will enforce (FR-M8). */
  endConditions: z.array(LocalizedText).optional(),
});
export type Mandate = z.infer<typeof Mandate>;

export const RunVariant = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("baseline") }),
  z.object({ kind: z.literal("permutation"), k: z.number().int(), baseRunId: z.string() }),
  z.object({ kind: z.literal("ablation_remove"), agentId: AgentId, baseRunId: z.string() }),
  z.object({
    kind: z.literal("ablation_constraint"),
    agentId: AgentId,
    constraint: z.string(),
    from: z.string(),
    to: z.string(),
    baseRunId: z.string(),
  }),
  z.object({ kind: z.literal("no_peer_control"), baseRunId: z.string() }),
  z.object({
    kind: z.literal("fork"),
    baseRunId: z.string(),
    fromRound: z.number().int(),
    edit: z.object({
      agentId: AgentId,
      removeSegmentIds: z.array(z.string()),
      addSegmentIds: z.array(z.string()),
    }),
  }),
  z.object({ kind: z.literal("backtest"), episodeId: z.string() }),
  /**
   * Added 2026-11-06 (model ensemble, FR-X2 to FR-X4): the same question re-run under a named
   * model-to-seat assignment. `label` names the assignment (for example all_gpt, all_nova,
   * mixed, swapped); the per-seat ids stay in Run.modelAssignment.
   */
  z.object({
    kind: z.literal("model_ensemble"),
    label: z.string(),
    baseRunId: z.string().nullable(),
  }),
  /**
   * Added 2026-11-06 (scenario variants): the same question under a changed room setting
   * (decision rule, budget ceiling, climate). `label` names the variant (for example
   * budget_tight); the settings themselves stay in Run.room.
   */
  z.object({
    kind: z.literal("scenario"),
    label: z.string(),
    baseRunId: z.string().nullable(),
  }),
]);
export type RunVariant = z.infer<typeof RunVariant>;

export const EndCondition = z.object({
  id: z.enum(["convergence", "max_rounds", "deadlock", "aborted"]),
  note: LocalizedText,
});
export type EndCondition = z.infer<typeof EndCondition>;

export const Run = z.object({
  id: z.string(),
  createdAt: z.string(),
  mandate: Mandate,
  /** Setup-room settings, recorded so replay reproduces them (FR-U10). */
  room: RoomConfig,
  variant: RunVariant,
  /** Snapshot, so later config edits do not rewrite history. */
  agents: z.array(AgentConfig),
  modelAssignment: z.record(SpeakerId, ModelId),
  status: z.enum(["running", "completed", "failed"]),
  endCondition: EndCondition.nullable(),
  isReference: z.boolean().default(false),
});
export type Run = z.infer<typeof Run>;

/** Dashboard card (FR-U11). Derived by summarizeRun(snapshot). */
export const RunSummary = z.object({
  id: z.string(),
  question: z.string(),
  template: Template,
  createdAt: z.string(),
  variantKind: z.string(),
  status: z.enum(["running", "completed", "failed"]),
  outcomeBadge: z.union([OutcomeClass, z.literal("running"), z.literal("failed")]),
  /** Topics with consensus or majority, out of all topics. */
  agreementShare: z.object({ agreed: z.number().int(), of: z.number().int() }),
  movedMost: z.object({ agentId: AgentId, pathLength: z.number() }).nullable(),
  durationMs: z.number().int(),
  roundsCompleted: z.number().int(),
  roundLimit: z.number().int(),
  agents: z.array(AgentId),
  models: z.array(ModelId),
  acceptedProposals: z.number().int(),
  rejectedProposals: z.number().int(),
  isReference: z.boolean(),
  endCondition: EndCondition.shape.id.nullable(),
});
export type RunSummary = z.infer<typeof RunSummary>;
