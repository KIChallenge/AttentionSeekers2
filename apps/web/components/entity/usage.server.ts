// "Used in" index (W-46, W-54): which runs, utterances, claims and positions cite a
// source. Built from the same RunSnapshots the run pages fold, so it works for DB runs
// and file runs alike. Cached briefly in memory. Server-only.
import { foldRun, type RunSnapshot, type RunSummary } from "@sv/contracts";
import { listRuns, loadRunEvents } from "@/lib/runs";

export interface CitationUse {
  runId: string;
  question: string;
  kind: "claim" | "position" | "retrieval";
  utteranceId: string | null;
  claimId: string | null;
  agentId: string | null;
  topicId: string | null;
  round: number | null;
  segmentId: string;
  text: string | null;
  recencyWeight: number | null;
  used: boolean;
}

interface Index {
  at: number;
  runs: RunSummary[];
  snapshots: Map<string, RunSnapshot>;
  bySource: Map<string, CitationUse[]>;
}

let cache: Index | null = null;
const TTL_MS = 30_000;

function push(m: Map<string, CitationUse[]>, sourceId: string, u: CitationUse) {
  const list = m.get(sourceId) ?? [];
  list.push(u);
  m.set(sourceId, list);
}

function indexSnapshot(m: Map<string, CitationUse[]>, s: RunSnapshot) {
  const run = s.run;
  if (!run) return;
  const base = { runId: run.id, question: run.mandate.question };
  for (const c of Object.values(s.claims)) {
    const u = s.utterances[c.utteranceId];
    for (const ref of c.citations)
      push(m, ref.sourceId, {
        ...base,
        kind: "claim",
        utteranceId: c.utteranceId,
        claimId: c.id,
        agentId: u?.speaker ?? null,
        topicId: null,
        round: u?.round ?? null,
        segmentId: ref.segmentId,
        text: c.atomicText,
        recencyWeight: ref.recencyWeight,
        used: true,
      });
  }
  for (const byTopic of Object.values(s.positions))
    for (const list of Object.values(byTopic))
      for (const p of list)
        for (const ref of p.citations)
          push(m, ref.sourceId, {
            ...base,
            kind: "position",
            utteranceId: p.trigger?.utteranceId ?? null,
            claimId: null,
            agentId: p.agentId,
            topicId: p.topicId,
            round: p.round,
            segmentId: ref.segmentId,
            text: null,
            recencyWeight: ref.recencyWeight,
            used: true,
          });
  for (const tr of Object.values(s.traces)) {
    const u = s.utterances[tr.utteranceId];
    for (const sr of tr.deliberation?.sourcesRead ?? [])
      push(m, sr.ref.sourceId, {
        ...base,
        kind: "retrieval",
        utteranceId: tr.utteranceId,
        claimId: null,
        agentId: u?.speaker ?? null,
        topicId: null,
        round: u?.round ?? null,
        segmentId: sr.ref.segmentId,
        text: sr.use,
        recencyWeight: sr.ref.recencyWeight,
        used: sr.use === "cited",
      });
  }
}

export async function usageIndex(): Promise<Index> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  const runs = await listRuns();
  const snapshots = new Map<string, RunSnapshot>();
  const bySource = new Map<string, CitationUse[]>();
  for (const r of runs) {
    try {
      const events = await loadRunEvents(r.id);
      if (!events) continue;
      const snap = foldRun(events, { keepTraces: true });
      snapshots.set(r.id, snap);
      indexSnapshot(bySource, snap);
    } catch (error) {
      console.warn("usage_index_skip", r.id, error instanceof Error ? error.message : error);
    }
  }
  cache = { at: Date.now(), runs, snapshots, bySource };
  return cache;
}

export async function usesOfSource(sourceId: string): Promise<CitationUse[]> {
  return (await usageIndex()).bySource.get(sourceId) ?? [];
}

export async function snapshotOf(runId: string): Promise<RunSnapshot | null> {
  return (await usageIndex()).snapshots.get(runId) ?? null;
}
