import type { RunEvent } from "@sv/contracts";
import { loadRunEvents } from "@/lib/runs";

// Replay of a stored run as NDJSON RunEvents (ui-plan 4.2).
//   ?from=<seq>   resume after reconnect (default 0)
//   ?speed=<x>    1 = recorded pace, 4 = four times faster, 0 = everything at once
// Gaps between events are scaled by 1/speed and capped at 1.5 s.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_GAP_MS = 1500;

export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const url = new URL(request.url);
  const from = Math.max(0, Number.parseInt(url.searchParams.get("from") ?? "0", 10) || 0);
  const speedRaw = Number.parseFloat(url.searchParams.get("speed") ?? "1");
  const speed = Number.isFinite(speedRaw) && speedRaw >= 0 ? Math.min(speedRaw, 64) : 1;

  let events: RunEvent[] | null;
  try {
    events = await loadRunEvents(runId);
  } catch (error) {
    console.error("run_load_failed", runId, error instanceof Error ? error.message : error);
    return Response.json({ error: "The run could not be read." }, { status: 500 });
  }
  if (!events) return Response.json({ error: "Run not found." }, { status: 404 });

  const encoder = new TextEncoder();
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: RunEvent) => {
        if (!cancelled) controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      };
      try {
        let prevT: number | null = null;
        for (const e of events) {
          if (cancelled) break;
          if (e.seq < from) continue;
          if (speed > 0 && prevT !== null) {
            const gap = Math.min((e.tMs - prevT) / speed, MAX_GAP_MS);
            if (gap > 0) await new Promise((r) => setTimeout(r, gap));
          }
          prevT = e.tMs;
          send(e.type === "run.started" ? { ...e, source: "replay" } : e);
        }
      } catch (error) {
        console.error("replay_interrupted", runId, error);
      } finally {
        if (!cancelled) controller.close();
      }
    },
    cancel() {
      cancelled = true;
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "Content-Encoding": "identity",
      "X-Accel-Buffering": "no",
      "X-Sv-Mode": "replay",
    },
  });
}
