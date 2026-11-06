import { beforeEach, describe, expect, it, vi } from "vitest";

// Smoke test of the chat route on the fixture run: real snapshot, real prompt builder and
// name guard; retrieval and the model are mocked. Names below are invented placeholders.
const seen: { messages: Array<{ role: string; content: string }>; model: string }[] = [];

vi.mock("@sv/engine/chat", async (importOriginal) => {
  const real = await importOriginal<typeof import("@sv/engine/chat")>();
  return {
    ...real,
    chatEvidence: vi.fn(async () => [
      {
        handle: "E1",
        segmentId: "seg-1",
        sourceId: "src-1",
        text: "Die Kammer lehnt eine Terminpflicht ohne Honorierung ab.",
        date: "2025-01-15",
        institutionCode: "ÄK",
        institutionRole: "medical_chamber",
        kind: "press",
        title: null,
        outlet: "APA-OTS",
        recencyWeight: 0.6,
        bm25Rank: 1,
        fused: 0.01,
        ownInstitution: true,
      },
    ]),
    streamAnswer: vi.fn(async function* (
      model: string,
      messages: Array<{ role: string; content: string }>,
    ) {
      seen.push({ model, messages });
      yield "Wir lehnen das ab, wie Dr. Muster";
      yield "mann sagte, ohne Honorierung [E1]. ";
      yield "Eine Zusage ohne Finanzierung tragen wir nicht [A].";
    }),
  };
});

const { POST } = await import("./route");

function ask(agentId: string, body: unknown) {
  return POST(
    new Request("http://x/api/runs/fixture-wartezeiten/agents/ak/chat", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ runId: "fixture-wartezeiten", agentId }) },
  );
}

describe("POST /api/runs/[runId]/agents/[agentId]/chat", () => {
  beforeEach(() => {
    seen.length = 0;
  });

  it("streams meta, guarded deltas and done from the seat's model", async () => {
    const res = await ask("ak", {
      question: "Warum lehnen Sie die verbindliche Vierwochenzusage ab?",
      lang: "de",
      history: [{ role: "user", content: "Hallo" }],
    });
    expect(res.status).toBe(200);
    const lines = (await res.text())
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(lines[0].type).toBe("meta");
    expect(lines[0].model).toBe("azure/gpt-5-mini");
    expect(lines[0].sources[0]).toMatchObject({ handle: "E1", sourceId: "src-1" });
    expect(lines.at(-1)).toEqual({ type: "done" });
    const text = lines
      .filter((l) => l.type === "delta")
      .map((l) => l.text)
      .join("");
    expect(text).toContain("[Institution]");
    expect(text).not.toContain("Muster");
    expect(text).toContain("[E1]");

    const call = seen[0];
    expect(call?.model).toBe("azure/gpt-5-mini");
    const system = call?.messages[0]?.content ?? "";
    expect(system).toContain("Rote Linien");
    expect(system).toContain("Endposition");
    expect(call?.messages.at(-1)?.content).toContain("Vierwochenzusage");
    expect(call?.messages).toHaveLength(3);
  });

  it("rejects seats outside the run and bad bodies", async () => {
    expect((await ask("zz", { question: "x" })).status).toBe(404);
    expect((await ask("ak", { question: "" })).status).toBe(400);
  });
});
