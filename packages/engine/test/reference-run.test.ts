// Structural invariants of the committed reference run (runs/reference-wartezeiten.ndjson):
// it must fold cleanly and follow the exchange rules the engine promises.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { foldRun, parseNdjson, type Utterance } from "@sv/contracts";
import { describe, expect, it } from "vitest";
import { MAX_EXCHANGE_TURNS } from "../src/exchanges.ts";
import { findPersonNames } from "../src/guard.ts";

const file = path.resolve(import.meta.dirname, "../../../runs/reference-wartezeiten.ndjson");
const present = existsSync(file);

describe.skipIf(!present)("reference run follows the exchange structure", () => {
  const events = present ? parseNdjson(readFileSync(file, "utf8")) : [];
  const snap = foldRun(events);
  const utt = (id: string) => snap.utterances[id] as Utterance;
  const closed = snap.exchanges;
  const agents = new Set(snap.run?.agents.map((a) => a.id));

  it("folds to a completed run with exchanges of every kind", () => {
    expect(snap.status).toBe("completed");
    const kinds = new Set(closed.map((x) => x.kind));
    expect(kinds).toEqual(new Set(["plenary", "bilateral", "caucus"]));
    for (const x of closed) {
      expect(x.outcome?.text.length ?? 0).toBeGreaterThan(0);
      expect(x.endMin).toBeGreaterThanOrEqual(x.startMin ?? 0);
    }
  });

  it("puts every utterance in exactly one exchange, with meeting time", () => {
    const seen = new Map<string, string>();
    for (const x of closed) for (const id of x.utteranceIds) seen.set(id, x.id);
    for (const id of snap.utteranceOrder) {
      const u = utt(id);
      expect(u.exchangeId).toBe(seen.get(id));
      expect(u.timing?.durationMin).toBeGreaterThan(0);
    }
  });

  it("bilaterals alternate, answer the previous turn and allow one interjection", () => {
    for (const x of closed.filter((e) => e.kind === "bilateral")) {
      const us = x.utteranceIds.map(utt);
      expect(x.participants.length).toBeGreaterThanOrEqual(2);
      expect(x.participants.length).toBeLessThanOrEqual(3);
      expect(us.length).toBeGreaterThanOrEqual(3);
      expect(us.length).toBeLessThanOrEqual(MAX_EXCHANGE_TURNS);
      const outsiders = us.filter((u) => !x.participants.includes(u.speaker));
      expect(outsiders.length).toBeLessThanOrEqual(1);
      for (let i = 1; i < us.length; i++) {
        expect(us[i]?.speaker).not.toBe(us[i - 1]?.speaker);
        expect(us[i]?.respondsTo).toBe(us[i - 1]?.id);
        expect(us[i]?.addressedTo?.length).toBeGreaterThan(0);
      }
      // An interjection comes from the holder of a red line touched just before.
      for (const o of outsiders) {
        const prev = us[us.indexOf(o) - 1];
        const owners = snap.run?.agents.filter((a) =>
          a.redLineIds.some((r) => prev?.redLinesTouched.includes(r)),
        );
        expect(owners?.map((a) => a.id)).toContain(o.speaker);
      }
    }
  });

  it("caucuses have 1 to 3 turns among coalition partners", () => {
    for (const x of closed.filter((e) => e.kind === "caucus")) {
      expect(x.utteranceIds.length).toBeGreaterThanOrEqual(1);
      expect(x.utteranceIds.length).toBeLessThanOrEqual(3);
      for (const id of x.utteranceIds) expect(x.participants).toContain(utt(id).speaker);
    }
  });

  it("meeting time is monotonic except where caucuses overlap", () => {
    const order = snap.utteranceOrder.map(utt);
    for (let i = 1; i < order.length; i++) {
      const a = order[i - 1] as Utterance;
      const b = order[i] as Utterance;
      const xa = closed.find((x) => x.id === a.exchangeId);
      const xb = closed.find((x) => x.id === b.exchangeId);
      const caucusPair = xa?.kind === "caucus" && xb?.kind === "caucus" && xa.id !== xb.id;
      if (caucusPair) continue;
      expect(b.timing?.startMin ?? 0).toBeGreaterThanOrEqual(
        (a.timing?.startMin ?? 0) + (a.timing?.durationMin ?? 0),
      );
    }
    // Overlapping caucuses really overlap.
    const caucuses = closed.filter((x) => x.kind === "caucus");
    const byRound = new Map<number, typeof caucuses>();
    for (const c of caucuses) byRound.set(c.round, [...(byRound.get(c.round) ?? []), c]);
    for (const list of byRound.values())
      if (list.length > 1) expect(list[0]?.startMin).toBe(list[1]?.startMin);
  });

  it("phase 1 opens with one short statement per institution in the plenary", () => {
    const first = closed[0];
    expect(first?.kind).toBe("plenary");
    const speakers = first?.utteranceIds.map(utt).filter((u) => agents.has(u.speaker)) ?? [];
    expect(new Set(speakers.map((u) => u.speaker))).toEqual(agents);
    expect(speakers.length).toBe(agents.size);
  });

  it("delegates are functional roles of the speaking institution, never names", () => {
    for (const a of snap.run?.agents ?? []) {
      expect(a.delegates?.length ?? 0).toBeGreaterThanOrEqual(2);
      for (const d of a.delegates ?? []) expect(findPersonNames(d.role.text)).toEqual([]);
    }
    for (const id of snap.utteranceOrder) {
      const u = utt(id);
      if (!agents.has(u.speaker)) continue;
      const own = snap.run?.agents.find((a) => a.id === u.speaker)?.delegates ?? [];
      expect(own.map((d) => d.id)).toContain(u.delegateId);
    }
  });
});
