import { z } from "zod";
import { OutcomeDescriptor } from "./descriptor.ts";
import { CitationRef } from "./evidence.ts";
import { AgentId, LocalizedText } from "./primitives.ts";

// Numbers on the outcome page, kept as separate types on purpose.

export const ImpactFigure = z.object({
  measureId: z.string(),
  metric: z.enum([
    "cost_eur_pa",
    "sv_spend_pp",
    "wait_weeks_median",
    "wait_change_pct",
    "posts_filled",
  ]),
  value: z.number().nullable(),
  low: z.number().nullable(),
  high: z.number().nullable(),
  unit: z.string(),
  inputs: z.array(
    z.object({
      name: LocalizedText,
      value: z.string(),
      citation: CitationRef.nullable(),
      assumption: z.boolean(),
    }),
  ),
  formula: z.string(),
  uncertainty: LocalizedText,
  modelVersion: z.string(),
  notModelled: z.boolean(),
});
export type ImpactFigure = z.infer<typeof ImpactFigure>;

export const Forecast = z.object({
  measureId: z.string(),
  status: z.enum(["ok", "small_n", "unavailable"]),
  descriptor: OutcomeDescriptor.nullable(),
  classKey: z.string(),
  n: z.number().int(),
  /** Null when small_n (FR-J3). */
  k: z.number().int().nullable(),
  interval: z
    .object({
      low: z.number(),
      high: z.number(),
      method: z.enum(["wilson", "jeffreys"]),
      level: z.number(),
    })
    .nullable(),
  /** k analogs, never one. */
  analogs: z.array(
    z.object({
      caseId: z.string(),
      episodeId: z.string(),
      similarity: z.number(),
      outcome: z.string(),
    }),
  ),
});
export type Forecast = z.infer<typeof Forecast>;

export const RatificationVote = z.object({
  agentId: AgentId,
  verdict: z.enum(["approve", "approve_with_reservation", "reject"]),
  reason: LocalizedText,
  /** FR-V5 */
  pressureGap: z.boolean(),
});
export type RatificationVote = z.infer<typeof RatificationVote>;

/** Provisional shape; confirm with the forecasting track (forecasting/data/method_note.json). */
export const MethodNote = z.object({
  version: z.string(),
  brier: z.object({
    model: z.number().nullable(),
    statusQuo: z.number().nullable(),
    n: z.number().int(),
  }),
  classSizes: z.record(z.string(), z.number().int()),
  ablationVerdict: LocalizedText,
  regimeCaveat: LocalizedText,
  extractorVersion: z.string(),
});
export type MethodNote = z.infer<typeof MethodNote>;
