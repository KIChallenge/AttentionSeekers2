import { readFileSync } from "node:fs";
import path from "node:path";
import { foldRun, parseNdjson } from "@sv/contracts";
import { describe, expect, it } from "vitest";
import {
  chatMessages,
  chatSystemPrompt,
  eventStreamFrames,
  nameStreamGuard,
  parseChatState,
  playedRounds,
  seatFacts,
  snapshotAt,
} from "../src/chat.ts";
import type { Passage } from "../src/retrieval.ts";

const runFile = path.resolve(
  import.meta.dirname,
  "../../../runs/reference-wartezeiten-presse.ndjson",
);
const events = parseNdjson(readFileSync(runFile, "utf8"));
const snap = foldRun(events);

const passage: Passage = {
  handle: "E1",
  segmentId: "seg-1",
  sourceId: "src-1",
  text: "Die Kammer lehnt eine Substitution der ärztlichen Erstdiagnose ab.",
  date: "2024-03-01",
  institutionCode: "ÄK",
  institutionRole: "medical_chamber",
  kind: "press",
  title: null,
  outlet: null,
  recencyWeight: 0.7,
  bm25Rank: 1,
  fused: 0.01,
  ownInstitution: true,
};

describe("ask an institution: prompt builder", () => {
  const f = seatFacts(snap, "ak");

  it("folds the seat from the run", () => {
    expect(f).not.toBeNull();
    expect(f?.model).toBe(snap.run?.modelAssignment.ak);
    expect(f?.utterances.length).toBeGreaterThan(0);
    expect(seatFacts(snap, "nobody")).toBeNull();
  });

  it("includes red lines with tiers and the final position per topic", () => {
    if (!f) throw new Error("no facts");
    const prompt = chatSystemPrompt(f, "de", [passage]);
    expect(prompt).toContain("Keine Stellenplanung außerhalb des Gesamtvertrags");
    expect(prompt).toContain("Kernüberzeugung");
    const tele = f.positions.find((t) => t.topicId === "t-tele");
    const last = tele?.rounds.at(-1);
    expect(last).toBeDefined();
    const s = (last?.stance ?? 0) > 0 ? `+${last?.stance}` : String(last?.stance);
    expect(prompt).toContain(`Telemedizin: Endposition ${s}`);
    expect(prompt).toContain("[E1]");
    expect(prompt).toContain(f.utterances[0]?.id ?? "?");
    expect(prompt).toContain("Antworte auf Deutsch");
    expect(prompt).not.toMatch(/\u2014/);
  });

  it("switches the answer language and keeps the history short", () => {
    if (!f) throw new Error("no facts");
    const history = Array.from({ length: 12 }, (_, i) => ({
      role: i % 2 ? ("assistant" as const) : ("user" as const),
      content: `turn ${i}`,
    }));
    const msgs = chatMessages(f, "en", [], history, "Why?");
    expect(msgs[0]?.content).toContain("Antworte auf Englisch");
    expect(msgs).toHaveLength(1 + 8 + 1);
    expect(msgs.at(-1)).toEqual({ role: "user", content: "Why?" });
  });
});

describe("ask an institution: streaming name guard", () => {
  // invented placeholder names, not real persons
  it("masks a name split across deltas", () => {
    const g = nameStreamGuard();
    const deltas = [
      "Wie Dr",
      ". Muster",
      "mann betont",
      " hat, bleiben wir",
      " bei unserer Linie.",
    ];
    const out = deltas.map((d) => g.push(d)).join("") + g.flush();
    expect(out).toBe("Wie [Institution] betont hat, bleiben wir bei unserer Linie.");
  });

  it("masks given-name pairs and passes institutional prose", () => {
    const g = nameStreamGuard();
    const out = g.push("Anna Beispiel von der Kammer und das Gesundheitsministerium ") + g.flush();
    expect(out).toBe("[Institution] von der Kammer und das Gesundheitsministerium ");
  });

  it("replaces em dashes", () => {
    const g = nameStreamGuard();
    expect(g.push("Wir \u2014 als Kammer \u2014 sagen nein") + g.flush()).toBe(
      "Wir, als Kammer, sagen nein",
    );
  });
});

function frame(headers: Record<string, string>, payload: unknown): Uint8Array {
  const enc = new TextEncoder();
  const hs: number[] = [];
  for (const [k, v] of Object.entries(headers)) {
    const kb = enc.encode(k);
    const vb = enc.encode(v);
    hs.push(kb.length, ...kb, 7, vb.length >> 8, vb.length & 255, ...vb);
  }
  const body = enc.encode(JSON.stringify(payload));
  const total = 12 + hs.length + body.length + 4;
  const out = new Uint8Array(total);
  const v = new DataView(out.buffer);
  v.setUint32(0, total);
  v.setUint32(4, hs.length);
  out.set(hs, 12);
  out.set(body, 12 + hs.length);
  return out;
}

describe("bedrock event stream decoder", () => {
  it("reads content deltas and leaves a partial frame", () => {
    const a = frame(
      { ":event-type": "contentBlockDelta", ":message-type": "event" },
      { delta: { text: "Wir " } },
    );
    const b = frame({ ":event-type": "messageStop", ":message-type": "event" }, {});
    const joined = new Uint8Array(a.length + b.length - 3);
    joined.set(a);
    joined.set(b.subarray(0, b.length - 3), a.length);
    const frames = [...eventStreamFrames(joined)];
    expect(frames).toHaveLength(1);
    expect(frames[0]?.type).toBe("contentBlockDelta");
    expect(frames[0]?.payload).toEqual({ delta: { text: "Wir " } });
  });
});

describe("ask an institution: negotiation state", () => {
  const promptAt = (key: string, agentId = "ak") => {
    const state = parseChatState(key);
    if (!state) throw new Error(`bad state ${key}`);
    const f = seatFacts(snapshotAt(events, state), agentId, state);
    if (!f) throw new Error("no facts");
    return chatSystemPrompt(f, "de", []);
  };
  // proposals first tabled in round 4 (p-07..p-09) and their titles
  const late = snap.proposalOrder
    .map((id) => snap.proposals[id])
    .filter((p) => p !== undefined && p.round >= 4);
  const lateTitles = late.map((p) => p?.title.text ?? "").filter((t) => t.length > 12);

  it("parses state keys and finds the played rounds", () => {
    expect(parseChatState("before")).toEqual({ kind: "before" });
    expect(parseChatState("r3")).toEqual({ kind: "round", round: 3 });
    expect(parseChatState("r0")).toBeNull();
    expect(playedRounds(events)).toBe(5);
    expect(late.length).toBeGreaterThan(0);
  });

  it("never leaks a later-round proposal into an earlier state", () => {
    for (const key of ["before", "r1", "r2", "r3"]) {
      const prompt = promptAt(key);
      for (const p of late) expect(prompt).not.toContain(p?.id ?? "?");
      for (const t of lateTitles) expect(prompt).not.toContain(t);
    }
    const after = promptAt("after");
    expect(late.some((p) => after.includes(p?.id ?? "?"))).toBe(true);
  });

  it("before keeps persona, red lines and the opening position only", () => {
    const prompt = promptAt("before");
    expect(prompt).toContain("Keine Stellenplanung außerhalb des Gesamtvertrags");
    expect(prompt).toContain("Eröffnungsposition");
    expect(prompt).not.toMatch(/\bu\d+-\d+\b/);
    expect(prompt).not.toMatch(/\bp-\d\d\b/);
    expect(prompt).not.toContain("Lehren je Runde");
    expect(prompt).not.toContain("Ergebnis des Laufs");
    const opening = snap.positions.ak?.["t-tele"]?.[0]?.stance ?? 0;
    expect(prompt).toContain(
      `Telemedizin: Eröffnungsposition ${opening > 0 ? `+${opening}` : opening}`,
    );
  });

  it("round N keeps utterances up to round N and nothing after", () => {
    const prompt = promptAt("r2");
    const rounds = [...prompt.matchAll(/\bu(\d+)-\d+\b/g)].map((m) => Number(m[1]));
    expect(rounds.length).toBeGreaterThan(0);
    expect(Math.max(...rounds)).toBeLessThanOrEqual(2);
    expect(prompt).toContain("Position nach Runde 2");
    expect(prompt).not.toContain("Ergebnis des Laufs");
    for (const id of snap.utteranceOrder) {
      const u = snap.utterances[id];
      if (u && u.round > 2 && u.speaker === "ak") expect(prompt).not.toContain(id);
    }
  });
});
