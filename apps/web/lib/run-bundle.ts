// Run bundle (W-33, FR-T9): everything needed to audit or replay one run offline.
// Server-only. The same entries back the zip and the single-JSON variant of the route.
import { createHash } from "node:crypto";
import { foldRun, type RunEvent } from "@sv/contracts";
import { renderResultHtml } from "@/components/result/export-html";
import type { Evidence } from "@/components/run/evidence";
import type { ZipEntry } from "./zip";

export const BUNDLE_FORMAT = "sv-run-bundle/1";

export interface RunBundle {
  runId: string;
  entries: ZipEntry[];
  manifest: Record<string, unknown>;
}

const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;
const sha256 = (s: string | Uint8Array) => createHash("sha256").update(s).digest("hex");

export function buildRunBundle(
  runId: string,
  events: RunEvent[],
  evidence: Evidence,
  opts: { origin: string; now?: Date },
): RunBundle {
  const now = opts.now ?? new Date();
  const snap = foldRun(events, { keepTraces: true });
  const run = snap.run;

  // Sources used: every passage a claim cites plus every retrieval candidate an agent
  // actually used. Only the person-filtered extract the app already serves is included.
  const segmentIds = new Set<string>();
  const sourceIds = new Set<string>();
  for (const c of Object.values(snap.claims)) {
    for (const ref of c.citations) {
      segmentIds.add(ref.segmentId);
      sourceIds.add(ref.sourceId);
    }
  }
  for (const tr of Object.values(snap.traces)) {
    for (const r of tr.retrieval)
      for (const cand of r.candidates) if (cand.used) segmentIds.add(cand.segmentId);
  }
  const segments = [...segmentIds].map((id) => evidence.segments[id]).filter((s) => !!s);
  for (const s of segments) if (s) sourceIds.add(s.sourceId);
  const sources = [...sourceIds].map((id) => evidence.sources[id]).filter((s) => !!s);
  const redLineIds = new Set(run?.agents.flatMap((a) => a.redLineIds) ?? []);
  const redLines = [...redLineIds].map((id) => evidence.redLines[id]).filter((r) => !!r);

  // Model assignment as configured, plus what each utterance actually ran on (fallbacks).
  const used: Record<string, { model: string; utterances: number; fallbacks: number }> = {};
  for (const id of snap.utteranceOrder) {
    const u = snap.utterances[id];
    if (!u) continue;
    const key = `${u.speaker}|${u.model}`;
    const row = used[key] ?? { model: u.model, utterances: 0, fallbacks: 0 };
    row.utterances++;
    if (u.telemetry?.fallbackFrom) row.fallbacks++;
    used[key] = row;
  }
  const models = {
    assignment: run?.modelAssignment ?? {},
    observed: Object.entries(used).map(([key, v]) => ({ agentId: key.split("|")[0], ...v })),
  };

  const ndjson = events
    .map((e) => JSON.stringify(e))
    .join("\n")
    .concat("\n");
  const entries: ZipEntry[] = [
    { name: "events.ndjson", data: ndjson },
    { name: "model-assignment.json", data: json(models) },
    {
      name: "sources-used.json",
      data: json({
        note: "Person-filtered extract; originals are linked, not republished.",
        sources,
        segments,
        redLines,
        unresolvedSegmentIds: [...segmentIds].filter((id) => !evidence.segments[id]),
      }),
    },
    ...Object.values(snap.traces).map((tr) => ({
      name: `traces/${tr.utteranceId}.json`,
      data: json(tr),
    })),
  ];
  if (run) {
    for (const lang of ["de", "en"] as const) {
      entries.push({
        name: `result-${lang}.html`,
        data: renderResultHtml(snap, run, evidence, lang, { origin: opts.origin, exportedAt: now }),
      });
    }
  }

  const manifest = {
    format: BUNDLE_FORMAT,
    runId,
    exportedAt: now.toISOString(),
    status: snap.status,
    question: run?.mandate.question ?? null,
    asOf: run?.mandate.asOf ?? null,
    variant: run?.variant ?? null,
    events: events.length,
    lastSeq: snap.lastSeq,
    utterances: snap.utteranceOrder.length,
    traces: Object.keys(snap.traces).length,
    sources: sources.length,
    segments: segments.length,
    files: entries.map((e) => ({
      name: e.name,
      bytes: typeof e.data === "string" ? Buffer.byteLength(e.data) : e.data.byteLength,
      sha256: sha256(e.data),
    })),
  };
  entries.unshift({ name: "manifest.json", data: json(manifest) });
  return { runId, entries, manifest };
}
