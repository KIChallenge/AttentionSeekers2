// Quality audit of a finished run: deterministic checks plus the cross-family judge,
// aggregated per agent, round, exchange and model, with a list of flagged utterances.
import {
  foldRun,
  type QualityAggregate,
  type QualityDimension,
  type QualityReport,
  type RunEvent,
  type Utterance,
  type UtteranceQuality,
} from "@sv/contracts";
import { nameOf } from "../agent.ts";
import {
  conCheck,
  containment,
  groundingCheck,
  mandateNumbers,
  negotiationCheck,
  registerCheck,
  relevanceCheck,
  repetitionCheck,
  type TurnCheckInput,
  vocabularyOf,
} from "./checks.ts";
import {
  estimateJudgeCost,
  type JudgeBatch,
  type JudgeTarget,
  judgeFor,
  RUBRIC_VERSION,
  runJudge,
} from "./judge.ts";

const BATCH = 6;
const r2 = (v: number) => Math.round(v * 100) / 100;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export interface AuditInput {
  events: RunEvent[];
  /** Skip the model judge (deterministic checks only). */
  noJudge?: boolean;
  /** Abort before any call when the estimate exceeds this (USD). */
  maxUsd?: number;
  onEstimate?: (e: { batches: number; tokensIn: number; tokensOut: number; usd: number }) => void;
}

interface Prepared {
  u: Utterance;
  target: JudgeTarget;
  check: TurnCheckInput;
  exchangeKind: string;
  topicId: string | null;
}

/** Positions emitted right after an utterance belong to it (same speaker). */
function stanceMoves(events: RunEvent[]) {
  const out = new Map<
    string,
    Array<{ topicId: string; from: number | null; to: number; trigger: boolean }>
  >();
  const last = new Map<string, string>();
  const prev = new Map<string, number>();
  for (const e of events) {
    if (e.type === "utterance.completed") last.set(e.utterance.speaker, e.utterance.id);
    if (e.type !== "position.updated") continue;
    const p = e.position;
    const key = `${p.agentId}:${p.topicId}`;
    const uid = last.get(p.agentId);
    const from = prev.get(key) ?? null;
    prev.set(key, p.stance);
    if (!uid) continue;
    const list = out.get(uid) ?? [];
    list.push({ topicId: p.topicId, from, to: p.stance, trigger: p.trigger !== null });
    out.set(uid, list);
  }
  return out;
}

export function prepare(events: RunEvent[]) {
  const snap = foldRun(events);
  const run = snap.run;
  if (!run) throw new Error("run has no run.started");
  const vocab = vocabularyOf(run.mandate);
  const numbers = mandateNumbers(run.mandate);
  for (const p of Object.values(snap.proposals))
    for (const v of [p.cost?.value, p.cost?.low, p.cost?.high, p.capacityEffect?.value])
      if (typeof v === "number") numbers.add(String(v));
  const exchanges = new Map(snap.exchanges.map((x) => [x.id, x]));
  const moves = stanceMoves(events);
  const notesBy = new Map<string, string[]>();
  for (const n of snap.expertNotes)
    for (const id of n.utteranceIds) notesBy.set(id, [...(notesBy.get(id) ?? []), n.note.text]);
  const own = new Map<string, string[]>();
  const prepared: Prepared[] = [];
  for (const id of snap.utteranceOrder) {
    const u = snap.utterances[id];
    if (!u || u.degraded) continue;
    const x = u.exchangeId ? exchanges.get(u.exchangeId) : undefined;
    const ownPrior = own.get(u.speaker) ?? [];
    const rt = u.respondsTo ? snap.utterances[u.respondsTo] : undefined;
    const claims = u.claimIds
      .map((c) => snap.claims[c])
      .filter((c): c is NonNullable<typeof c> => Boolean(c));
    const mv = (moves.get(u.id) ?? []).find((m) => m.topicId === x?.topicId) ?? null;
    const bigMove = (moves.get(u.id) ?? []).find(
      (m) => m.from !== null && Math.abs(m.to - m.from) >= 0.5,
    );
    const interjection =
      x?.kind === "bilateral" && !x.participants.includes(u.speaker) ? "interjection" : undefined;
    prepared.push({
      u,
      exchangeKind: x?.kind ?? "plenary",
      topicId: x?.topicId ?? null,
      check: {
        text: u.text.text,
        speaker: u.speaker,
        phase: u.phase,
        vocab,
        topicId: x?.topicId ?? null,
        ownPrior: [...ownPrior],
        exchangeKind: interjection ?? x?.kind,
        kind: u.kind,
      },
      target: {
        id: u.id,
        speaker: u.speaker,
        kind: u.kind,
        phase: u.phase,
        model: u.model,
        text: u.text.text,
        respondsTo: rt ? { id: rt.id, speaker: rt.speaker, text: rt.text.text } : null,
        claims: claims.map((c) => ({
          atomic: c.atomicText,
          state: c.state,
          citations: c.citations.length,
        })),
        expertNotes: notesBy.get(u.id) ?? [],
        stance: mv ?? bigMove ?? null,
      },
    });
    own.set(u.speaker, [...ownPrior, u.text.text]);
  }
  const batches: JudgeBatch[] = [];
  const byExchange = new Map<string, Prepared[]>();
  for (const p of prepared) {
    const k = p.u.exchangeId ?? `r${p.u.round}`;
    byExchange.set(k, [...(byExchange.get(k) ?? []), p]);
  }
  for (const [k, list] of byExchange) {
    const x = exchanges.get(k);
    const topic = run.mandate.topics.find((t) => t.id === x?.topicId);
    const transcript = list.map((p) => ({ id: p.u.id, speaker: p.u.speaker, text: p.u.text.text }));
    const byJudge = new Map<string, Prepared[]>();
    for (const p of list) {
      const j = judgeFor(p.u.model);
      byJudge.set(j, [...(byJudge.get(j) ?? []), p]);
    }
    for (const [judgeModel, ps] of byJudge)
      for (let i = 0; i < ps.length; i += BATCH)
        batches.push({
          judgeModel,
          exchange: {
            id: x?.id ?? null,
            kind: x?.kind ?? "plenary",
            topic: topic ? `${topic.label.text} (${topic.measure.text})` : null,
            trigger: x?.trigger.text ?? "",
            transcript,
          },
          targets: ps.slice(i, i + BATCH).map((p) => p.target),
        });
  }
  return {
    snap,
    run,
    prepared,
    batches,
    numbers,
    mandate: {
      question: run.mandate.question,
      topics: run.mandate.topics.map((t) => `${t.id} ${t.label.text}: ${t.measure.text}`),
    },
  };
}

type Flag = UtteranceQuality["flags"][number];

export async function auditRun(input: AuditInput): Promise<QualityReport> {
  const { snap, run, prepared, batches, numbers, mandate } = prepare(input.events);
  const est = estimateJudgeCost(mandate, batches);
  input.onEstimate?.({ batches: batches.length, ...est });
  if (!input.noJudge && input.maxUsd !== undefined && est.usd > input.maxUsd)
    throw new Error(`judge estimate ${est.usd} USD exceeds the cap ${input.maxUsd} USD`);
  const judged = input.noJudge
    ? { items: new Map(), calls: 0, failed: 0, tokensIn: 0, tokensOut: 0, costUsd: 0 }
    : await runJudge(mandate, batches);

  const utterances: UtteranceQuality[] = prepared.map((p) => {
    const flags: Flag[] = [];
    const det = (dimension: QualityDimension, c: { passed: boolean; reason: string | null }) => {
      if (!c.passed)
        flags.push({
          dimension,
          source: "deterministic",
          severity: dimension === "con" ? "major" : "minor",
          reason: c.reason ?? "",
        });
    };
    const rel = relevanceCheck(p.check);
    const rep = repetitionCheck(p.check);
    const reg = registerCheck(p.check);
    const con = conCheck(p.check);
    const neg = negotiationCheck(p.check);
    det(rel.reason?.startsWith("Thema") ? "relevanceExchange" : "relevanceMandate", rel);
    det("repetition", rep);
    det("register", reg);
    det("con", con);
    if (neg && !neg.passed)
      flags.push({
        dimension: "responsiveness",
        source: "deterministic",
        severity: "minor",
        reason: neg.reason ?? "",
      });
    const g = groundingCheck({
      text: p.u.text.text,
      mandateNumbers: numbers,
      claims: p.u.claimIds
        .map((id) => snap.claims[id])
        .filter((c): c is NonNullable<typeof c> => Boolean(c))
        .map((c) => ({
          state: c.state,
          citations: c.citations.length,
          value: c.numeric?.value ?? null,
          quote: p.u.text.text.slice(c.span.start, c.span.end),
          atomic: c.atomicText,
        })),
      expertNotes: p.target.expertNotes,
    });
    for (const x of g.reasons)
      flags.push({ dimension: "grounding", source: "deterministic", ...x });
    const st = p.target.stance;
    let consDet = 1;
    if (st && st.from !== null && Math.abs(st.to - st.from) >= 0.75 && !st.trigger) {
      consDet = 0.5;
      flags.push({
        dimension: "consistency",
        source: "deterministic",
        severity: "minor",
        reason: `Haltung zu ${st.topicId} springt von ${st.from} auf ${st.to} ohne erfassten Anlass.`,
      });
    }
    const j = judged.items.get(p.u.id);
    for (const is of j?.issues ?? [])
      flags.push({
        dimension: is.dimension,
        source: "judge",
        severity: is.severity,
        reason: is.reason,
      });
    const js = (k: keyof NonNullable<typeof j>) => (j ? (j[k] as number) / 3 : null);
    const cap = (v: number | null, passed: boolean) => (passed ? v : Math.min(v ?? 1, 1 / 3));
    const repScore = (() => {
      if (!rep.passed && rep.reason?.startsWith("Satzschleife")) return 0;
      const v = rep.value ?? 0;
      return r2(Math.max(0, Math.min(1, 1 - (v - 0.3) / 0.5)));
    })();
    const relEx = p.topicId || p.exchangeKind !== "plenary" ? js("relevanceExchange") : null;
    const scores: UtteranceQuality["scores"] = {
      relevanceMandate: r2(
        cap(js("relevanceMandate"), rel.passed || !!rel.reason?.startsWith("Thema")) ?? 1,
      ),
      relevanceExchange:
        relEx === null && !p.topicId ? null : r2(cap(relEx, !rel.reason?.startsWith("Thema")) ?? 1),
      responsiveness: p.u.respondsTo
        ? r2(cap(js("responsiveness"), !neg || neg.passed) ?? 1)
        : null,
      grounding: r2(j ? mean([js("grounding") ?? 1, g.score]) : g.score),
      repetition: p.u.speaker === "moderator" || p.u.speaker === "expert" ? null : repScore,
      consistency: r2(Math.min(js("consistency") ?? 1, consDet)),
      register: r2(cap(js("register"), reg.passed) ?? 1),
      con: con.passed ? 1 : 0,
    };
    const vals = Object.values(scores).filter((v): v is number => v !== null);
    return {
      utteranceId: p.u.id,
      speaker: p.u.speaker,
      round: p.u.round,
      exchangeId: p.u.exchangeId ?? null,
      model: p.u.model,
      judgeModel: j?.judgeModel ?? null,
      scores,
      overall: r2(mean(vals)),
      flags,
    };
  });

  const agg = (key: string, list: UtteranceQuality[]): QualityAggregate => {
    const dims = Object.keys(list[0]?.scores ?? {}) as QualityDimension[];
    const scores: Record<string, number | null> = {};
    for (const d of dims) {
      const v = list
        .map((x) => x.scores[d])
        .filter((x): x is number => x !== null && x !== undefined);
      scores[d] = v.length ? r2(mean(v)) : null;
    }
    return {
      key,
      n: list.length,
      overall: r2(mean(list.map((x) => x.overall))),
      scores,
      flagged: list.filter(isFlagged).length,
    };
  };
  const group = (f: (x: UtteranceQuality) => string) => {
    const m = new Map<string, UtteranceQuality[]>();
    for (const x of utterances) m.set(f(x), [...(m.get(f(x)) ?? []), x]);
    return [...m.entries()].map(([k, v]) => agg(k, v));
  };
  const allUtts = snap.utteranceOrder.map((id) => snap.utterances[id]).filter(Boolean);
  const gated = allUtts.filter((u) => u?.gate);
  return {
    runId: run.id,
    generatedAt: new Date().toISOString(),
    rubricVersion: RUBRIC_VERSION,
    judge: {
      models: [...new Set(batches.map((b) => b.judgeModel))],
      rule: "cross-family: Azure GPT turns judged by Bedrock Nova, Bedrock turns judged by Azure GPT",
      settings:
        "temperature 0, reasoning none, seed 20261106 (Azure), fixed rubric, batches of up to 6 utterances per exchange",
      calls: judged.calls,
      failed: judged.failed,
      tokensIn: judged.tokensIn,
      tokensOut: judged.tokensOut,
      costUsd: judged.costUsd,
    },
    overall: agg("run", utterances),
    byAgent: group((x) => x.speaker),
    byRound: group((x) => `R${x.round}`),
    byExchange: group((x) => x.exchangeId ?? "-"),
    byModel: group((x) => x.model),
    utterances,
    gates: {
      turns: gated.length,
      regenerated: gated.filter((u) => u?.gate?.action === "regenerated").length,
      flagged: gated.filter((u) => u?.gate?.action === "flagged").length,
      moderation: snap.moderationGates ?? [],
    },
  };
}

/**
 * Flagged = a major issue, a dimension at or below 1/3 (judge score 0 or 1, or a failed
 * deterministic gate check), or an overall score below 0.8. Minor issues alone do not flag.
 */
export function isFlagged(x: UtteranceQuality): boolean {
  return (
    x.flags.some((f) => f.severity === "major") ||
    Object.values(x.scores).some((v) => v !== null && v !== undefined && v <= 0.34) ||
    x.overall < 0.8
  );
}

/** Similarity between two texts, exposed for tests. */
export const similarity = containment;

const pct = (v: number | null | undefined) =>
  v === null || v === undefined ? "-" : `${Math.round(v * 100)}`;

export function reportMarkdown(r: QualityReport): string {
  const dims = Object.keys(r.overall.scores);
  const head = `| | n | gesamt | ${dims.join(" | ")} | markiert |`;
  const sep = `|${"---|".repeat(dims.length + 4)}`;
  const row = (label: string, a: QualityAggregate) =>
    `| ${label} | ${a.n} | ${pct(a.overall)} | ${dims.map((d) => pct(a.scores[d])).join(" | ")} | ${a.flagged} |`;
  const flagged = r.utterances.filter(isFlagged);
  const byDim: Record<string, number> = {};
  for (const u of r.utterances)
    for (const f of u.flags) byDim[f.dimension] = (byDim[f.dimension] ?? 0) + 1;
  return [
    `# Quality report ${r.runId}`,
    "",
    `Rubric ${r.rubricVersion}. Judge: ${r.judge.models.join(", ")} (${r.judge.rule}); ${r.judge.settings}. ${r.judge.calls} calls, ${r.judge.failed} failed, about ${r.judge.costUsd} USD (estimate from list prices).`,
    "Scores are 0 to 100 (100 = no problem). Flagged = a major issue, a dimension at or below 33, or overall below 80; minor issues alone do not flag.",
    "",
    `Overall ${pct(r.overall.overall)}; ${flagged.length} of ${r.utterances.length} utterances flagged. Issues by dimension: ${
      Object.entries(byDim)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k} ${v}`)
        .join(", ") || "none"
    }.`,
    r.gates.turns
      ? `Gate: ${r.gates.turns} turns gated, ${r.gates.regenerated} regenerated, ${r.gates.flagged} accepted with a flag; ${r.gates.moderation.length} moderation decisions (${r.gates.moderation.map((g) => g.kind).join(", ") || "none"}).`
      : "Gate: no gate decisions recorded (run predates the gate).",
    "",
    "## By agent",
    head,
    sep,
    ...r.byAgent.map((a) => row(`${a.key} (${nameOf(a.key)})`, a)),
    "",
    "## By model",
    head,
    sep,
    ...r.byModel.map((a) => row(a.key, a)),
    "",
    "## By round",
    head,
    sep,
    ...r.byRound.map((a) => row(a.key, a)),
    "",
    "## By exchange",
    head,
    sep,
    ...r.byExchange.map((a) => row(a.key, a)),
    "",
    "## Flagged utterances",
    ...flagged.map(
      (u) =>
        `- ${u.utteranceId} ${nameOf(u.speaker)} (${u.model.split("/").pop()}, overall ${pct(u.overall)}): ${u.flags.map((f) => `[${f.dimension}${f.severity === "major" ? ", major" : ""}, ${f.source}] ${f.reason}`).join(" / ")}`,
    ),
    "",
  ].join("\n");
}
