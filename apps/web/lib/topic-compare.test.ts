import { readFileSync } from "node:fs";
import path from "node:path";
import { foldRun, parseNdjson, summarizeRun } from "@sv/contracts";
import { describe, expect, it } from "vitest";
import { compareRuns, familyOf, topicKeyOf } from "./topic-compare";

const runsDir = path.resolve(__dirname, "../../../runs");
const load = (id: string) => {
  const snap = foldRun(parseNdjson(readFileSync(path.join(runsDir, `${id}.ndjson`), "utf8")));
  return { summary: summarizeRun(snap), snap };
};

describe("topic comparison", () => {
  it("keys templates by id and custom questions by a stable hash", () => {
    expect(topicKeyOf({ template: "wartezeiten", question: "x" })).toBe("wartezeiten");
    const a = topicKeyOf({ template: "custom", question: "Wie  geht das?" });
    expect(a).toMatch(/^q-[0-9a-f]{8}$/);
    expect(topicKeyOf({ template: "custom", question: "wie geht das? " })).toBe(a);
  });

  it("maps gateway ids to families", () => {
    expect(familyOf("azure/gpt-6-sol")).toBe("gpt");
    expect(familyOf("bedrock/eu.amazon.nova-pro-v1:0")).toBe("nova");
    expect(familyOf(undefined)).toBe("unknown");
    expect(familyOf("bedrock/deepseek.v3.2")).toBe("deepseek");
    expect(familyOf("bedrock/qwen.qwen3-235b-a22b-2507-v1:0")).toBe("qwen");
    expect(familyOf("bedrock/moonshotai.kimi-k2.5")).toBe("kimi");
    expect(familyOf("bedrock/zai.glm-5")).toBe("glm");
    expect(familyOf("bedrock/mistral.devstral-2-123b")).toBe("mistral");
    expect(familyOf("bedrock/openai.gpt-oss-120b-1:0")).toBe("gpt-oss");
  });

  it("compares the two reference runs topic by topic", () => {
    const cmp = compareRuns("wartezeiten", [
      load("reference-wartezeiten"),
      load("reference-wartezeiten-presse"),
    ]);
    expect(cmp.runs).toHaveLength(2);
    expect(cmp.runs[0]?.seatFamilies).toBe("mixed");
    expect(cmp.topics.map((t) => t.id)).toContain("t-tele");
    for (const t of cmp.topics) {
      expect(t.cells).toHaveLength(2);
      expect(["robust", "model_dependent"]).toContain(t.robustness);
      expect(t.agreedIn).toBe(t.cells.filter((c) => c.agreement === "agreed").length);
    }
    // Both references seat the same families, so no seat can show a between-family effect.
    for (const s of cmp.seats) expect(s.verdict).toBe("insufficient");
    expect(cmp.families).toEqual(["gpt", "nova"]);
  });

  it("labels each one-family ensemble run by its family", () => {
    const fams = ["gpt", "qwen", "glm", "mistral", "deepseek"];
    const cmp = compareRuns("wartezeiten", [
      ...fams.map((f) => load(`ensemble-wartezeiten-${f}`)),
      load("ensemble-wartezeiten-mixed-families"),
    ]);
    expect(cmp.runs.map((r) => r.seatFamilies)).toEqual([...fams, "mixed"]);
    expect(cmp.runs.map((r) => r.label)).toEqual([
      ...fams.map((f) => `all_${f}`),
      "mixed_families",
    ]);
    expect(cmp.families).toEqual(["deepseek", "glm", "gpt", "mistral", "qwen"]);
    // Every seat was played by several families, so the permutation effect is measurable.
    for (const s of cmp.seats) expect(s.verdict).not.toBe("insufficient");
  });
});
