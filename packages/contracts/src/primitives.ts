import { z } from "zod";

/** Calendar date, ISO 8601 day precision. */
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export type IsoDate = z.infer<typeof IsoDate>;

export const Lang = z.enum(["de", "en"]);
export type Lang = z.infer<typeof Lang>;

/** gm, sv, ak, va, ka, pf, bl, pv, fm for the core nine; FR-A7/A9 add more via config. */
export const AgentId = z.string().regex(/^[a-z]{2,4}$/);
export type AgentId = z.infer<typeof AgentId>;

export const SpeakerId = z.union([AgentId, z.literal("moderator"), z.literal("expert")]);
export type SpeakerId = z.infer<typeof SpeakerId>;

/** u3-02: round 3, second utterance of the round. */
export const UtteranceId = z.string().regex(/^u\d+-\d{2,}$/);
export type UtteranceId = z.infer<typeof UtteranceId>;

/** Gateway model id, e.g. "azure/gpt-5-mini". */
export const ModelId = z.string().min(1);
export type ModelId = z.infer<typeof ModelId>;

/** Original text plus translations; the record is language-independent (FR-L5). */
export const LocalizedText = z.object({
  lang: Lang,
  text: z.string(),
  translations: z.object({ de: z.string().optional(), en: z.string().optional() }).default({}),
});
export type LocalizedText = z.infer<typeof LocalizedText>;

/** Picks the text for a display language, falling back to the original. */
export function localize(value: LocalizedText, lang: Lang): string {
  if (value.lang === lang) return value.text;
  return value.translations[lang] ?? value.text;
}

/** -1 harmful, 0 neutral, +1 beneficial (FR-A10 incentives, FR-A11 incentive matrix). */
export const PayoffSign = z.union([z.literal(-1), z.literal(0), z.literal(1)]);
export type PayoffSign = z.infer<typeof PayoffSign>;

/** Descriptor roles: identical enum to schema/outcome-descriptor.schema.json $defs.role. */
export const Role = z.enum([
  "ministry_health",
  "social_insurance",
  "medical_chamber",
  "contract_physicians",
  "elective_physicians",
  "hospitals",
  "nursing",
  "patients",
  "legislature",
  "ministry_finance",
  "laender",
  "public_health",
  "chamber_commerce",
  "chamber_labour",
  "chamber_agriculture",
  "industry_pharma",
  "other",
]);
export type Role = z.infer<typeof Role>;

/** The five phases of the brief (FR-R1). Phase number = index + 1. */
export const PhaseKey = z.enum([
  "position_formation",
  "discussion",
  "negotiation",
  "compromise",
  "presentation",
]);
export type PhaseKey = z.infer<typeof PhaseKey>;

export const PHASES: ReadonlyArray<{ n: number; key: PhaseKey; de: string; en: string }> = [
  { n: 1, key: "position_formation", de: "Positionsbildung", en: "Position formation" },
  { n: 2, key: "discussion", de: "Diskussion", en: "Discussion" },
  { n: 3, key: "negotiation", de: "Verhandlung", en: "Negotiation" },
  { n: 4, key: "compromise", de: "Kompromissfindung", en: "Compromise finding" },
  { n: 5, key: "presentation", de: "Ergebnisdarstellung", en: "Presentation of results" },
];
