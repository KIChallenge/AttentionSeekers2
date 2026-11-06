// Scenario variants: the same question under changed room settings (decision rule, budget
// ceiling, climate), compared side by side with the reference run. Pure functions over folded
// runs; the page renders what these return.
import type {
  CompromisePackage,
  CompromiseResult,
  LocalizedText,
  RunSnapshot,
  RunSummary,
} from "@sv/contracts";

export interface Range {
  value: number;
  low: number | null;
  high: number | null;
}

export interface VariantColumn {
  id: string;
  /** Variant label from Run.variant ("budget_tight", ...) or "reference". */
  label: string;
  isReference: boolean;
  rule: "consensus" | "qualified_majority" | "veto_players";
  budgetPct: number;
  climate: "cooperative" | "neutral" | "confrontational";
  accepted: Array<{ id: string; title: LocalizedText }>;
  tabled: number;
  compromise: CompromisePackage | null;
  compromiseResult: CompromiseResult | null;
  /** Package impact (evidence basis) with its range; null when nothing was modelled. */
  wait: Range | null;
  cost: Range | null;
  /** Topics still in conflict after the last round. */
  conflicts: LocalizedText[];
  /** Agreement per topic id: supporters / seats at the end. */
  agreement: Record<string, { support: number; oppose: number; of: number }>;
}

export interface VariantComparison {
  topics: Array<{ id: string; label: LocalizedText }>;
  columns: VariantColumn[];
}

/** Display order: reference first, then the settings in pairs. */
export const VARIANT_ORDER = [
  "reference",
  "budget_tight",
  "budget_generous",
  "climate_cooperative",
  "climate_confrontational",
  "rule_veto",
  "rule_consensus",
];

const rangeOf = (s: RunSnapshot, metric: string): Range | null => {
  const f = s.figures.find((x) => x.measureId === "package" && x.metric === metric);
  if (!f || f.value === null || f.notModelled) return null;
  return { value: f.value, low: f.low, high: f.high };
};

export function isVariantRun(s: RunSnapshot): boolean {
  return s.run?.variant.kind === "scenario";
}

export function variantColumn(s: RunSnapshot): VariantColumn | null {
  const run = s.run;
  if (!run) return null;
  const proposals = s.proposalOrder.flatMap((id) => (s.proposals[id] ? [s.proposals[id]] : []));
  const last = s.summaries.at(-1);
  const topicLabel = (id: string) =>
    run.mandate.topics.find((t) => t.id === id)?.label ?? {
      lang: "de" as const,
      text: id,
      translations: {},
    };
  const agreement: VariantColumn["agreement"] = {};
  for (const t of run.mandate.topics) {
    let support = 0;
    let oppose = 0;
    let of = 0;
    for (const a of run.agents) {
      const p = s.positions[a.id]?.[t.id]?.at(-1);
      if (!p) continue;
      of++;
      if (p.stance >= 0.5) support++;
      else if (p.stance <= -0.5) oppose++;
    }
    agreement[t.id] = { support, oppose, of };
  }
  return {
    id: run.id,
    label: run.variant.kind === "scenario" ? run.variant.label : "reference",
    isReference: run.isReference,
    rule: run.room.decisionRule,
    budgetPct: run.room.budgetCeiling.maxIncreasePct,
    climate: run.room.climate,
    accepted: proposals
      .filter((p) => p.status === "accepted")
      .map((p) => ({ id: p.id, title: p.title })),
    tabled: proposals.length,
    compromise: s.compromise ?? null,
    compromiseResult: s.compromiseResult ?? null,
    wait: rangeOf(s, "wait_change_pct"),
    cost: rangeOf(s, "cost_eur_pa"),
    conflicts: [...new Set(last?.openConflicts.map((c) => c.topicId) ?? [])].map(topicLabel),
    agreement,
  };
}

/**
 * The variants of a scenario plus its reference run, when the reference already has the
 * compromise step (older references are left out so the columns compare like with like).
 */
export function compareVariants(
  items: Array<{ summary: RunSummary; snap: RunSnapshot }>,
  referenceRunId: string,
): VariantComparison | null {
  const done = items.filter((x) => x.summary.status === "completed");
  const variants = done.filter((x) => isVariantRun(x.snap));
  if (variants.length === 0) return null;
  const ref = done.find((x) => x.summary.id === referenceRunId && x.snap.compromise);
  const cols = [...(ref ? [ref] : []), ...variants]
    .map((x) => variantColumn(x.snap))
    .filter((c): c is VariantColumn => Boolean(c))
    .sort((a, b) => rank(a.label) - rank(b.label));
  const first = (ref ?? variants[0])?.snap.run;
  return {
    topics: first?.mandate.topics.map((t) => ({ id: t.id, label: t.label })) ?? [],
    columns: cols,
  };
}

const rank = (label: string) => {
  const i = VARIANT_ORDER.indexOf(label);
  return i < 0 ? VARIANT_ORDER.length : i;
};

/** One plain sentence on top: where the compromise carries and where it fails. */
export function variantHeadline(
  cmp: VariantComparison,
  labelOf: (label: string) => string,
  lang: "de" | "en",
): string {
  const withK = cmp.columns.filter((c) => c.compromiseResult);
  const carried = withK.filter((c) => c.compromiseResult?.passes);
  const failed = withK.filter((c) => !c.compromiseResult?.passes);
  const list = (cs: VariantColumn[]) => cs.map((c) => labelOf(c.label)).join(", ");
  const n = withK.length;
  if (n === 0)
    return lang === "de"
      ? "Keine Variante hat einen Kompromissvorschlag des Moderators."
      : "No variant has a moderator compromise proposal.";
  if (lang === "de") {
    if (carried.length === n)
      return `Der Kompromissvorschlag des Moderators trägt in allen ${n} Varianten.`;
    if (carried.length === 0)
      return `Der Kompromissvorschlag des Moderators scheitert in allen ${n} Varianten.`;
    return `Der Kompromissvorschlag des Moderators trägt in ${carried.length} von ${n} Varianten und scheitert bei ${list(failed)}.`;
  }
  if (carried.length === n) return `The moderator's compromise carries in all ${n} variants.`;
  if (carried.length === 0) return `The moderator's compromise fails in all ${n} variants.`;
  return `The moderator's compromise carries in ${carried.length} of ${n} variants and fails under ${list(failed)}.`;
}
