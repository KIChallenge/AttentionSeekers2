// Evidence retrieval (FR-P1..P5, FR-H2, FR-T6). Hybrid: German full-text search and a
// Titan v2 vector top-k (segment_embeddings, HNSW cosine) are fused by reciprocal rank
// together with the agent's own-institution list, then weighted by recency. The as-of
// eligibility predicate (date <= asOf) sits inside every SQL branch, before ranking, and
// is checked again in fuse(). SV_RETRIEVAL=fulltext switches the vector branch off.
import type { CitationRef, RetrievalTrace } from "@sv/contracts";
import { type SQL, sql } from "drizzle-orm";
import { lawBranchQuery, lawRecencyWeight } from "./legal/retrieval.ts";

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
  /** Rank in the vector branch (1 = nearest), null when not retrieved semantically. */
  vectorRank?: number | null;
  /** Cosine similarity to the query embedding, when the vector branch returned it. */
  similarity?: number | null;
  fused: number;
  ownInstitution: boolean;
}

export interface EvidenceSet {
  passages: Passage[];
  trace: RetrievalTrace;
}

export const HALF_LIFE_YEARS = 2;
/** Reciprocal rank fusion constant (Cormack et al.). */
export const RRF_K = 60;

/** Headings and fragments ("Datum", "Zu § 3") sit close to every query vector; skip them. */
export const VECTOR_MIN_CHARS = 50;

export type RetrievalMode = "fulltext" | "hybrid";

/** Hybrid unless SV_RETRIEVAL=fulltext (fallback flag) or no embedding key is configured. */
export function retrievalMode(): RetrievalMode {
  if (process.env.SV_RETRIEVAL === "fulltext") return "fulltext";
  return process.env.BIFROST_SEED_BEDROCK_KEY ? "hybrid" : "fulltext";
}

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

export type Row = {
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
  /** Vector branch only: cosine similarity. */
  similarity?: number | null;
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

export interface Scored {
  r: Row;
  date: string;
  w: number;
  own: boolean;
  bm25Rank: number | null;
  vectorRank: number | null;
  similarity: number | null;
  fused: number;
}

/**
 * Reciprocal rank fusion of the ranked lists (lexical, vector, own institution; k = 60),
 * times the recency weight (FR-P4). Rows dated after asOf are dropped here as a second
 * line of defence behind the SQL predicate; a row present in no list (an injected
 * segment) gets a floor score of 1/(k+30).
 */
export function fuse(input: {
  lexical: Row[];
  vector?: Row[];
  own?: Row[];
  extra?: Row[];
  /** Legal basis (kind "law"), its own ranked list (legal/retrieval.ts). */
  law?: Row[];
  asOf: string;
  role: string;
}): Scored[] {
  const rank = (rows: Row[] = []) => {
    const m = new Map<string, number>();
    for (const [i, r] of rows.entries()) if (!m.has(r.segment_id)) m.set(r.segment_id, i + 1);
    return m;
  };
  const lex = rank(input.lexical);
  const vec = rank(input.vector);
  const ownR = rank(input.own);
  const lawR = rank(input.law);
  const sim = new Map((input.vector ?? []).map((r) => [r.segment_id, r.similarity ?? null]));
  const all = [
    ...(input.extra ?? []),
    ...input.lexical,
    ...(input.vector ?? []),
    ...(input.own ?? []),
    ...(input.law ?? []),
  ];
  const seen = new Set<string>();
  return all
    .filter((r) => isEligible(isoDay(r.date), input.asOf))
    .filter((r) => !seen.has(r.segment_id) && Boolean(seen.add(r.segment_id)))
    .map((r) => {
      const date = isoDay(r.date);
      const w = lawRecencyWeight(r.kind, recencyWeight(date, input.asOf));
      const lr = lex.get(r.segment_id);
      const vr = vec.get(r.segment_id);
      const or = ownR.get(r.segment_id);
      const ar = lawR.get(r.segment_id);
      const rrf =
        (lr ? 1 / (RRF_K + lr) : 0) +
          (vr ? 1 / (RRF_K + vr) : 0) +
          (or ? 1 / (RRF_K + or) : 0) +
          (ar ? 1 / (RRF_K + ar) : 0) || 1 / (RRF_K + 30);
      return {
        r,
        date,
        w,
        own: r.institution_role === input.role,
        bm25Rank: lr ?? null,
        vectorRank: vr ?? null,
        similarity: vr ? Number(sim.get(r.segment_id) ?? 0) : null,
        fused: rrf * w,
      };
    })
    .sort((a, b) => b.fused - a.fused);
}

/**
 * Segments injected by a fork edit (includeSegmentIds), still behind the as-of predicate.
 * The id list is bound as ONE text[] parameter: interpolating a JS array directly makes
 * drizzle expand it into a row literal, which Postgres rejects inside any().
 */
export function includeSegmentsQuery(ids: string[], asOf: string): SQL {
  return sql`
    select s.id as segment_id, s.source_id, s.text, src.date::text as date, src.institution_code,
           src.institution_role, src.kind, src.title, src.outlet, src.corpus_revision, 0.5 as rank
    from segments s join sources src on src.id = s.source_id
    where s.id = any(${sql.param(ids)}::text[]) and src.date <= ${asOf}::date
      and src.person_filtered = true`;
}

/**
 * Retrieves passages for one agent. Own-institution passages enter as their own ranked
 * list, every score is multiplied by the recency weight. Returns used passages (top
 * `use`) and the full candidate trace, including discarded ones with a reason.
 */
export async function retrieve(opts: {
  query: string;
  role: string;
  asOf: string;
  limit?: number;
  use?: number;
  excludeSegmentIds?: string[];
  includeSegmentIds?: string[];
  mode?: RetrievalMode;
}): Promise<EvidenceSet> {
  const { query, role, asOf, limit = 10, use = 6 } = opts;
  const mode = opts.mode ?? retrievalMode();
  const terms = queryTerms(query);
  const trace: RetrievalTrace = { query: terms.join(" "), asOf, corpusRevision, candidates: [] };
  const d = await db();
  if (!d) return { passages: [], trace };
  let lexRows: Row[] = [];
  let ownRows: Row[] = [];
  let vecRows: Row[] = [];
  let extraRows: Row[] = [];
  let lawRows: Row[] = [];
  try {
    const store = await import("@sv/db");
    const tsq = terms.join(" OR ");
    // Bounded queries so the plan stays cheap on a large corpus: lexical top hits via the
    // GIN index, the most recent passages of the agent's own institution, and (hybrid)
    // the nearest neighbours via HNSW. Every branch filters date <= asOf in SQL.
    const lexical = d.execute(sql`
      with q as (select websearch_to_tsquery('german', ${tsq}) as q)
      select s.id as segment_id, s.source_id, s.text, src.date::text as date, src.institution_code,
             src.institution_role, src.kind, src.title, src.outlet, src.corpus_revision,
             ts_rank_cd(s.tsv, q.q) as rank
      from segments s join sources src on src.id = s.source_id, q
      where s.tsv @@ q.q and src.date <= ${asOf}::date and src.person_filtered = true and src.corpus_revision <> ${excludedRevision()}
      order by ts_rank_cd(s.tsv, q.q) desc, src.date desc
      limit 40`);
    const own = d.execute(sql`
      with q as (select websearch_to_tsquery('german', ${tsq}) as q)
      select s.id as segment_id, s.source_id, s.text, src.date::text as date, src.institution_code,
             src.institution_role, src.kind, src.title, src.outlet, src.corpus_revision,
             ts_rank_cd(s.tsv, q.q) as rank
      from segments s join sources src on src.id = s.source_id, q
      where src.institution_role = ${role} and src.date <= ${asOf}::date
        and src.person_filtered = true and src.corpus_revision <> ${excludedRevision()}
      order by (s.tsv @@ q.q) desc, src.date desc
      limit 12`);
    const vector =
      mode === "hybrid"
        ? store.embedQuery(query).then(async (qv) => {
            if (!qv) return [] as Row[];
            const lit = store.toVectorLiteral(qv);
            // Iterative HNSW scan keeps the k nearest that pass the as-of filter instead of
            // filtering a fixed candidate set afterwards (pgvector >= 0.8).
            return d.transaction(async (tx) => {
              await tx.execute(sql`set local hnsw.ef_search = 100`);
              await tx.execute(sql`set local hnsw.iterative_scan = relaxed_order`);
              const res = await tx.execute(sql`
                select s.id as segment_id, s.source_id, s.text, src.date::text as date,
                       src.institution_code, src.institution_role, src.kind, src.title, src.outlet,
                       src.corpus_revision, 0 as rank,
                       1 - (e.embedding <=> ${lit}::vector) as similarity
                from segment_embeddings e
                join segments s on s.id = e.segment_id
                join sources src on src.id = s.source_id
                where e.model = ${store.EMBED_MODEL} and src.date <= ${asOf}::date
                  and length(s.text) >= ${VECTOR_MIN_CHARS}
                  and src.person_filtered = true and src.corpus_revision <> ${excludedRevision()}
                order by e.embedding <=> ${lit}::vector
                limit 40`);
              return (res as unknown as { rows: Row[] }).rows;
            });
          })
        : Promise.resolve([] as Row[]);
    const law = d.execute(lawBranchQuery(tsq, asOf, excludedRevision()));
    const [l, o, v, a] = await Promise.all([
      lexical,
      own,
      vector.catch((error) => {
        // The vector branch is optional: full-text results still stand.
        console.warn(
          "vector_retrieval_failed",
          error instanceof Error ? error.message.slice(0, 200) : error,
        );
        return [] as Row[];
      }),
      law,
    ]);
    lexRows = (l as unknown as { rows: Row[] }).rows;
    ownRows = (o as unknown as { rows: Row[] }).rows;
    lawRows = (a as unknown as { rows: Row[] }).rows;
    vecRows = v.map((r) => ({ ...r, similarity: Number(r.similarity) }));
    if (opts.includeSegmentIds?.length) {
      // A failed lookup of injected segments must not switch retrieval off for the process.
      try {
        const extra = await d.execute(includeSegmentsQuery(opts.includeSegmentIds, asOf));
        extraRows = (extra as unknown as { rows: Row[] }).rows;
      } catch (error) {
        console.warn(
          "include_segments_failed",
          error instanceof Error ? error.message.slice(0, 200) : error,
        );
      }
    }
  } catch (error) {
    console.warn("retrieval_failed", error instanceof Error ? error.message.slice(0, 200) : error);
    dbBroken = true;
    return { passages: [], trace };
  }
  const first = extraRows[0] ?? lexRows[0] ?? vecRows[0] ?? ownRows[0];
  if (first) corpusRevision = first.corpus_revision;
  trace.corpusRevision = corpusRevision;
  const excluded = new Set(opts.excludeSegmentIds ?? []);
  const scored = fuse({
    lexical: lexRows,
    vector: vecRows,
    own: ownRows,
    extra: extraRows,
    law: lawRows,
    asOf,
    role,
  }).slice(0, limit * 2);
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
      vectorRank: s.vectorRank,
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
        vectorRank: s.vectorRank,
        similarity: s.similarity,
        fused: s.fused,
        ownInstitution: s.own,
      });
  }
  return { passages, trace };
}

export function getCorpusRevision() {
  return corpusRevision;
}
