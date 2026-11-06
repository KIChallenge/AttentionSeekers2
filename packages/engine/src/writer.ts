// RunEvent writer: assigns seq and tMs, validates every event against the contract,
// masks person names (CON-1/CON-2, ui-plan 4.2 rule 5), appends to runs/<id>.ndjson,
// batches inserts into the database (optional) and notifies listeners (live stream).
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { foldRun, PROTOCOL_VERSION, RunEvent } from "@sv/contracts";
import { maskDeep } from "./guard.ts";

type Body = Record<string, unknown> & { type: RunEvent["type"] };

export class RunWriter {
  readonly runId: string;
  readonly file: string;
  readonly events: RunEvent[] = [];
  private seq = 0;
  private t0 = performance.now();
  private pending: RunEvent[] = [];
  private flushing: Promise<void> = Promise.resolve();
  private dbOk: boolean;
  private listeners: Array<(e: RunEvent) => void> = [];
  maskedStrings = 0;

  constructor(runId: string, dir: string, opts: { db?: boolean; tOffsetMs?: number } = {}) {
    this.runId = runId;
    mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, `${runId}.ndjson`);
    writeFileSync(this.file, "");
    this.dbOk = opts.db !== false && Boolean(process.env.DATABASE_URL);
    if (opts.tOffsetMs) this.t0 -= opts.tOffsetMs;
  }

  onEvent(fn: (e: RunEvent) => void) {
    this.listeners.push(fn);
  }

  get elapsedMs() {
    return Math.round(performance.now() - this.t0);
  }

  /** Re-emits an existing event (fork prefix) under this run id with a fresh seq. */
  copy(e: RunEvent) {
    const { v: _v, runId: _r, seq: _s, ...rest } = e as RunEvent & Record<string, unknown>;
    const out = this.emitRaw({ ...(rest as Body) }, e.tMs);
    // Continue the clock after the copied prefix.
    this.t0 = Math.min(this.t0, performance.now() - e.tMs);
    return out;
  }

  emit(body: Body): RunEvent {
    return this.emitRaw(body, this.elapsedMs);
  }

  private emitRaw(body: Body, tMs: number): RunEvent {
    const { value, masked } = maskDeep(body);
    if (masked > 0) {
      this.maskedStrings += masked;
      console.warn("con_guard_masked", JSON.stringify({ type: body.type, strings: masked }));
    }
    const last = this.events.at(-1)?.tMs ?? 0;
    const event = RunEvent.parse({
      v: PROTOCOL_VERSION,
      runId: this.runId,
      seq: this.seq,
      tMs: Math.max(last, tMs),
      ...value,
    });
    this.seq++;
    this.events.push(event);
    appendFileSync(this.file, `${JSON.stringify(event)}\n`);
    for (const l of this.listeners) l(event);
    if (this.dbOk) {
      this.pending.push(event);
      if (this.pending.length >= 25 || event.type === "run.started") this.flush();
    }
    return event;
  }

  private flush() {
    const batch = this.pending;
    this.pending = [];
    if (batch.length === 0 || !this.dbOk) return this.flushing;
    const first = batch[0]?.type === "run.started";
    this.flushing = this.flushing.then(async () => {
      try {
        const store = await import("@sv/db");
        if (first) await resetRun(this.runId);
        await store.appendRunEvents(store.getDb(), batch);
      } catch (error) {
        this.dbOk = false;
        console.warn(
          "run_store_unavailable",
          error instanceof Error ? error.message.slice(0, 200) : String(error),
        );
      }
    });
    return this.flushing;
  }

  /** Flushes remaining events and materialises read models (only when the DB is up). */
  async close(): Promise<{ db: boolean }> {
    await this.flush();
    await this.flushing;
    if (this.dbOk) {
      try {
        const store = await import("@sv/db");
        await store.materializeRun(store.getDb(), foldRun(this.events, { keepTraces: true }));
        await store.closeDb();
      } catch (error) {
        this.dbOk = false;
        console.warn(
          "run_materialize_failed",
          error instanceof Error ? error.message.slice(0, 200) : String(error),
        );
      }
    }
    return { db: this.dbOk };
  }
}

/** A re-run under the same id replaces the stored run instead of mixing event streams. */
async function resetRun(runId: string) {
  const store = await import("@sv/db");
  const { eq } = await import("drizzle-orm");
  const db = store.getDb();
  const t = store.schema;
  for (const table of [
    t.positions,
    t.claims,
    t.proposals,
    t.strategicAssessments,
    t.coalitionCalculi,
    t.roundLessons,
    t.utteranceTraces,
  ]) {
    await db.delete(table).where(eq(table.runId, runId));
  }
  await db.delete(t.runs).where(eq(t.runs.id, runId));
}
