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
  "backtest_svog_2018",
  "backtest_gtelg_2023",
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
  /**
   * Added 2026-11-06: "fast" is the live-demo preset (fewer focused talks, faster seats);
   * absent means the full setting.
   */
  pace: z.enum(["fast", "full"]).optional(),
});
export type RoomConfig = z.infer<typeof RoomConfig>;

/**
 * Live-demo preset "Schnell" (added 2026-11-06): two rounds, one short focused talk, and the
 * fastest seats that passed the model smoke test (docs/model-smoke.md: gpt-6-sol p50 5.8 s,
 * Devstral 2 p95 23 s, GLM 4.7 Flash p50 6.3 s), so three families stay at the table and the
 * second verifier still comes from another family. Everything else (claims, Experte, gates,
 * compromise round) is unchanged.
 */
export const FAST_PRESET = {
  roundLimit: 2,
  moderatorModel: "azure/gpt-6-sol",
  expertModel: "azure/gpt-6-sol",
  seats: {
    gm: "azure/gpt-6-sol",
    fm: "azure/gpt-6-sol",
    sv: "azure/gpt-6-sol",
    ak: "azure/gpt-6-sol",
    pf: "azure/gpt-6-sol",
    ka: "bedrock/mistral.devstral-2-123b",
    pv: "bedrock/mistral.devstral-2-123b",
    va: "bedrock/zai.glm-4.7-flash",
    bl: "bedrock/zai.glm-4.7-flash",
  } as Record<string, string>,
  defaultSeat: "azure/gpt-6-sol",
} as const;

/** Applies the fast preset to a room (seat models, rounds, pace); full keeps the room. */
export function withPace(room: RoomConfig, pace: "fast" | "full"): RoomConfig {
  if (pace === "full") return { ...room, pace: "full" };
  return {
    ...room,
    pace: "fast",
    roundLimit: FAST_PRESET.roundLimit,
    moderatorModel: FAST_PRESET.moderatorModel,
    expertModel: FAST_PRESET.expertModel,
    agents: room.agents.map((a) => ({
      ...a,
      model: FAST_PRESET.seats[a.agentId] ?? FAST_PRESET.defaultSeat,
    })),
    scheduledEvents: room.scheduledEvents.filter((e) => e.atRound <= FAST_PRESET.roundLimit),
  };
}
