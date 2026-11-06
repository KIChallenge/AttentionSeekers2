import { LipsyncDe } from "@met4citizen/talkinghead/modules/lipsync-de.mjs";
import { LipsyncEn } from "@met4citizen/talkinghead/modules/lipsync-en.mjs";
import { describe, expect, it } from "vitest";
import { figureStyle, seatPosition, stageColumns } from "./figure-style";
import { ampGate, buildTrack, VISEMES, type Viseme, visemeWeights } from "./visemes";

const blank = () => Object.fromEntries(VISEMES.map((v) => [v, 0])) as Record<Viseme, number>;

describe("viseme track", () => {
  it("turns German text into a non-empty track with known visemes", () => {
    const t = buildTrack("Die Wartezeit beträgt 34 Tage.", new LipsyncDe());
    expect(t.visemes.length).toBeGreaterThan(10);
    expect(t.total).toBeGreaterThan(0);
    for (const v of t.visemes) expect(VISEMES).toContain(v);
  });

  it("works for English and for empty text", () => {
    expect(buildTrack("Waiting times fell.", new LipsyncEn()).visemes.length).toBeGreaterThan(3);
    expect(buildTrack("  ", new LipsyncEn()).total).toBe(0);
  });

  it("opens the mouth mid-utterance and keeps it shut when gated or out of range", () => {
    const t = buildTrack("Die Wartezeit beträgt vierunddreißig Tage.", new LipsyncDe());
    const sum = (w: Record<Viseme, number>) => Object.values(w).reduce((a, b) => a + b, 0);
    expect(sum(visemeWeights(t, 0.5, 1, blank()))).toBeGreaterThan(0.1);
    expect(sum(visemeWeights(t, 0.5, 0, blank()))).toBe(0);
    expect(sum(visemeWeights(t, 1.2, 1, blank()))).toBe(0);
    for (const v of Object.values(visemeWeights(t, 0.3, 1, blank())))
      expect(v).toBeLessThanOrEqual(1);
  });

  it("gates on amplitude", () => {
    expect(ampGate(0)).toBe(0);
    expect(ampGate(0.5)).toBeGreaterThan(0.5);
    expect(ampGate(5)).toBe(1);
  });
});

describe("figure style", () => {
  it("is deterministic per seat and varies between seats", () => {
    expect(figureStyle("ak", "#ff0000")).toEqual(figureStyle("ak", "#ff0000"));
    const ids = ["gm", "sv", "ak", "va", "ka", "pf", "bl", "pv", "fm"];
    const looks = new Set(ids.map((id) => JSON.stringify({ ...figureStyle(id, "#000"), suit: 0 })));
    expect(looks.size).toBeGreaterThan(6);
    for (const id of ids) expect(figureStyle(id, "#000").skin).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("mirrors the tile grid", () => {
    expect(stageColumns(11)).toBe(4);
    expect(seatPosition(0, 4).y).toBeCloseTo(0);
    expect(seatPosition(5, 4).y).toBeLessThan(0);
    expect(seatPosition(3, 4).x).toBeGreaterThan(seatPosition(0, 4).x);
  });
});
