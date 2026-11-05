// Server-only: loads every run of one question and builds the topic comparison, plus the
// cached historical base rate per measure class (lib/topic-forecasts.json, see
// scripts/topic-forecasts.ts).

import { listRuns, loadRunSnapshot } from "./runs";
import { compareRuns, type TopicComparison, topicKeyOf } from "./topic-compare";
import forecasts from "./topic-forecasts.json";

export interface ClassRate {
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
  const all = (await listRuns()).filter((r) => topicKeyOf(r) === key && r.status === "completed");
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
  const items = [];
  for (const summary of summaries) {
    const snap = await loadRunSnapshot(summary.id);
    if (snap) items.push({ summary, snap });
  }
  // References first, then ensemble members by label, then the rest by date.
  items.sort(
    (a, b) =>
      Number(b.summary.isReference) - Number(a.summary.isReference) ||
      a.summary.id.localeCompare(b.summary.id),
  );
  return { cmp: compareRuns(key, items), excluded };
}
