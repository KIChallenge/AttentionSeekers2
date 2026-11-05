import {
  cachedFile,
  fileResponse,
  inflightProvider,
  RUN_ID,
  UTT_ID,
  voice,
} from "@/lib/stage-voice";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/runs/<runId>/tts/<uttId>?lang=de[&meta=1]
//
// Audio for one utterance, voiced the first time someone listens: the cached <uttId>.el.mp3,
// else a fresh ElevenLabs render streamed while it is cached, else (no key, no voice, quota
// spent or any ElevenLabs error) the cached Azure <uttId>.mp3 or a fresh Azure render. Order
// details in lib/stage-voice.ts. Ids are checked against
// strict patterns and only utterances already completed in the record are voiced. No shell.
// X-Voice-Provider names who voiced it; X-Voice-Cache says hit, wait (joined a running render)
// or miss. With meta=1 the route only reports {provider, state} and never renders.
export async function GET(
  req: Request,
  ctx: { params: Promise<{ runId: string; uttId: string }> },
) {
  const { runId, uttId } = await ctx.params;
  const url = new URL(req.url);
  const langParam = url.searchParams.get("lang") ?? "de";
  if (!RUN_ID.test(runId) || !UTT_ID.test(uttId) || !["de", "en"].includes(langParam)) {
    return Response.json({ error: "bad run, utterance or language" }, { status: 400 });
  }
  const lang = langParam;

  if (url.searchParams.get("meta") === "1") {
    // a running render first: it may replace a cached Azure file with an ElevenLabs one
    const hit = cachedFile(runId, lang, uttId);
    const body =
      hit?.provider === "elevenlabs"
        ? { provider: hit.provider, state: "cached" }
        : inflightProvider(runId, lang, uttId)
          ? { provider: null, state: "rendering" }
          : hit
            ? { provider: hit.provider, state: "cached" }
            : { provider: null, state: "none" };
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  }

  const r = await voice(runId, lang, uttId);
  switch (r.kind) {
    case "file":
      return fileResponse(req, r.file, {
        "X-Voice-Provider": r.provider,
        "X-Voice-Cache": r.cache,
      });
    case "stream":
      return new Response(r.body, {
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "no-store",
          "X-Voice-Provider": r.provider,
          "X-Voice-Cache": "miss",
          "Server-Timing": r.timing,
        },
      });
    case "buffer":
      return new Response(new Uint8Array(r.body), {
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Length": String(r.body.length),
          "Cache-Control": "no-store",
          "X-Voice-Provider": r.provider,
          "X-Voice-Cache": "miss",
          "Server-Timing": r.timing,
          ...(r.reason ? { "X-Voice-Fallback": encodeURIComponent(r.reason.slice(0, 160)) } : {}),
        },
      });
    default:
      return Response.json({ error: r.reason }, { status: 404 });
  }
}
