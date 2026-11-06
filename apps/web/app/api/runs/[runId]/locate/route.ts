import { CHAT_MODEL } from "@sv/engine/chat";
import { gateAnswer, gateContext } from "@sv/engine/chat-gate";
import { maskPersonNames } from "@sv/engine/guard";
import { hasGateway, structured } from "@sv/engine/llm";
import { z } from "zod";
import {
  buildLocateIndex,
  fallbackLocate,
  indexText,
  LocateAnswer,
  type LocateResult,
  locateMessages,
  validIds,
} from "@/lib/locate";
import { loadRunEvents } from "@/lib/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/runs/<runId>/locate  {"question": "...", "lang": "de"}
//
// "Ask the debate": where in the run did something happen? The chat model reads a compact
// index of the run and answers in 1 to 3 sentences with the utterance ids that show it; ids the
// run does not have are dropped. Without a model, or when the call fails, a keyword ranking over
// the same index answers, so the viewer always gets moments to jump to.
// Response: {"answer":..,"utteranceIds":[..],"round":n|null,"source":"model"|"fallback"}

const Body = z.object({
  question: z.string().trim().min(1).max(500),
  lang: z.enum(["de", "en"]).default("de"),
});

export async function POST(req: Request, ctx: { params: Promise<{ runId: string }> }) {
  const { runId } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad request" }, { status: 400 });
  const events = await loadRunEvents(runId).catch(() => null);
  if (!events?.length) return Response.json({ error: "run not found" }, { status: 404 });
  const { question, lang } = parsed.data;
  const index = buildLocateIndex(events, lang);
  const fallback = fallbackLocate(index, question, lang);
  if (!hasGateway() || process.env.SV_LOCATE_OFFLINE === "1") return Response.json(fallback);

  try {
    const { data } = await structured(
      CHAT_MODEL(),
      "locate_answer",
      LocateAnswer,
      locateMessages(index, question, lang),
      { reasoningEffort: "low", maxOutputTokens: 4000, timeoutMs: 45_000 },
    );
    const ids = validIds(data.utteranceIds, index);
    // the gate keeps clean sentences only; a garbled answer falls back to the ranking text
    const gated = gateAnswer(data.answer.trim(), lang, gateContext(indexText(index), question));
    const answer = maskPersonNames(gated.text || fallback.answer);
    const round =
      data.round !== null && index.utterances.some((u) => u.round === data.round)
        ? data.round
        : (index.utterances.find((u) => u.id === ids[0])?.round ?? null);
    const result: LocateResult = { answer, utteranceIds: ids, round, source: "model" };
    return Response.json(ids.length || !fallback.utteranceIds.length ? result : fallback);
  } catch (error) {
    console.warn("locate_failed", error instanceof Error ? error.message.slice(0, 200) : error);
    return Response.json(fallback);
  }
}
