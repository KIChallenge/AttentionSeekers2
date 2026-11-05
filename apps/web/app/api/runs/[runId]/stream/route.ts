import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseNdjson, type RunEvent } from "@sv/contracts";
import { loadRunEvents, replayDir } from "@/lib/runs";

// Replay of a stored run as NDJSON RunEvents (ui-plan 4.2).
//   ?from=<seq>   resume after reconnect (default 0)
//   ?speed=<x>    1 = recorded pace, 4 = four times faster, 0 = everything at once
// Gaps between events are scaled by 1/speed and capped at 1.5 s.
// A run that is still going (no run.completed or run.error yet) is followed live: the
// route tails runs/<id>.ndjson, which the engine appends to event by event.

const FINAL = new Set(["run.completed", "run.error"]);
const TAIL_POLL_MS = 400;
const TAIL_IDLE_MS = 10 * 60_000;

/** Complete lines of the run file with seq > after. */
async function readFileEvents(runId: string, after: number): Promise<RunEvent[]> {
  const file = path.join(/*turbopackIgnore: true*/ replayDir(), `${runId}.ndjson`);
  if (!existsSync(file)) return [];
  const text = await readFile(file, "utf8");
  const complete = text.slice(0, text.lastIndexOf("\n") + 1);
  return parseNdjson(complete).filter((e) => e.seq > after);
}

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
  // The database lags behind a live run (batched writes); the file is current.
  const live = !events.some((e) => FINAL.has(e.type));
  if (live) {
    const fromFile = await readFileEvents(runId, -1).catch(() => []);
    if (fromFile.length > events.length) events = fromFile;
  }

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
          send(e.type === "run.started" && !live ? { ...e, source: "replay" } : e);
        }
        if (live) {
          let last = events.at(-1)?.seq ?? -1;
          let idleSince = Date.now();
          let done = false;
          while (!cancelled && !done && Date.now() - idleSince < TAIL_IDLE_MS) {
            await new Promise((r) => setTimeout(r, TAIL_POLL_MS));
            const fresh = await readFileEvents(runId, last).catch(() => []);
            for (const e of fresh) {
              if (e.seq !== last + 1) break;
              if (e.seq >= from) send(e);
              last = e.seq;
              idleSince = Date.now();
              if (FINAL.has(e.type)) done = true;
            }
          }
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
      "X-Sv-Mode": live ? "live" : "replay",
    },
  });
}
