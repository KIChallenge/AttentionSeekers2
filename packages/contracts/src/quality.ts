import { z } from "zod";
import { LocalizedText, ModelId, SpeakerId, UtteranceId } from "./primitives.ts";

// Debate quality (added 2026-11-06, additive only).
// 1. Turn gate: cheap deterministic checks run before an utterance is committed; a failed
//    relevance, repetition, register or negotiation check regenerates the turn once with
//    the reason in the prompt, then the turn is accepted and flagged (Utterance.gate).
// 2. Moderation gate: agenda items off the mandate are refused, exchanges that stop
//    producing new arguments are closed early (RunEvent "moderation.gate").
// 3. Audit: an offline report per run (runs/<runId>.quality.json) scored by a judge of the
//    other model family plus the same deterministic checks.

export const GateCheckId = z.enum([
  "relevance",
  "repetition",
  "register",
  "negotiation",
  "con",
  "grounding",
]);
export type GateCheckId = z.infer<typeof GateCheckId>;

export const GateCheck = z.object({
  check: GateCheckId,
  passed: z.boolean(),
  /** Short German or English reason, shown to engineers and fed back on regeneration. */
  reason: z.string().nullable(),
  /** Metric behind the decision (overlap share, similarity), when there is one. */
  value: z.number().nullable().optional(),
});
export type GateCheck = z.infer<typeof GateCheck>;

export const GateDecision = z.object({
  /** accepted: first draft passed; regenerated: second draft passed; flagged: kept despite a failed check. */
  action: z.enum(["accepted", "regenerated", "flagged"]),
  /** Checks of the first draft. */
  first: z.array(GateCheck),
  /** Checks of the regenerated draft (only when regenerated or flagged after a retry). */
  retry: z.array(GateCheck).optional(),
  /** First-draft text when it was replaced, so the inspector can show what the gate caught. */
  rejectedText: z.string().optional(),
});
export type GateDecision = z.infer<typeof GateDecision>;

export const ModerationGateKind = z.enum([
  /** A planned exchange or agenda item outside the mandate's topics was refused. */
  "agenda_refused",
  /** An exchange stopped producing new arguments and was closed before its planned end. */
  "exchange_closed_early",
  /** A negotiation-phase turn had neither a concrete proposal nor a justified objection. */
  "concrete_demand",
]);
export type ModerationGateKind = z.infer<typeof ModerationGateKind>;

export const ModerationGate = z.object({
  round: z.number().int().min(1),
  kind: ModerationGateKind,
  exchangeId: z.string().nullable(),
  topicId: z.string().nullable(),
  utteranceId: UtteranceId.nullable(),
  reason: LocalizedText,
});
export type ModerationGate = z.infer<typeof ModerationGate>;

// ---------- audit report ----------

export const QualityDimension = z.enum([
  "relevanceMandate",
  "relevanceExchange",
  "responsiveness",
  "grounding",
  "repetition",
  "consistency",
  "register",
  "con",
]);
export type QualityDimension = z.infer<typeof QualityDimension>;

/** 0..1 per dimension (1 = no problem); null when the dimension does not apply. */
export const QualityScores = z.record(QualityDimension, z.number().min(0).max(1).nullable());
export type QualityScores = z.infer<typeof QualityScores>;

export const UtteranceQuality = z.object({
  utteranceId: UtteranceId,
  speaker: SpeakerId,
  round: z.number().int(),
  exchangeId: z.string().nullable(),
  model: ModelId,
  judgeModel: ModelId.nullable(),
  scores: QualityScores,
  /** Mean of the applicable dimensions. */
  overall: z.number().min(0).max(1),
  flags: z.array(
    z.object({
      dimension: QualityDimension,
      source: z.enum(["deterministic", "judge"]),
      severity: z.enum(["minor", "major"]),
      reason: z.string(),
    }),
  ),
});
export type UtteranceQuality = z.infer<typeof UtteranceQuality>;

export const QualityAggregate = z.object({
  key: z.string(),
  n: z.number().int(),
  overall: z.number(),
  scores: z.record(z.string(), z.number().nullable()),
  flagged: z.number().int(),
});
export type QualityAggregate = z.infer<typeof QualityAggregate>;

export const QualityReport = z.object({
  runId: z.string(),
  generatedAt: z.string(),
  rubricVersion: z.string(),
  judge: z.object({
    models: z.array(ModelId),
    rule: z.string(),
    settings: z.string(),
    calls: z.number().int(),
    failed: z.number().int(),
    tokensIn: z.number().int(),
    tokensOut: z.number().int(),
    costUsd: z.number(),
  }),
  overall: QualityAggregate,
  byAgent: z.array(QualityAggregate),
  byRound: z.array(QualityAggregate),
  byExchange: z.array(QualityAggregate),
  byModel: z.array(QualityAggregate),
  utterances: z.array(UtteranceQuality),
  /** Gate decisions recorded in the run (empty for runs before the gate existed). */
  gates: z.object({
    turns: z.number().int(),
    regenerated: z.number().int(),
    flagged: z.number().int(),
    moderation: z.array(ModerationGate),
  }),
});
export type QualityReport = z.infer<typeof QualityReport>;
