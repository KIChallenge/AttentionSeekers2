import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  emptySnapshot,
  foldRun,
  parseNdjson,
  pathLength,
  positionAt,
  RunEvent,
  RunSequenceError,
  reduceRun,
  summarizeRun,
  topicStatus,
} from "../src/index.ts";

const file = path.resolve(import.meta.dirname, "../../../runs/fixture-wartezeiten.ndjson");
const text = readFileSync(file, "utf8");
const events = parseNdjson(text);
const snap = foldRun(events);

describe("fixture-wartezeiten.ndjson", () => {
  it("validates every line and keeps seq contiguous from 0", () => {
    expect(events.length).toBeGreaterThan(300);
    expect(events[0]?.type).toBe("run.started");
    events.forEach((e, i) => {
      expect(e.seq).toBe(i);
      if (i > 0) expect(e.tMs).toBeGreaterThanOrEqual(events[i - 1]?.tMs ?? 0);
    });
    expect(events.at(-1)?.type).toBe("run.completed");
  });

  it("contains no em dash and no person-name placeholders", () => {
    expect(text.includes(String.fromCharCode(0x2014))).toBe(false);
    expect(/\b(Dr\.|Mag\.|Minister(in)? [A-Z])/.test(text)).toBe(false);
  });

  it("uses all five phases and nine agents", () => {
    expect(snap.rounds.map((r) => r.phase)).toEqual([1, 2, 3, 4, 5]);
    expect(snap.run?.agents.map((a) => a.id)).toEqual([
      "gm",
      "sv",
      "ak",
      "va",
      "ka",
      "pf",
      "bl",
      "pv",
      "fm",
    ]);
    const speakers = new Set(Object.values(snap.utterances).map((u) => u.speaker));
    for (const id of [
      "gm",
      "sv",
      "ak",
      "va",
      "ka",
      "pf",
      "bl",
      "pv",
      "fm",
      "moderator",
      "expert",
    ]) {
      expect(speakers.has(id)).toBe(true);
    }
  });
});

describe("foldRun", () => {
  it("completes the run with an end condition", () => {
    expect(snap.status).toBe("completed");
    expect(snap.endCondition?.id).toBe("max_rounds");
    expect(snap.run?.status).toBe("completed");
    expect(Object.keys(snap.pending)).toHaveLength(0);
    expect(snap.activeSpeaker).toBeNull();
  });

  it("keeps utterances ordered and attached to rounds", () => {
    expect(snap.utteranceOrder[0]).toBe("u1-01");
    expect(snap.utteranceOrder).toHaveLength(Object.keys(snap.utterances).length);
    expect(snap.rounds[2]?.utteranceIds).toContain("u3-02");
  });

  it("records a position change with its trigger (FR-A5)", () => {
    const va = positionAt(snap, "va", "t-tele", 3);
    expect(va?.stance).toBeGreaterThan(0);
    expect(va?.trigger?.utteranceId).toBe("u3-02");
    expect(positionAt(snap, "va", "t-tele", 1)?.stance).toBeLessThan(0);
    expect(summarizeRun(snap).movedMost?.agentId).toBe("va");
    expect(pathLength(snap, "va")).toBeGreaterThan(pathLength(snap, "gm"));
  });

  it("keeps rejected proposals with reasons (FR-R4)", () => {
    const rejected = Object.values(snap.proposals).filter((p) => p.status === "rejected");
    expect(rejected.length).toBeGreaterThanOrEqual(3);
    for (const p of rejected) expect(p.rejectionReason?.text.length).toBeGreaterThan(5);
    expect(snap.proposals["p-06"]?.status).toBe("accepted");
  });

  it("leaves real open conflicts in the final summary (AC 6, FR-R6)", () => {
    const last = snap.summaries.at(-1);
    expect(last?.round).toBe(5);
    expect(last?.openConflicts.length).toBeGreaterThanOrEqual(2);
    expect(topicStatus(snap, "t-honorar").status).toBe("minority");
  });

  it("carries strategy, coalition calculus and lessons (FR-A10, A11, R8)", () => {
    expect(Object.keys(snap.assessments)).toHaveLength(9);
    expect(snap.assessments.ak?.[0]?.vetoStatus).toBe("formal_veto");
    expect(snap.calculi.map((c) => c.round)).toEqual([2, 3, 4, 5]);
    const r4 = snap.calculi.find((c) => c.round === 4);
    expect(r4?.proposals.find((p) => p.proposalId === "p-06")?.passes).toBe(true);
    expect(r4?.proposals.find((p) => p.proposalId === "p-07")?.blockers).toContain("fm");
    expect(snap.lessons).toHaveLength(36);
    expect(snap.lessonApplications.map((a) => a.utteranceId)).toContain("u3-04");
  });

  it("tracks the contradiction and the assumption chain", () => {
    expect(snap.claims["c-1-04-1"]?.state).toBe("contradicted");
    expect(snap.claims["c-3-08-1"]?.state).toBe("assumption");
    expect(snap.expertNotes).toHaveLength(1);
  });

  it("produces a dashboard summary", () => {
    const s = summarizeRun(snap);
    expect(s.outcomeBadge).toBe("consensus");
    expect(s.agreementShare.of).toBe(7);
    expect(s.roundsCompleted).toBe(5);
    expect(s.isReference).toBe(true);
  });

  it("is JSON serialisable", () => {
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
  });
});

describe("reduceRun", () => {
  it("ignores duplicates and rejects gaps", () => {
    const [first, second, third] = events;
    if (!first || !second || !third) throw new Error("fixture too short");
    let s = reduceRun(emptySnapshot(), first);
    s = reduceRun(s, second);
    expect(reduceRun(s, second)).toBe(s);
    const gap = { ...third, seq: 5 } as RunEvent;
    expect(() => reduceRun(s, gap)).toThrow(RunSequenceError);
  });

  it("applies translations and streaming deltas", () => {
    const base = foldRun(events.slice(0, 3));
    const started = RunEvent.parse({
      v: 1,
      runId: base.runId,
      seq: 3,
      tMs: 9999,
      type: "utterance.started",
      utteranceId: "u9-01",
      speaker: "gm",
      round: 1,
      respondsTo: null,
      model: "m",
    });
    const delta = RunEvent.parse({
      v: 1,
      runId: base.runId,
      seq: 4,
      tMs: 9999,
      type: "utterance.delta",
      utteranceId: "u9-01",
      text: "Hallo",
    });
    const s = reduceRun(reduceRun(base, started), delta);
    expect(s.pending["u9-01"]?.text).toBe("Hallo");
    expect(s.activeSpeaker).toBe("gm");
    const tr = RunEvent.parse({
      v: 1,
      runId: snap.runId,
      seq: snap.lastSeq + 1,
      tMs: snap.lastTMs,
      type: "translation.ready",
      utteranceIds: ["u1-02"],
      lang: "en",
      texts: { "u1-02": "EN text" },
    });
    expect(reduceRun(snap, tr).utterances["u1-02"]?.text.translations.en).toBe("EN text");
  });

  it("keeps traces only when asked", () => {
    expect(Object.keys(snap.traces)).toHaveLength(0);
  });
});
