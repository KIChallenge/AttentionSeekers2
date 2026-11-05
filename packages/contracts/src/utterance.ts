import { z } from "zod";
import { LocalizedText, ModelId, SpeakerId, UtteranceId } from "./primitives.ts";
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
});
export type Utterance = z.infer<typeof Utterance>;
