import { readFileSync } from "node:fs";
import {
  AGENT_CATALOG,
  type OutcomeDescriptor,
  type RedLine,
  type Segment,
  type Source,
  type StanceProfile,
} from "@sv/contracts";
import { sql } from "drizzle-orm";
import type { z } from "zod";
import type { Db } from "./client.ts";
import * as t from "./schema.ts";

// JSONL importers for the Python tracks (ui-plan 2.2, ticket W-27). Every row is
// validated with the contract schema; an invalid row fails the import with file and
// line number. Rows without personFiltered: true are refused (CON-1/CON-2 fail-closed).
// SKELETON: the adapters below map the data track's current field names; confirm the
// final file names with the track owners.

export class ImportError extends Error {}

export function* readJsonl(file: string): Generator<{ line: number; row: unknown }> {
  const lines = readFileSync(file, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]?.trim();
    if (!raw) continue;
    try {
      yield { line: i + 1, row: JSON.parse(raw) };
    } catch (error) {
      throw new ImportError(`${file}:${i + 1}: invalid JSON (${(error as Error).message})`);
    }
  }
}

export function validateRows<S extends z.ZodType>(
  file: string,
  schema: S,
  adapt: (row: unknown) => unknown = (r) => r,
): z.infer<S>[] {
  const out: z.infer<S>[] = [];
  for (const { line, row } of readJsonl(file)) {
    const parsed = schema.safeParse(adapt(row));
    if (!parsed.success) throw new ImportError(`${file}:${line}: ${parsed.error.message}`);
    out.push(parsed.data);
  }
  return out;
}

async function chunked<T>(rows: T[], size: number, fn: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

export async function importSources(db: Db, rows: Source[]) {
  await chunked(rows, 500, (chunk) =>
    db
      .insert(t.sources)
      .values(
        chunk.map((s) => ({
          id: s.id,
          kind: s.kind,
          institutionCode: s.institution.code,
          institutionRole: s.institution.role,
          date: s.date,
          outlet: s.outlet,
          title: s.title,
          legalRef: s.legalRef,
          url: s.url,
          licence: s.licence,
          personFiltered: s.personFiltered,
          corpusRevision: s.corpusRevision,
          data: s,
        })),
      )
      .onConflictDoUpdate({
        target: t.sources.id,
        set: { data: sql`excluded.data`, corpusRevision: sql`excluded.corpus_revision` },
      }),
  );
  return rows.length;
}

export async function importSegments(db: Db, rows: Segment[]) {
  await chunked(rows, 1000, (chunk) =>
    db
      .insert(t.segments)
      .values(
        chunk.map((s) => ({
          id: s.id,
          sourceId: s.sourceId,
          ordinal: s.ordinal,
          start: s.start,
          end: s.end,
          text: s.text,
          textEn: s.textEn,
        })),
      )
      .onConflictDoUpdate({
        target: t.segments.id,
        set: { text: sql`excluded.text`, textEn: sql`excluded.text_en` },
      }),
  );
  return rows.length;
}

export async function importStanceProfiles(db: Db, rows: StanceProfile[]) {
  await db.delete(t.stanceProfiles);
  await chunked(rows, 500, (chunk) =>
    db.insert(t.stanceProfiles).values(
      chunk.map((p) => ({
        role: p.role,
        topicKey: p.topicKey,
        year: p.year,
        stance: p.stance,
        confidence: p.confidence,
        data: p,
      })),
    ),
  );
  return rows.length;
}

export async function importRedLines(db: Db, rows: RedLine[]) {
  await chunked(rows, 500, (chunk) =>
    db
      .insert(t.redLines)
      .values(chunk.map((r) => ({ id: r.id, role: r.role, tier: r.tier, data: r })))
      .onConflictDoUpdate({ target: t.redLines.id, set: { data: sql`excluded.data` } }),
  );
  return rows.length;
}

export async function importDescriptors(db: Db, rows: OutcomeDescriptor[]) {
  await chunked(rows, 500, (chunk) =>
    db
      .insert(t.outcomeDescriptors)
      .values(
        chunk.map((d) => ({
          caseId: d.case_id,
          origin: d.origin,
          episodeId: d.episode_id ?? null,
          measureClass: d.measure_class,
          outcome: d.origin === "historical" ? d.outcome : null,
          data: d,
        })),
      )
      .onConflictDoUpdate({
        target: t.outcomeDescriptors.caseId,
        set: { data: sql`excluded.data` },
      }),
  );
  return rows.length;
}

// ---------- adapters for the data track's current files ----------

/** data track agent ids to institution roles. */
const DATA_AGENT_ROLE: Record<string, Source["institution"]["role"]> = {
  bmsgpk: "ministry_health",
  sv: "social_insurance",
  aerztekammer: "medical_chamber",
  contract_physicians: "contract_physicians",
  elective_physicians: "elective_physicians",
  hospitals: "hospitals",
  nursing: "nursing",
  patients: "patients",
  laender: "laender",
  bmf: "ministry_finance",
  other: "other",
};

/**
 * data/derived/stellungnahmen.jsonl row to Source. The masking pass runs in the data
 * track (masking_summary.json); rows count as person-filtered only if the row says so
 * or the caller passes assumeMasked after checking that summary.
 */
export function adaptStellungnahme(assumeMasked: boolean, corpusRevision: string) {
  return (raw: unknown): unknown => {
    const r = raw as Record<string, unknown>;
    const role = DATA_AGENT_ROLE[String(r.agent)] ?? "other";
    const cat = AGENT_CATALOG.find((a) => a.role === role);
    const masked = r.person_filtered === true || (assumeMasked && r.person_filtered !== false);
    return {
      id: r.id,
      kind: "stellungnahme",
      institution: {
        code: String(r.institution_id ?? r.agent ?? "other"),
        nameDe: String(r.institution ?? cat?.nameDe ?? "Institution"),
        glossEn: cat?.glossEn ?? "Institution",
        role,
      },
      date: r.date,
      datePrecision: "day",
      outlet: null,
      title: r.me_title ?? null,
      legalRef: r.citation ?? null,
      url: r.url ?? null,
      licence: null,
      personFiltered: masked,
      corpusRevision,
    };
  };
}

/** data/derived/stellungnahmen_segments.jsonl row to Segment (offsets not yet provided). */
export function adaptStellungnahmeSegment(raw: unknown): unknown {
  const r = raw as Record<string, unknown>;
  const text = String(r.text ?? "");
  return {
    id: `${r.stellungnahme_id}#${r.seg}`,
    sourceId: r.stellungnahme_id,
    ordinal: r.seg,
    start: typeof r.start === "number" ? r.start : 0,
    end: typeof r.end === "number" ? r.end : text.length,
    text,
    textEn: r.text_en ?? null,
  };
}
