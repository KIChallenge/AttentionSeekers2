// Scenarios: runs grouped by question setting. A scenario is the template id (or the hash of
// a custom question), split by what the run was for: the main group carries the round limit
// most runs of the question used, shorter runs are check runs ("Prüfläufe"), and the
// hand-written fixture is the demo. Pure functions over run summaries; nothing per run id.
import type { RunSummary } from "@sv/contracts";
import { familyOf, topicKeyOf } from "./topic-compare";

export type ScenarioKind = "main" | "checks" | "demo";

export interface Scenario {
  /** Route key: the topic key, with `.checks` or `.demo` for the side groups. */
  key: string;
  baseKey: string;
  kind: ScenarioKind;
  template: RunSummary["template"];
  question: string;
  /** Reference first, then newest first (the order listRuns uses). */
  runs: RunSummary[];
  referenceRunId: string;
  /** Model families over all seats of all runs, sorted. */
  families: string[];
  roundLimit: number;
  /** Newest createdAt in the group. */
  updatedAt: string;
}

const DEMO_PREFIX = "fixture-";
const SUFFIX: Record<Exclude<ScenarioKind, "main">, string> = { checks: ".checks", demo: ".demo" };

/** Historical replays (template `backtest_*`) get their own card group. */
export const isBacktest = (s: Pick<Scenario, "template">): boolean =>
  s.template.startsWith("backtest_");

/** The only id-based rule: the committed fixture has no metadata that says it is hand-written. */
export const isDemoRun = (r: Pick<RunSummary, "id">): boolean => r.id.startsWith(DEMO_PREFIX);

export function scenarioKey(baseKey: string, kind: ScenarioKind): string {
  return kind === "main" ? baseKey : `${baseKey}${SUFFIX[kind]}`;
}

export function parseScenarioKey(key: string): { baseKey: string; kind: ScenarioKind } {
  for (const kind of ["checks", "demo"] as const)
    if (key.endsWith(SUFFIX[kind])) return { baseKey: key.slice(0, -SUFFIX[kind].length), kind };
  return { baseKey: key, kind: "main" };
}

/** Round limit most runs of a question used; ties go to the longer negotiation. */
export function modalRoundLimit(runs: Array<Pick<RunSummary, "roundLimit">>): number {
  const counts = new Map<number, number>();
  for (const r of runs) counts.set(r.roundLimit, (counts.get(r.roundLimit) ?? 0) + 1);
  return (
    [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ??
    runs[0]?.roundLimit ??
    0
  );
}

const byReferenceThenDate = (a: RunSummary, b: RunSummary) =>
  Number(b.isReference) - Number(a.isReference) || b.createdAt.localeCompare(a.createdAt);

function build(
  baseKey: string,
  kind: ScenarioKind,
  runs: RunSummary[],
  roundLimit: number,
): Scenario | null {
  if (runs.length === 0) return null;
  const sorted = [...runs].sort(byReferenceThenDate);
  const first = sorted[0];
  if (!first) return null;
  return {
    key: scenarioKey(baseKey, kind),
    baseKey,
    kind,
    template: first.template,
    question: first.question,
    runs: sorted,
    referenceRunId: first.id,
    families: [...new Set(sorted.flatMap((r) => r.models.map(familyOf)))].sort(),
    roundLimit,
    updatedAt:
      [...sorted].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.createdAt ??
      first.createdAt,
  };
}

/**
 * Groups runs into scenarios. Main scenarios come first (most runs first), then the check
 * groups, then the demos, so a grid can show the main ones and fold the rest.
 */
export function groupScenarios(runs: RunSummary[]): Scenario[] {
  const byBase = new Map<string, RunSummary[]>();
  for (const r of runs) {
    const k = topicKeyOf(r);
    byBase.set(k, [...(byBase.get(k) ?? []), r]);
  }
  const out: Scenario[] = [];
  for (const [baseKey, group] of byBase) {
    const demo = group.filter(isDemoRun);
    const real = group.filter((r) => !isDemoRun(r));
    const modal = modalRoundLimit(real);
    const main = real.filter((r) => r.roundLimit === modal);
    const checks = real.filter((r) => r.roundLimit !== modal);
    for (const s of [
      build(baseKey, "main", main, modal),
      build(baseKey, "checks", checks, modalRoundLimit(checks)),
      build(baseKey, "demo", demo, modalRoundLimit(demo)),
    ])
      if (s) out.push(s);
  }
  const rank: Record<ScenarioKind, number> = { main: 0, checks: 1, demo: 2 };
  return out.sort(
    (a, b) =>
      rank[a.kind] - rank[b.kind] ||
      b.runs.length - a.runs.length ||
      b.updatedAt.localeCompare(a.updatedAt),
  );
}

export function findScenario(runs: RunSummary[], key: string): Scenario | null {
  return groupScenarios(runs).find((s) => s.key === key) ?? null;
}
