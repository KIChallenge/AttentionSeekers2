import {
  chatEvidence,
  chatMessages,
  nameStreamGuard,
  seatFacts,
  streamAnswer,
} from "@sv/engine/chat";
import { z } from "zod";
import { loadRunSnapshot } from "@/lib/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/runs/<runId>/agents/<agentId>/chat
//
// Ask one seat of a run about its stance. The answer comes from the seat's own model with the
// persona, red lines, positions, utterances, votes, lessons and strategy it had in the run, and
// evidence retrieved as of the run's as-of date. Nothing is stored: the browser sends its short
// history with every question. The response is NDJSON:
//   {"type":"meta","model":..,"sources":[..]}  evidence handles E1.. with source metadata
//   {"type":"delta","text":..}                 name-guarded answer text
//   {"type":"done"} | {"type":"error","message":..}

const Body = z.object({
  question: z.string().trim().min(1).max(1000),
  lang: z.enum(["de", "en"]).default("de"),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(20)
    .default([]),
});

const AGENT_ID = /^[a-z]{1,12}$/;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ runId: string; agentId: string }> },
) {
  const { runId, agentId } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !AGENT_ID.test(agentId))
    return Response.json({ error: "bad request" }, { status: 400 });
  const snap = await loadRunSnapshot(runId).catch(() => null);
  if (!snap?.run) return Response.json({ error: "run not found" }, { status: 404 });
  const facts = seatFacts(snap, agentId);
  if (!facts) return Response.json({ error: "institution not in this run" }, { status: 404 });

  const { question, lang, history } = parsed.data;
  const passages = await chatEvidence(facts, question);
  const messages = chatMessages(facts, lang, passages, history, question);
  const sources = passages.map((p) => ({
    handle: p.handle,
    sourceId: p.sourceId,
    segmentId: p.segmentId,
    label: [p.institutionCode, p.date, p.outlet ?? p.kind].filter(Boolean).join(" · "),
    title: p.title,
    text: p.text,
    recencyWeight: p.recencyWeight,
  }));

  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(`${JSON.stringify(o)}\n`));
      send({ type: "meta", model: facts.model, sources });
      const guard = nameStreamGuard();
      try {
        for await (const d of streamAnswer(facts.model, messages, { signal: req.signal })) {
          const text = guard.push(d);
          if (text) send({ type: "delta", text });
        }
        const rest = guard.flush();
        if (rest) send({ type: "delta", text: rest });
        send({ type: "done" });
      } catch (error) {
        if (!req.signal.aborted) {
          console.warn("chat_failed", error instanceof Error ? error.message.slice(0, 200) : error);
          send({ type: "error", message: "answer failed" });
        }
      } finally {
        try {
          controller.close();
        } catch {
          // the client went away
        }
      }
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
