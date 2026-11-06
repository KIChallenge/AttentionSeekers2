import { readFileSync } from "node:fs";
import path from "node:path";
import type { RunEvent } from "@sv/contracts";
import { describe, expect, it } from "vitest";
import { buildLocateIndex, fallbackLocate, indexText, MAX_IDS, tokens, validIds } from "./locate";

const events = readFileSync(
  path.join(__dirname, "../../../runs/reference-wartezeiten-v3.ndjson"),
  "utf8",
)
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l) as RunEvent);

describe("locate index", () => {
  const index = buildLocateIndex(events, "de");

  it("lists every utterance with round, speaker, minute and clipped text", () => {
    expect(index.utterances).toHaveLength(139);
    const u = index.utterances[0];
    expect(u?.round).toBe(1);
    expect(u?.speaker.length).toBeGreaterThan(0);
    for (const x of index.utterances) expect(x.text.length).toBeLessThanOrEqual(200);
    const mins = index.utterances.map((x) => x.min);
    expect(mins.at(-1)).toBeGreaterThan(mins[0] ?? 0);
  });

  it("lists proposals with status round and the utterances that carry them", () => {
    const decided = index.proposals.filter((p) => p.status !== "open");
    expect(decided.length).toBeGreaterThan(0);
    for (const p of decided) expect(p.statusRound).not.toBeNull();
    expect(index.proposals.some((p) => p.utteranceIds.length > 0)).toBe(true);
    expect(indexText(index)).toContain(index.proposals[0]?.id ?? "?");
  });

  it("keeps known ids only, once, in time order", () => {
    const [a, b] = index.utterances.map((u) => u.id);
    expect(validIds([b ?? "", "u9-99", a ?? "", a ?? "", " "], index)).toEqual([a, b]);
    expect(
      validIds(
        index.utterances.map((u) => u.id),
        index,
      ),
    ).toHaveLength(MAX_IDS);
  });

  it("falls back to keyword overlap, compounds included", () => {
    const r = fallbackLocate(index, "Wo ging es um den Finanzierungsstreit?", "de");
    expect(r.source).toBe("fallback");
    expect(r.utteranceIds.length).toBeGreaterThan(0);
    expect(validIds(r.utteranceIds, index)).toEqual(r.utteranceIds);
    expect(r.round).not.toBeNull();
  });

  it("says so when nothing matches", () => {
    const r = fallbackLocate(index, "Quantenchromodynamik?", "en");
    expect(r.utteranceIds).toEqual([]);
    expect(r.answer).toMatch(/no matching/);
  });

  it("folds umlauts and drops stop words", () => {
    expect(tokens("Wann hat die Ärztekammer zugestimmt?")).toEqual(["aerztekammer", "zugestimmt"]);
  });
});
