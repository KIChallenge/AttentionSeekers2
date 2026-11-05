// Gateway client: OpenAI-compatible Chat Completions (pattern from medlyn llm/client.ts).
// structured(): strict JSON schema from Zod, one retry on invalid output, refusal and
// truncation errors, concurrency slot, key redaction. Returns usage and latency for
// telemetry (FR-T7). The model id is passed per call (FR-X1, NFR-4).
import { z } from "zod";

export type Message = { role: "system" | "user" | "assistant"; content: string };

export interface CallMeta {
  model: string;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  reasoningTokens: number;
  retries: number;
  gatewayRequestId: string | null;
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
  const v = Number(process.env.SV_LLM_CONCURRENCY ?? 12);
  return Number.isSafeInteger(v) && v > 0 ? v : 12;
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
  const key = process.env.OPENAI_COMPATIBLE_API_KEY;
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
      if (!res.ok) throw new Error(`LLM ${res.status}: ${redact((await res.text()).slice(0, 300))}`);
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

export interface StructuredOptions {
  timeoutMs?: number;
  maxOutputTokens?: number;
  reasoningEffort?: "none" | "low" | "medium" | "high" | null;
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
  const { timeoutMs = 150_000, maxOutputTokens = 16_000, reasoningEffort = "low" } = opts;
  const response_format = {
    type: "json_schema",
    json_schema: { name, strict: true, schema: z.toJSONSchema(schema, { target: "draft-7" }) },
  };
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { content, meta } = await complete(
        model,
        messages,
        {
          response_format,
          max_completion_tokens: maxOutputTokens,
          ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
        },
        timeoutMs,
        name,
      );
      return { data: schema.parse(JSON.parse(content)), meta: { ...meta, retries: attempt } };
    } catch (error) {
      lastError = error;
    }
  }
  throw new StructuredOutputError(
    `LLM ${name}: ${redact(lastError instanceof Error ? lastError.message : String(lastError))}`,
  );
}

/** Rough token estimate for prompt blocks shown in the inspector. */
export const estimateTokens = (text: string) => Math.ceil(text.length / 3.6);
