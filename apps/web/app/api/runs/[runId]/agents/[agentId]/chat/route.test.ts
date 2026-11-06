import { beforeEach, describe, expect, it, vi } from "vitest";

// Smoke test of the chat route on the fixture run: real snapshot, real prompt builder, output
// gate and name guard; retrieval and the model stream are mocked. Names below are invented
// placeholders.
const seen: { messages: Array<{ role: string; content: string }>; model: string }[] = [];
let replies: string[][] = [];

vi.mock("@sv/engine/chat", async (importOriginal) => {
  const real = await importOriginal<typeof import("@sv/engine/chat")>();
  async function* fakeStream(model: string, messages: Array<{ role: string; content: string }>) {
    seen.push({ model, messages });
    for (const d of replies.shift() ?? []) yield d;
  }
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
    gatedAnswer: (...args: Parameters<typeof real.gatedAnswer>) =>
      real.gatedAnswer(args[0], args[1], args[2], args[3], { ...args[4], stream: fakeStream }),
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

async function lines(res: Response) {
  return (await res.text())
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
}

const textOf = (ls: Array<{ type: string; text?: string }>) => {
  let t = "";
  for (const l of ls) {
    if (l.type === "reset") t = "";
    if (l.type === "delta") t += l.text ?? "";
  }
  return t;
};

describe("POST /api/runs/[runId]/agents/[agentId]/chat", () => {
  beforeEach(() => {
    seen.length = 0;
    replies = [];
  });

  it("answers with the chat model, names the seat's model, guards names", async () => {
    replies = [
      [
        "Wir lehnen das ab, wie Dr. Muster",
        "mann sagte, ohne Honorierung [E1]. ",
        "Eine Zusage ohne Finanzierung tragen wir nicht [A].",
      ],
    ];
    const res = await ask("ak", {
      question: "Warum lehnen Sie die verbindliche Vierwochenzusage ab?",
      lang: "de",
      history: [{ role: "user", content: "Hallo" }],
    });
    expect(res.status).toBe(200);
    const ls = await lines(res);
    expect(ls[0]).toMatchObject({
      type: "meta",
      model: "azure/gpt-6-sol",
      seatModel: "azure/gpt-5-mini",
    });
    expect(ls[0].sources[0]).toMatchObject({ handle: "E1", sourceId: "src-1" });
    expect(ls.at(-1)).toEqual({ type: "done" });
    expect(ls.at(-2)).toMatchObject({
      type: "gate",
      answeredBy: "azure/gpt-6-sol",
      cut: false,
      regenerated: false,
    });
    const text = textOf(ls);
    expect(text).toContain("[Institution]");
    expect(text).not.toContain("Muster");
    expect(text).toContain("[E1]");
    expect(text).toContain("tragen wir nicht [A].");

    const call = seen[0];
    expect(call?.model).toBe("azure/gpt-6-sol");
    const system = call?.messages[0]?.content ?? "";
    expect(system).toContain("Rote Linien");
    expect(system).toContain("Endposition");
    expect(call?.messages.at(-1)?.content).toContain("Vierwochenzusage");
    expect(call?.messages).toHaveLength(3);
  });

  it("regenerates once when the gate drops most of a drifting answer", async () => {
    replies = [
      [
        "Wir unterstützen das [A]. Im Gesetz muss die Zusage verursacht werden, mit Salinas-",
        "kompatible Berichten und einer Prüfung durch die GAO [A]. Wir avons aucune problématique",
        " emballage environnemental d'ici demain vingt heures lt.",
      ],
      ["Eine Zusage ohne Finanzierung tragen wir nicht mit [A]. Wir verhandeln über Mittel [A]."],
    ];
    const ls = await lines(await ask("ak", { question: "Was muss im Gesetz verankert werden?" }));
    expect(seen.map((s) => s.model)).toEqual(["azure/gpt-6-sol", "azure/gpt-6-sol"]);
    expect(ls.some((l) => l.type === "reset")).toBe(true);
    const gate = ls.find((l) => l.type === "gate");
    expect(gate).toMatchObject({ regenerated: true, answeredBy: "azure/gpt-6-sol" });
    expect(gate.flagged).toEqual(expect.arrayContaining(["GAO"]));
    const text = textOf(ls);
    expect(text).toBe(
      "Eine Zusage ohne Finanzierung tragen wir nicht mit [A]. Wir verhandeln über Mittel [A].",
    );
    // the drifting sentences never reached the browser, only the clean first one did
    const sentBeforeReset = ls
      .slice(
        0,
        ls.findIndex((l) => l.type === "reset"),
      )
      .filter((l) => l.type === "delta")
      .map((l) => l.text)
      .join("");
    expect(sentBeforeReset).not.toMatch(/Salinas|GAO|avons/);
  });

  it("rejects seats outside the run and bad bodies", async () => {
    expect((await ask("zz", { question: "x" })).status).toBe(404);
    expect((await ask("ak", { question: "" })).status).toBe(400);
  });
});
