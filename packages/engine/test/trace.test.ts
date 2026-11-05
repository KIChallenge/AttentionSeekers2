import { LlmCall } from "@sv/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { structured } from "../src/llm.ts";
import { CallTracer } from "../src/trace.ts";

// Agent trace without a gateway: fetch is stubbed with Chat Completions responses.
const Out = z.object({ answer: z.string() });

function reply(content: string) {
  return new Response(
    JSON.stringify({
      id: "chatcmpl-test",
      choices: [{ finish_reason: "stop", message: { content } }],
      usage: {
        prompt_tokens: 1000,
        completion_tokens: 200,
        completion_tokens_details: { reasoning_tokens: 40 },
        prompt_tokens_details: { cached_tokens: 300 },
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

const msgs = [
  { role: "system" as const, content: "Rolle" },
  { role: "user" as const, content: "Frage" },
];

describe("CallTracer", () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.OPENAI_COMPATIBLE_BASE_URL = "http://gateway.invalid/v1";
    process.env.OPENAI_COMPATIBLE_API_KEY = "test";
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    process.env = { ...env };
    vi.restoreAllMocks();
  });

  it("emits one valid llm.call per structured() call with its parent", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => reply('{"answer":"ja"}'));
    const calls: LlmCall[] = [];
    const tracer = new CallTracer();
    tracer.attach(
      (c) => calls.push(c),
      () => 0,
    );
    await tracer.run({ kind: "assessment", ref: "gm@r1", round: 1, speaker: "gm" }, () =>
      structured("azure/gpt-5-mini", "strategic_assessment", Out, msgs),
    );
    // A call outside any traced step is not attributed.
    await structured("azure/gpt-5-mini", "untraced", Out, msgs);
    expect(calls).toHaveLength(1);
    const c = LlmCall.parse(calls[0]);
    expect(c.parent).toEqual({ kind: "assessment", ref: "gm@r1" });
    expect(c).toMatchObject({
      agentId: "gm",
      provider: "azure",
      tokensIn: 1000,
      tokensCached: 300,
      tokensOut: 200,
      tokensReasoning: 40,
      attempts: 1,
      status: "ok",
      schemaName: "strategic_assessment",
    });
    expect(c.costUsd).toBeGreaterThan(0);
    expect(c.inputPreview?.length).toBe(2);
    expect(c.outputPreview).toContain("ja");
  });

  it("holds utterance calls until the id is known and marks fallback and failure", async () => {
    let n = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      // the Bedrock call fails before HTTP; the fallback call is invalid once, then valid
      reply(n++ < 1 ? '{"wrong":1}' : '{"answer":"ok"}'),
    );
    const calls: LlmCall[] = [];
    const tracer = new CallTracer();
    tracer.attach(
      (c) => calls.push(c),
      () => 0,
    );
    const slot = tracer.slot({ kind: "utterance", round: 2, speaker: "pv" });
    await expect(
      tracer.run(slot, () => structured("bedrock/x", "agent_turn", Out, msgs)),
    ).rejects.toThrow();
    // bedrock/x has no Bedrock key here, so it fails before any HTTP attempt.
    await tracer.run(
      slot,
      () => structured("azure/gpt-6-sol", "agent_turn", Out, msgs),
      "bedrock/x",
    );
    expect(calls).toHaveLength(0);
    slot.resolve("u2-07");
    expect(calls.map((c) => [c.parent.ref, c.status, c.fallbackFrom])).toEqual([
      ["u2-07", "failed", null],
      ["u2-07", "fallback", "bedrock/x"],
    ]);
    // the fallback call needed a schema retry: two attempts, tokens of both counted
    expect(calls[1]?.attempts).toBe(2);
    expect(calls[1]?.tokensIn).toBe(2000);
    expect(calls[1]?.inputPreview).toBeUndefined();
  });

  it("re-bases calls made before the writer existed onto the run clock", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => reply('{"answer":"m"}'));
    let clock = 0;
    const tracer = new CallTracer(() => clock);
    await tracer.run({ kind: "mandate", ref: "run-x", round: null, speaker: "moderator" }, () =>
      structured("azure/gpt-6-sol", "mandate", Out, msgs),
    );
    clock = 5000; // 5 s of pre-run time passed when the writer starts at 0
    const calls: LlmCall[] = [];
    tracer.attach(
      (c) => calls.push(c),
      () => 0,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.startedAtMs).toBeLessThanOrEqual(-5000);
  });
});
