// Model bias across the ensemble of one question: where does each run end up, measured against
// what the data leads us to expect? Pure functions over folded snapshots, so the page and the
// tests share one reading of "erwartbar" and "abseits".
//
// What is measured: the simulation's dependence on which model plays the seats, with one run
// per family. Nothing here says anything about real institutions.
import { type Axis, type LocalizedText, positionAt, type RunSnapshot } from "@sv/contracts";

/** Stance scale of positions: -2..+2, so the largest possible gap is 4. */
export const STANCE_RANGE = 4;

/** Score weights; quality is skipped (weights renormalised) when a run has no audit. */
export const SCORE_WEIGHTS = { stance: 0.5, outcome: 0.25, quality: 0.25 } as const;

/** A stance gap of this size or more counts as fully off (normalisation of the stance term). */
export const STANCE_FULL_SCALE = 2;

export interface BiasRunInput {
  id: string;
  snap: RunSnapshot;
  /** Overall audit score 0..1 from <run>.quality.json, null when not audited. */
  quality: number | null;
}

export interface RedLineDef {
  id: string;
  topicKeys: string[];
}

export interface AxisDef {
  id: "x" | "y";
  label: LocalizedText;
  poles: [LocalizedText, LocalizedText];
  weights: Record<string, number>;
}

export interface Point {
  x: number | null;
  y: number | null;
}

export interface BiasRow {
  id: string;
  /** Mean signed shift per axis over all institutions (final minus expected). */
  direction: { x: number | null; y: number | null };
  /** Per institution: final point on the axes. */
  finals: Record<string, Point>;
  /** Per institution: mean |final - expected| over topics. */
  deviation: Record<string, number | null>;
  /** Mean |final - expected| over every institution and topic. */
  stanceDev: number | null;
  temperament: Temperament;
  quality: number | null;
  score: ScoreParts;
}

export interface Temperament {
  tabled: number;
  accepted: number;
  /** accepted / tabled; null when nothing was tabled. */
  acceptRate: number | null;
  /** Stance moves with a recorded trigger, per round after the opening. */
  movesPerRound: number;
  redLines: number;
  touched: number;
  /** Red lines whose owner kept the sign of its opening stance on every red-line topic. */
  held: number;
  conditionalShare: number | null;
  votes: number;
}

export interface ScoreParts {
  stanceTerm: number | null;
  outcomeTerm: number | null;
  qualityTerm: number | null;
  score: number | null;
}

export interface ModelBias {
  agents: string[];
  topics: string[];
  axes: AxisDef[];
  /** Data-expected stance per institution and topic: median of the round-1 openings. */
  expected: Record<string, Record<string, number | null>>;
  expectedPoints: Record<string, Point>;
  histRate: number;
  rows: BiasRow[];
  /** Row ids from lowest score (erwartbar) to highest (abseits); unscored runs last. */
  ranking: string[];
}

export const mean = (xs: number[]): number | null =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] ?? null) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
}

/** Position on an axis: weighted mean of the topic stances present; null if none is. */
export function axisValue(
  stances: Record<string, number | null | undefined>,
  weights: Record<string, number>,
): number | null {
  let sw = 0;
  let sx = 0;
  for (const [t, w] of Object.entries(weights)) {
    const s = stances[t];
    if (s === null || s === undefined || w <= 0) continue;
    sw += w;
    sx += w * s;
  }
  return sw > 0 ? sx / sw : null;
}

/** Signed shift a minus b on each axis; null where either side is missing. */
export function signedShift(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : a - b;
}

/** Mean absolute stance gap over the topics both sides state. */
export function meanAbsGap(
  actual: Record<string, number | null | undefined>,
  expected: Record<string, number | null | undefined>,
): number | null {
  const gaps: number[] = [];
  for (const [t, e] of Object.entries(expected)) {
    const a = actual[t];
    if (e === null || e === undefined || a === null || a === undefined) continue;
    gaps.push(Math.abs(a - e));
  }
  return mean(gaps);
}

/**
 * Score from 0 (erwartbar) to 1 (abseits):
 *   stanceTerm   = min(1, stanceDev / STANCE_FULL_SCALE)
 *   outcomeTerm  = |acceptRate - histRate|
 *   qualityTerm  = 1 - quality
 *   score        = sum(w_i * term_i) / sum(w_i) over the terms present
 */
export function scoreOf(
  stanceDev: number | null,
  acceptRate: number | null,
  histRate: number,
  quality: number | null,
): ScoreParts {
  const stanceTerm = stanceDev === null ? null : Math.min(1, stanceDev / STANCE_FULL_SCALE);
  const outcomeTerm = acceptRate === null ? null : Math.abs(acceptRate - histRate);
  const qualityTerm = quality === null ? null : 1 - quality;
  const parts: Array<[number | null, number]> = [
    [stanceTerm, SCORE_WEIGHTS.stance],
    [outcomeTerm, SCORE_WEIGHTS.outcome],
    [qualityTerm, SCORE_WEIGHTS.quality],
  ];
  let sw = 0;
  let sx = 0;
  for (const [v, w] of parts) {
    if (v === null) continue;
    sw += w;
    sx += w * v;
  }
  return { stanceTerm, outcomeTerm, qualityTerm, score: sw > 0 ? sx / sw : null };
}

const sign = (x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0);

function temperamentOf(snap: RunSnapshot, redLines: Map<string, RedLineDef>): Temperament {
  const run = snap.run;
  const ps = snap.proposalOrder.map((id) => snap.proposals[id]).filter((p) => p !== undefined);
  const accepted = ps.filter((p) => p.status === "accepted").length;
  const votes = ps.flatMap((p) => p.votes ?? []);
  const conditional = votes.filter((v) => v.vote === "conditional").length;
  const rounds = Math.max(1, snap.rounds.length, ...snap.rounds.map((r) => r.round));
  let moves = 0;
  for (const byTopic of Object.values(snap.positions))
    for (const list of Object.values(byTopic))
      for (const p of list) if (p.round >= 2 && p.trigger) moves++;

  const touchedIds = new Set<string>();
  for (const id of snap.utteranceOrder)
    for (const r of snap.utterances[id]?.redLinesTouched ?? []) touchedIds.add(r);
  const topicIdByKey = new Map((run?.mandate.topics ?? []).map((t) => [t.key, t.id]));
  let total = 0;
  let held = 0;
  for (const a of run?.agents ?? [])
    for (const rl of a.redLineIds) {
      total++;
      const def = redLines.get(rl);
      const tids = (def?.topicKeys ?? [])
        .map((k) => topicIdByKey.get(k))
        .filter((t): t is string => !!t);
      const kept = tids.every((t) => {
        const open = positionAt(snap, a.id, t, 1)?.stance;
        const fin = positionAt(snap, a.id, t)?.stance;
        if (open === undefined || fin === undefined || open === 0) return true;
        return sign(fin) === sign(open);
      });
      if (kept) held++;
    }
  return {
    tabled: ps.length,
    accepted,
    acceptRate: ps.length ? accepted / ps.length : null,
    movesPerRound: rounds > 1 ? moves / (rounds - 1) : 0,
    redLines: total,
    touched: [...touchedIds].length,
    held,
    conditionalShare: votes.length ? conditional / votes.length : null,
    votes: votes.length,
  };
}

function axesOf(axes: Axis[] | undefined): AxisDef[] {
  return (axes ?? []).map((a) => ({
    id: a.id,
    label: a.label,
    poles: a.poles,
    weights: a.topicWeights,
  }));
}

export function computeModelBias(
  inputs: BiasRunInput[],
  opts: { histRate: number; redLines: RedLineDef[] },
): ModelBias {
  const runs = inputs.filter((x) => x.snap.run);
  const first = runs[0]?.snap.run;
  const axes = axesOf(first?.mandate.axes);
  const topics = (first?.mandate.topics ?? []).map((t) => t.id);
  const agents = (first?.agents ?? []).map((a) => a.id);
  const redLines = new Map(opts.redLines.map((r) => [r.id, r]));

  const expected: ModelBias["expected"] = {};
  for (const a of agents) {
    expected[a] = {};
    for (const t of topics) {
      const opens = runs
        .map((r) => positionAt(r.snap, a, t, 1)?.stance)
        .filter((s): s is number => typeof s === "number");
      (expected[a] as Record<string, number | null>)[t] = median(opens);
    }
  }
  const pointOf = (st: Record<string, number | null | undefined>): Point => ({
    x: axisValue(st, axes.find((x) => x.id === "x")?.weights ?? {}),
    y: axisValue(st, axes.find((x) => x.id === "y")?.weights ?? {}),
  });
  const expectedPoints: Record<string, Point> = {};
  for (const a of agents) expectedPoints[a] = pointOf(expected[a] ?? {});

  const rows: BiasRow[] = runs.map(({ id, snap, quality }) => {
    const finals: Record<string, Point> = {};
    const deviation: Record<string, number | null> = {};
    const gaps: number[] = [];
    const dx: number[] = [];
    const dy: number[] = [];
    for (const a of agents) {
      const st: Record<string, number | null> = {};
      for (const t of topics) st[t] = positionAt(snap, a, t)?.stance ?? null;
      const exp = expected[a] ?? {};
      finals[a] = pointOf(st);
      deviation[a] = meanAbsGap(st, exp);
      for (const t of topics) {
        const s = st[t];
        const e = exp[t];
        if (s !== null && s !== undefined && e !== null && e !== undefined)
          gaps.push(Math.abs(s - e));
      }
      const sx = signedShift(finals[a]?.x ?? null, expectedPoints[a]?.x ?? null);
      const sy = signedShift(finals[a]?.y ?? null, expectedPoints[a]?.y ?? null);
      if (sx !== null) dx.push(sx);
      if (sy !== null) dy.push(sy);
    }
    const temperament = temperamentOf(snap, redLines);
    const stanceDev = mean(gaps);
    return {
      id,
      direction: { x: mean(dx), y: mean(dy) },
      finals,
      deviation,
      stanceDev,
      temperament,
      quality,
      score: scoreOf(stanceDev, temperament.acceptRate, opts.histRate, quality),
    };
  });

  const ranking = [...rows]
    .sort(
      (a, b) =>
        (a.score.score ?? Number.POSITIVE_INFINITY) - (b.score.score ?? Number.POSITIVE_INFINITY),
    )
    .map((r) => r.id);
  return { agents, topics, axes, expected, expectedPoints, histRate: opts.histRate, rows, ranking };
}
