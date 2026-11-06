// Cross-run readings for one scenario: how each institution starts and ends per topic, which
// red lines were touched, what it supported or opposed, and which institutions voted together.
// Pure functions over folded snapshots; the order of `items` is the column order everywhere.
import {
  type LocalizedText,
  pathLength,
  positionAt,
  type RunSnapshot,
  type RunSummary,
} from "@sv/contracts";

export interface ScenarioItem {
  summary: RunSummary;
  snap: RunSnapshot;
}

export interface PerspectiveTopic {
  topicId: string;
  label: LocalizedText;
  /** Opening stance (round 1) from the first run that recorded one. */
  start: number | null;
  /** Final stance per run, aligned with `items`; null when the seat never stated one. */
  finals: Array<number | null>;
}

export interface RedLineUse {
  id: string;
  /** Utterances across all runs that touched this red line. */
  touched: number;
  runsTouched: number;
}

export interface ProposalVote {
  runId: string;
  proposalId: string;
  title: LocalizedText;
  status: "open" | "accepted" | "rejected" | "withdrawn";
}

export interface PerspectiveRow {
  agentId: string;
  topics: PerspectiveTopic[];
  redLines: RedLineUse[];
  supported: ProposalVote[];
  opposed: ProposalVote[];
  /** Mean path length over the runs the seat sat in. */
  moved: number;
  /** Runs this institution took part in. */
  runIds: string[];
}

function votesOf(p: {
  supporters: string[];
  opponents: string[];
  votes?: Array<{ agentId: string; vote: "support" | "conditional" | "oppose" }>;
}): { support: Set<string>; oppose: Set<string> } {
  if (p.votes?.length) {
    return {
      support: new Set(p.votes.filter((v) => v.vote === "support").map((v) => v.agentId)),
      oppose: new Set(p.votes.filter((v) => v.vote === "oppose").map((v) => v.agentId)),
    };
  }
  return { support: new Set(p.supporters), oppose: new Set(p.opponents) };
}

export function perspectives(items: ScenarioItem[]): PerspectiveRow[] {
  const usable = items.filter((x) => x.snap.run);
  const agentIds = [...new Set(usable.flatMap((x) => x.snap.run?.agents.map((a) => a.id) ?? []))];
  const topicDefs = usable[0]?.snap.run?.mandate.topics ?? [];
  return agentIds.map((agentId) => {
    const mine = usable.filter((x) => x.snap.run?.agents.some((a) => a.id === agentId));
    const cfg = mine[0]?.snap.run?.agents.find((a) => a.id === agentId);
    const topics: PerspectiveTopic[] = topicDefs.map((tp) => {
      const starts = usable.map(({ snap }) => positionAt(snap, agentId, tp.id, 1)?.stance ?? null);
      return {
        topicId: tp.id,
        label: tp.label,
        start: starts.find((s): s is number => s !== null) ?? null,
        finals: usable.map(({ snap }) => positionAt(snap, agentId, tp.id)?.stance ?? null),
      };
    });
    const redLines: RedLineUse[] = (cfg?.redLineIds ?? []).map((id) => {
      let touched = 0;
      let runsTouched = 0;
      for (const { snap } of usable) {
        const n = snap.utteranceOrder.filter((u) =>
          snap.utterances[u]?.redLinesTouched.includes(id),
        ).length;
        touched += n;
        if (n > 0) runsTouched++;
      }
      return { id, touched, runsTouched };
    });
    const supported: ProposalVote[] = [];
    const opposed: ProposalVote[] = [];
    for (const { summary, snap } of mine) {
      for (const pid of snap.proposalOrder) {
        const p = snap.proposals[pid];
        if (!p) continue;
        const v = votesOf(p);
        const row = { runId: summary.id, proposalId: p.id, title: p.title, status: p.status };
        if (v.support.has(agentId)) supported.push(row);
        else if (v.oppose.has(agentId)) opposed.push(row);
      }
    }
    const lens = mine.map(({ snap }) => pathLength(snap, agentId));
    return {
      agentId,
      topics,
      redLines,
      supported,
      opposed,
      moved: lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0,
      runIds: mine.map((x) => x.summary.id),
    };
  });
}

export interface AlignmentMatrix {
  agentIds: string[];
  /** same[i][j]: (run, proposal) pairs where i and j voted on the same side. */
  same: number[][];
  /** both[i][j]: pairs where both expressed a side (support or oppose). */
  both: number[][];
}

export interface ProposalVerdict {
  runId: string;
  proposalId: string;
  title: LocalizedText;
  status: "accepted" | "rejected";
  round: number;
  supporters: string[];
  opponents: string[];
  /** From the last coalition calculus that scored the proposal; empty when none did. */
  minimalWinningCoalitions: string[][];
  blockers: string[];
}

export interface CoalitionPatterns {
  matrix: AlignmentMatrix;
  /** Pairs with at least one shared vote, strongest first. */
  pairs: Array<{ a: string; b: string; same: number; both: number }>;
  /** How often each institution was a blocker over all scored proposals. */
  blockers: Array<{ agentId: string; count: number; of: number }>;
  verdicts: ProposalVerdict[];
}

export function coalitionPatterns(items: ScenarioItem[]): CoalitionPatterns {
  const usable = items.filter((x) => x.snap.run);
  const agentIds = [...new Set(usable.flatMap((x) => x.snap.run?.agents.map((a) => a.id) ?? []))];
  const idx = new Map(agentIds.map((a, i) => [a, i]));
  const n = agentIds.length;
  const same = agentIds.map(() => agentIds.map(() => 0));
  const both = agentIds.map(() => agentIds.map(() => 0));
  const verdicts: ProposalVerdict[] = [];
  const blockCount = new Map<string, number>();
  let scored = 0;

  for (const { summary, snap } of usable) {
    for (const pid of snap.proposalOrder) {
      const p = snap.proposals[pid];
      if (!p) continue;
      const v = votesOf(p);
      const side = new Map<string, 1 | -1>();
      for (const a of v.support) side.set(a, 1);
      for (const a of v.oppose) side.set(a, -1);
      const sided = [...side.keys()].filter((a) => idx.has(a));
      for (let i = 0; i < sided.length; i++)
        for (let j = i + 1; j < sided.length; j++) {
          const a = sided[i];
          const b = sided[j];
          if (!a || !b) continue;
          const ia = idx.get(a);
          const ib = idx.get(b);
          if (ia === undefined || ib === undefined) continue;
          const rowA = both[ia];
          const rowB = both[ib];
          if (rowA) rowA[ib] = (rowA[ib] ?? 0) + 1;
          if (rowB) rowB[ia] = (rowB[ia] ?? 0) + 1;
          if (side.get(a) === side.get(b)) {
            const sA = same[ia];
            const sB = same[ib];
            if (sA) sA[ib] = (sA[ib] ?? 0) + 1;
            if (sB) sB[ia] = (sB[ia] ?? 0) + 1;
          }
        }
      if (p.status !== "accepted" && p.status !== "rejected") continue;
      const calc = [...snap.calculi]
        .sort((a, b) => b.round - a.round)
        .flatMap((c) => c.proposals.filter((x) => x.proposalId === p.id))[0];
      if (calc) {
        scored++;
        for (const b of calc.blockers) blockCount.set(b, (blockCount.get(b) ?? 0) + 1);
      }
      verdicts.push({
        runId: summary.id,
        proposalId: p.id,
        title: p.title,
        status: p.status,
        round: p.round,
        supporters: [...v.support],
        opponents: [...v.oppose],
        minimalWinningCoalitions: calc?.minimalWinningCoalitions ?? [],
        blockers: calc?.blockers ?? [],
      });
    }
  }

  const pairs: CoalitionPatterns["pairs"] = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const s = same[i]?.[j] ?? 0;
      const b = both[i]?.[j] ?? 0;
      const a = agentIds[i];
      const c = agentIds[j];
      if (s > 0 && a && c) pairs.push({ a, b: c, same: s, both: b });
    }
  pairs.sort((x, y) => y.same - x.same || y.same / y.both - x.same / x.both);

  const blockers = agentIds
    .map((agentId) => ({ agentId, count: blockCount.get(agentId) ?? 0, of: scored }))
    .filter((b) => b.count > 0)
    .sort((a, b) => b.count - a.count);

  return { matrix: { agentIds, same, both }, pairs, blockers, verdicts };
}
