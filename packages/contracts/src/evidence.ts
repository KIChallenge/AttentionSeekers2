import { z } from "zod";
import { IsoDate, Role } from "./primitives.ts";

// Evidence and provenance (FR-P1..P7, CON-1/2, FR-H2)

export const SourceKind = z.enum([
  "press",
  "stellungnahme",
  "sozdok",
  "statistic",
  "parliament",
  "ris",
  "audit",
]);
export type SourceKind = z.infer<typeof SourceKind>;

export const Institution = z.object({
  code: z.string(),
  nameDe: z.string(),
  glossEn: z.string(),
  role: Role,
});
export type Institution = z.infer<typeof Institution>;

export const Source = z.object({
  id: z.string(),
  kind: SourceKind,
  institution: Institution,
  date: IsoDate,
  datePrecision: z.enum(["day", "month", "year"]),
  /** "Der Standard", "APA-OTS", null for statute. */
  outlet: z.string().nullable(),
  title: z.string().nullable(),
  /** "ASVG § 341 Abs. 1" for SOZDOK. */
  legalRef: z.string().nullable(),
  url: z.string().url().nullable(),
  licence: z.string().nullable().default(null),
  /** Import refuses anything else (CON-1/CON-2 fail-closed). */
  personFiltered: z.literal(true),
  corpusRevision: z.string(),
});
export type Source = z.infer<typeof Source>;

export const Segment = z.object({
  id: z.string(),
  sourceId: z.string(),
  ordinal: z.number().int(),
  /** Offsets into normalised source text (FR-P7). */
  start: z.number().int(),
  end: z.number().int(),
  text: z.string(),
  textEn: z.string().nullable(),
});
export type Segment = z.infer<typeof Segment>;

export const CitationRef = z.object({
  sourceId: z.string(),
  segmentId: z.string(),
  start: z.number().int().nullable(),
  end: z.number().int().nullable(),
  /** FR-P4, shown as "w 0.92". */
  recencyWeight: z.number().min(0).max(1),
});
export type CitationRef = z.infer<typeof CitationRef>;
