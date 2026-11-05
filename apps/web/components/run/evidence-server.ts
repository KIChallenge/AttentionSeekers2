// Server-only: loads the evidence extract (sources, segments, red lines) that the run
// screens resolve citation refs against. Reads <replayDir>/<runId>.sources.json when it
// exists, plus fixture-sources.json as the shared extract. Only person-filtered rows pass.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { RedLine, Segment, Source } from "@sv/contracts";
import { isRunId, replayDir } from "@/lib/runs";
import type { Evidence } from "./evidence";

async function readExtract(file: string, into: Evidence) {
  if (!existsSync(file)) return;
  try {
    const raw = JSON.parse(await readFile(file, "utf8")) as {
      sources?: unknown[];
      segments?: unknown[];
      redLines?: unknown[];
    };
    for (const s of raw.sources ?? []) {
      const p = Source.safeParse(s);
      if (p.success) into.sources[p.data.id] = p.data;
    }
    for (const s of raw.segments ?? []) {
      const p = Segment.safeParse(s);
      if (p.success) into.segments[p.data.id] = p.data;
    }
    for (const s of raw.redLines ?? []) {
      const p = RedLine.safeParse(s);
      if (p.success) into.redLines[p.data.id] = p.data;
    }
  } catch (error) {
    console.warn("evidence_extract_invalid", file, error instanceof Error ? error.message : error);
  }
}

export async function loadEvidence(runId: string): Promise<Evidence> {
  const ev: Evidence = { sources: {}, segments: {}, redLines: {} };
  const dir = replayDir();
  await readExtract(path.join(/*turbopackIgnore: true*/ dir, "fixture-sources.json"), ev);
  if (isRunId(runId)) {
    await readExtract(path.join(/*turbopackIgnore: true*/ dir, `${runId}.sources.json`), ev);
  }
  return ev;
}
