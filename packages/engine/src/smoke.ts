// Model smoke test (NFR-10): N structured calls per model with the engine's real schemas and
// real German prompts rebuilt from a recorded run, so a model is judged on the calls it would
// actually make in a negotiation.
//
//   smoke --models deepseek,qwen,kimi,glm,mistral [--n 20] [--run ensemble-wartezeiten-gpt]
//         [--concurrency 4] [--parallel 2] [--out docs/model-smoke.md] [--mode tool|json]
//
// Kinds (rotated): strategic assessment, utterance (agent_turn), round lesson, verification.
// Reports valid-JSON rate, repairs, latency p50/p95, tokens, a German-language score and an
// estimated cost per model; --out writes the Markdown table.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  type Claim,
  estimateCostUsd,
  foldRun,
  modelFamily,
  parseNdjson,
  type RoundLesson,
  type RunEvent,
} from "@sv/contracts";
import type { z } from "zod";
import { LessonOut, lessonMessages, StrategyOut, strategyMessages, TurnOut } from "./agent.ts";
import { REPO_ROOT, resolveModelAlias } from "./config.ts";
import { CheckOut, checkMessages, VERIFY_STANCE } from "./expert.ts";
import { type CallRecord, type Message, observeCalls, structured, throttled } from "./llm.ts";
import type { Passage } from "./retrieval.ts";
import { stateFromSnapshot } from "./runner.ts";
import type { RunState } from "./state.ts";

const { values } = parseArgs({
  allowPositionals: true,
  options: {
    models: { type: "string" },
    n: { type: "string" },
    run: { type: "string" },
    concurrency: { type: "string" },
    parallel: { type: "string" },
    out: { type: "string" },
    mode: { type: "string" },
  },
});
if (values.mode === "tool" || values.mode === "json")
  process.env.SV_BEDROCK_STRUCTURED = values.mode;

const aliases = (values.models ?? process.env.SV_MODELS ?? "gpt").split(",").filter(Boolean);
const N = Number(values.n ?? 20);
const runId = values.run ?? "ensemble-wartezeiten-gpt";
const events = parseNdjson(
  readFileSync(path.join(REPO_ROOT, "runs", `${runId}.ndjson`), "utf8"),
) as RunEvent[];

// ---------- rebuild real prompts from the recorded run ----------

/** State as it was when round `round` started (events before that round.started). */
function stateAt(round: number): RunState {
  const cut = events.findIndex((e) => e.type === "round.started" && e.round >= round);
  const snap = foldRun(cut < 0 ? events : events.slice(0, cut));
  const run = snap.run;
  if (!run) throw new Error(`${runId}: no run.started`);
  const s: RunState = {
    run,
    room: run.room,
    mandate: run.mandate,
    agents: run.agents,
    agentIds: run.agents.map((a) => a.id),
    utterances: [],
    claims: new Map(),
    positions: new Map(),
    proposals: new Map(),
    votes: new Map(),
    lessons: new Map(),
    assessments: new Map(),
    calculus: null,
    summaries: [],
    demands: new Map(),
    passages: new Map(passages),
    blockedRounds: new Map(),
    proposalCounter: 0,
    uttCounter: 0,
    retrievalEdit: null,
  };
  stateFromSnapshot(s, snap);
  return s;
}

/** Evidence passages parsed back from the "Belege" prompt blocks of utterance traces. */
const passages = new Map<string, Passage>();
const passagesBy = new Map<string, Passage[]>();
const traces = events.flatMap((e) => (e.type === "utterance.trace" ? [e.trace] : []));
const speakerOf = new Map(
  events.flatMap((e) =>
    e.type === "utterance.completed" ? [[e.utterance.id, e.utterance.speaker] as const] : [],
  ),
);
const LINE =
  /^(E\d+) \[([^,]+), ([^,]+), ([^,]+), Gewicht ([\d.]+)(, eigene Institution)?(?:, "(.*)")?\]: (.*)$/;
for (const t of traces) {
  const block = t.prompt.find((b) => b.title === "Belege")?.text ?? "";
  const refs = t.deliberation?.sourcesRead ?? [];
  const list: Passage[] = [];
  for (const line of block.split("\n")) {
    const m = line.match(LINE);
    if (!m) continue;
    const ref = refs[list.length]?.ref;
    const p: Passage = {
      handle: m[1] ?? "",
      segmentId: ref?.segmentId ?? `${t.utteranceId}-${m[1]}`,
      sourceId: ref?.sourceId ?? "",
      kind: m[2] ?? "",
      institutionCode: m[3] ?? "",
      date: m[4] ?? "",
      recencyWeight: Number(m[5]),
      ownInstitution: Boolean(m[6]),
      title: m[7] ?? null,
      text: m[8] ?? "",
      institutionRole: "",
      outlet: null,
      bm25Rank: null,
      fused: 0,
    };
    list.push(p);
    passages.set(p.segmentId, p);
  }
  const speaker = speakerOf.get(t.utteranceId);
  if (speaker && list.length) passagesBy.set(speaker, list);
}

type Case = { kind: string; name: string; schema: z.ZodType; messages: Message[] };

function buildCases(n: number): Case[] {
  const rounds = [...new Set(events.flatMap((e) => (e.type === "round.started" ? [e.round] : [])))];
  const lessons = events.flatMap((e) => (e.type === "lesson.recorded" ? [e.lesson] : []));
  const verifyRefs = events.flatMap((e) =>
    e.type === "llm.call" && e.call.parent.kind === "verification" && e.call.parent.ref
      ? [{ ref: e.call.parent.ref, round: e.call.round ?? 1 }]
      : [],
  );
  const agentTraces = traces.filter((t) => {
    const sp = speakerOf.get(t.utteranceId);
    return sp && sp !== "moderator" && sp !== "expert";
  });
  const pick = <T>(xs: T[], i: number): T => {
    const x = xs[Math.floor((i * xs.length) / Math.max(1, Math.ceil(n / 4))) % xs.length];
    if (x === undefined) throw new Error("smoke: recorded run has too few calls of a kind");
    return x;
  };
  const cases: Case[] = [];
  for (let i = 0; cases.length < n; i++) {
    const k = i % 4;
    const j = Math.floor(i / 4);
    if (k === 0) {
      const round = pick(rounds, j);
      const s = stateAt(round);
      const agentId = pick(s.agentIds, j * 3 + 1);
      cases.push({
        kind: "strategy",
        name: "strategic_assessment",
        schema: StrategyOut,
        messages: strategyMessages(s, agentId, round, passagesBy.get(agentId) ?? []),
      });
    } else if (k === 1) {
      const t = pick(agentTraces, j);
      const messages: Message[] = [];
      for (const b of t.prompt) {
        const role = b.role === "system" ? "system" : b.role === "assistant" ? "assistant" : "user";
        const last = messages.at(-1);
        if (last && last.role === role) last.content += `\n\n${b.text}`;
        else messages.push({ role, content: b.text });
      }
      cases.push({ kind: "utterance", name: "agent_turn", schema: TurnOut, messages });
    } else if (k === 2) {
      const l: RoundLesson = pick(lessons, j);
      const s = stateAt(l.round + 1);
      cases.push({
        kind: "lesson",
        name: "round_lesson",
        schema: LessonOut,
        messages: lessonMessages(s, l.agentId, l.round, {
          passed: l.passed,
          failed: l.failed,
          blockedBy: l.blockedBy,
        }),
      });
    } else {
      const v = pick(verifyRefs, j);
      const s = stateAt(v.round + 1);
      const ids = new Set(v.ref.split(","));
      const fresh = [...s.claims.values()].filter((c) => ids.has(c.id));
      const freshUtts = new Set(fresh.map((c) => c.utteranceId));
      const earlier: Claim[] = [...s.claims.values()].filter(
        (c) => !ids.has(c.id) && !freshUtts.has(c.utteranceId) && c.kind !== "normative",
      );
      cases.push({
        kind: "verification",
        name: "expert_verify",
        schema: CheckOut,
        messages: checkMessages(s, VERIFY_STANCE, fresh, earlier),
      });
    }
  }
  return cases;
}

// ---------- German check ----------

const DE =
  /\b(und|der|die|das|nicht|mit|für|ist|wir|eine?|auf|zu|den|von|sich|auch|bei|wird|werden|nur|ohne)\b/gi;
const EN = /\b(and|the|not|with|for|is|we|an?|on|to|of|this|that|will|be|only|without|are)\b/gi;

/** Free-text German share: German stop words / (German + English), English fields skipped. */
function germanScore(out: unknown): { de: number; en: number } {
  const acc = { de: 0, en: 0 };
  const walk = (v: unknown, key: string) => {
    if (typeof v === "string") {
      if (/En$/.test(key) || v.length < 25) return;
      acc.de += v.match(DE)?.length ?? 0;
      acc.en += v.match(EN)?.length ?? 0;
    } else if (Array.isArray(v)) for (const x of v) walk(x, key);
    else if (v && typeof v === "object")
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, k);
  };
  walk(out, "");
  return acc;
}

// ---------- run ----------

async function pool<T>(items: T[], width: number, fn: (x: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.max(1, width) }, async () => {
      for (let x = queue.shift(); x !== undefined; x = queue.shift()) await fn(x);
    }),
  );
}

interface Row {
  alias: string;
  model: string;
  family: string;
  calls: number;
  valid: number;
  ok: number;
  repaired: number;
  /** Valid only after the repair turn (second attempt). */
  turnRepairs: number;
  failed: number;
  p50: number;
  p95: number;
  tokensIn: number;
  tokensOut: number;
  tokensReasoning: number;
  germanShare: number;
  costUsd: number | null;
  byKind: Record<string, { valid: number; of: number }>;
  errors: string[];
  sample: string;
}

const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
};

async function smokeModel(alias: string, cases: Case[]): Promise<Row> {
  const model = resolveModelAlias(alias);
  const records: Array<CallRecord & { kind: string }> = [];
  const outputs: Array<{ kind: string; data: unknown }> = [];
  await pool(cases, Number(values.concurrency ?? 4), async (c) => {
    let kindRecords: CallRecord[] = [];
    try {
      await observeCalls(
        (r) => kindRecords.push(r),
        async () => {
          const r = await structured(model, c.name, c.schema, c.messages, {
            reasoningEffort: c.kind === "lesson" ? "none" : "low",
          });
          outputs.push({ kind: c.kind, data: r.data });
        },
      );
    } catch {
      // counted from the failed CallRecord
    }
    for (const r of kindRecords) {
      records.push({ ...r, kind: c.kind });
      console.error(
        `smoke_call ${alias} ${c.kind} ${r.status} ${r.durationMs}ms in=${r.tokensIn} out=${r.tokensOut} attempts=${r.attempts}`,
      );
    }
    kindRecords = [];
  });
  const lat = records.map((r) => r.durationMs);
  const byKind: Row["byKind"] = {};
  for (const r of records) {
    const k = byKind[r.kind] ?? { valid: 0, of: 0 };
    byKind[r.kind] = k;
    k.of++;
    if (r.status !== "failed") k.valid++;
  }
  const g = outputs.reduce(
    (a, o) => {
      const x = germanScore(o.data);
      return { de: a.de + x.de, en: a.en + x.en };
    },
    { de: 0, en: 0 },
  );
  const sum = (f: (r: CallRecord) => number) => records.reduce((a, r) => a + f(r), 0);
  const tokens = {
    tokensIn: sum((r) => r.tokensIn),
    tokensCached: sum((r) => r.tokensCached),
    tokensOut: sum((r) => r.tokensOut),
  };
  const utt = outputs.find((o) => o.kind === "utterance")?.data as { textDe?: string } | undefined;
  return {
    alias,
    model,
    family: modelFamily(model),
    calls: records.length,
    valid: records.filter((r) => r.status !== "failed").length,
    ok: records.filter((r) => r.status === "ok").length,
    repaired: records.filter((r) => r.status === "repaired").length,
    turnRepairs: records.filter((r) => r.status === "repaired" && r.attempts > 1).length,
    failed: records.filter((r) => r.status === "failed").length,
    p50: quantile(lat, 0.5),
    p95: quantile(lat, 0.95),
    ...tokens,
    tokensReasoning: sum((r) => r.tokensReasoning),
    germanShare: g.de + g.en ? g.de / (g.de + g.en) : 0,
    costUsd: estimateCostUsd(model, tokens),
    byKind,
    errors: [...new Set(records.flatMap((r) => (r.error ? [r.error.slice(0, 140)] : [])))].slice(
      0,
      3,
    ),
    sample: (utt?.textDe ?? "").replace(/\s+/g, " ").slice(0, 240),
  };
}

const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)} %` : "n/a");

function markdown(rows: Row[], startedAt: string): string {
  const lines = [
    "# Model smoke test",
    "",
    `Generated by \`pnpm --filter engine smoke --models ${aliases.join(",")} --n ${N}${values.out ? ` --out ${values.out}` : ""}\` on ${startedAt}.`,
    `Prompts are rebuilt from the recorded run \`${runId}\` with the engine's own prompt builders and Zod schemas, rotating strategic assessment, utterance (agent_turn), round lesson and second-family verification. All prompts and answers are German. Bedrock region ${process.env.BIFROST_SEED_BEDROCK_REGION ?? "n/a"}, on-demand.`,
    "",
    "Valid = schema-valid after at most one repair (local schema repair or one repair turn). Repaired = valid only thanks to a repair. Latency is per structured call including the repair turn. German = share of German stop words among German plus English stop words in the German free-text fields (English translation fields skipped). Cost is an estimate from MODEL_PRICES.",
    "",
    "| Model | Family | Valid | Repaired | Failed | p50 s | p95 s | Tokens in / out (reasoning) | German | Est. USD | Verdict |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const r of rows) {
    const validShare = r.calls ? r.valid / r.calls : 0;
    const verdict =
      validShare < 0.9 ? "drop (valid < 90 %)" : r.germanShare < 0.85 ? "drop (German)" : "keep";
    lines.push(
      `| \`${r.model}\` | ${r.family} | ${r.valid}/${r.calls} (${pct(r.valid, r.calls)}) | ${r.repaired} (${r.turnRepairs} by turn) | ${r.failed} | ${(r.p50 / 1000).toFixed(1)} | ${(r.p95 / 1000).toFixed(1)} | ${r.tokensIn} / ${r.tokensOut} (${r.tokensReasoning}) | ${(100 * r.germanShare).toFixed(0)} % | ${r.costUsd?.toFixed(3) ?? "n/a"} | ${verdict} |`,
    );
  }
  lines.push(
    "",
    "## Per kind (valid / calls)",
    "",
    "| Model | strategy | utterance | lesson | verification |",
    "|---|---|---|---|---|",
  );
  for (const r of rows) {
    const k = (x: string) => (r.byKind[x] ? `${r.byKind[x].valid}/${r.byKind[x].of}` : "n/a");
    lines.push(
      `| ${r.alias} | ${k("strategy")} | ${k("utterance")} | ${k("lesson")} | ${k("verification")} |`,
    );
  }
  lines.push("", "## Sample utterance (German text, first 240 characters) and errors", "");
  for (const r of rows) {
    lines.push(`- **${r.alias}**: ${r.sample || "(no valid utterance)"}`);
    for (const e of r.errors) lines.push(`  - error: ${e.replace(/\s+/g, " ").replace(/\|/g, "/")}`);
  }
  const throttles = Object.entries(throttled);
  if (throttles.length)
    lines.push("", `Throttling retries: ${throttles.map(([m, n]) => `${m} ${n}`).join(", ")}.`);
  return `${lines.join("\n")}\n`;
}

const startedAt = new Date().toISOString().slice(0, 16).replace("T", " ");
const cases = buildCases(N);
console.error(
  `smoke: ${aliases.length} models x ${cases.length} calls from ${runId} (${cases.map((c) => c.kind[0]).join("")})`,
);
const rows: Row[] = [];
await pool(aliases, Number(values.parallel ?? 2), async (alias) => {
  const t = performance.now();
  const row = await smokeModel(alias, cases);
  rows.push(row);
  console.error(
    `smoke_model ${JSON.stringify({ alias, valid: row.valid, calls: row.calls, repaired: row.repaired, p50: row.p50, p95: row.p95, german: Number(row.germanShare.toFixed(2)), usd: row.costUsd, s: Math.round((performance.now() - t) / 1000) })}`,
  );
});
rows.sort((a, b) => aliases.indexOf(a.alias) - aliases.indexOf(b.alias));
const md = markdown(rows, startedAt);
if (values.out) {
  const file = path.isAbsolute(values.out) ? values.out : path.join(REPO_ROOT, values.out);
  if (existsSync(file) && process.env.SV_SMOKE_APPEND === "1")
    writeFileSync(file, `${readFileSync(file, "utf8")}\n${md}`);
  else writeFileSync(file, md);
  console.error(`smoke: wrote ${file}`);
} else process.stdout.write(md);
