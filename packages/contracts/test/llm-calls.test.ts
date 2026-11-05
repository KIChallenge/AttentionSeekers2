import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  deriveLlmCalls,
  estimateCostUsd,
  foldRun,
  type LlmCall,
  modelFamily,
  parseNdjson,
  providerOf,
  RunEvent,
} from "../src/index.ts";

const file = path.resolve(import.meta.dirname, "../../../runs/fixture-wartezeiten.ndjson");
const events = parseNdjson(readFileSync(file, "utf8"));

const call: LlmCall = {
  callId: "c0001",
  parent: { kind: "assessment", ref: "gm@r1" },
  round: 1,
  agentId: "gm",
  speaker: "gm",
  provider: "azure",
  model: "azure/gpt-5-mini",
  startedAtMs: 120,
  durationMs: 900,
  tokensIn: 1000,
  tokensCached: 400,
  tokensOut: 200,
  tokensReasoning: 50,
  costUsd: 0.00056,
  attempts: 1,
  status: "ok",
  fallbackFrom: null,
  schemaName: "strategic_assessment",
  origin: "recorded",
};

describe("llm.call", () => {
  it("older runs fold to an empty call list", () => {
    expect(foldRun(events).llmCalls).toEqual([]);
  });

  it("is folded into snapshot.llmCalls in arrival order", () => {
    const last = events.at(-1) as RunEvent;
    const extra = RunEvent.parse({
      v: 1,
      runId: last.runId,
      seq: last.seq + 1,
      tMs: last.tMs,
      type: "llm.call",
      call,
    });
    const snap = foldRun([...events, extra]);
    expect(snap.llmCalls).toHaveLength(1);
    expect(snap.llmCalls[0]?.parent).toEqual({ kind: "assessment", ref: "gm@r1" });
  });

  it("estimates cost with cached input at the cached rate", () => {
    // 600 fresh * 0.25 + 400 cached * 0.025 + 200 out * 2, per million
    expect(estimateCostUsd("azure/gpt-5-mini", call)).toBeCloseTo(0.00056, 8);
    expect(estimateCostUsd("acme/unknown", call)).toBeNull();
  });

  it("names provider and family", () => {
    expect(providerOf("bedrock/eu.amazon.nova-pro-v1:0")).toBe("bedrock");
    expect(modelFamily("bedrock/eu.amazon.nova-pro-v1:0")).toBe("amazon");
    expect(modelFamily("azure/gpt-6-sol")).toBe("openai");
    expect(modelFamily("mistral/mistral-medium-3")).toBe("mistral");
  });

  it("derives a labelled trace from utterance telemetry for older runs", () => {
    const derived = deriveLlmCalls(events);
    const withTelemetry = events.filter(
      (e) => e.type === "utterance.completed" && e.utterance.telemetry,
    ).length;
    const timed = derived.filter((c) => !c.unknown);
    expect(timed.length).toBe(withTelemetry);
    expect(derived.every((c) => c.origin === "derived")).toBe(true);
    for (const c of timed) {
      expect(c.startedAtMs).toBeGreaterThanOrEqual(0);
      expect(c.durationMs).toBeGreaterThanOrEqual(0);
    }
  });
});
