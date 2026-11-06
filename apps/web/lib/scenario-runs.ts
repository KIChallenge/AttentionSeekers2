// Server-only: loads every run once and derives the scenario cards for the home page and the
// full data of one scenario page (runs, topic comparison, perspectives, coalitions, and the
// reference run's snapshot for the agent chat).
import type { CompromiseConsistency, LocalizedText, RunSnapshot, RunSummary } from "@sv/contracts";
import type { Evidence } from "@/components/run/evidence";
import { loadEvidence } from "@/components/run/evidence-server";
import { loadCompromiseSidecar } from "./runs";
import {
  type CoalitionPatterns,
  coalitionPatterns,
  type PerspectiveRow,
  perspectives,
  type ScenarioItem,
} from "./scenario-insights";
import { compareVariants, type VariantComparison } from "./scenario-variants";
import { groupScenarios, type Scenario, type ScenarioKind } from "./scenarios";
import { compareRuns, type TopicComparison } from "./topic-compare";
import { type HistoricRates, historicRates, loadAll } from "./topic-runs";

export interface ScenarioCard {
  key: string;
  baseKey: string;
  kind: ScenarioKind;
  template: RunSummary["template"];
  question: string;
  runCount: number;
  /** Runs in the comparison (completed). */
  compared: number;
  families: string[];
  referenceRunId: string;
  outcomeBadge: RunSummary["outcomeBadge"];
  /** Topics agreed in every compared run, and how many topics there are. */
  agreedAll: LocalizedText[];
  topicsOf: number;
  baseRate: { k: number; n: number } | null;
  updatedAt: string;
}

function baseRateOf(
  cmp: TopicComparison | null,
  hist: HistoricRates,
  template: RunSummary["template"],
): ScenarioCard["baseRate"] {
  if (!cmp) return null;
  // Rate for the measure class the scenario's proposals use most, else the overall rate.
  const classes = new Map<string, number>();
  for (const tp of cmp.topics)
    if (tp.measureClass) classes.set(tp.measureClass, (classes.get(tp.measureClass) ?? 0) + 1);
  const top = [...classes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const rate = top ? hist.classes[top] : undefined;
  if (rate && rate.n > 0 && !rate.smallN) return { k: rate.k, n: rate.n };
  // The overall rate is over health drafts, so a custom question gets no fallback.
  if (template === "custom" || !hist.overall) return null;
  return { k: hist.overall.k, n: hist.overall.n };
}

function comparable(s: Scenario, loaded: Map<string, ScenarioItem>): ScenarioItem[] {
  return s.runs.flatMap((r) => {
    const x = loaded.get(r.id);
    return x && r.status === "completed" ? [x] : [];
  });
}

const byReference = (a: RunSummary, b: RunSummary) =>
  Number(b.isReference) - Number(a.isReference) || b.createdAt.localeCompare(a.createdAt);

/** Scenario cards; the caller may pass the loaded runs to share one read with the overview. */
export async function loadScenarioCards(
  loaded?: Awaited<ReturnType<typeof loadAll>>,
): Promise<ScenarioCard[]> {
  loaded ??= await loadAll();
  const summaries = [...loaded.values()].map((x) => x.summary).sort(byReference);
  const hist = historicRates();
  return groupScenarios(summaries).map((s) => {
    const items = comparable(s, loaded);
    const cmp = items.length ? compareRuns(s.baseKey, items) : null;
    const n = cmp?.runs.length ?? 0;
    const ref = s.runs.find((r) => r.id === s.referenceRunId) ?? s.runs[0];
    return {
      key: s.key,
      baseKey: s.baseKey,
      kind: s.kind,
      template: s.template,
      question: s.question,
      runCount: s.runs.length,
      compared: n,
      families: s.families,
      referenceRunId: s.referenceRunId,
      outcomeBadge: ref?.outcomeBadge ?? "no_result",
      agreedAll: cmp ? cmp.topics.filter((t) => t.agreedIn === n).map((t) => t.label) : [],
      topicsOf: cmp?.topics.length ?? 0,
      baseRate: s.kind === "main" ? baseRateOf(cmp, hist, s.template) : null,
      updatedAt: s.updatedAt,
    };
  });
}

export interface ScenarioData {
  scenario: Scenario;
  cmp: TopicComparison | null;
  hist: HistoricRates;
  perspectives: PerspectiveRow[];
  coalitions: CoalitionPatterns;
  /** Room-setting variants of the question with the reference run (Szenarien tab). */
  variants: VariantComparison | null;
  /** Experte consistency check of the reference run's compromise (sidecar). */
  referenceConsistency: CompromiseConsistency | null;
  /** Reference run for the agent chat; null when its snapshot is not loadable. */
  reference: { snap: RunSnapshot; evidence: Evidence } | null;
}

export async function loadScenario(key: string): Promise<ScenarioData | null> {
  const loaded = await loadAll();
  const summaries = [...loaded.values()].map((x) => x.summary).sort(byReference);
  const scenario = groupScenarios(summaries).find((s) => s.key === key);
  if (!scenario) return null;
  const items = comparable(scenario, loaded);
  const refItem = loaded.get(scenario.referenceRunId);
  const sidecars = new Map(
    await Promise.all(
      items.map(async (x) => [x.summary.id, await loadCompromiseSidecar(x.summary.id)] as const),
    ),
  );
  return {
    scenario,
    cmp: items.length ? compareRuns(scenario.baseKey, items) : null,
    hist: historicRates(),
    perspectives: perspectives(items),
    coalitions: coalitionPatterns(items),
    variants: compareVariants(items, scenario.referenceRunId, (id) => sidecars.get(id) ?? null),
    referenceConsistency: sidecars.get(scenario.referenceRunId) ?? null,
    reference: refItem?.snap.run
      ? { snap: refItem.snap, evidence: await loadEvidence(scenario.referenceRunId) }
      : null,
  };
}
