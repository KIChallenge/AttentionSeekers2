// FR-A11: moderator coalition calculus. Pure function over votes, veto players and the
// active decision rule; no model call. The result drives which compromise is tabled.
import type {
  Coalition,
  CoalitionCalculus,
  DecisionRule,
  LocalizedText,
  PayoffSign,
} from "@sv/contracts";

export type Vote = "support" | "conditional" | "oppose";

export interface CalculusProposal {
  proposalId: string;
  topicIds: string[];
  /** Latest vote per agent; agents without a vote count as undecided. */
  votes: Record<string, Vote>;
  /** Payoff sign per agent from the FR-A10 incentives (falls back to the vote). */
  payoffs?: Record<string, PayoffSign>;
  /** Tie-breaker, 0..1. */
  acceptance?: number;
  status?: "open" | "accepted" | "rejected" | "withdrawn";
}

export interface CalculusInput {
  runId: string;
  round: number;
  agents: string[];
  decisionRule: DecisionRule;
  qualifiedMajority: { needed: number; of: number } | null;
  vetoPlayers: string[];
  proposals: CalculusProposal[];
  /** Optional per-topic stance alignment (agentId to stance) for alignment coalitions. */
  topicStances?: Record<string, Record<string, number>>;
  /** Cap on enumerated minimal winning coalitions per proposal. */
  maxCoalitions?: number;
}

const L = (de: string, en: string): LocalizedText => ({
  lang: "de",
  text: de,
  translations: { en },
});

/** Agents needed to pass under the rule (FR-U10). */
export function quorumFor(
  rule: DecisionRule,
  n: number,
  qm: { needed: number; of: number } | null,
): number {
  if (n === 0) return 0;
  if (rule === "consensus") return n;
  if (rule === "qualified_majority") {
    if (qm && qm.of > 0) return Math.min(n, Math.ceil((qm.needed / qm.of) * n));
    return Math.ceil((2 * n) / 3);
  }
  return Math.floor(n / 2) + 1;
}

/** Whether a set of supporters wins under the rule. */
export function isWinning(
  members: readonly string[],
  rule: DecisionRule,
  n: number,
  needed: number,
  vetoPlayers: readonly string[],
): boolean {
  const set = new Set(members);
  if (rule === "consensus") return set.size >= n;
  if (set.size < needed) return false;
  if (rule === "veto_players") return vetoPlayers.every((v) => set.has(v));
  return true;
}

function* combinations<T>(pool: readonly T[], k: number, start = 0, acc: T[] = []): Generator<T[]> {
  if (acc.length === k) {
    yield [...acc];
    return;
  }
  for (let i = start; i <= pool.length - (k - acc.length); i++) {
    acc.push(pool[i] as T);
    yield* combinations(pool, k, i + 1, acc);
    acc.pop();
  }
}

/**
 * Minimal winning coalitions drawn from the pool (supporters first, then conditional):
 * winning sets where removing any member makes them lose. Under a quota rule with veto
 * players these are exactly the sets of size max(needed, |veto|) containing all veto
 * players, so we enumerate that size directly. Ordered by how many conditional members
 * they need (fewest first).
 */
export function minimalWinningCoalitions(
  supporters: readonly string[],
  conditional: readonly string[],
  rule: DecisionRule,
  n: number,
  needed: number,
  vetoPlayers: readonly string[],
  max = 4,
): string[][] {
  const pool = [...supporters, ...conditional.filter((a) => !supporters.includes(a))];
  if (rule === "consensus") {
    return pool.length >= n ? [pool.slice().sort()] : [];
  }
  const veto = rule === "veto_players" ? vetoPlayers : [];
  if (!veto.every((v) => pool.includes(v))) return [];
  const size = Math.max(needed, veto.length);
  if (pool.length < size) return [];
  const rest = pool.filter((a) => !veto.includes(a));
  const out: Array<{ members: string[]; cost: number }> = [];
  for (const extra of combinations(rest, size - veto.length)) {
    const members = [...veto, ...extra];
    const cost = members.filter((m) => !supporters.includes(m)).length;
    out.push({ members: members.slice().sort(), cost });
    if (out.length > 400) break;
  }
  out.sort((a, b) => a.cost - b.cost || a.members.join().localeCompare(b.members.join()));
  return out.slice(0, max).map((c) => c.members);
}

/** Who can block the proposal under the active rule. */
export function blockersFor(
  opponents: readonly string[],
  conditional: readonly string[],
  rule: DecisionRule,
  n: number,
  needed: number,
  vetoPlayers: readonly string[],
): string[] {
  if (rule === "consensus") return [...opponents];
  const out = new Set<string>();
  if (rule === "veto_players") {
    for (const v of vetoPlayers) if (opponents.includes(v) || conditional.includes(v)) out.add(v);
  }
  // A blocking minority: the opponents alone deny the quorum.
  if (n - opponents.length < needed) for (const o of opponents) out.add(o);
  return [...out];
}

export function computeCalculus(input: CalculusInput): CoalitionCalculus {
  const { agents, decisionRule: rule } = input;
  const n = agents.length;
  const needed = quorumFor(rule, n, input.qualifiedMajority);
  const veto = rule === "veto_players" ? input.vetoPlayers.filter((v) => agents.includes(v)) : [];
  const live = input.proposals.filter((p) => (p.status ?? "open") !== "withdrawn");

  const rows = live.map((p) => {
    const supporters = agents.filter((a) => p.votes[a] === "support");
    const conditional = agents.filter((a) => p.votes[a] === "conditional");
    const opponents = agents.filter((a) => p.votes[a] === "oppose");
    const missingVetoPlayers = veto.filter((v) => !supporters.includes(v));
    const passes =
      rule === "consensus"
        ? opponents.length === 0 && supporters.length >= n - 1
        : isWinning(supporters, rule, n, needed, veto);
    const payoffs: Record<string, PayoffSign> = {};
    for (const a of agents) {
      const given = p.payoffs?.[a];
      if (given !== undefined) payoffs[a] = given;
      else payoffs[a] = p.votes[a] === "support" ? 1 : p.votes[a] === "oppose" ? -1 : 0;
    }
    return {
      proposalId: p.proposalId,
      supporters,
      conditional,
      opponents,
      containsAllVetoPlayers: missingVetoPlayers.length === 0,
      missingVetoPlayers,
      passes,
      blockers: blockersFor(opponents, conditional, rule, n, needed, veto),
      minimalWinningCoalitions: minimalWinningCoalitions(
        supporters,
        conditional,
        rule,
        n,
        needed,
        veto,
        input.maxCoalitions ?? 4,
      ),
      payoffs,
    };
  });

  // Coalitions: supporting and blocking sets per proposal, plus topic alignment.
  const coalitions: Coalition[] = [];
  const seen = new Map<string, Coalition>();
  const add = (
    kind: Coalition["kind"],
    members: string[],
    topicIds: string[],
    note: LocalizedText,
  ) => {
    if (members.length < 2) return;
    const key = `${kind}:${[...members].sort().join(",")}`;
    const prev = seen.get(key);
    if (prev) {
      for (const t of topicIds) if (!prev.topicIds.includes(t)) prev.topicIds.push(t);
      return;
    }
    const c: Coalition = {
      id: `co-${input.round}-${coalitions.length + 1}`,
      members: [...members].sort(),
      topicIds: [...topicIds],
      kind,
      note,
    };
    seen.set(key, c);
    coalitions.push(c);
  };
  for (const [i, r] of rows.entries()) {
    const p = live[i];
    if (!p) continue;
    add(
      "supporting",
      r.supporters,
      p.topicIds,
      L(`Trägt ${r.proposalId}`, `Supports ${r.proposalId}`),
    );
    add(
      "blocking",
      r.opponents,
      p.topicIds,
      L(`Lehnt ${r.proposalId} ab`, `Opposes ${r.proposalId}`),
    );
  }
  for (const [topicId, stances] of Object.entries(input.topicStances ?? {})) {
    const pro = Object.entries(stances)
      .filter(([, s]) => s >= 1)
      .map(([a]) => a);
    const contra = Object.entries(stances)
      .filter(([, s]) => s <= -1)
      .map(([a]) => a);
    add(
      "alignment",
      pro,
      [topicId],
      L("Gleiche Richtung beim Thema", "Same direction on the topic"),
    );
    add("alignment", contra, [topicId], L("Gemeinsam dagegen", "Jointly against"));
  }

  // nextTabled: passing proposals first, then the smallest distance to a winning set.
  const open = rows.filter((_, i) => (live[i]?.status ?? "open") === "open");
  const score = (r: (typeof rows)[number]) => {
    const pool = r.supporters.length + r.conditional.length;
    const missing =
      rule === "veto_players"
        ? veto.filter((v) => !r.supporters.includes(v) && !r.conditional.includes(v)).length
        : 0;
    const shortfall = Math.max(0, needed - pool);
    return { passes: r.passes, distance: missing * 2 + shortfall, support: r.supporters.length };
  };
  let nextTabled: CoalitionCalculus["nextTabled"] = null;
  const ranked = open
    .map((r) => ({
      r,
      s: score(r),
      acc: live.find((p) => p.proposalId === r.proposalId)?.acceptance ?? 0,
    }))
    .sort(
      (a, b) =>
        Number(b.s.passes) - Number(a.s.passes) ||
        a.s.distance - b.s.distance ||
        b.s.support - a.s.support ||
        b.acc - a.acc,
    );
  const best = ranked[0];
  if (best) {
    const r = best.r;
    const cond = r.conditional.length ? r.conditional.join(", ") : "-";
    nextTabled = {
      proposalId: r.proposalId,
      reason: r.passes
        ? L(
            `${r.proposalId} erfüllt die Entscheidungsregel (${r.supporters.length} von ${n}, alle Vetospieler dabei).`,
            `${r.proposalId} meets the decision rule (${r.supporters.length} of ${n}, all veto players on board).`,
          )
        : r.missingVetoPlayers.length > 0 && rule === "veto_players"
          ? L(
              `${r.proposalId} liegt am nächsten an einer Gewinnkoalition; es fehlen die Vetospieler ${r.missingVetoPlayers.join(", ")}. Bedingte Zustimmung: ${cond}.`,
              `${r.proposalId} is closest to a winning coalition; veto players missing: ${r.missingVetoPlayers.join(", ")}. Conditional: ${cond}.`,
            )
          : L(
              `${r.proposalId} liegt am nächsten an der Schwelle (${r.supporters.length} Zustimmungen, ${needed} nötig). Bedingte Zustimmung: ${cond}.`,
              `${r.proposalId} is closest to the threshold (${r.supporters.length} in favour, ${needed} needed). Conditional: ${cond}.`,
            ),
    };
  }

  return {
    runId: input.runId,
    round: input.round,
    decisionRule: rule,
    quorum: { needed, of: n },
    vetoPlayers: veto,
    proposals: rows,
    coalitions,
    nextTabled,
  };
}

/** FR-O2 class of a proposal from its votes. */
export function outcomeClassOf(
  supporters: number,
  opponents: number,
  n: number,
): "consensus" | "majority" | "minority" | "no_result" {
  if (n > 0 && opponents === 0 && supporters >= n - 1) return "consensus";
  if (supporters > n / 2) return "majority";
  if (supporters > 0) return "minority";
  return "no_result";
}
