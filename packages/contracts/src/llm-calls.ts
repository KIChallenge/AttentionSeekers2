import { z } from "zod";
import type { RunEvent } from "./events.ts";
import { AgentId, ModelId, SpeakerId } from "./primitives.ts";
import { PromptBlock } from "./traces.ts";

// Agent trace (engineer view): one record per model call, including the calls that never
// become an utterance (mandate, strategic assessment, lesson, expert check, verification,
// exchange outcome, round summary). Emitted as RunEvent "llm.call" since 2026-11-06;
// older runs get a best-effort trace derived from utterance telemetry (deriveLlmCalls).

/** What the call was for; `ref` points at the record it produced. */
export const LlmCallParentKind = z.enum([
  "mandate",
  "utterance",
  "assessment",
  "lesson",
  "expert_check",
  "verification",
  "exchange_outcome",
  "summary",
  "impact",
]);
export type LlmCallParentKind = z.infer<typeof LlmCallParentKind>;

export const LlmCallStatus = z.enum(["ok", "repaired", "fallback", "failed"]);
export type LlmCallStatus = z.infer<typeof LlmCallStatus>;

export const LlmCall = z.object({
  callId: z.string(),
  /**
   * ref: utterance id, "<agentId>@r<round>" (assessment, lesson), exchange id, "r<round>"
   * (summary), comma-separated claim ids (expert check, verification), run id (mandate).
   * Null when the call failed before its record existed.
   */
  parent: z.object({ kind: LlmCallParentKind, ref: z.string().nullable() }),
  round: z.number().int().nullable(),
  agentId: AgentId.nullable(),
  speaker: SpeakerId.nullable(),
  provider: z.string(),
  model: ModelId,
  /** Milliseconds from run start; negative for calls before run.started (mandate). */
  startedAtMs: z.number().int(),
  durationMs: z.number().int().nonnegative(),
  tokensIn: z.number().int().nonnegative(),
  tokensCached: z.number().int().nonnegative(),
  tokensOut: z.number().int().nonnegative(),
  tokensReasoning: z.number().int().nonnegative(),
  /** Estimate from MODEL_PRICES, never a billed amount. */
  costUsd: z.number().nullable(),
  /** HTTP attempts inside one structured call (schema retry included). */
  attempts: z.number().int().min(1),
  status: LlmCallStatus,
  fallbackFrom: ModelId.nullable(),
  schemaName: z.string(),
  error: z.string().nullable().optional(),
  gatewayRequestId: z.string().nullable().optional(),
  /** Short input and output previews for calls whose record does not keep the prompt. */
  inputPreview: z.array(PromptBlock).optional(),
  outputPreview: z.string().optional(),
  /** "recorded" = emitted by the engine; "derived" = reconstructed from an older run. */
  origin: z.enum(["recorded", "derived"]).default("recorded"),
  /** Derived calls only: fields that were not recorded and are shown as unknown. */
  unknown: z.array(z.enum(["timing", "tokens", "model"])).optional(),
});
export type LlmCall = z.infer<typeof LlmCall>;

/**
 * Price table in USD per million tokens. ESTIMATES for the trace view only: list prices
 * as of autumn 2026 where known, an assumption otherwise (flag `assumed`). Cached input
 * is billed at `cachedIn`.
 */
export const MODEL_PRICES: ReadonlyArray<{
  match: RegExp;
  label: string;
  in: number;
  cachedIn: number;
  out: number;
  assumed: boolean;
}> = [
  { match: /gpt-6/, label: "GPT-6 class", in: 1.25, cachedIn: 0.125, out: 10, assumed: true },
  { match: /gpt-5-mini/, label: "GPT-5 mini", in: 0.25, cachedIn: 0.025, out: 2, assumed: false },
  { match: /gpt-5/, label: "GPT-5", in: 1.25, cachedIn: 0.125, out: 10, assumed: false },
  { match: /nova-pro/, label: "Nova Pro", in: 0.8, cachedIn: 0.2, out: 3.2, assumed: false },
  { match: /nova-lite/, label: "Nova Lite", in: 0.06, cachedIn: 0.015, out: 0.24, assumed: false },
  { match: /mistral-large/, label: "Mistral Large", in: 2, cachedIn: 2, out: 6, assumed: true },
  { match: /mistral|pixtral/, label: "Mistral", in: 0.4, cachedIn: 0.4, out: 2, assumed: true },
];

/** Estimated cost in USD; null for an unknown model. Reasoning tokens are billed as output. */
export function estimateCostUsd(
  model: string,
  t: { tokensIn: number; tokensCached: number; tokensOut: number },
): number | null {
  const p = MODEL_PRICES.find((x) => x.match.test(model));
  if (!p) return null;
  const fresh = Math.max(0, t.tokensIn - t.tokensCached);
  const usd = (fresh * p.in + t.tokensCached * p.cachedIn + t.tokensOut * p.out) / 1_000_000;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

/** "bedrock/eu.amazon.nova-pro-v1:0" -> "bedrock"; "azure/gpt-5" -> "azure". */
export function providerOf(model: string): string {
  const i = model.indexOf("/");
  return i > 0 ? model.slice(0, i) : "openai-compatible";
}

/** Model family for colouring: the vendor behind the provider route. */
export function modelFamily(model: string): string {
  const m = model.toLowerCase();
  if (/gpt|(^|\/)o\d|openai/.test(m)) return "openai";
  if (/nova|titan|amazon/.test(m)) return "amazon";
  if (/mistral|pixtral/.test(m)) return "mistral";
  if (/claude|anthropic/.test(m)) return "anthropic";
  if (/llama|meta/.test(m)) return "meta";
  return providerOf(model);
}

/**
 * Best-effort trace for runs recorded before "llm.call" existed. Only utterance telemetry
 * carries model, latency and tokens; the call is placed so it ends at the utterance's
 * completion event (an upper bound: parallel calls are committed later than they end).
 * Assessments, lessons and exchange outcomes left no telemetry: they appear as markers at
 * their event time with timing, tokens and model flagged unknown. Every call is "derived".
 */
export function deriveLlmCalls(events: readonly RunEvent[]): LlmCall[] {
  const out: LlmCall[] = [];
  let run: Extract<RunEvent, { type: "run.started" }>["run"] | null = null;
  const exchangeKind = new Map<string, string>();
  let n = 0;
  const id = () => `d${String(++n).padStart(4, "0")}`;
  const assigned = (who: string) =>
    run?.modelAssignment[who] ?? run?.modelAssignment.moderator ?? "unknown";
  const marker = (
    e: RunEvent,
    kind: LlmCallParentKind,
    ref: string,
    round: number,
    who: string,
    schemaName: string,
  ): LlmCall => {
    const model = assigned(who);
    return {
      callId: id(),
      parent: { kind, ref },
      round,
      agentId: /^[a-z]{2,4}$/.test(who) ? who : null,
      speaker: who,
      provider: providerOf(model),
      model,
      startedAtMs: e.tMs,
      durationMs: 0,
      tokensIn: 0,
      tokensCached: 0,
      tokensOut: 0,
      tokensReasoning: 0,
      costUsd: null,
      attempts: 1,
      status: "ok",
      fallbackFrom: null,
      schemaName,
      origin: "derived",
      unknown: ["timing", "tokens", "model"],
    };
  };
  for (const e of events) {
    if (e.type === "llm.call") return []; // a recorded trace exists; never mix the two
    if (e.type === "run.started") run = e.run;
    else if (e.type === "exchange.opened") exchangeKind.set(e.exchange.id, e.exchange.kind);
    else if (e.type === "utterance.completed") {
      const u = e.utterance;
      const tel = u.telemetry;
      if (!tel) continue;
      const kind: LlmCallParentKind =
        u.speaker === "expert"
          ? "expert_check"
          : u.speaker === "moderator"
            ? u.kind === "round_summary"
              ? "summary"
              : "exchange_outcome"
            : "utterance";
      const schemaName =
        kind === "utterance"
          ? exchangeKind.get(u.exchangeId ?? "") === "plenary"
            ? "agent_turn"
            : "exchange_turn"
          : kind === "summary"
            ? "round_summary"
            : kind === "expert_check"
              ? "expert_check + expert_verify (merged)"
              : "moderator";
      const latency = Math.round(tel.latencyMs);
      out.push({
        callId: id(),
        parent: { kind, ref: kind === "summary" ? `r${u.round}` : u.id },
        round: u.round,
        agentId: kind === "utterance" ? u.speaker : null,
        speaker: u.speaker,
        provider: providerOf(tel.model),
        model: tel.model,
        startedAtMs: Math.max(0, e.tMs - latency),
        durationMs: latency,
        tokensIn: tel.tokensIn,
        tokensCached: 0,
        tokensOut: tel.tokensOut,
        tokensReasoning: tel.reasoningTokens ?? 0,
        costUsd: estimateCostUsd(tel.model, {
          tokensIn: tel.tokensIn,
          tokensCached: 0,
          tokensOut: tel.tokensOut,
        }),
        attempts: 1 + tel.retries,
        status: tel.fallbackFrom ? "fallback" : "ok",
        fallbackFrom: tel.fallbackFrom,
        schemaName,
        gatewayRequestId: tel.gatewayRequestId,
        origin: "derived",
      });
    } else if (e.type === "strategy.assessed") {
      const a = e.assessment;
      const ref = `${a.agentId}@r${a.round}`;
      out.push(marker(e, "assessment", ref, a.round, a.agentId, "strategic_assessment"));
    } else if (e.type === "lesson.recorded") {
      const l = e.lesson;
      const ref = `${l.agentId}@r${l.round}`;
      out.push(marker(e, "lesson", ref, l.round, l.agentId, "round_lesson"));
    } else if (e.type === "exchange.closed" && e.exchange.kind !== "plenary") {
      const x = e.exchange;
      out.push(marker(e, "exchange_outcome", x.id, x.round, "moderator", "exchange_outcome"));
    }
  }
  return out;
}
