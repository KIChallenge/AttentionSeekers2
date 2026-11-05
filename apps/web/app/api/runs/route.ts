import { Mandate, RoomConfig, Template } from "@sv/contracts";
import { z } from "zod";
import { listRuns } from "@/lib/runs";
import {
  isRunId,
  ndjsonFrom,
  newRunId,
  spawnEngine,
  tempJson,
  waitForRunFile,
} from "../_engine/spawn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

/** RunSummary[] for the dashboard (FR-U11). */
export async function GET() {
  return Response.json(await listRuns());
}

const Body = z.object({
  /** Full setup-room config (from /api/mandate, possibly edited). */
  room: RoomConfig.optional(),
  /** Mandate from /api/mandate; omitted means the moderator builds it at start. */
  mandate: Mandate.optional(),
  question: z.string().min(5).max(2000).optional(),
  template: Template.optional(),
  roundLimit: z.number().int().min(1).max(8).optional(),
  asOf: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  runId: z.string().optional(),
});

/**
 * POST /api/runs starts a live negotiation.
 *   default        202 { runId, streamUrl } and the run continues in the background;
 *                  events go to runs/<id>.ndjson and the database.
 *   ?stream=1      the response itself is the live NDJSON RunEvent stream
 *                  (or send Accept: application/x-ndjson).
 */
export async function POST(request: Request) {
  const raw: unknown = await request.json().catch(() => ({}));
  // The setup room posts a bare RoomConfig; API clients may wrap it as { room, mandate }.
  const bare = RoomConfig.safeParse(raw);
  const parsed = bare.success ? Body.safeParse({ room: bare.data }) : Body.safeParse(raw);
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  const b = parsed.data;
  if (!b.room && !b.question && (!b.template || b.template === "custom"))
    return Response.json({ error: "room, question or template required" }, { status: 400 });
  const runId = b.runId && isRunId(b.runId) ? b.runId : newRunId();
  const args = ["run", "--id", runId];
  if (b.room) args.push("--room-file", tempJson("room.json", b.room));
  else {
    if (b.question) args.push("--question", b.question);
    if (b.template) args.push("--template", b.template);
    if (b.roundLimit) args.push("--rounds", String(b.roundLimit));
    if (b.asOf) args.push("--as-of", b.asOf);
  }
  if (b.mandate) args.push("--mandate-file", tempJson("mandate.json", b.mandate));

  const url = new URL(request.url);
  const live =
    url.searchParams.get("stream") === "1" ||
    (request.headers.get("accept") ?? "").includes("application/x-ndjson");
  if (live) {
    const child = spawnEngine([...args, "--stdout"], { pipe: true });
    return ndjsonFrom(child, runId);
  }
  const child = spawnEngine(args, { detached: true });
  child.unref();
  // Give the engine a moment to write run.started so the stream route finds the run.
  await waitForRunFile(runId, 25_000);
  return Response.json(
    { runId, streamUrl: `/api/runs/${encodeURIComponent(runId)}/stream` },
    { status: 202 },
  );
}
