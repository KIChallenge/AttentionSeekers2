import { z } from "zod";
import { CitationRef } from "./evidence.ts";
import { AgentId, IsoDate, LocalizedText, Role, UtteranceId } from "./primitives.ts";

// Topics, positions and agent character (FR-A1, C1, C3, C4, A5, U3, U4)

export const Topic = z.object({
  id: z.string(),
  /** Taxonomy key shared with the data track's stance profiles. */
  key: z.string(),
  label: LocalizedText,
  measure: LocalizedText,
});
export type Topic = z.infer<typeof Topic>;

export const Axis = z.object({
  id: z.enum(["x", "y"]),
  label: LocalizedText,
  poles: z.tuple([LocalizedText, LocalizedText]),
  /** topicId to weight; position on the axis = weighted mean of topic stances. */
  topicWeights: z.record(z.string(), z.number()),
});
export type Axis = z.infer<typeof Axis>;

export const Position = z.object({
  runId: z.string(),
  agentId: AgentId,
  topicId: z.string(),
  round: z.number().int().min(1),
  /** -2 strongly against .. +2 strongly for. */
  stance: z.number().min(-2).max(2),
  strength: z.number().min(0).max(1),
  arguments: z.array(LocalizedText),
  citations: z.array(CitationRef),
  rationale: LocalizedText,
  /** FR-A5: set whenever the stance moved against the previous round. */
  trigger: z.object({ utteranceId: UtteranceId, note: LocalizedText }).nullable(),
});
export type Position = z.infer<typeof Position>;

export const StanceProfile = z.object({
  role: Role,
  topicKey: z.string(),
  /** Set for FR-H3 history rows. */
  year: z.number().int().nullable(),
  stance: z.number().min(-2).max(2),
  confidence: z.number().min(0).max(1),
  support: z.array(CitationRef),
  fit: z.object({
    n: z.number().int(),
    from: IsoDate,
    to: IsoDate,
    halfLifeYears: z.number(),
    method: z.literal("llm_derived_spot_checked"),
  }),
});
export type StanceProfile = z.infer<typeof StanceProfile>;

export const RedLine = z.object({
  id: z.string(),
  role: Role,
  text: LocalizedText,
  basis: CitationRef.nullable(),
  /** ACF tiers. */
  tier: z.enum(["deep_core", "policy_core", "secondary"]),
  topicKeys: z.array(z.string()),
});
export type RedLine = z.infer<typeof RedLine>;

/** The four temperament dials, 0..1 each (FR-C4). */
export const TemperamentSetting = z.object({
  concession: z.number().min(0).max(1),
  assertiveness: z.number().min(0).max(1),
  coalitionAppetite: z.number().min(0).max(1),
  riskTolerance: z.number().min(0).max(1),
});
export type TemperamentSetting = z.infer<typeof TemperamentSetting>;

export const Temperament = TemperamentSetting.extend({
  /** FR-C5 */
  modelBaselineConcession: z.number().nullable(),
  correctedConcession: z.number().nullable(),
  /** Hide the control in the UI until true. */
  inertnessChecked: z.boolean(),
});
export type Temperament = z.infer<typeof Temperament>;

export const AgentConfig = z.object({
  id: AgentId,
  role: Role,
  /** "ÖÄK, Kurie niedergelassene Ärzte"; institutions only, never a person. */
  institution: z.object({ nameDe: z.string(), glossEn: z.string(), unit: z.string() }),
  /** fitted = stance profile from the corpus; prompted = configuration only (FR-A9). */
  mode: z.enum(["fitted", "prompted"]),
  goals: z.array(LocalizedText),
  interests: z.array(LocalizedText),
  restrictions: z.array(LocalizedText),
  budgetConstraints: z.array(LocalizedText),
  priorities: z.array(z.object({ label: LocalizedText, weight: z.number() })),
  redLineIds: z.array(z.string()),
  temperament: Temperament,
  /** CSS colour token, e.g. "var(--c-gm)". */
  color: z.string(),
  /** Display code, e.g. "ÄK". */
  code: z.string().max(3),
  /**
   * Up to three delegates per institution, each a fictional, unnamed functional role
   * ("Verhandlungsführung", "Finanzreferat"). Never a real person or a name (CON-1, CON-2).
   */
  delegates: z
    .array(z.object({ id: z.string(), role: LocalizedText }))
    .max(3)
    .optional(),
  /**
   * Added 2026-11-06 (in-context persona): which persona material the system prompt used.
   * dossier = profile plus packages/engine/config/dossiers/<role>.md (version + content hash);
   * profile = agents.json profile only. Absent in runs recorded before this field existed.
   */
  persona: z
    .object({
      mode: z.enum(["dossier", "profile"]),
      version: z.string().nullable(),
      sha256: z.string().nullable(),
    })
    .optional(),
  /**
   * Added 2026-11-06 (citation style): the institution's historical citation propensity
   * (share of corpus segments with legal, figure or study references; see
   * packages/engine/config/citation-style.json) that phrased the evidence hint. Style only,
   * never a gate. Absent in runs recorded before this field existed.
   */
  citationStyle: z
    .object({
      propensity: z.number(),
      tier: z.enum(["high", "medium", "low"]),
      measured: z.boolean(),
    })
    .optional(),
});
export type AgentConfig = z.infer<typeof AgentConfig>;
