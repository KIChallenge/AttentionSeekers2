import { z } from "zod";
import { CitationRef } from "./evidence.ts";
import { LocalizedText, ModelId, UtteranceId } from "./primitives.ts";

// Claims (FR-T10, FR-N1, N2, N7)

export const ClaimState = z.enum(["verified", "unverified", "contradicted", "assumption"]);
export type ClaimState = z.infer<typeof ClaimState>;

export const ModelVerdict = z.object({
  model: ModelId,
  verdict: z.enum(["supported", "partial", "unsupported", "contradicted"]),
  reason: z.string(),
});
export type ModelVerdict = z.infer<typeof ModelVerdict>;

export const Claim = z
  .object({
    id: z.string(),
    utteranceId: UtteranceId,
    /** Offsets in the original-language utterance text. */
    span: z.object({ start: z.number().int(), end: z.number().int() }),
    atomicText: z.string(),
    kind: z.enum(["numeric", "factual", "legal", "normative"]),
    numeric: z
      .object({
        value: z.number(),
        unit: z.string(),
        low: z.number().nullable(),
        high: z.number().nullable(),
      })
      .nullable(),
    citations: z.array(CitationRef),
    state: ClaimState,
    verifyingModels: z.array(ModelVerdict),
    decompositionModel: ModelId.nullable(),
    contradiction: z
      .object({
        withClaimId: z.string(),
        note: LocalizedText,
        resolution: z.enum(["unresolved", "resolved"]),
      })
      .nullable(),
  })
  .refine((c) => (c.state === "assumption") === (c.citations.length === 0), {
    message: "assumption iff no citation",
  });
export type Claim = z.infer<typeof Claim>;
