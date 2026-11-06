import { describe, expect, it } from "vitest";
import {
  CAPTION_MAX,
  callCoalitions,
  captionChunks,
  chunkAt,
  meetingLayout,
} from "./meeting-logic";

const text =
  "Wir können einer gestaffelten Erweiterung der Kassenstellen zustimmen, wenn die Finanzierung ohne Verschiebung auf unsere Budgets gesichert ist. Eine eigene Tarifposition und planbare Kontingente sind für uns ebenfalls wichtig, um die Terminzusagen honorieren zu können. Danke.";

describe("caption chunks", () => {
  it("splits sentences and cuts long ones at a clause", () => {
    const c = captionChunks(text);
    expect(c.length).toBeGreaterThanOrEqual(4);
    for (const x of c) expect(x.text.length).toBeLessThanOrEqual(CAPTION_MAX);
    expect(c[0]?.text.endsWith("zustimmen,")).toBe(true);
    expect(c.at(-1)?.text).toBe("Danke.");
    // offsets tile the whole text, so any position maps to one chunk
    expect(c[0]?.start).toBe(0);
    expect(c.at(-1)?.end).toBe(text.length);
    for (let i = 1; i < c.length; i++) expect(c[i]?.start).toBe(c[i - 1]?.end);
  });

  it("does not end a sentence inside an abbreviation", () => {
    const c = captionChunks("Das gilt z. B. für Wien. Und sonst nicht.");
    expect(c.map((x) => x.text)).toEqual(["Das gilt z. B. für Wien.", "Und sonst nicht."]);
  });

  it("advances by playback fraction weighted by characters", () => {
    const c = captionChunks(text);
    expect(chunkAt(c, 0, text.length)).toBe(0);
    expect(chunkAt(c, 1, text.length)).toBe(c.length - 1);
    const second = c[1];
    if (!second) throw new Error("no second chunk");
    expect(chunkAt(c, (second.start + 1) / text.length, text.length)).toBe(1);
    const seen = new Set<number>();
    let last = 0;
    for (let p = 0; p <= 1; p += 0.01) {
      const i = chunkAt(c, p, text.length);
      expect(i).toBeGreaterThanOrEqual(last);
      last = i;
      seen.add(i);
    }
    expect(seen.size).toBe(c.length);
  });
});

describe("meeting layout", () => {
  const ids = ["moderator", "gm", "sv", "ak", "va", "ka", "pf", "bl", "pv", "fm", "expert"];
  const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  it.each([
    [1872, 860],
    [1392, 700],
    [390, 640],
  ])("puts the speaker in the spotlight at %ix%i, nothing overlaps", (w, h) => {
    const r = meetingLayout(ids, "bl", w, h);
    const spot = r.bl;
    if (!spot) throw new Error("no spotlight");
    for (const id of ids) {
      const x = r[id];
      expect(x, id).toBeDefined();
      if (!x || id === "bl") continue;
      expect(spot.w * spot.h).toBeGreaterThan(x.w * x.h * 6);
      expect(x.x).toBeGreaterThanOrEqual(0);
      expect(x.y).toBeGreaterThanOrEqual(0);
      expect(x.x + x.w).toBeLessThanOrEqual(w + 1);
      expect(x.y + x.h).toBeLessThanOrEqual(h + 1);
      for (const o of ids) {
        const y = r[o];
        if (o !== id && y) expect(overlap(x, y), `${id} ${o}`).toBe(false);
      }
    }
  });

  it("falls back to an even gallery without a speaker", () => {
    const r = meetingLayout(ids, null, 1600, 900);
    const areas = ids.map((id) => (r[id]?.w ?? 0) * (r[id]?.h ?? 0));
    expect(Math.max(...areas)).toBe(Math.min(...areas));
  });
});

describe("call coalitions", () => {
  const note = (text: string) => ({ text, translations: {} });
  const calculi = [
    {
      round: 1,
      coalitions: [
        {
          id: "a",
          members: ["ak", "pf", "pv"],
          topicIds: ["t-4wo"],
          note: note("Gleiche Richtung"),
        },
        { id: "b", members: ["fm", "va"], topicIds: ["t-4wo"], note: note("Gemeinsam dagegen") },
        { id: "c", members: ["gm", "sv"], topicIds: ["t-tele"], note: note("Gleiche Richtung") },
      ],
    },
    {
      round: 3,
      coalitions: [{ id: "d", members: ["ak", "va"], topicIds: ["t-4wo"], note: note("x") }],
    },
  ];
  const seated = ["ak", "pf", "pv", "fm", "va", "gm", "sv"];

  it("keeps the topic's groups from the latest calculus up to the round", () => {
    const c = callCoalitions(calculi, 2, "t-4wo", seated);
    expect(c.map((x) => x.id)).toEqual(["a", "b"]);
    expect(c[1]?.against).toBe(true);
    expect(c[0]?.color).not.toBe(c[1]?.color);
    expect(callCoalitions(calculi, 3, "t-4wo", seated).map((x) => x.id)).toEqual(["d"]);
  });

  it("needs a topic, a round and two seated members", () => {
    expect(callCoalitions(calculi, 2, null, seated)).toEqual([]);
    expect(callCoalitions(calculi, null, "t-4wo", seated)).toEqual([]);
    expect(callCoalitions(calculi, 2, "t-4wo", ["ak", "fm"])).toEqual([]);
  });
});
