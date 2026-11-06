// Server-only: loads every run of one question and builds the topic comparison, plus the
// cached historical base rate per measure class (lib/topic-forecasts.json, see
// scripts/topic-forecasts.ts).

import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  foldRun,
  parseNdjson,
  type RunSnapshot,
  type RunSummary,
  summarizeRun,
} from "@sv/contracts";
import { listRuns, loadRunSnapshot, replayDir } from "./runs";
import { compareRuns, type TopicComparison, topicKeyOf } from "./topic-compare";
import forecasts from "./topic-forecasts.json";

export interface ClassRate {
  /** Registry class used when the engine's class has no registry counterpart. */
  via: string | null;
  n: number;
  k: number;
  low: number | null;
  high: number | null;
  smallN: boolean;
  modified: number;
  analogs: Array<{ episodeId: string; title: string; date: string; outcome: string }>;
}

export interface HistoricRates {
  overall: { k: number; n: number; low: number; high: number } | null;
  baselineVerdict: string;
  generatedFor: { date: string; proposer: string };
  classes: Record<string, ClassRate>;
}

export function historicRates(): HistoricRates {
  return forecasts as HistoricRates;
}

export interface Excluded {
  id: string;
  reason: "fixture" | "round_limit";
}

/**
 * Comparable runs only: completed, not a hand-written fixture, and with the round limit most
 * runs of the question used (a two-round demo is not the same experiment as five rounds).
 */
export async function loadTopicComparison(
  key: string,
): Promise<{ cmp: TopicComparison; excluded: Excluded[] } | null> {
  const sel = await selectTopicRuns(key);
  return sel ? { cmp: compareRuns(key, sel.items), excluded: sel.excluded } : null;
}

type Loaded = { summary: RunSummary; snap: RunSnapshot };

/** The comparable runs of one question in display order, shared by the topic views. */
export async function selectTopicRuns(
  key: string,
): Promise<{ items: Loaded[]; excluded: Excluded[] } | null> {
  const loaded = await loadAll();
  const all = [...loaded.values()]
    .map((x) => x.summary)
    .filter((r) => topicKeyOf(r) === key && r.status === "completed");
  const excluded: Excluded[] = [];
  const limits: Record<number, number> = {};
  for (const r of all)
    if (!r.id.startsWith("fixture-")) limits[r.roundLimit] = (limits[r.roundLimit] ?? 0) + 1;
  const modal = Number(Object.entries(limits).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0);
  const summaries = all.filter((r) => {
    if (r.id.startsWith("fixture-")) excluded.push({ id: r.id, reason: "fixture" });
    else if (r.roundLimit !== modal) excluded.push({ id: r.id, reason: "round_limit" });
    else return true;
    return false;
  });
  if (summaries.length === 0) return null;
  const items = summaries.flatMap((summary) => {
    const x = loaded.get(summary.id);
    return x ? [x] : [];
  });
  // References first, then ensemble members by label, then the rest by date.
  items.sort(
    (a, b) =>
      Number(b.summary.isReference) - Number(a.summary.isReference) ||
      a.summary.id.localeCompare(b.summary.id),
  );
  return { items, excluded };
}

/**
 * The committed NDJSON files are the record of the ensemble, so they win over database rows
 * with the same id (a dev database can hold an older run under a reference id). Runs that only
 * exist in the database are added after.
 */
async function loadAll(): Promise<Map<string, { summary: RunSummary; snap: RunSnapshot }>> {
  const out = new Map<string, { summary: RunSummary; snap: RunSnapshot }>();
  const dir = replayDir();
  if (existsSync(dir))
    for (const f of await readdir(dir)) {
      if (!f.endsWith(".ndjson")) continue;
      try {
        const snap = foldRun(
          parseNdjson(await readFile(path.join(/*turbopackIgnore: true*/ dir, f), "utf8")),
        );
        if (snap.run) out.set(snap.run.id, { summary: summarizeRun(snap), snap });
      } catch (error) {
        console.warn("run_file_invalid", f, error instanceof Error ? error.message : error);
      }
    }
  for (const summary of await listRuns()) {
    if (out.has(summary.id)) continue;
    const snap = await loadRunSnapshot(summary.id);
    if (snap?.run) out.set(summary.id, { summary, snap });
  }
  return out;
}
