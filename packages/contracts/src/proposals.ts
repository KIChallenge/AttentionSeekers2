import { z } from "zod";
import { AgentId, LocalizedText } from "./primitives.ts";

// Rounds and proposals (FR-M6, M7, R2, R3, R4, O2)

export const OutcomeClass = z.enum(["consensus", "majority", "minority", "no_result"]);
export type OutcomeClass = z.infer<typeof OutcomeClass>;

export const RoundSummary = z.object({
  round: z.number().int(),
  /** Listed first in the UI (FR-M6). */
  openConflicts: z.array(
    z.object({
      topicId: z.string(),
      sides: z.tuple([z.array(AgentId), z.array(AgentId)]),
      boundBy: z.array(z.string()),
      note: LocalizedText,
    }),
  ),
  consensus: z.array(
    z.object({
      topicId: z.string(),
      share: z.tuple([z.number().int(), z.number().int()]),
      note: LocalizedText,
    }),
  ),
  failedProposals: z.array(z.object({ proposalId: z.string(), reason: LocalizedText })),
  newOptions: z.array(LocalizedText),
  text: LocalizedText,
  /** Added 2026-11-05 (engine): concrete recommendations, set on the final summary (FR-O3). */
  recommendations: z
    .array(
      z.object({
        text: LocalizedText,
        priority: z.enum(["high", "medium", "low"]),
        proposalIds: z.array(z.string()),
      }),
    )
    .optional(),
});
export type RoundSummary = z.infer<typeof RoundSummary>;

export const Proposal = z.object({
  id: z.string(),
  originAgent: AgentId,
  /** Round in which the proposal was tabled. */
  round: z.number().int().min(1),
  topicIds: z.array(z.string()),
  title: LocalizedText,
  cost: z
    .object({ value: z.number(), low: z.number(), high: z.number(), unit: z.string() })
    .nullable(),
  acceptance: z.number().min(0).max(1),
  feasibility: z.number().min(0).max(1),
  supporters: z.array(AgentId),
  opponents: z.array(AgentId),
  conditional: z.array(AgentId),
  status: z.enum(["open", "accepted", "rejected", "withdrawn"]),
  /** Kept with the reason (FR-R4). */
  rejectionReason: LocalizedText.nullable(),
  outcomeClass: OutcomeClass.nullable(),
  /** Id of the proposal this one is an alternative to. */
  alternativeTo: z.string().nullable().default(null),
  /** Added 2026-11-05 (engine): latest vote per agent with its stated reason or condition. */
  votes: z
    .array(
      z.object({
        agentId: AgentId,
        vote: z.enum(["support", "conditional", "oppose"]),
        reason: LocalizedText,
        round: z.number().int(),
      }),
    )
    .optional(),
});
export type Proposal = z.infer<typeof Proposal>;
