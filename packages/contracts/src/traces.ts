import { z } from "zod";
import { CitationRef } from "./evidence.ts";
import { IsoDate, LocalizedText, ModelId, UtteranceId } from "./primitives.ts";

// Deliberation and traces (FR-T1..T7)

export const Deliberation = z.object({
  utteranceId: UtteranceId,
  sourcesRead: z.array(
    z.object({ ref: CitationRef, use: z.enum(["cited", "read_adverse", "read_not_cited"]) }),
  ),
  priorUtterances: z.array(
    z.object({ id: UtteranceId, relation: z.enum(["responds_to", "own", "context"]) }),
  ),
  /** Lessons (FR-R8) that were in context; keys are "<agentId>@r<round>". */
  lessonsUsed: z.array(z.string()).default([]),
  options: z.array(
    z.object({
      key: z.string(),
      label: LocalizedText,
      pros: z.array(LocalizedText),
      cons: z.array(LocalizedText),
      status: z.enum(["chosen", "rejected"]),
      rejectReason: LocalizedText.nullable(),
    }),
  ),
  decision: LocalizedText,
  wouldChangeMind: z.array(LocalizedText),
  providerTrace: z.object({
    available: z.boolean(),
    text: z.string().nullable(),
    note: z.string().nullable(),
  }),
  schemaVersion: z.literal(2),
});
export type Deliberation = z.infer<typeof Deliberation>;

export const Telemetry = z.object({
  model: ModelId,
  latencyMs: z.number(),
  tokensIn: z.number().int(),
  tokensOut: z.number().int(),
  costEur: z.number().nullable(),
  retries: z.number().int(),
  fallbackFrom: ModelId.nullable(),
  cacheHit: z.boolean(),
  gatewayRequestId: z.string().nullable(),
  /** Added 2026-11-05 (engine): reasoning tokens reported by the provider, when any. */
  reasoningTokens: z.number().int().optional(),
  params: z.object({
    temperature: z.number().nullable(),
    maxOutputTokens: z.number().nullable(),
    seed: z.number().nullable(),
  }),
});
export type Telemetry = z.infer<typeof Telemetry>;

export const PromptBlock = z.object({
  role: z.enum(["system", "user", "assistant"]),
  title: z.string(),
  tokens: z.number().int(),
  text: z.string(),
});
export type PromptBlock = z.infer<typeof PromptBlock>;

export const RetrievalTrace = z.object({
  query: z.string(),
  asOf: IsoDate,
  corpusRevision: z.string(),
  candidates: z.array(
    z.object({
      segmentId: z.string(),
      bm25Rank: z.number().int().nullable(),
      vectorRank: z.number().int().nullable(),
      fused: z.number(),
      recencyWeight: z.number(),
      used: z.boolean(),
      discardReason: z.string().nullable(),
    }),
  ),
});
export type RetrievalTrace = z.infer<typeof RetrievalTrace>;

export const UtteranceTrace = z.object({
  utteranceId: UtteranceId,
  prompt: z.array(PromptBlock),
  retrieval: z.array(RetrievalTrace),
  deliberation: Deliberation,
});
export type UtteranceTrace = z.infer<typeof UtteranceTrace>;
