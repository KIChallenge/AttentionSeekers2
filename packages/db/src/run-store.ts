import {
  foldRun,
  RunEvent,
  type RunEvent as RunEventT,
  type RunSnapshot,
  summarizeRun,
} from "@sv/contracts";
import { and, asc, desc, eq, gte } from "drizzle-orm";
import type { Db } from "./client.ts";
import * as t from "./schema.ts";

/** Appends events (idempotent on run_id + seq). Creates the runs row on run.started. */
export async function appendRunEvents(db: Db, events: RunEventT[]): Promise<void> {
  if (events.length === 0) return;
  await db.transaction(async (tx) => {
    for (const e of events) {
      if (e.type === "run.started") {
        const r = e.run;
        await tx
          .insert(t.runs)
          .values({
            id: r.id,
            createdAt: new Date(r.createdAt),
            question: r.mandate.question,
            template: r.room.template,
            variantKind: r.variant.kind,
            baseRunId: "baseRunId" in r.variant ? r.variant.baseRunId : null,
            status: r.status,
            isReference: r.isReference,
            run: r,
          })
          .onConflictDoNothing();
      }
    }
    await tx
      .insert(t.runEvents)
      .values(
        events.map((e) => ({ runId: e.runId, seq: e.seq, tMs: e.tMs, type: e.type, payload: e })),
      )
      .onConflictDoNothing();
  });
}

export async function readRunEvents(db: Db, runId: string, from = 0): Promise<RunEventT[]> {
  const rows = await db
    .select({ payload: t.runEvents.payload })
    .from(t.runEvents)
    .where(and(eq(t.runEvents.runId, runId), gte(t.runEvents.seq, from)))
    .orderBy(asc(t.runEvents.seq));
  return rows.map((r) => RunEvent.parse(r.payload));
}

export async function listRunSummaries(db: Db) {
  return db
    .select({ id: t.runs.id, summary: t.runs.summary, status: t.runs.status })
    .from(t.runs)
    .orderBy(desc(t.runs.isReference), desc(t.runs.createdAt));
}

/** Writes the read models for a finished run. Safe to call twice. */
export async function materializeRun(db: Db, snap: RunSnapshot): Promise<void> {
  const run = snap.run;
  if (!run) throw new Error("snapshot has no run");
  const runId = run.id;
  await db.transaction(async (tx) => {
    for (const table of [
      t.positions,
      t.claims,
      t.proposals,
      t.strategicAssessments,
      t.coalitionCalculi,
      t.roundLessons,
    ]) {
      await tx.delete(table).where(eq(table.runId, runId));
    }
    const positions = Object.values(snap.positions).flatMap((byTopic) =>
      Object.values(byTopic).flat(),
    );
    if (positions.length)
      await tx.insert(t.positions).values(
        positions.map((p) => ({
          runId,
          agentId: p.agentId,
          topicId: p.topicId,
          round: p.round,
          stance: p.stance,
          strength: p.strength,
          triggerUtteranceId: p.trigger?.utteranceId ?? null,
          data: p,
        })),
      );
    const claims = Object.values(snap.claims);
    if (claims.length)
      await tx.insert(t.claims).values(
        claims.map((c) => ({
          runId,
          id: c.id,
          utteranceId: c.utteranceId,
          kind: c.kind,
          state: c.state,
          data: c,
        })),
      );
    const proposals = Object.values(snap.proposals);
    if (proposals.length)
      await tx.insert(t.proposals).values(
        proposals.map((p) => ({
          runId,
          id: p.id,
          originAgent: p.originAgent,
          status: p.status,
          outcomeClass: p.outcomeClass,
          data: p,
        })),
      );
    const assessments = Object.values(snap.assessments).flat();
    if (assessments.length)
      await tx.insert(t.strategicAssessments).values(
        assessments.map((a) => ({
          runId,
          agentId: a.agentId,
          round: a.round,
          vetoStatus: a.vetoStatus,
          lean: a.cooperationVsBlockade.lean,
          blockadeRisk: a.cooperationVsBlockade.blockadeRisk,
          data: a,
        })),
      );
    if (snap.calculi.length)
      await tx
        .insert(t.coalitionCalculi)
        .values(snap.calculi.map((c) => ({ runId, round: c.round, data: c })));
    if (snap.lessons.length)
      await tx
        .insert(t.roundLessons)
        .values(snap.lessons.map((l) => ({ runId, agentId: l.agentId, round: l.round, data: l })));
    for (const tr of Object.values(snap.traces)) {
      await tx
        .insert(t.utteranceTraces)
        .values({ runId, utteranceId: tr.utteranceId, data: tr })
        .onConflictDoUpdate({
          target: [t.utteranceTraces.runId, t.utteranceTraces.utteranceId],
          set: { data: tr },
        });
    }
    await tx
      .update(t.runs)
      .set({
        status: snap.status === "idle" ? "running" : snap.status,
        summary: summarizeRun(snap),
      })
      .where(eq(t.runs.id, runId));
  });
}

/** Loads an NDJSON run into the store and materialises it. */
export async function loadRun(db: Db, events: RunEventT[]): Promise<RunSnapshot> {
  await appendRunEvents(db, events);
  const snap = foldRun(events, { keepTraces: true });
  await materializeRun(db, snap);
  return snap;
}
