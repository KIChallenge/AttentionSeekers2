// Evidence retrieval (FR-P1..P5, FR-H2, FR-T6): German full-text search over segments,
// eligibility date <= asOf, recency weight per citation. Vector branch is not wired
// yet (no embeddings imported), so vectorRank stays null in the trace.
import type { CitationRef, RetrievalTrace } from "@sv/contracts";

export interface Passage {
  /** Short handle shown to the model, e.g. "E3". */
  handle: string;
  segmentId: string;
  sourceId: string;
  text: string;
  date: string;
  institutionCode: string;
  institutionRole: string;
  kind: string;
  title: string | null;
  outlet: string | null;
  recencyWeight: number;
  bm25Rank: number | null;
  fused: number;
  ownInstitution: boolean;
}

export interface EvidenceSet {
  passages: Passage[];
  trace: RetrievalTrace;
}

export const HALF_LIFE_YEARS = 2;

/** The UI fixture corpus is invented; live runs skip it unless SV_INCLUDE_FIXTURE=1. */
export const FIXTURE_REVISION = "corpus-2026-10-31";
function excludedRevision(): string {
  return process.env.SV_INCLUDE_FIXTURE === "1" ? "__none__" : FIXTURE_REVISION;
}

/**
 * FR-H2 eligibility: a source is visible to an agent iff its date is on or before the
 * run's as-of date. The SQL below applies the same predicate (src.date <= asOf).
 */
export function isEligible(sourceDate: string, asOf: string): boolean {
  return sourceDate.slice(0, 10) <= asOf.slice(0, 10);
}

/** FR-P4: exponential decay with a two-year half-life, floored at 0.05. */
export function recencyWeight(date: string, asOf: string): number {
  const age = (Date.parse(asOf) - Date.parse(date)) / (365.25 * 86_400_000);
  if (!Number.isFinite(age)) return 0.5;
  const w = 0.5 ** (Math.max(0, age) / HALF_LIFE_YEARS);
  return Math.round(Math.max(0.05, Math.min(1, w)) * 100) / 100;
}

export function citationOf(p: Passage): CitationRef {
  return {
    sourceId: p.sourceId,
    segmentId: p.segmentId,
    start: null,
    end: null,
    recencyWeight: p.recencyWeight,
  };
}

let dbBroken = false;
let corpusRevision = "unknown";

async function db() {
  if (dbBroken || !process.env.DATABASE_URL) return null;
  try {
    const store = await import("@sv/db");
    return store.getDb();
  } catch {
    dbBroken = true;
    return null;
  }
}

type Row = {
  segment_id: string;
  source_id: string;
  text: string;
  date: string | Date;
  institution_code: string;
  institution_role: string;
  kind: string;
  title: string | null;
  outlet: string | null;
  corpus_revision: string;
  rank: number;
};

function isoDay(d: string | Date): string {
  return typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);
}

const STOPWORDS = new Set(
  "der die das und oder ein eine einer eines wie können kann innerhalb von um ohne mehr als zu auf den dem des im in mit für bei nicht werden wird ist sind auch nur über".split(
    " ",
  ),
);

export function queryTerms(text: string): string[] {
  return [
    ...new Set(
      text
        .replace(/[^\p{L}\p{N}\s-]/gu, " ")
        .split(/\s+/)
        .map((w) => w.trim())
        .filter((w) => w.length > 3 && !STOPWORDS.has(w.toLowerCase())),
    ),
  ].slice(0, 24);
}

/**
 * Retrieves passages for one agent. Own-institution passages are boosted (x1.5) and
 * every score is multiplied by the recency weight. Returns used passages (top `use`)
 * and the full candidate trace, including discarded ones with a reason.
 */
export async function retrieve(opts: {
  query: string;
  role: string;
  asOf: string;
  limit?: number;
  use?: number;
  excludeSegmentIds?: string[];
  includeSegmentIds?: string[];
}): Promise<EvidenceSet> {
  const { query, role, asOf, limit = 10, use = 6 } = opts;
  const terms = queryTerms(query);
  const trace: RetrievalTrace = { query: terms.join(" "), asOf, corpusRevision, candidates: [] };
  const d = await db();
  if (!d) return { passages: [], trace };
  let rows: Row[] = [];
  const lexRank = new Map<string, number>();
  const ownRank = new Map<string, number>();
  try {
    const { sql } = await import("drizzle-orm");
    const tsq = terms.join(" OR ");
    // Two bounded queries so the plan stays cheap on a large corpus: lexical top hits
    // via the GIN index, plus the most recent passages of the agent's own institution.
    const lexical = await d.execute(sql`
      with q as (select websearch_to_tsquery('german', ${tsq}) as q)
      select s.id as segment_id, s.source_id, s.text, src.date::text as date, src.institution_code,
             src.institution_role, src.kind, src.title, src.outlet, src.corpus_revision,
             ts_rank_cd(s.tsv, q.q) as rank
      from segments s join sources src on src.id = s.source_id, q
      where s.tsv @@ q.q and src.date <= ${asOf}::date and src.person_filtered = true and src.corpus_revision <> ${excludedRevision()}
      order by ts_rank_cd(s.tsv, q.q) desc, src.date desc
      limit 40`);
    const own = await d.execute(sql`
      with q as (select websearch_to_tsquery('german', ${tsq}) as q)
      select s.id as segment_id, s.source_id, s.text, src.date::text as date, src.institution_code,
             src.institution_role, src.kind, src.title, src.outlet, src.corpus_revision,
             ts_rank_cd(s.tsv, q.q) as rank
      from segments s join sources src on src.id = s.source_id, q
      where src.institution_role = ${role} and src.date <= ${asOf}::date
        and src.person_filtered = true and src.corpus_revision <> ${excludedRevision()}
      order by (s.tsv @@ q.q) desc, src.date desc
      limit 12`);
    const lexRows = (lexical as unknown as { rows: Row[] }).rows;
    const ownRows = (own as unknown as { rows: Row[] }).rows;
    for (const [i, r] of lexRows.entries()) lexRank.set(r.segment_id, i + 1);
    for (const [i, r] of ownRows.entries()) ownRank.set(r.segment_id, i + 1);
    rows = [...lexRows, ...ownRows];
    if (opts.includeSegmentIds?.length) {
      const extra = await d.execute(sql`
        select s.id as segment_id, s.source_id, s.text, src.date::text as date, src.institution_code,
               src.institution_role, src.kind, src.title, src.outlet, src.corpus_revision, 0.5 as rank
        from segments s join sources src on src.id = s.source_id
        where s.id = any(${opts.includeSegmentIds}) and src.date <= ${asOf}::date`);
      rows = [...(extra as unknown as { rows: Row[] }).rows, ...rows];
    }
  } catch (error) {
    console.warn("retrieval_failed", error instanceof Error ? error.message.slice(0, 200) : error);
    dbBroken = true;
    return { passages: [], trace };
  }
  if (rows[0]) corpusRevision = rows[0].corpus_revision;
  trace.corpusRevision = corpusRevision;
  const excluded = new Set(opts.excludeSegmentIds ?? []);
  // Reciprocal rank fusion of the lexical list and the own-institution list (k = 60),
  // times the recency weight (FR-P4).
  const K = 60;
  const scored = rows
    .filter((r) => isEligible(isoDay(r.date), asOf))
    .filter((r, i, all) => all.findIndex((x) => x.segment_id === r.segment_id) === i)
    .map((r) => {
      const date = isoDay(r.date);
      const w = recencyWeight(date, asOf);
      const own = r.institution_role === role;
      const lr = lexRank.get(r.segment_id);
      const or = ownRank.get(r.segment_id);
      const rrf = (lr ? 1 / (K + lr) : 0) + (or ? 1 / (K + or) : 0) || 1 / (K + 30);
      return { r, date, w, own, bm25Rank: lr ?? null, fused: rrf * w };
    })
    .sort((a, b) => b.fused - a.fused)
    .slice(0, limit * 2);
  const passages: Passage[] = [];
  for (const s of scored) {
    let discardReason: string | null = null;
    if (excluded.has(s.r.segment_id)) discardReason = "removed_by_fork_edit";
    else if (passages.length >= use) discardReason = "below_cutoff";
    // Diversity: at most two passages per source document.
    else if (passages.filter((p) => p.sourceId === s.r.source_id).length >= 2)
      discardReason = "same_source_cap";
    const used = discardReason === null;
    trace.candidates.push({
      segmentId: s.r.segment_id,
      bm25Rank: s.bm25Rank,
      vectorRank: null,
      fused: Math.round(s.fused * 10000) / 10000,
      recencyWeight: s.w,
      used,
      discardReason,
    });
    if (used)
      passages.push({
        handle: "",
        segmentId: s.r.segment_id,
        sourceId: s.r.source_id,
        text: s.r.text.slice(0, 700),
        date: s.date,
        institutionCode: s.r.institution_code,
        institutionRole: s.r.institution_role,
        kind: s.r.kind,
        title: s.r.title,
        outlet: s.r.outlet,
        recencyWeight: s.w,
        bm25Rank: s.bm25Rank,
        fused: s.fused,
        ownInstitution: s.own,
      });
  }
  return { passages, trace };
}

export function getCorpusRevision() {
  return corpusRevision;
}
