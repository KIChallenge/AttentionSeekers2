import { z } from "zod";
import { IsoDate, Role } from "./primitives.ts";

// Mirror of schema/outcome-descriptor.schema.json v0.1 (Python-owned source of truth).
// Field names stay snake_case to match the JSON Schema exactly.

const Tri = z.enum(["yes", "no", "unknown"]);
const DescriptorStance = z.enum(["support", "oppose", "conditional", "silent", "unknown"]);

export const MeasureClass = z.enum([
  "capacity_expansion",
  "capacity_reduction",
  "fee_change",
  "new_service",
  "service_restriction",
  "digitalisation",
  "structural_reform",
  "scope_of_practice",
  "access_rule",
  "prevention_program",
  "workforce",
  "drug_reimbursement",
  "financing_rule",
  "monitoring_reporting",
  "other",
]);
export type MeasureClass = z.infer<typeof MeasureClass>;

const DescriptorBase = z
  .object({
    schema_version: z.literal("0.1"),
    case_id: z.string(),
    episode_id: z.string().optional(),
    measure_class: MeasureClass,
    cost_direction: z.enum(["increase", "decrease", "neutral", "unknown"]),
    cost_band: z.enum(["none", "low", "medium", "high", "unknown"]),
    payer: z.enum(["federal", "social_insurance", "laender", "mixed", "private", "unknown"]),
    requires_legislation: Tri,
    requires_15a_agreement: Tri,
    requires_gesamtvertrag: Tri,
    supporting_roles: z.array(Role),
    opposing_roles: z.array(Role),
    conditional_roles: z.array(Role).optional(),
    budget_authority_stance: DescriptorStance,
    laender_stance: DescriptorStance,
    medical_chamber_stance: DescriptorStance,
    contestation: z.enum(["low", "medium", "high"]),
    red_line_crossed: Tri,
    horizon_years: z.number().int().min(0).max(20).nullable(),
    evidence: z
      .array(
        z
          .object({
            doc_id: z.string(),
            date: IsoDate,
            institution_role: Role,
            passage_offsets: z.tuple([z.number().int(), z.number().int()]).optional(),
            field: z.string().optional(),
          })
          .strict(),
      )
      .min(1),
    extractor: z
      .object({
        version: z.string().optional(),
        method: z.enum(["human", "model", "model_human_reviewed"]).optional(),
        model: z.string().optional(),
        reviewed_by: z.string().optional(),
      })
      .optional(),
  })
  .strict();

export const OutcomeDescriptor = z.discriminatedUnion("origin", [
  DescriptorBase.extend({
    origin: z.literal("historical"),
    episode_id: z.string(),
    decision_date: IsoDate,
    outcome: z.enum([
      "implemented",
      "partially_implemented",
      "rejected",
      "lapsed",
      "superseded",
      "unknown",
    ]),
    outcome_record: z
      .object({
        source: z.enum([
          "parlament_gesetzgebungsverfahren",
          "ris_bgbl",
          "ris_15a",
          "rechnungshof",
          "zielsteuerung_monitoring",
          "other",
        ]),
        identifier: z.string(),
        url: z.string().optional(),
      })
      .strict(),
  }),
  // .strict() on the base already forbids outcome and decision_date here.
  DescriptorBase.extend({ origin: z.literal("simulated") }),
]);
export type OutcomeDescriptor = z.infer<typeof OutcomeDescriptor>;
