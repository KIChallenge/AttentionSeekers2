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
});
