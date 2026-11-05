// Gateway client: OpenAI-compatible Chat Completions (pattern from medlyn llm/client.ts).
// structured(): strict JSON schema from Zod, one retry on invalid output, refusal and
// truncation errors, concurrency slot, key redaction. Returns usage and latency for
// telemetry (FR-T7). The model id is passed per call (FR-X1, NFR-4).
import { AsyncLocalStorage } from "node:async_hooks";
import { z } from "zod";

export type Message = { role: "system" | "user" | "assistant"; content: string };

export interface CallMeta {
  model: string;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  reasoningTokens: number;
  /** Prompt tokens served from the provider's prompt cache (0 when not reported). */
  tokensCached: number;
  retries: number;
  gatewayRequestId: string | null;
}

/**
 * One finished structured() call as seen by the agent trace: wall time across all
 * attempts, tokens summed over the attempts that returned, and how it ended.
 */
export interface CallRecord {
  schemaName: string;
  model: string;
  /** performance.now() at the start of the first attempt. */
  startedAt: number;
  durationMs: number;
  tokensIn: number;
  tokensCached: number;
  tokensOut: number;
  tokensReasoning: number;
  attempts: number;
  status: "ok" | "repaired" | "failed";
  error: string | null;
  gatewayRequestId: string | null;
  messages: Message[];
  output: unknown;
}

const callSinks = new AsyncLocalStorage<(r: CallRecord) => void>();

/**
 * Runs fn with a sink that receives a CallRecord for every structured() call made inside it
 * (async context, so parallel runs and parallel agents never mix). The innermost sink wins.
 */
export function observeCalls<T>(sink: (r: CallRecord) => void, fn: () => T): T {
  return callSinks.run(sink, fn);
}

export interface Usage {
  calls: number;
  tokensIn: number;
  tokensOut: number;
  reasoningTokens: number;
}

/** Process-wide token counter; the runner snapshots it per run. */
export const usage: Usage = { calls: 0, tokensIn: 0, tokensOut: 0, reasoningTokens: 0 };

let active = 0;
const waiting: Array<() => void> = [];
function limit(): number {
  const v = Number(process.env.SV_LLM_CONCURRENCY ?? 24);
  return Number.isSafeInteger(v) && v > 0 ? v : 24;
}
async function slot<T>(run: () => Promise<T>): Promise<T> {
  if (active >= limit()) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    return await run();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

export class StructuredOutputError extends Error {}

/** Never logs request bodies or credentials. */
export function redact(message: string): string {
  let m = message;
  for (const key of [process.env.OPENAI_COMPATIBLE_API_KEY, process.env.BIFROST_SEED_BEDROCK_KEY])
    if (key) m = m.replaceAll(key, "[redacted]");
  return m.replace(/Bearer\s+\S+|sk-[\w-]+/gi, "[redacted]").slice(0, 600);
}

function baseUrl(): string {
  const base = process.env.OPENAI_COMPATIBLE_BASE_URL;
  if (!base) throw new Error("OPENAI_COMPATIBLE_BASE_URL is not set");
  return base.replace(/\/+$/, "");
}

/** Strip a gateway prefix like "azure/" when talking to a plain deployment endpoint. */
function wireModel(model: string): string {
  if (process.env.SV_KEEP_MODEL_PREFIX === "1") return model;
  const i = model.indexOf("/");
  return i >= 0 ? model.slice(i + 1) : model;
}

export function hasGateway(): boolean {
  return Boolean(process.env.OPENAI_COMPATIBLE_BASE_URL && process.env.OPENAI_COMPATIBLE_API_KEY);
}

async function complete(
  model: string,
  messages: Message[],
  body: Record<string, unknown>,
  timeoutMs: number,
  name: string,
): Promise<{ content: string; meta: Omit<CallMeta, "retries"> }> {
  return slot(async () => {
    const started = performance.now();
    let status: number | undefined;
    try {
      const res = await fetch(`${baseUrl()}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_COMPATIBLE_API_KEY ?? ""}`,
          "api-key": process.env.OPENAI_COMPATIBLE_API_KEY ?? "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: wireModel(model), messages, ...body }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      status = res.status;
      if (!res.ok)
        throw new Error(`LLM ${res.status}: ${redact((await res.text()).slice(0, 300))}`);
      const json = (await res.json()) as {
        id?: string;
        choices?: Array<{
          finish_reason?: string;
          message?: { content?: string; refusal?: string | null };
        }>;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          completion_tokens_details?: { reasoning_tokens?: number };
          prompt_tokens_details?: { cached_tokens?: number };
        };
      };
      const u = json.usage ?? {};
      usage.calls++;
      usage.tokensIn += u.prompt_tokens ?? 0;
      usage.tokensOut += u.completion_tokens ?? 0;
      usage.reasoningTokens += u.completion_tokens_details?.reasoning_tokens ?? 0;
      const choice = json.choices?.[0];
      if (choice?.message?.refusal) throw new StructuredOutputError(`LLM ${name}: refused`);
      if (choice?.finish_reason === "length")
        throw new StructuredOutputError(`LLM ${name}: truncated`);
      const content = choice?.message?.content;
      if (typeof content !== "string" || !content.trim())
        throw new StructuredOutputError(`LLM ${name}: empty response`);
      return {
        content,
        meta: {
          model,
          latencyMs: Math.round(performance.now() - started),
          tokensIn: u.prompt_tokens ?? 0,
          tokensOut: u.completion_tokens ?? 0,
          reasoningTokens: u.completion_tokens_details?.reasoning_tokens ?? 0,
          tokensCached: u.prompt_tokens_details?.cached_tokens ?? 0,
          gatewayRequestId: json.id ?? null,
        },
      };
    } catch (error) {
      console.warn(
        "llm_request_failed",
        JSON.stringify({
          operation: name,
          status,
          message: redact(error instanceof Error ? error.message : String(error)),
        }),
      );
      throw error;
    }
  });
}

// ---------- Amazon Bedrock (Converse API), model ids prefixed "bedrock/" ----------

export const BEDROCK_PREFIX = "bedrock/";
export const isBedrock = (model: string) => model.startsWith(BEDROCK_PREFIX);

/** Structured-output reliability per model: calls, invalid outputs, final failures. */
export const structuredStats: Record<
  string,
  { calls: number; attempts: number; invalid: number; failed: number; repaired: number }
> = {};
const statOf = (model: string) => {
  structuredStats[model] ??= { calls: 0, attempts: 0, invalid: 0, failed: 0, repaired: 0 };
  return structuredStats[model];
};

export function hasBedrock(): boolean {
  return Boolean(process.env.BIFROST_SEED_BEDROCK_KEY && process.env.BIFROST_SEED_BEDROCK_REGION);
}

/** Bedrock rejects the draft-7 "$schema" marker inside a tool inputSchema. */
export function toolSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const { $schema: _drop, ...rest } = schema;
  return rest;
}

/**
 * Maps chat messages to Converse and forces one tool whose inputSchema is the JSON schema,
 * so the tool input is the structured output. System messages go to `system`; consecutive
 * same-role messages are merged because Converse requires alternating turns.
 */
export function converseBody(
  messages: Message[],
  name: string,
  schema: Record<string, unknown>,
  maxTokens: number,
  choice: "tool" | "any" = "tool",
  temperature: number | null = null,
): Record<string, unknown> {
  const system = messages.filter((m) => m.role === "system").map((m) => ({ text: m.content }));
  const turns: Array<{ role: "user" | "assistant"; content: Array<{ text: string }> }> = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    const last = turns.at(-1);
    if (last && last.role === m.role) last.content.push({ text: m.content });
    else turns.push({ role: m.role, content: [{ text: m.content }] });
  }
  return {
    ...(system.length ? { system } : {}),
    messages: turns,
    inferenceConfig: temperature === null ? { maxTokens } : { maxTokens, temperature },
    toolConfig: {
      tools: [
        {
          toolSpec: {
            name,
            description: `Return the result as the input of this tool (${name}).`,
            inputSchema: { json: toolSchema(schema) },
          },
        },
      ],
      toolChoice: choice === "tool" ? { tool: { name } } : { any: {} },
    },
  };
}

type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  enum?: unknown[];
};

/**
 * Schema-guided repair for tool-use output: models behind Converse often omit fields they
 * were told to leave empty. Fills a missing string with "", a missing nullable with null,
 * a missing array with [], a missing boolean with false, and turns numeric strings into
 * numbers. Never invents numbers or enum values, so those still fail validation.
 */
export function repairToSchema(data: unknown, schema: JsonSchema): unknown {
  // Nullable comes as anyOf [..., {type: "null"}] or as type: ["string", "null"].
  const typeList = Array.isArray(schema.type) ? schema.type : null;
  const nullable =
    Boolean(schema.anyOf?.some((s) => s.type === "null")) || Boolean(typeList?.includes("null"));
  const inner: JsonSchema = typeList
    ? { ...schema, type: typeList.find((t) => t !== "null") }
    : (schema.anyOf?.find((s) => s.type !== "null") ?? schema);
  if (data === undefined || data === null) {
    if (nullable) return null;
    if (inner.enum) return data;
    if (inner.type === "string") return "";
    if (inner.type === "array") return [];
    if (inner.type === "boolean") return false;
    if (inner.type === "object") return repairToSchema({}, inner);
    return data;
  }
  if (inner.type === "object" && typeof data === "object" && !Array.isArray(data)) {
    const out: Record<string, unknown> = { ...(data as Record<string, unknown>) };
    for (const [k, s] of Object.entries(inner.properties ?? {})) {
      const v = repairToSchema(out[k], s);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  if (inner.type === "array") {
    let arr = data;
    if (typeof arr === "string") {
      try {
        arr = JSON.parse(arr);
      } catch {
        arr = [];
      }
    }
    if (!Array.isArray(arr)) return [];
    return inner.items ? arr.map((x) => repairToSchema(x, inner.items as JsonSchema)) : arr;
  }
  if (inner.type === "string" && !inner.enum && typeof data !== "string") {
    if (typeof data === "number" || typeof data === "boolean") return String(data);
    if (Array.isArray(data) && data.every((x) => typeof x === "string")) return data.join("; ");
    return data;
  }
  if ((inner.type === "number" || inner.type === "integer") && typeof data === "string") {
    const n = Number(data.replace(",", "."));
    return Number.isFinite(n) ? n : data;
  }
  return data;
}

/** Models that refuse a named toolChoice fall back to "any" (one tool, same effect). */
const anyChoice = new Set<string>();

const BEDROCK_THROTTLE_RETRIES = 3;
/** HTTP 429 responses per model (reported with the structured-output stats). */
export const throttled: Record<string, number> = {};

// Bedrock quotas are per account and low; a separate, smaller concurrency slot.
let bedrockActive = 0;
const bedrockWaiting: Array<() => void> = [];
function bedrockLimit(): number {
  const v = Number(process.env.SV_BEDROCK_CONCURRENCY ?? 6);
  return Number.isSafeInteger(v) && v > 0 ? v : 6;
}
async function bedrockSlot<T>(run: () => Promise<T>): Promise<T> {
  if (bedrockActive >= bedrockLimit()) await new Promise<void>((r) => bedrockWaiting.push(r));
  bedrockActive++;
  try {
    return await run();
  } finally {
    bedrockActive--;
    bedrockWaiting.shift()?.();
  }
}

async function completeBedrock(
  model: string,
  messages: Message[],
  name: string,
  schema: Record<string, unknown>,
  maxTokens: number,
  timeoutMs: number,
  temperature: number | null = null,
): Promise<{ content: string; meta: Omit<CallMeta, "retries"> }> {
  const key = process.env.BIFROST_SEED_BEDROCK_KEY;
  const region = process.env.BIFROST_SEED_BEDROCK_REGION;
  if (!key || !region) throw new Error("Bedrock key or region is not set");
  const modelId = model.slice(BEDROCK_PREFIX.length);
  return bedrockSlot(async () => {
    const started = performance.now();
    let status: number | undefined;
    try {
      const send = (choice: "tool" | "any") =>
        fetch(
          `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/converse`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify(
              converseBody(messages, name, schema, maxTokens, choice, temperature),
            ),
            signal: AbortSignal.timeout(timeoutMs),
          },
        );
      let res = await send(anyChoice.has(modelId) ? "any" : "tool");
      // Throttling: back off and retry (1.5 s, 3 s, 6 s) before giving up.
      for (let i = 0; res.status === 429 && i < BEDROCK_THROTTLE_RETRIES; i++) {
        throttled[model] = (throttled[model] ?? 0) + 1;
        await res.text();
        await new Promise((r) => setTimeout(r, 1500 * 2 ** i));
        res = await send(anyChoice.has(modelId) ? "any" : "tool");
      }
      if (res.status === 400 && !anyChoice.has(modelId)) {
        const text = await res.text();
        if (!/toolChoice|tool choice/i.test(text))
          throw new Error(`Bedrock 400: ${redact(text.slice(0, 300))}`);
        anyChoice.add(modelId);
        res = await send("any");
      }
      status = res.status;
      if (!res.ok)
        throw new Error(`Bedrock ${res.status}: ${redact((await res.text()).slice(0, 300))}`);
      const json = (await res.json()) as {
        output?: {
          message?: {
            content?: Array<{ text?: string; toolUse?: { name?: string; input?: unknown } }>;
          };
        };
        stopReason?: string;
        usage?: { inputTokens?: number; outputTokens?: number; cacheReadInputTokens?: number };
      };
      const u = json.usage ?? {};
      usage.calls++;
      usage.tokensIn += u.inputTokens ?? 0;
      usage.tokensOut += u.outputTokens ?? 0;
      if (json.stopReason === "max_tokens")
        throw new StructuredOutputError(`LLM ${name}: truncated`);
      const parts = json.output?.message?.content ?? [];
      const input = parts.find((p) => p.toolUse)?.toolUse?.input;
      const content =
        typeof input === "string"
          ? input
          : input !== undefined
            ? JSON.stringify(input)
            : (parts.find((p) => p.text)?.text ?? "");
      if (!content.trim()) throw new StructuredOutputError(`LLM ${name}: empty response`);
      return {
        content,
        meta: {
          model,
          latencyMs: Math.round(performance.now() - started),
          tokensIn: u.inputTokens ?? 0,
          tokensOut: u.outputTokens ?? 0,
          reasoningTokens: 0,
          tokensCached: u.cacheReadInputTokens ?? 0,
          gatewayRequestId: res.headers.get("x-amzn-requestid"),
        },
      };
    } catch (error) {
      console.warn(
        "llm_request_failed",
        JSON.stringify({
          operation: name,
          provider: "bedrock",
          status,
          message: redact(error instanceof Error ? error.message : String(error)),
        }),
      );
      throw error;
    }
  });
}

export interface StructuredOptions {
  timeoutMs?: number;
  maxOutputTokens?: number;
  reasoningEffort?: "none" | "low" | "medium" | "high" | null;
  /**
   * Deterministic settings for judges (quality audit). Only sent when set; the Azure
   * reasoning deployment accepts temperature 0 only with reasoningEffort "none".
   */
  temperature?: number | null;
  seed?: number | null;
}

/**
 * One JSON-schema call validated with Zod; invalid output is retried once.
 * Use .nullable() instead of .optional(): strict mode requires every key.
 */
export async function structured<T extends z.ZodType>(
  model: string,
  name: string,
  schema: T,
  messages: Message[],
  opts: StructuredOptions = {},
): Promise<{ data: z.infer<T>; meta: CallMeta }> {
  const {
    timeoutMs = 150_000,
    maxOutputTokens = 16_000,
    reasoningEffort = "low",
    temperature = null,
    seed = null,
  } = opts;
  const json = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  const response_format = {
    type: "json_schema",
    json_schema: { name, strict: true, schema: json },
  };
  const stat = statOf(model);
  stat.calls++;
  const sink = callSinks.getStore();
  const started = performance.now();
  const acc = { tokensIn: 0, tokensCached: 0, tokensOut: 0, tokensReasoning: 0, attempts: 0 };
  let requestId: string | null = null;
  const report = (status: CallRecord["status"], output: unknown, error: string | null) =>
    sink?.({
      schemaName: name,
      model,
      startedAt: started,
      durationMs: Math.round(performance.now() - started),
      ...acc,
      status,
      error,
      gatewayRequestId: requestId,
      messages,
      output,
    });
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    stat.attempts++;
    acc.attempts++;
    let content: string;
    let meta: Omit<CallMeta, "retries">;
    try {
      ({ content, meta } = isBedrock(model)
        ? await completeBedrock(
            model,
            messages,
            name,
            json,
            Math.min(maxOutputTokens, 8192),
            timeoutMs,
            temperature,
          )
        : await complete(
            model,
            messages,
            {
              response_format,
              max_completion_tokens: maxOutputTokens,
              ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
              ...(temperature !== null ? { temperature } : {}),
              ...(seed !== null ? { seed } : {}),
            },
            timeoutMs,
            name,
          ));
    } catch (error) {
      lastError = error;
      continue;
    }
    acc.tokensIn += meta.tokensIn;
    acc.tokensCached += meta.tokensCached;
    acc.tokensOut += meta.tokensOut;
    acc.tokensReasoning += meta.reasoningTokens;
    requestId = meta.gatewayRequestId;
    try {
      const raw: unknown = JSON.parse(content);
      const direct = schema.safeParse(raw);
      if (direct.success) {
        report("ok", direct.data, null);
        return { data: direct.data, meta: { ...meta, retries: attempt } };
      }
      if (isBedrock(model)) {
        const fixed = schema.safeParse(repairToSchema(raw, json as JsonSchema));
        if (fixed.success) {
          stat.repaired++;
          report("repaired", fixed.data, null);
          return { data: fixed.data, meta: { ...meta, retries: attempt } };
        }
      }
      throw direct.error;
    } catch (error) {
      stat.invalid++;
      console.warn(
        "llm_invalid_output",
        JSON.stringify({ operation: name, model, message: redact(String(error)).slice(0, 300) }),
      );
      lastError = error;
    }
  }
  stat.failed++;
  const message = redact(lastError instanceof Error ? lastError.message : String(lastError));
  report("failed", null, message.slice(0, 300));
  throw new StructuredOutputError(`LLM ${name}: ${message}`);
}

/** Rough token estimate for prompt blocks shown in the inspector. */
export const estimateTokens = (text: string) => Math.ceil(text.length / 3.6);
