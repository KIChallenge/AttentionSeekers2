import { positionAt, type RunSnapshot } from "@sv/contracts";

// Who works with whom: for every pair of institutions, on how many topics they stand on the
// same side and on how many on opposite sides at a given round. A side needs a clear stance
// (|stance| >= MIN); neutral positions count as neither. Pure, testable.

export const MIN_STANCE = 0.5;

export interface PairRelation {
  together: number;
  against: number;
  /** Topics counted (both took a clear side). */
  topics: number;
}

export function pairRelations(
  snap: Pick<RunSnapshot, "positions">,
  agents: readonly string[],
  topicIds: readonly string[],
  round: number,
): Record<string, Record<string, PairRelation>> {
  const side = (a: string, t: string) => {
    const p = positionAt(snap as RunSnapshot, a, t, round);
    if (!p || Math.abs(p.stance) < MIN_STANCE) return 0;
    return Math.sign(p.stance);
  };
  const out: Record<string, Record<string, PairRelation>> = {};
  for (const a of agents) {
    out[a] = {};
    for (const b of agents) {
      const r: PairRelation = { together: 0, against: 0, topics: 0 };
      if (a !== b)
        for (const t of topicIds) {
          const sa = side(a, t);
          const sb = side(b, t);
          if (!sa || !sb) continue;
          r.topics += 1;
          if (sa === sb) r.together += 1;
          else r.against += 1;
        }
      out[a][b] = r;
    }
  }
  return out;
}

/** Pairs sorted by net relation; the strongest allies first, then the clearest opponents last. */
export function rankedPairs(
  rel: Record<string, Record<string, PairRelation>>,
  agents: readonly string[],
): Array<{ a: string; b: string; r: PairRelation }> {
  const pairs: Array<{ a: string; b: string; r: PairRelation }> = [];
  agents.forEach((a, i) => {
    for (const b of agents.slice(i + 1)) {
      const r = rel[a]?.[b];
      if (r && r.topics > 0) pairs.push({ a, b, r });
    }
  });
  return pairs.sort((x, y) => y.r.together - y.r.against - (x.r.together - x.r.against));
}
