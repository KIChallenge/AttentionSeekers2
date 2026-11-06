// Measured values for /method (W-25: FR-J5, FR-J7, FR-J12, NFR-10, CON-6) from
// runs/method-note.json. Every measured field is nullable: null renders as "not measured
// yet" instead of hiding the gap (CON-4). The engine track fills palette and referenceRun,
// the forecasting track fills forecast and backtest. Server-only.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { replayDir } from "@/lib/runs";

const Bi = z.object({ de: z.string(), en: z.string() });
const num = z.number().nullable();
const flag = z.boolean().nullable();

export const MethodNoteFile = z.object({
  version: z.string(),
  updatedAt: z.string(),
  palette: z.array(
    z.object({
      model: z.string().nullable(),
      family: z.string().nullable(),
      roles: z.array(z.string()),
      smoke: z.object({
        streaming: flag,
        structuredOutput: flag,
        reasoningField: flag,
        latencyMs: num,
        checkedAt: z.string().nullable(),
      }),
      concessionBaseline: num,
    }),
  ),
  referenceRun: z.object({
    runId: z.string(),
    models: z.array(z.string()),
    rounds: num,
    utterances: num,
    claims: z.object({
      verified: num,
      partial: num,
      unverified: num,
      contradicted: num,
      assumption: num,
    }),
  }),
  forecast: z.object({
    registry: z.object({
      asOf: z.string(),
      drafts: num,
      episodes: num,
      labels: z.record(z.string(), z.number()),
    }),
    brier: z.object({ referenceClass: num, statusQuo: num, nEpisodes: num }),
    ablationVerdict: Bi.nullable(),
    regimeCaveat: Bi,
  }),
  backtest: z.object({
    case: z.string(),
    status: z.enum(["pending", "running", "done", "cut"]),
    hypothesis: Bi,
    result: Bi.nullable(),
    /** Run ids of the backtest variants and the write-up, when done. */
    runs: z.array(z.string()).optional(),
    doc: z.string().optional(),
    /** One row per backtest episode: forecast, simulation and the legislative record. */
    compare: z
      .array(
        z.object({
          case: z.string(),
          forecast: Bi,
          simulation: Bi,
          reality: Bi,
          runs: z.array(z.string()),
          doc: z.string(),
        }),
      )
      .optional(),
  }),
});
export type MethodNoteFile = z.infer<typeof MethodNoteFile>;

export type NoteLoad =
  | { ok: true; note: MethodNoteFile; file: string }
  | { ok: false; reason: string; file: string };

export async function loadMethodNote(): Promise<NoteLoad> {
  const file = path.join(/*turbopackIgnore: true*/ replayDir(), "method-note.json");
  const shown = path.join(path.basename(path.dirname(file)), "method-note.json");
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    return { ok: false, reason: "missing", file: shown };
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "invalid JSON", file: shown };
  }
  const parsed = MethodNoteFile.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      reason: issue ? `${issue.path.join(".")}: ${issue.message}` : "schema",
      file: shown,
    };
  }
  return { ok: true, note: parsed.data, file: shown };
}
