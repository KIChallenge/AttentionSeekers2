import { z } from "zod";
import { LocalizedText, ModelId, SpeakerId, UtteranceId } from "./primitives.ts";
import { GateDecision } from "./quality.ts";
import { Telemetry } from "./traces.ts";

// Utterances (FR-U1, A4, A5, M4, NFR-9)

export const UtteranceKind = z.enum([
  "round_opening",
  "position",
  "rebuttal",
  "proposal",
  "position_shift",
  "justification_demand",
  "contradiction_note",
  "event_injection",
  "round_summary",
  "closing",
]);
export type UtteranceKind = z.infer<typeof UtteranceKind>;

export const Utterance = z.object({
  id: UtteranceId,
  round: z.number().int().min(1),
  /** Position within the whole run, 1-based. */
  seq: z.number().int(),
  phase: z.number().int().min(1).max(5),
  speaker: SpeakerId,
  kind: UtteranceKind,
  /** Required for agents after round 1 (enforced in the engine). */
  respondsTo: UtteranceId.nullable(),
  text: LocalizedText,
  claimIds: z.array(z.string()),
  redLinesTouched: z.array(z.string()),
  proposalIds: z.array(z.string()).default([]),
  model: ModelId,
  telemetry: Telemetry.nullable(),
  /** Engineer strip. */
  deliberationSummary: z
    .object({ read: z.string(), weighed: z.string(), wouldMoveIt: z.string() })
    .nullable(),
  /** NFR-9 visible marker. */
  degraded: z.object({ reason: z.string() }).nullable(),
  /** Exchange this utterance belongs to (bilateral, caucus or plenary sequence). */
  exchangeId: z.string().optional(),
  /** Which delegate of the institution speaks: a fictional, unnamed functional role (CON-1). */
  delegateId: z.string().optional(),
  /** Speakers this utterance is addressed to; empty means the whole table. */
  addressedTo: z.array(SpeakerId).optional(),
  /** Simulated meeting time for the timeline, from the start of the run. */
  timing: z.object({ startMin: z.number().min(0), durationMin: z.number().positive() }).optional(),
  /** Turn quality gate (added 2026-11-06): checks run before the turn was committed. */
  gate: GateDecision.optional(),
});
export type Utterance = z.infer<typeof Utterance>;

/**
 * An exchange is a focused back-and-forth inside a round: two or three institutions on one
 * conflict (bilateral), a coalition preparing a joint line (caucus), or the full table
 * (plenary). The moderator opens it from a conflict or proposal and closes it with an outcome.
 */
export const ExchangeKind = z.enum(["plenary", "bilateral", "caucus"]);
export const Exchange = z.object({
  id: z.string(),
  round: z.number().int().min(1),
  phase: z.number().int().min(1).max(5),
  kind: ExchangeKind,
  participants: z.array(SpeakerId).min(1),
  topicId: z.string().nullable(),
  /** Why the moderator opened it: conflict id, proposal id or free text. */
  trigger: LocalizedText,
  utteranceIds: z.array(UtteranceId),
  outcome: LocalizedText.nullable(),
  startMin: z.number().min(0).optional(),
  endMin: z.number().min(0).optional(),
});
export type Exchange = z.infer<typeof Exchange>;
