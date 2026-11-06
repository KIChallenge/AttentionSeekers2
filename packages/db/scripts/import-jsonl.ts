// pnpm db:import            imports runs/fixture-sources.json and whatever track files exist
// pnpm db:import --assume-masked   also imports data/derived/stellungnahmen*.jsonl
//                                  (only after checking data/derived/masking_summary.json)
// pnpm db:import --no-press        skips press/derived/press_*.jsonl (loaded by default when present)
// pnpm db:import --no-embed        skips embedding new segments (done by default when the Bedrock key is set)
import "./env.ts";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { OutcomeDescriptor, RedLine, Segment, Source, StanceProfile } from "@sv/contracts";
import { closeDb, getDb } from "../src/client.ts";
import { embeddingConfigured, embedMissingSegments } from "../src/embeddings.ts";
import {
  adaptStellungnahme,
  adaptStellungnahmeSegment,
  importDescriptors,
  importRedLines,
  importSegments,
  importSources,
  importStanceProfiles,
  validateRows,
} from "../src/importers.ts";

const root = path.resolve(import.meta.dirname, "../../..");
const assumeMasked = process.argv.includes("--assume-masked");
const db = getDb();
const p = (rel: string) => path.join(root, rel);

// 1. fixture sources for the reference run
const fx = p("runs/fixture-sources.json");
if (existsSync(fx)) {
  const j = JSON.parse(readFileSync(fx, "utf8"));
  const n1 = await importSources(
    db,
    j.sources.map((s: unknown) => Source.parse(s)),
  );
  const n2 = await importSegments(
    db,
    j.segments.map((s: unknown) => Segment.parse(s)),
  );
  const n3 = await importRedLines(
    db,
    j.redLines.map((s: unknown) => RedLine.parse(s)),
  );
  console.log(`fixture: ${n1} sources, ${n2} segments, ${n3} red lines`);
}

// 2. contract-shaped track outputs (proposed names, ui-plan 2.2)
const contractFiles: Array<[string, () => Promise<number>]> = [
  [
    "data/derived/sources.jsonl",
    async () => importSources(db, validateRows(p("data/derived/sources.jsonl"), Source)),
  ],
  [
    "data/derived/segments.jsonl",
    async () => importSegments(db, validateRows(p("data/derived/segments.jsonl"), Segment)),
  ],
  [
    "data/derived/stance_profiles.jsonl",
    async () =>
      importStanceProfiles(
        db,
        validateRows(p("data/derived/stance_profiles.jsonl"), StanceProfile),
      ),
  ],
  [
    "data/derived/red_lines.jsonl",
    async () => importRedLines(db, validateRows(p("data/derived/red_lines.jsonl"), RedLine)),
  ],
  [
    "forecasting/data/descriptors.jsonl",
    async () =>
      importDescriptors(
        db,
        validateRows(p("forecasting/data/descriptors.jsonl"), OutcomeDescriptor),
      ),
  ],
];
for (const [rel, run] of contractFiles) {
  if (!existsSync(p(rel))) continue;
  console.log(`${rel}: ${await run()} rows`);
}

// 3. adapter for the data track's current Stellungnahmen files
if (assumeMasked && existsSync(p("data/derived/stellungnahmen.jsonl"))) {
  if (!existsSync(p("data/derived/masking_summary.json")))
    throw new Error("masking_summary.json missing; refusing to import");
  const sources = validateRows(
    p("data/derived/stellungnahmen.jsonl"),
    Source,
    adaptStellungnahme(true, "data-derived"),
  );
  console.log(`stellungnahmen: ${await importSources(db, sources)} sources`);
  const segs = validateRows(
    p("data/derived/stellungnahmen_segments.jsonl"),
    Segment,
    adaptStellungnahmeSegment,
  );
  console.log(`stellungnahmen_segments: ${await importSegments(db, segs)} segments`);
}

// 4. press archive (press/derived, built by `pnpm press:all`). Contract-shaped Source rows of
// kind "press"; loaded only when the press guard summary reports zero leaks (CON-1/CON-2).
const noPress = process.argv.includes("--no-press");
if (!noPress && existsSync(p("press/derived/press_sources.jsonl"))) {
  const summaryFile = p("press/derived/press_masking_summary.json");
  if (!existsSync(summaryFile))
    throw new Error("press_masking_summary.json missing; refusing to import");
  const summary = JSON.parse(readFileSync(summaryFile, "utf8")) as { leak_hits?: number };
  if (summary.leak_hits !== 0)
    throw new Error("press guard summary reports leaks; refusing to import");
  const sources = validateRows(p("press/derived/press_sources.jsonl"), Source);
  if (sources.some((s) => s.kind !== "press"))
    throw new Error("press_sources.jsonl holds a non-press row");
  console.log(`press_sources: ${await importSources(db, sources)} sources`);
  const segs = validateRows(p("press/derived/press_segments.jsonl"), Segment);
  console.log(`press_segments: ${await importSegments(db, segs)} segments`);
}

// 5. semantic vectors for new or changed segments (skipped without the Bedrock key or
// with --no-embed; `pnpm db:embed` does the same job standalone and resumes).
if (!process.argv.includes("--no-embed") && embeddingConfigured()) {
  const e = await embedMissingSegments(db, {
    log: (x) => console.log(`embeddings: ${x.done} done, ${x.pending} pending`),
  });
  console.log(`embeddings: ${e.done} new, ${e.failed} failed, ${e.tokens} tokens`);
}
await closeDb();
