import { foldRun } from "@sv/contracts";
import {
  CHAT_MODEL,
  CHAT_STATE_KEY,
  chatEvidence,
  chatMessages,
  chatStateKey,
  chatStates,
  gatedAnswer,
  nameStreamGuard,
  parseChatState,
  playedRounds,
  runText,
  seatFacts,
  snapshotAt,
} from "@sv/engine/chat";
import { gateContext } from "@sv/engine/chat-gate";
import { maskPersonNames } from "@sv/engine/guard";
import { z } from "zod";
import { loadRunEvents } from "@/lib/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/runs/<runId>/agents/<agentId>/chat
//
// Ask one seat of a run about its stance. The answer comes from a strong chat model (CHAT_MODEL,
// not the seat's run model) with the persona, red lines, positions, utterances, votes, lessons
// and strategy the seat had in the run, and evidence retrieved as of the run's as-of date.
// `state` cuts that context to a point in the negotiation: "before" (persona, dossier and
// opening position), "r<N>" (up to and including round N) or "after" (the full run). The
// output gate keeps clean sentences only and regenerates once when too much is lost. Nothing is
// stored: the browser sends its short history with every question. The response is NDJSON:
//   {"type":"meta","model":..,"seatModel":..,"state":..,"sources":[..]}  answering model, the
//                                         seat's run model, the state, evidence handles E1..
//   {"type":"delta","text":..}                 gated, name-guarded answer text
//   {"type":"reset"}                           drop the text so far: a regenerated answer follows
//   {"type":"gate","answeredBy":..,"cut":..,"regenerated":..,"flagged":[..]}
//   {"type":"done"} | {"type":"error","message":..}

const Body = z.object({
  question: z.string().trim().min(1).max(1000),
  lang: z.enum(["de", "en"]).default("de"),
  state: z.string().regex(CHAT_STATE_KEY).default("after"),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(20)
    .default([]),
});

const AGENT_ID = /^[a-z]{1,12}$/;

// GET: the states this run offers for the seat, each with its stance per topic, for the
// state switch and the comparison ({"states":[{"key":"before","stances":{"t-tele":-2}},..]}).
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ runId: string; agentId: string }> },
) {
  const { runId, agentId } = await ctx.params;
  if (!AGENT_ID.test(agentId)) return Response.json({ error: "bad request" }, { status: 400 });
  const events = await loadRunEvents(runId).catch(() => null);
  if (!events?.length) return Response.json({ error: "run not found" }, { status: 404 });
  return Response.json({ states: chatStates(events, agentId) });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ runId: string; agentId: string }> },
) {
  const { runId, agentId } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !AGENT_ID.test(agentId))
    return Response.json({ error: "bad request" }, { status: 400 });
  const events = await loadRunEvents(runId).catch(() => null);
  const snap = events ? foldRun(events) : null;
  if (!events || !snap?.run) return Response.json({ error: "run not found" }, { status: 404 });
  const { question, lang, history } = parsed.data;
  const state = parseChatState(parsed.data.state);
  if (!state || (state.kind === "round" && state.round > playedRounds(events)))
    return Response.json({ error: "no such state in this run" }, { status: 400 });
  const facts = seatFacts(snapshotAt(events, state), agentId, state);
  if (!facts) return Response.json({ error: "institution not in this run" }, { status: 404 });

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

  const model = CHAT_MODEL();
  // the gate's lexicon may span the whole run: it only drops garbled words, it adds nothing
  const gate = gateContext(...messages.map((m) => m.content), runText(snap));
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(`${JSON.stringify(o)}\n`));
      send({ type: "meta", model, seatModel: facts.model, state: chatStateKey(state), sources });
      let guard = nameStreamGuard();
      try {
        for await (const ev of gatedAnswer(model, messages, lang, gate, { signal: req.signal })) {
          if (ev.type === "delta") {
            const text = guard.push(ev.text);
            if (text) send({ type: "delta", text });
          } else if (ev.type === "reset") {
            guard = nameStreamGuard();
            send(ev);
          } else {
            const rest = guard.flush();
            if (rest) send({ type: "delta", text: rest });
            send({
              type: "gate",
              answeredBy: ev.answeredBy,
              cut: ev.cut,
              regenerated: ev.regenerated,
              flagged: ev.flagged.map((w) => maskPersonNames(w)).slice(0, 12),
            });
          }
        }
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
