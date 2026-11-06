import { quota } from "@/lib/stage-voice";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/tts/usage: ElevenLabs characters used this month (from /v1/user/subscription,
// cached 60 s server-side, plus what this server rendered since). No key, no figures.
export async function GET() {
  const q = await quota();
  if (!q) return Response.json({ available: false }, { headers: { "Cache-Control": "no-store" } });
  return Response.json(
    { available: true, tier: q.tier, used: q.used, limit: q.limit, resetUnix: q.resetUnix },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
