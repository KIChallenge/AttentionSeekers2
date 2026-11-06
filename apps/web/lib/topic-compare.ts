// Topic comparison across runs of one question (FR-X3, FR-X4, FR-J4). Pure functions over
// folded snapshots, so the page, tests and any export share one reading of "robust".
//
// What is measured: the simulation's sensitivity to which model plays which seat. Nothing here
// says anything about real institutions; the page states that next to every number.
import {
  type LocalizedText,
  type OutcomeClass,
  positionAt,
  type RunSnapshot,
  type RunSummary,
  topicStatus,
} from "@sv/contracts";

/** Route key for a question: the template id, or a short hash of a custom question. */
export function topicKeyOf(r: Pick<RunSummary, "template" | "question">): string {
  if (r.template && r.template !== "custom") return r.template;
  let h = 0x811c9dc5;
  for (const ch of r.question.trim().toLowerCase().replace(/\s+/g, " ")) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `q-${h.toString(16).padStart(8, "0")}`;
}

/**
 * Model family from a gateway id: "azure/gpt-6-sol" -> "gpt", "bedrock/eu.amazon.nova-pro" ->
 * "nova", "bedrock/moonshotai.kimi-k2.5" -> "kimi". The open-weight gpt-oss is its own family
 * here, since it is a different model line from the gateway GPT.
 */
const FAMILY_PATTERNS: Array<[RegExp, string]> = [
  [/gpt-oss/, "gpt-oss"],
  [/gpt/, "gpt"],
  [/nova/, "nova"],
  [/deepseek/, "deepseek"],
  [/qwen/, "qwen"],
  [/kimi|moonshot/, "kimi"],
  [/glm|zai\./, "glm"],
  [/mistral|devstral|pixtral/, "mistral"],
  [/minimax/, "minimax"],
  [/claude/, "claude"],
  [/llama/, "llama"],
  [/gemini/, "gemini"],
];
export function familyOf(model: string | undefined): string {
  if (!model) return "unknown";
  const m = model.toLowerCase();
  for (const [re, f] of FAMILY_PATTERNS) if (re.test(m)) return f;
  return m.split("/").at(-1)?.split(/[-.:]/)[0] ?? m;
}

export type Agreement = "agreed" | "open";
const agreementOf = (s: OutcomeClass): Agreement =>
  s === "consensus" || s === "majority" ? "agreed" : "open";

export interface RunColumn {
  id: string;
  isReference: boolean;
  variantKind: string;
  /** model_ensemble or scenario label, else the variant kind. */
  label: string;
  /** A family ("gpt", "deepseek", ...) or "mixed": which families sat at the institutions' seats. */
  seatFamilies: string;
  seatModels: Record<string, string>;
  agreed: number;
  of: number;
  accepted: number;
  tabled: number;
  outcomeBadge: RunSummary["outcomeBadge"];
  durationMs: number;
  /** Package figures summed over accepted measures (null when none was modelled). */
  waitChangePct: number | null;
  costEurMio: number | null;
  /** Seat calls recorded (llm.call with an agent), and those served by the fallback model. */
  seatCalls: number;
  fallbackCalls: number;
  tokensIn: number;
  tokensOut: number;
  /** Estimate from the engine's price table; null for runs without call records. */
  costUsd: number | null;
}

export interface ProposalCell {
  id: string;
  title: LocalizedText;
  status: "open" | "accepted" | "rejected" | "withdrawn";
  measureClass: string;
}

export interface TopicCell {
  runId: string;
  status: OutcomeClass;
  agreement: Agreement;
  support: number;
  oppose: number;
  of: number;
  proposals: ProposalCell[];
  waitChangePct: number | null;
  costEurMio: number | null;
}

export type Robustness = "robust" | "model_dependent" | "single_run";

export interface TopicRow {
  id: string;
  label: LocalizedText;
  measure: LocalizedText | null;
  cells: TopicCell[];
  /** final stance per institution per run (null when the seat never stated one). */
  stances: Record<string, Array<number | null>>;
  agreedIn: number;
  acceptedIn: number;
  tabledIn: number;
  robustness: Robustness;
  /** Families seen across the runs that reached the majority reading. */
  familiesCovered: string[];
  /** Most frequent measure class of the proposals tabled on this topic. */
  measureClass: string | null;
}

export interface SeatEffect {
  agentId: string;
  /** Mean over topics of |mean stance when played by family A - by family B|. */
  betweenFamilies: number | null;
  /** Mean over topics of the stance range among runs with the same family at this seat. */
  withinFamily: number | null;
  families: Record<string, number>;
  verdict: "model_dependent" | "stable" | "insufficient";
}

export interface TopicComparison {
  key: string;
  question: string;
  runs: RunColumn[];
  topics: TopicRow[];
  seats: SeatEffect[];
  families: string[];
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function figureSum(s: RunSnapshot, ids: Set<string>, metric: string): number | null {
  const fs = s.figures.filter(
    (f) => ids.has(f.measureId) && f.metric === metric && !f.notModelled && f.value !== null,
  );
  return fs.length ? fs.reduce((a, f) => a + (f.value ?? 0), 0) : null;
}

function seatFamiliesOf(seatModels: Record<string, string>): string {
  const fams = [...new Set(Object.values(seatModels).map(familyOf))].sort();
  return fams.length === 1 ? (fams[0] ?? "unknown") : "mixed";
}

/** Two stances further apart than this count as a behaviour change (scale -2..+2). */
export const SEAT_EFFECT_THRESHOLD = 0.5;

export function compareRuns(
  key: string,
  items: Array<{ summary: RunSummary; snap: RunSnapshot }>,
): TopicComparison {
  const usable = items.filter((x) => x.snap.run && x.snap.status !== "failed");
  const first = usable[0]?.snap.run;
  const runs: RunColumn[] = usable.map(({ summary, snap }) => {
    const run = snap.run;
    if (!run) throw new Error("unreachable");
    const seatModels: Record<string, string> = {};
    for (const a of run.agents) {
      const m = run.modelAssignment[a.id];
      if (m) seatModels[a.id] = m;
    }
    const ps = snap.proposalOrder.map((id) => snap.proposals[id]).filter((p) => p !== undefined);
    const acc = new Set(ps.filter((p) => p.status === "accepted").map((p) => p.id));
    const seatCalls = snap.llmCalls.filter((c) => c.agentId !== null && c.agentId in seatModels);
    return {
      id: summary.id,
      isReference: summary.isReference,
      variantKind: run.variant.kind,
      label:
        run.variant.kind === "model_ensemble" || run.variant.kind === "scenario"
          ? run.variant.label
          : run.variant.kind,
      seatFamilies: seatFamiliesOf(seatModels),
      seatModels,
      agreed: summary.agreementShare.agreed,
      of: summary.agreementShare.of,
      accepted: acc.size,
      tabled: ps.length,
      outcomeBadge: summary.outcomeBadge,
      durationMs: summary.durationMs,
      waitChangePct: figureSum(snap, acc, "wait_change_pct"),
      costEurMio: figureSum(snap, acc, "cost_eur_pa"),
      seatCalls: seatCalls.length,
      fallbackCalls: seatCalls.filter((c) => c.fallbackFrom).length,
      tokensIn: snap.llmCalls.reduce((a, c) => a + c.tokensIn, 0),
      tokensOut: snap.llmCalls.reduce((a, c) => a + c.tokensOut + c.tokensReasoning, 0),
      costUsd: snap.llmCalls.length
        ? snap.llmCalls.reduce((a, c) => a + (c.costUsd ?? 0), 0)
        : null,
    };
  });

  const topicDefs = first?.mandate.topics ?? [];
  const agentIds = [...new Set(usable.flatMap((x) => x.snap.run?.agents.map((a) => a.id) ?? []))];

  const topics: TopicRow[] = topicDefs.map((tp) => {
    const cells: TopicCell[] = usable.map(({ summary, snap }) => {
      const st = topicStatus(snap, tp.id);
      const ps = snap.proposalOrder
        .flatMap((id) => {
          const p = snap.proposals[id];
          return p?.topicIds.includes(tp.id) ? [p] : [];
        })
        .map((p) => ({
          id: p.id,
          title: p.title,
          status: p.status,
          measureClass: p.measureClass ?? "other",
        }));
      const acc = new Set(ps.filter((p) => p.status === "accepted").map((p) => p.id));
      return {
        runId: summary.id,
        ...st,
        agreement: agreementOf(st.status),
        proposals: ps,
        waitChangePct: figureSum(snap, acc, "wait_change_pct"),
        costEurMio: figureSum(snap, acc, "cost_eur_pa"),
      };
    });
    const stances: TopicRow["stances"] = {};
    for (const a of agentIds)
      stances[a] = usable.map(({ snap }) => positionAt(snap, a, tp.id)?.stance ?? null);
    const agreedIn = cells.filter((c) => c.agreement === "agreed").length;
    const acceptedIn = cells.filter((c) => c.proposals.some((p) => p.status === "accepted")).length;
    const tabledIn = cells.filter((c) => c.proposals.length > 0).length;
    const majority: Agreement = agreedIn * 2 >= cells.length ? "agreed" : "open";
    const familiesCovered = [
      ...new Set(
        cells
          .map((c, i) => (c.agreement === majority ? runs[i]?.seatFamilies : undefined))
          .filter((f): f is string => Boolean(f)),
      ),
    ];
    const sameAgreement = agreedIn === 0 || agreedIn === cells.length;
    const sameAcceptance = acceptedIn === 0 || acceptedIn === cells.length;
    const classes: Record<string, number> = {};
    for (const c of cells)
      for (const p of c.proposals) classes[p.measureClass] = (classes[p.measureClass] ?? 0) + 1;
    const measureClass = Object.entries(classes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return {
      id: tp.id,
      label: tp.label,
      measure: tp.measure ?? null,
      cells,
      stances,
      agreedIn,
      acceptedIn,
      tabledIn,
      robustness:
        cells.length < 2
          ? "single_run"
          : sameAgreement && sameAcceptance
            ? "robust"
            : "model_dependent",
      familiesCovered,
      measureClass,
    };
  });

  // Permutation effect (FR-X3): for each seat, final stances grouped by the family that played it.
  const seats: SeatEffect[] = agentIds.map((agentId) => {
    const famOfRun = runs.map((r) => familyOf(r.seatModels[agentId]));
    const families: Record<string, number> = {};
    for (const f of famOfRun) families[f] = (families[f] ?? 0) + 1;
    const fams = Object.keys(families);
    const between: number[] = [];
    const within: number[] = [];
    for (const tp of topics) {
      const xs = tp.stances[agentId] ?? [];
      const byFam: Record<string, number[]> = {};
      xs.forEach((x, i) => {
        const f = famOfRun[i];
        if (x === null || x === undefined || !f) return;
        byFam[f] = [...(byFam[f] ?? []), x];
      });
      const means = Object.values(byFam)
        .map(mean)
        .filter((m): m is number => m !== null);
      if (means.length >= 2) between.push(Math.max(...means) - Math.min(...means));
      for (const g of Object.values(byFam))
        if (g.length >= 2) within.push(Math.max(...g) - Math.min(...g));
    }
    const b = mean(between);
    const w = mean(within);
    let verdict: SeatEffect["verdict"] = "insufficient";
    if (fams.length >= 2 && b !== null)
      verdict = b >= SEAT_EFFECT_THRESHOLD && b > (w ?? 0) ? "model_dependent" : "stable";
    return { agentId, betweenFamilies: b, withinFamily: w, families, verdict };
  });

  return {
    key,
    question: first?.mandate.question ?? usable[0]?.summary.question ?? "",
    runs,
    topics,
    seats,
    families: [...new Set(runs.flatMap((r) => Object.values(r.seatModels).map(familyOf)))].sort(),
  };
}
