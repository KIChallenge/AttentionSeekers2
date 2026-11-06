import { modelFamily } from "@sv/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SEAT_PLAN, seatModelOf, verifierFor } from "../src/config.ts";

const KEYS = [
  "BIFROST_SEED_BEDROCK_KEY",
  "BIFROST_SEED_BEDROCK_REGION",
  "SV_DEFAULT_MODEL",
  "SV_SEAT_MODELS",
  "SV_VERIFIER_MODEL",
  "SV_VERIFIER_MODELS",
] as const;
const saved: Record<string, string | undefined> = {};

describe("multi-family seats and cross-family verification", () => {
  beforeEach(() => {
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    process.env.BIFROST_SEED_BEDROCK_KEY = "test-placeholder";
    process.env.BIFROST_SEED_BEDROCK_REGION = "eu-north-1";
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("spreads the default seats over at least four families, Nova not among them", () => {
    const fams = new Set(Object.keys(DEFAULT_SEAT_PLAN).map((a) => modelFamily(seatModelOf(a))));
    expect(fams.size).toBeGreaterThanOrEqual(4);
    expect(fams.has("amazon")).toBe(false);
  });

  it("falls back to the default model for every seat without Bedrock", () => {
    delete process.env.BIFROST_SEED_BEDROCK_KEY;
    for (const a of Object.keys(DEFAULT_SEAT_PLAN)) expect(seatModelOf(a)).toBe("azure/gpt-6-sol");
  });

  it("honours a seat override", () => {
    process.env.SV_SEAT_MODELS = "gm=nova";
    expect(seatModelOf("gm")).toBe("bedrock/eu.amazon.nova-pro-v1:0");
  });

  it("never verifies a claim with the speaker's family", () => {
    const expert = "azure/gpt-6-sol";
    for (const a of Object.keys(DEFAULT_SEAT_PLAN)) {
      const speaker = seatModelOf(a);
      const v = verifierFor(speaker, expert);
      expect(modelFamily(v)).not.toBe(modelFamily(speaker));
      expect(modelFamily(v)).not.toBe(modelFamily(expert));
    }
    // An all-one-family run still gets an outside verifier.
    for (const m of ["bedrock/deepseek.v3.2", "bedrock/qwen.qwen3-235b-a22b-2507-v1:0"])
      expect(modelFamily(verifierFor(m, expert))).not.toBe(modelFamily(m));
  });
});
