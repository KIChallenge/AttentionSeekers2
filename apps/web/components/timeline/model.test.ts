import { readFileSync } from "node:fs";
import path from "node:path";
import { foldRun, parseNdjson, type Utterance } from "@sv/contracts";
import { describe, expect, it } from "vitest";
import {
  buildTimeline,
  focusOf,
  groupByExchange,
  minutesForText,
  parallelExchanges,
} from "./model";

const runs = path.resolve(import.meta.dirname, "../../../../runs");
const snap = foldRun(
  parseNdjson(readFileSync(path.join(runs, "fixture-wartezeiten.ndjson"), "utf8")),
);

describe("buildTimeline", () => {
  const m = buildTimeline(snap, snap.run);

  it("has one row per institution plus moderator and expert", () => {
    expect(m.rows[0]).toBe("moderator");
    expect(m.rows.at(-1)).toBe("expert");
    expect(m.rows).toHaveLength((snap.run?.agents.length ?? 0) + 2);
  });

  it("uses recorded minutes and stacks the overlapping caucuses in separate lanes", () => {
    expect(m.items.every((i) => !i.derived)).toBe(true);
    const caucuses = m.bands.filter((b) => b.exchange.kind === "caucus");
    expect(caucuses).toHaveLength(2);
    expect(new Set(caucuses.map((b) => b.lane)).size).toBe(2);
    expect(parallelExchanges(snap.exchanges).size).toBe(2);
  });

  it("links replies to the utterance they answer", () => {
    expect(m.links).toContainEqual({ from: "u3-02", to: "u3-03" });
  });

  it("derives minutes from seq and word count when timing is missing", () => {
    const utterances: Record<string, Utterance> = {};
    for (const id of snap.utteranceOrder.slice(0, 3)) {
      const u = snap.utterances[id];
      if (u) utterances[id] = { ...u, timing: undefined };
    }
    const d = buildTimeline(
      { ...snap, utterances, utteranceOrder: Object.keys(utterances), exchanges: [] },
      snap.run,
    );
    expect(d.items.every((i) => i.derived)).toBe(true);
    const [a, b] = d.items;
    expect(a?.start).toBe(0);
    expect(b?.start).toBeGreaterThanOrEqual((a?.start ?? 0) + (a?.dur ?? 0));
    expect(minutesForText("eins zwei drei")).toBeGreaterThanOrEqual(1);
  });
});

describe("focus and grouping", () => {
  it("names delegate and addressees of a bilateral utterance", () => {
    const f = focusOf(snap, "u3-11");
    expect(f?.speaker).toBe("ak");
    expect(f?.delegateId).toBe("ak-d3");
    expect(f?.addressedTo).toEqual(["bl"]);
  });

  it("groups interleaved caucus utterances by exchange", () => {
    const r4 = snap.rounds.find((r) => r.round === 4);
    const groups = groupByExchange(r4?.utteranceIds ?? [], snap.utterances);
    const x2 = groups.find((g) => g.exchangeId === "x4-2");
    expect(x2?.ids).toEqual(["u4-09", "u4-11", "u4-13"]);
  });
});
