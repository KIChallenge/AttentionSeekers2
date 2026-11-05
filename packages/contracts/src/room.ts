import { z } from "zod";
import { TemperamentSetting } from "./agents.ts";
import { CitationRef } from "./evidence.ts";
import { AgentId, IsoDate, Lang, LocalizedText, ModelId } from "./primitives.ts";

// Negotiation setup room (FR-U9, FR-U10). Every setting is written into the
// mandate, shown in the record and reproducible on replay.

export const Template = z.enum([
  "wartezeiten",
  "honorarverhandlungen",
  "spitalsplanung",
  "pflegereform",
  "pve",
  "impfstrategie",
  "neue_leistungen",
  "custom",
]);
export type Template = z.infer<typeof Template>;

export const DecisionRule = z.enum(["consensus", "qualified_majority", "veto_players"]);
export type DecisionRule = z.infer<typeof DecisionRule>;

export const Climate = z.enum(["cooperative", "neutral", "confrontational"]);
export type Climate = z.infer<typeof Climate>;

export const PressureLevel = z.enum(["none", "low", "medium", "high"]);
export type PressureLevel = z.infer<typeof PressureLevel>;

/** Optional event injected mid-run (new statistic, court ruling, ...). */
export const ScheduledEvent = z.object({
  id: z.string(),
  /** Injected at the start of this round. */
  atRound: z.number().int().min(1),
  kind: z.enum(["statistic", "court_ruling", "press_report", "budget_shock", "political", "other"]),
  title: LocalizedText,
  body: LocalizedText,
  sourceRef: CitationRef.nullable(),
});
export type ScheduledEvent = z.infer<typeof ScheduledEvent>;

export const RoomAgent = z.object({
  agentId: AgentId,
  enabled: z.boolean(),
  origin: z.enum(["core", "optional"]),
  mode: z.enum(["fitted", "prompted"]),
  /** The moderator's suggested selection (FR-M2). */
  suggestedByModerator: z.boolean(),
  reason: LocalizedText,
  model: ModelId,
  temperament: TemperamentSetting,
});
export type RoomAgent = z.infer<typeof RoomAgent>;

export const RoomConfig = z.object({
  template: Template,
  question: z.string().min(1),
  lang: Lang,
  agents: z.array(RoomAgent),
  moderatorModel: ModelId,
  expertModel: ModelId,
  decisionRule: DecisionRule,
  /** Only for qualified_majority: needed out of the enabled agents. */
  qualifiedMajority: z.object({ needed: z.number().int(), of: z.number().int() }).nullable(),
  roundLimit: z.number().int().min(1).max(8),
  budgetCeiling: z.object({
    /** Max increase of health spending in percent, e.g. 5. */
    maxIncreasePct: z.number(),
    baselineEurBn: z.number().nullable(),
    note: LocalizedText.nullable(),
  }),
  /** Retrieval cutoff (FR-H2). */
  asOf: IsoDate,
  climate: Climate,
  pressures: z.object({ time: PressureLevel, budget: PressureLevel, public: PressureLevel }),
  scheduledEvents: z.array(ScheduledEvent),
  coldRatification: z.boolean(),
  seed: z.number().int(),
});
export type RoomConfig = z.infer<typeof RoomConfig>;
