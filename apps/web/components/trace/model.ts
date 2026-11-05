// Pure grouping for the agent trace waterfall: round -> group (exchange or round-level
// work) -> turn -> model calls. No React here, so it stays testable.
import { type LlmCall, type LlmCallParentKind, modelFamily, type RunSnapshot } from "@sv/contracts";

export interface TraceTurn {
  key: string;
  /** Utterance id, "<agent>@r<n>", exchange id or "r<n>". */
  ref: string | null;
  speaker: string | null;
  kind: LlmCallParentKind;
  calls: LlmCall[];
  start: number;
  end: number;
}

export interface TraceGroup {
  key: string;
  /** Exchange id for exchanges; null for round-level work. */
  exchangeId: string | null;
  exchangeKind: "plenary" | "bilateral" | "caucus" | null;
  /** Round-level work kind when exchangeId is null. */
  work: "prep" | "expert" | "lessons" | "summary" | "mandate" | "other" | null;
  turns: TraceTurn[];
  start: number;
  end: number;
}

export interface TraceRound {
  round: number | null;
  phase: number | null;
  groups: TraceGroup[];
  start: number;
  end: number;
  calls: LlmCall[];
}

export interface TraceTotals {
  calls: number;
  wallMs: number;
  tokensIn: number;
  tokensCached: number;
  tokensOut: number;
  tokensReasoning: number;
  costUsd: number;
  /** Calls without a price (unknown model) or without tokens (derived markers). */
  unpriced: number;
  /** Derived markers: only the time is known. */
  markers: number;
  fallbacks: number;
  repairs: number;
  failed: number;
  retried: number;
  byFamily: Array<{ family: string; calls: number; tokens: number; costUsd: number; ms: number }>;
  byKind: Array<{ kind: LlmCallParentKind; calls: number; ms: number; costUsd: number }>;
}

export const endOf = (c: LlmCall) => c.startedAtMs + c.durationMs;
export const hasTiming = (c: LlmCall) => !c.unknown?.includes("timing");

/** Which exchange a call belongs to, if any. */
function exchangeOf(c: LlmCall, snap: RunSnapshot): string | null {
  if (c.parent.kind === "exchange_outcome") return c.parent.ref;
  if (c.parent.kind === "utterance" && c.parent.ref)
    return snap.utterances[c.parent.ref]?.exchangeId ?? null;
  return null;
}

function workOf(kind: LlmCallParentKind): TraceGroup["work"] {
  if (kind === "assessment") return "prep";
  if (kind === "expert_check" || kind === "verification") return "expert";
  if (kind === "lesson") return "lessons";
  if (kind === "summary") return "summary";
  if (kind === "mandate") return "mandate";
  return "other";
}

/** Turn key: one per utterance; per agent for prep and lessons; per batch for the expert. */
function turnKey(c: LlmCall): string {
  if (c.parent.kind === "verification") return `expert_check:${c.parent.ref ?? c.callId}`;
  return `${c.parent.kind}:${c.parent.ref ?? c.callId}`;
}

const span = <T extends { start: number; end: number }>(xs: T[]) => ({
  start: Math.min(...xs.map((x) => x.start)),
  end: Math.max(...xs.map((x) => x.end)),
});

export function buildTrace(calls: LlmCall[], snap: RunSnapshot): TraceRound[] {
  const rounds = new Map<string, LlmCall[]>();
  for (const c of calls) {
    const k = String(c.round ?? "pre");
    rounds.set(k, [...(rounds.get(k) ?? []), c]);
  }
  const out: TraceRound[] = [];
  for (const [k, list] of rounds) {
    const round = k === "pre" ? null : Number(k);
    const groups = new Map<string, TraceGroup>();
    const turns = new Map<string, TraceTurn>();
    for (const c of list) {
      const ex = exchangeOf(c, snap);
      const gk = ex ? `x:${ex}` : `w:${workOf(c.parent.kind)}`;
      let g = groups.get(gk);
      if (!g) {
        const x = ex ? snap.exchanges.find((e) => e.id === ex) : undefined;
        g = {
          key: gk,
          exchangeId: ex,
          exchangeKind: x?.kind ?? null,
          work: ex ? null : workOf(c.parent.kind),
          turns: [],
          start: 0,
          end: 0,
        };
        groups.set(gk, g);
      }
      const tk = `${gk}|${turnKey(c)}`;
      let t = turns.get(tk);
      if (!t) {
        t = {
          key: tk,
          ref: c.parent.ref,
          speaker: c.parent.kind === "verification" ? "expert" : c.speaker,
          kind: c.parent.kind === "verification" ? "expert_check" : c.parent.kind,
          calls: [],
          start: 0,
          end: 0,
        };
        turns.set(tk, t);
        g.turns.push(t);
      }
      t.calls.push(c);
    }
    for (const g of groups.values()) {
      for (const t of g.turns) {
        t.calls.sort((a, b) => a.startedAtMs - b.startedAtMs);
        Object.assign(t, span(t.calls.map((c) => ({ start: c.startedAtMs, end: endOf(c) }))));
      }
      g.turns.sort((a, b) => a.start - b.start || a.key.localeCompare(b.key));
      Object.assign(g, span(g.turns));
    }
    const gs = [...groups.values()].sort((a, b) => a.start - b.start);
    out.push({
      round,
      phase: round ? (snap.rounds.find((r) => r.round === round)?.phase ?? null) : null,
      groups: gs,
      calls: list,
      ...span(gs),
    });
  }
  return out.sort((a, b) => (a.round ?? 0) - (b.round ?? 0));
}

export function totals(calls: LlmCall[]): TraceTotals {
  const fam = new Map<string, TraceTotals["byFamily"][number]>();
  const kinds = new Map<LlmCallParentKind, TraceTotals["byKind"][number]>();
  const t: TraceTotals = {
    calls: calls.length,
    wallMs: 0,
    tokensIn: 0,
    tokensCached: 0,
    tokensOut: 0,
    tokensReasoning: 0,
    costUsd: 0,
    unpriced: 0,
    markers: 0,
    fallbacks: 0,
    repairs: 0,
    failed: 0,
    retried: 0,
    byFamily: [],
    byKind: [],
  };
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const c of calls) {
    t.tokensIn += c.tokensIn;
    t.tokensCached += c.tokensCached;
    t.tokensOut += c.tokensOut;
    t.tokensReasoning += c.tokensReasoning;
    if (c.costUsd === null) t.unpriced++;
    else t.costUsd += c.costUsd;
    if (c.unknown?.includes("timing")) t.markers++;
    if (c.status === "fallback") t.fallbacks++;
    if (c.status === "repaired") t.repairs++;
    if (c.status === "failed") t.failed++;
    if (c.attempts > 1) t.retried++;
    lo = Math.min(lo, c.startedAtMs);
    hi = Math.max(hi, endOf(c));
    const f = modelFamily(c.model);
    const fe = fam.get(f) ?? { family: f, calls: 0, tokens: 0, costUsd: 0, ms: 0 };
    fe.calls++;
    fe.tokens += c.tokensIn + c.tokensOut;
    fe.costUsd += c.costUsd ?? 0;
    fe.ms += c.durationMs;
    fam.set(f, fe);
    const k = c.parent.kind;
    const ke = kinds.get(k) ?? { kind: k, calls: 0, ms: 0, costUsd: 0 };
    ke.calls++;
    ke.ms += c.durationMs;
    ke.costUsd += c.costUsd ?? 0;
    kinds.set(k, ke);
  }
  t.wallMs = calls.length ? hi - lo : 0;
  t.byFamily = [...fam.values()].sort((a, b) => b.calls - a.calls);
  t.byKind = [...kinds.values()].sort((a, b) => b.ms - a.ms);
  return t;
}

/** Cumulative tokens and cost in completion order, keyed by callId. */
export function runningTotals(calls: LlmCall[]): Map<string, { tokens: number; costUsd: number }> {
  const out = new Map<string, { tokens: number; costUsd: number }>();
  let tokens = 0;
  let cost = 0;
  for (const c of [...calls].sort((a, b) => endOf(a) - endOf(b))) {
    tokens += c.tokensIn + c.tokensOut;
    cost += c.costUsd ?? 0;
    out.set(c.callId, { tokens, costUsd: cost });
  }
  return out;
}

/** Colour per model family (bars and legend); neutral, not vendor branding. */
export const FAMILY_COLOR: Record<string, string> = {
  openai: "#0f9b8e",
  amazon: "#e08a1e",
  mistral: "#7c5cd6",
  anthropic: "#c2643c",
  meta: "#3b6fd8",
};
export const familyColor = (f: string) => FAMILY_COLOR[f] ?? "#8a8f98";
