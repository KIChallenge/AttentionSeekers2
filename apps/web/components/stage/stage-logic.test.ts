import { describe, expect, it } from "vitest";
import { type AudioManifest, audioFileFor, showpieceSpan } from "./stage-logic";

const utts = Array.from({ length: 10 }, (_, i) => ({ id: `u${i}` }));
const len = (n: number) => () => n;

describe("showpieceSpan", () => {
  it("takes the exchange, the middle, then alternates after and before", () => {
    const span = showpieceSpan(utts, { fromId: "u4", toId: "u6" }, 600, len(100));
    expect(span).toEqual([3, 4, 5, 6, 7, 8]);
  });

  it("stays contiguous and stops a side at the first neighbour that overflows", () => {
    const chars = (i: number) => (i === 7 ? 1000 : 100);
    const span = showpieceSpan(utts, { fromId: "u4", toId: "u6" }, 600, chars);
    expect(span).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("returns nothing when even the exchange is over budget or missing", () => {
    expect(showpieceSpan(utts, { fromId: "u4", toId: "u6" }, 150, len(100))).toEqual([]);
    expect(showpieceSpan(utts, null, 1000, len(100))).toEqual([]);
    expect(showpieceSpan(utts, { fromId: "x", toId: "u6" }, 1000, len(100))).toEqual([]);
  });

  it("covers the whole record when the budget allows", () => {
    expect(showpieceSpan(utts, { fromId: "u0", toId: "u1" }, 10_000, len(10))).toHaveLength(10);
  });
});

describe("audioFileFor", () => {
  const m = (files: Record<string, string>, provider?: "elevenlabs"): AudioManifest => ({
    runId: "r",
    lang: "de",
    model: "m",
    voices: {},
    files,
    provider,
  });
  const azure = m({ a: "a.mp3", b: "b.mp3" });
  const eleven = m({ b: "b.el.mp3" }, "elevenlabs");

  it("prefers the ElevenLabs file and falls back to Azure per utterance", () => {
    expect(audioFileFor("b", azure, eleven)).toEqual({ file: "b.el.mp3", provider: "elevenlabs" });
    expect(audioFileFor("a", azure, eleven)).toEqual({ file: "a.mp3", provider: "azure" });
    expect(audioFileFor("c", azure, eleven)).toBeNull();
    expect(audioFileFor("b", null, eleven)?.provider).toBe("elevenlabs");
    expect(audioFileFor("a", azure, null)?.file).toBe("a.mp3");
  });
});
