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
  /** Added 2026-11-06 (impact calibration): evidence table or the proposers' own estimate. */
  basis: z.enum(["evidence", "proposer"]).optional(),
  /** Added 2026-11-06: evidence classes behind the figure (keys of impact-evidence.json). */
  evidenceClasses: z.array(z.string()).optional(),
  /** Added 2026-11-06: distinct sources behind the figure. */
  sourceCount: z.number().int().optional(),
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

/**
 * Added 2026-11-06 (compromise synthesis): the moderator's conditional compromise package,
 * drafted after the end condition from the proposals and positions that came closest. It is
 * a proposal, never a forced result: its real support comes from the ratification round.
 */
export const CompromiseCondition = z.object({
  kind: z.enum(["financing", "evaluation", "sunset", "pilot", "governance", "other"]),
  text: LocalizedText,
});
export type CompromiseCondition = z.infer<typeof CompromiseCondition>;

export const CompromisePackage = z.object({
  id: z.string(),
  round: z.number().int(),
  title: LocalizedText,
  /** Why these pieces: what came closest and what was traded. */
  rationale: LocalizedText,
  components: z.array(z.object({ text: LocalizedText, proposalIds: z.array(z.string()) })),
  conditions: z.array(CompromiseCondition),
  /** Proposals the package draws on. */
  basedOn: z.array(z.string()),
  /** The moderator's reading of the table before the ratification round. */
  expected: z.object({
    support: z.array(AgentId),
    conditional: z.array(AgentId),
    oppose: z.array(z.object({ agentId: AgentId, reason: LocalizedText })),
  }),
  redLinesTouched: z.array(
    z.object({ redLineId: z.string(), agentId: AgentId, note: LocalizedText }),
  ),
  utteranceId: z.string().nullable(),
});
export type CompromisePackage = z.infer<typeof CompromisePackage>;

export const CompromiseVote = z.object({
  packageId: z.string(),
  agentId: AgentId,
  stance: z.enum(["support", "conditional", "oppose"]),
  /** For conditional support: the condition; for opposition: what would change it. */
  condition: LocalizedText.nullable(),
  reason: LocalizedText,
  redLinesTouched: z.array(z.string()),
  utteranceId: z.string().nullable(),
  model: z.string(),
});
export type CompromiseVote = z.infer<typeof CompromiseVote>;

export const CompromiseResult = z.object({
  packageId: z.string(),
  support: z.array(AgentId),
  conditional: z.array(AgentId),
  oppose: z.array(AgentId),
  /** Whether support plus conditional support meets the room's decision rule. */
  passes: z.boolean(),
  rule: z.enum(["consensus", "qualified_majority", "veto_players"]),
  needed: z.number().int(),
  missingVetoPlayers: z.array(AgentId),
  note: LocalizedText,
});
export type CompromiseResult = z.infer<typeof CompromiseResult>;

/**
 * Added 2026-11-06 (compromise consistency): the Experte's check after the ratification
 * round. Every pair of stated conditions (conditional support, or support with a condition)
 * is checked for compatibility; a carried package whose conditions contradict each other
 * only carries if those conditions can be reconciled. Stored as runs/<runId>.compromise.json
 * (written by the engine after the ratification, or offline by compromise-cli over old runs)
 * and preferred by the outcome page, the result document and the scenario tabs.
 */
export const CompromiseStatedCondition = z.object({
  agentId: AgentId,
  stance: z.enum(["support", "conditional", "oppose"]),
  condition: LocalizedText,
});
export type CompromiseStatedCondition = z.infer<typeof CompromiseStatedCondition>;

export const CompromiseConflict = z.object({
  a: AgentId,
  b: AgentId,
  /** contradiction = cannot both hold; tension = both hold only with an explicit trade. */
  severity: z.enum(["contradiction", "tension"]),
  note: LocalizedText,
});
export type CompromiseConflict = z.infer<typeof CompromiseConflict>;

export const CompromiseConsistency = z.object({
  runId: z.string(),
  packageId: z.string(),
  /** carries = compatible conditions; carries_if_reconciled = conflicting pairs; fails = no majority. */
  verdict: z.enum(["carries", "carries_if_reconciled", "fails"]),
  label: LocalizedText,
  conditions: z.array(CompromiseStatedCondition),
  pairsChecked: z.number().int(),
  conflicts: z.array(CompromiseConflict),
  model: z.string(),
  checkedAt: z.string(),
});
export type CompromiseConsistency = z.infer<typeof CompromiseConsistency>;
