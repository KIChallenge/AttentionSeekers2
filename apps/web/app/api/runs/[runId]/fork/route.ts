import { z } from "zod";
import { isRunId, ndjsonFrom, newRunId, spawnEngine, waitForRunFile } from "../../../_engine/spawn";

// POST /api/runs/[runId]/fork: re-runs a stored negotiation from round N (FR-U11).
// Rounds before N are copied unchanged; from N on the engine continues live,
// optionally with an evidence edit for one agent (remove or add segment ids).
// Body: { fromRound, edit?: { agentId, removeSegmentIds, addSegmentIds } }
// Response: 202 { runId, streamUrl }, or the live NDJSON stream with ?stream=1.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

const Body = z.object({
  fromRound: z.number().int().min(1).max(8),
  edit: z
    .object({
      agentId: z.string().regex(/^[a-z]{2,4}$/),
      removeSegmentIds: z.array(z.string().max(200)).max(50).default([]),
      addSegmentIds: z.array(z.string().max(200)).max(50).default([]),
    })
    .optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId: baseRunId } = await params;
  if (!isRunId(baseRunId)) return Response.json({ error: "Invalid run id." }, { status: 400 });
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  const { fromRound, edit } = parsed.data;
  const runId = newRunId("fork");
  const args = ["fork", "--base", baseRunId, "--from-round", String(fromRound), "--id", runId];
  if (edit) {
    args.push("--edit-agent", edit.agentId);
    if (edit.removeSegmentIds.length) args.push("--remove", edit.removeSegmentIds.join(","));
    if (edit.addSegmentIds.length) args.push("--add", edit.addSegmentIds.join(","));
  }
  if (new URL(request.url).searchParams.get("stream") === "1") {
    return ndjsonFrom(spawnEngine([...args, "--stdout"], { pipe: true }), runId);
  }
  const child = spawnEngine(args, { detached: true });
  child.unref();
  await waitForRunFile(runId, 25_000);
  return Response.json(
    { runId, baseRunId, fromRound, streamUrl: `/api/runs/${encodeURIComponent(runId)}/stream` },
    { status: 202 },
  );
}
