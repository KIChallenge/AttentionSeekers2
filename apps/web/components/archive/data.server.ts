// Evidence archive data (W-45, W-46). Server-only. Postgres first (German FTS on
// segments.tsv), runs/fixture-sources.json as the fallback so the archive works with the
// database down. Only name-masked text is ever served: rows with personFiltered !== true
// are dropped here as well as at import (CON-1/CON-2 fail-closed).
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RedLine, Segment, Source, SourceKind, StanceProfile } from "@sv/contracts";
import { FIXTURE_REVISION } from "@sv/engine/retrieval";
import { replayDir } from "@/lib/runs";

export const MASK_TOKEN = "[...]";
const PAGE_SIZE = 30;
/** Press items: metadata and short snippets only until licensing is settled. */
export const PRESS_SNIPPET_CHARS = 280;

/** Volltext (German FTS), Semantisch (Titan v2 vectors), Kombiniert (RRF of both). */
export type SearchMode = "fulltext" | "semantic" | "hybrid";
export const SEARCH_MODES: SearchMode[] = ["hybrid", "fulltext", "semantic"];

export interface ArchiveQuery {
  q: string;
  mode: SearchMode;
  kinds: string[];
  institutions: string[];
  years: string[];
  draftLaws: string[];
  licences: string[];
  /** FR-H2 cutoff; documents after it are flagged, not hidden, unless hideAfter. */
  asOf: string | null;
  hideAfter: boolean;
  page: number;
}

export interface ArchiveHit {
  source: Source;
  /** Highlighted snippet with \u0001 / \u0002 around matches. */
  snippet: string;
  segmentId: string | null;
  rank: number;
  afterAsOf: boolean;
  draftLaw: string | null;
  licenceLabel: string;
  /** Why the hit matched: full-text keyword and/or cosine similarity of the best passage. */
  match: Match;
}

export interface Match {
  keyword: boolean;
  similarity: number | null;
}

export interface Facet {
  value: string;
  label: string;
  count: number;
}

export interface ArchiveResult {
  hits: ArchiveHit[];
  total: number;
  page: number;
  pageSize: number;
  facets: {
    kind: Facet[];
    institution: Facet[];
    year: Facet[];
    draftLaw: Facet[];
    licence: Facet[];
  };
  dateRange: { min: string | null; max: string | null };
  backend: "postgres" | "file";
  /** Mode actually used; falls back to fulltext when no query embedding is available. */
  mode: SearchMode;
  semanticUnavailable: boolean;
}

/** The eligibility rule the engine applies to retrieval (FR-H2): published on or before asOf. */
export function eligibleAt(sourceDate: string, asOf: string | null): boolean {
  return !asOf || sourceDate <= asOf;
}

/**
 * Draft law key in the forecasting registry's case_id form ("XXVII-ME-326"), derived
 * from the Stellungnahme citation ("52/SN-326/ME") and the GP prefix of the source id
 * ("XXVII/SNME/253667"). Null when the source is not tied to a Ministerialentwurf.
 */
export function draftLawOf(s: Source): string | null {
  const ref = s.legalRef ?? "";
  const m = ref.match(/SN-(\d+)\/ME/) ?? ref.match(/^(\d+)\/ME/);
  if (!m) return null;
  const gp = s.id.match(/^([IVXL]+)\//)?.[1];
  return gp ? `${gp}-ME-${m[1]}` : `ME-${m[1]}`;
}

/** "XXVII-ME-326" -> "326/ME XXVII. GP". */
export function draftLawLabel(key: string): string {
  const m = key.match(/^(?:([IVXL]+)-)?ME-(\d+)$/);
  if (!m) return key;
  return m[1] ? `${m[2]}/ME ${m[1]}. GP` : `${m[2]}/ME`;
}

const KIND_LICENCE: Record<SourceKind, string> = {
  stellungnahme: "stellungnahme",
  press: "press",
  sozdok: "statute",
  ris: "statute",
  parliament: "parliament",
  statistic: "open_data",
  audit: "public_report",
};

/** Licence bucket for facets: the explicit licence if present, else derived from the kind. */
export function licenceOf(s: Source): string {
  if (s.licence) return s.licence;
  return KIND_LICENCE[s.kind] ?? "unknown";
}

/**
 * The UI fixture corpus (FIXTURE_REVISION) is invented. Archive lists, facets, counts and
 * the palette leave it out unless SV_INCLUDE_FIXTURE=1, as live engine runs do; a fixture
 * source opened directly (the fixture run cites them) gets a banner instead.
 */
export function isFixtureSource(s: Source): boolean {
  return s.corpusRevision === FIXTURE_REVISION;
}

/** SQL predicate on sources.corpus_revision (`alias` like "s."); constant strings only. */
function live(alias = ""): string {
  return process.env.SV_INCLUDE_FIXTURE === "1"
    ? "true"
    : `${alias}corpus_revision <> '${FIXTURE_REVISION}'`;
}

export function isPress(s: Source): boolean {
  return s.kind === "press";
}

// ---------------- database access ----------------

type Client = {
  query: <R = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<{ rows: R[] }>;
};
type Pool = Client & { connect: () => Promise<Client & { release: () => void }> };

/**
 * Runs vector queries on one connection with a wider HNSW candidate list and iterative
 * scans (pgvector >= 0.8), so filters and LIMITs above the default ef_search of 40 still
 * return the true nearest rows.
 */
async function withVectorSession<T>(db: Pool, ef: number, fn: (c: Client) => Promise<T>) {
  const c = await db.connect();
  try {
    await c.query("begin");
    await c.query(`set local hnsw.ef_search = ${Math.round(ef)}`);
    await c.query("set local hnsw.iterative_scan = relaxed_order");
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (error) {
    await c.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    c.release();
  }
}

async function queryVector(q: string): Promise<{ literal: string; model: string } | null> {
  try {
    const store = await import("@sv/db");
    const v = await store.embedQuery(q);
    return v ? { literal: store.toVectorLiteral(v), model: store.EMBED_MODEL } : null;
  } catch {
    return null;
  }
}

/** Below this cosine similarity a semantic neighbour is noise, not a hit. */
const SEMANTIC_MIN_SIMILARITY = 0.15;
const SEMANTIC_SOURCES = 200;
/** Headings and fragments ("Datum", "Zu § 3") sit close to every short query; skip them. */
const SEMANTIC_MIN_CHARS = 50;

async function pool(): Promise<Pool | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const store = await import("@sv/db");
    const db = store.getDb() as unknown as { $client: Pool };
    await db.$client.query("select 1");
    return db.$client;
  } catch (error) {
    console.warn("archive_db_unavailable", error instanceof Error ? error.message : error);
    return null;
  }
}

function asSource(data: unknown): Source | null {
  const s = data as Source;
  if (s?.personFiltered !== true) return null;
  return s;
}

// ---------------- file fallback ----------------

let fileCache: { sources: Source[]; segments: Segment[] } | null = null;
async function fileStore() {
  if (fileCache) return fileCache;
  const file = path.join(/*turbopackIgnore: true*/ replayDir(), "fixture-sources.json");
  if (!existsSync(file)) return { sources: [], segments: [] };
  const j = JSON.parse(await readFile(file, "utf8")) as { sources: Source[]; segments: Segment[] };
  fileCache = {
    sources: j.sources.filter((s) => s.personFiltered === true),
    segments: j.segments,
  };
  return fileCache;
}

// ---------------- search ----------------

function facetCount<T>(rows: T[], key: (r: T) => string | null, label = (v: string) => v): Facet[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([value, count]) => ({ value, count, label: label(value) }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

function highlight(text: string, q: string): string {
  const terms = q
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((t) => t.length > 2);
  if (!terms.length) return text;
  const re = new RegExp(
    `(${terms.map((t) => t.slice(0, Math.max(4, t.length - 2))).join("|")})`,
    "giu",
  );
  return text.replace(re, "\u0001$1\u0002");
}

function clipPress(s: Source, snippet: string): string {
  if (!isPress(s)) return snippet;
  return snippet.length > PRESS_SNIPPET_CHARS
    ? `${snippet.slice(0, PRESS_SNIPPET_CHARS).trimEnd()} …`
    : snippet;
}

interface Candidate {
  source: Source;
  snippet: string;
  segmentId: string | null;
  rank: number;
  match?: Match;
}

function finish(
  cands: Candidate[],
  query: ArchiveQuery,
  backend: ArchiveResult["backend"],
  used: { mode: SearchMode; semanticUnavailable: boolean } = {
    mode: "fulltext",
    semanticUnavailable: false,
  },
) {
  // Facets are computed over the query result before facet filters (simple OR-within, AND-across).
  const enrich = cands.map((c) => ({
    ...c,
    draftLaw: draftLawOf(c.source),
    licenceLabel: licenceOf(c.source),
    year: c.source.date.slice(0, 4),
    afterAsOf: !eligibleAt(c.source.date, query.asOf),
  }));
  const pass = (c: (typeof enrich)[number], skip: string) =>
    (skip === "kind" || !query.kinds.length || query.kinds.includes(c.source.kind)) &&
    (skip === "institution" ||
      !query.institutions.length ||
      query.institutions.includes(c.source.institution.code)) &&
    (skip === "year" || !query.years.length || query.years.includes(c.year)) &&
    (skip === "draftLaw" ||
      !query.draftLaws.length ||
      (c.draftLaw !== null && query.draftLaws.includes(c.draftLaw))) &&
    (skip === "licence" || !query.licences.length || query.licences.includes(c.licenceLabel)) &&
    (!query.hideAfter || !c.afterAsOf);
  const names = new Map(
    enrich.map((c) => [c.source.institution.code, c.source.institution.nameDe]),
  );
  const facets = {
    kind: facetCount(
      enrich.filter((c) => pass(c, "kind")),
      (c) => c.source.kind,
    ),
    institution: facetCount(
      enrich.filter((c) => pass(c, "institution")),
      (c) => c.source.institution.code,
      (v) => names.get(v) ?? v,
    ),
    year: facetCount(
      enrich.filter((c) => pass(c, "year")),
      (c) => c.year,
    ).sort((a, b) => b.value.localeCompare(a.value)),
    draftLaw: facetCount(
      enrich.filter((c) => pass(c, "draftLaw")),
      (c) => c.draftLaw,
      draftLawLabel,
    ),
    licence: facetCount(
      enrich.filter((c) => pass(c, "licence")),
      (c) => c.licenceLabel,
    ),
  };
  const filtered = enrich.filter((c) => pass(c, ""));
  const dates = enrich.map((c) => c.source.date).sort();
  const page = Math.max(1, query.page);
  const hits: ArchiveHit[] = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((c) => ({
    source: c.source,
    snippet: clipPress(c.source, c.snippet),
    segmentId: c.segmentId,
    rank: c.rank,
    afterAsOf: c.afterAsOf,
    draftLaw: c.draftLaw,
    licenceLabel: c.licenceLabel,
    match: c.match ?? { keyword: query.q.trim() !== "", similarity: null },
  }));
  return {
    ...used,
    hits,
    total: filtered.length,
    page,
    pageSize: PAGE_SIZE,
    facets,
    dateRange: { min: dates[0] ?? null, max: dates.at(-1) ?? null },
    backend,
  } satisfies ArchiveResult;
}

const CANDIDATE_LIMIT = 2000;

/** Full-text branch: best segment per source by ts_rank, highlighted snippet, plus
 * title / institution / legal-ref substring matches. */
async function lexicalCandidates(db: Pool, q: string): Promise<Candidate[]> {
  // Best segment per source by ts_rank, plus a highlighted snippet.
  const { rows } = await db.query<{
    data: unknown;
    segment_id: string;
    rank: number;
    snippet: string;
  }>(
    `with q as (select websearch_to_tsquery('german', $1) as tsq),
     hits as (
       select distinct on (g.source_id) g.source_id, g.id as segment_id, g.text,
              ts_rank(g.tsv, q.tsq) as rank
       from segments g, q
       where g.tsv @@ q.tsq
       order by g.source_id, ts_rank(g.tsv, q.tsq) desc
     )
     select s.data, h.segment_id, h.rank,
            ts_headline('german', h.text, q.tsq,
              'StartSel=' || chr(1) || ',StopSel=' || chr(2) || ',MaxWords=45,MinWords=18,MaxFragments=2,FragmentDelimiter= … ') as snippet
     from hits h join sources s on s.id = h.source_id, q
     where s.person_filtered = true and ${live("s.")}
     order by h.rank desc, s.date desc
     limit ${CANDIDATE_LIMIT}`,
    [q],
  );
  const cands: Candidate[] = rows.flatMap((r) => {
    const source = asSource(r.data);
    return source
      ? [{ source, snippet: r.snippet, segmentId: r.segment_id, rank: Number(r.rank) }]
      : [];
  });
  // Title and institution matches that FTS on segment text misses.
  const seen = new Set(cands.map((c) => c.source.id));
  const { rows: extra } = await db.query<{
    data: unknown;
    segment_id: string | null;
    text: string | null;
  }>(
    `select s.data, g.id as segment_id, g.text from sources s
     left join lateral (select id, text from segments where source_id = s.id order by ordinal limit 1) g on true
     where s.person_filtered = true and ${live("s.")}
       and (s.title ilike $1 or s.institution_code ilike $1 or s.legal_ref ilike $1
            or s.data->'institution'->>'nameDe' ilike $1)
     order by s.date desc limit 200`,
    [`%${q}%`],
  );
  for (const r of extra) {
    const source = asSource(r.data);
    if (!source || seen.has(source.id)) continue;
    cands.push({ source, snippet: r.text ?? "", segmentId: r.segment_id, rank: 0 });
  }
  return cands;
}

/**
 * Semantic branch: nearest segments to the query embedding (HNSW cosine), best segment
 * per source. With "hide later documents" on, the as-of predicate runs inside the vector
 * scan so the top-k is filled with eligible sources. Null when no query vector is available.
 */
async function semanticCandidates(
  db: Pool,
  q: string,
  query: ArchiveQuery,
): Promise<Candidate[] | null> {
  const qv = await queryVector(q);
  if (!qv) return null;
  const cutoff = query.hideAfter && query.asOf ? query.asOf : null;
  try {
    const rows = await withVectorSession(db, 400, async (c) => {
      const res = await c.query<{
        data: unknown;
        segment_id: string;
        text: string;
        similarity: number;
      }>(
        `with nn as (
           select e.segment_id, e.embedding <=> $1::vector as dist
           from segment_embeddings e
           join segments g0 on g0.id = e.segment_id
           join sources s0 on s0.id = g0.source_id
           where e.model = $2 and length(g0.text) >= ${SEMANTIC_MIN_CHARS}
             and ($3::date is null or s0.date <= $3::date)
           order by e.embedding <=> $1::vector
           limit 400
         ), best as (
           select distinct on (g.source_id) g.source_id, g.id as segment_id, g.text, nn.dist
           from nn join segments g on g.id = nn.segment_id
           order by g.source_id, nn.dist
         )
         select s.data, b.segment_id, b.text, 1 - b.dist as similarity
         from best b join sources s on s.id = b.source_id
         where s.person_filtered = true and ${live("s.")} and 1 - b.dist >= $4
         order by b.dist
         limit ${SEMANTIC_SOURCES}`,
        [qv.literal, qv.model, cutoff, SEMANTIC_MIN_SIMILARITY],
      );
      return res.rows;
    });
    return rows.flatMap((r) => {
      const source = asSource(r.data);
      const similarity = Math.round(Number(r.similarity) * 1000) / 1000;
      return source
        ? [
            {
              source,
              snippet: r.text,
              segmentId: r.segment_id,
              rank: similarity,
              match: { keyword: false, similarity },
            },
          ]
        : [];
    });
  } catch (error) {
    console.warn("archive_semantic_failed", error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Reciprocal rank fusion (k = 60) of the full-text and semantic source rankings. A source
 * found by both keeps the highlighted full-text snippet and carries both match reasons.
 */
export function fuseArchive(lexical: Candidate[], semantic: Candidate[], k = 60): Candidate[] {
  const out = new Map<string, Candidate & { score: number }>();
  lexical.forEach((c, i) => {
    out.set(c.source.id, {
      ...c,
      match: { keyword: true, similarity: null },
      score: 1 / (k + i + 1),
    });
  });
  semantic.forEach((c, i) => {
    const s = 1 / (k + i + 1);
    const prev = out.get(c.source.id);
    if (prev) {
      prev.score += s;
      prev.match = { keyword: true, similarity: c.match?.similarity ?? null };
    } else out.set(c.source.id, { ...c, score: s });
  });
  return [...out.values()]
    .sort((a, b) => b.score - a.score)
    .map(({ score, ...c }) => ({ ...c, rank: Math.round(score * 1e5) / 1e5 }));
}

export async function searchArchive(query: ArchiveQuery): Promise<ArchiveResult> {
  const db = await pool();
  const q = query.q.trim();
  if (db) {
    if (q) {
      const [lexical, semantic] = await Promise.all([
        query.mode === "semantic" ? null : lexicalCandidates(db, q),
        query.mode === "fulltext" ? null : semanticCandidates(db, q, query),
      ]);
      const semanticUnavailable = query.mode !== "fulltext" && semantic === null;
      if (semanticUnavailable || query.mode === "fulltext") {
        // Fallback keeps the archive useful when Bedrock or the vectors are unavailable.
        const cands = lexical ?? (await lexicalCandidates(db, q));
        return finish(cands, query, "postgres", { mode: "fulltext", semanticUnavailable });
      }
      if (query.mode === "semantic" || !lexical)
        return finish(semantic ?? [], query, "postgres", {
          mode: "semantic",
          semanticUnavailable: false,
        });
      return finish(fuseArchive(lexical, semantic ?? []), query, "postgres", {
        mode: "hybrid",
        semanticUnavailable: false,
      });
    }
    const { rows } = await db.query<{
      data: unknown;
      segment_id: string | null;
      text: string | null;
    }>(
      `select s.data, g.id as segment_id, g.text from sources s
       left join lateral (
         select id, text from segments where source_id = s.id and length(text) > 60
         order by ordinal limit 1) g on true
       where s.person_filtered = true and ${live("s.")}
       order by s.date desc limit ${CANDIDATE_LIMIT}`,
    );
    return finish(
      rows.flatMap((r) => {
        const source = asSource(r.data);
        return source ? [{ source, snippet: r.text ?? "", segmentId: r.segment_id, rank: 0 }] : [];
      }),
      query,
      "postgres",
    );
  }
  // file fallback: substring match
  const fs = await fileStore();
  const lower = q.toLowerCase();
  const cands: Candidate[] = [];
  for (const source of fs.sources) {
    const segs = fs.segments.filter((g) => g.sourceId === source.id);
    const hit = lower
      ? (segs.find((g) => g.text.toLowerCase().includes(lower)) ??
        ((source.title ?? "").toLowerCase().includes(lower) ||
        source.institution.nameDe.toLowerCase().includes(lower)
          ? segs[0]
          : undefined))
      : segs[0];
    if (lower && !hit) continue;
    cands.push({
      source,
      snippet: hit ? highlight(hit.text, q) : "",
      segmentId: hit?.id ?? null,
      rank: 0,
    });
  }
  cands.sort((a, b) => b.source.date.localeCompare(a.source.date));
  return finish(cands, query, "file");
}

// ---------------- detail ----------------

export interface SourceDetail {
  source: Source;
  segments: Segment[];
  maskedCount: number;
  draftLaw: string | null;
  licenceLabel: string;
  /** Press: segments clipped to snippets. */
  clipped: boolean;
}

export async function getSource(id: string): Promise<SourceDetail | null> {
  const db = await pool();
  let source: Source | null = null;
  let segments: Segment[] = [];
  if (db) {
    const { rows } = await db.query<{ data: unknown }>(
      "select data from sources where id = $1 and person_filtered = true",
      [id],
    );
    source = asSource(rows[0]?.data);
    if (source) {
      const { rows: segs } = await db.query<Segment & { text_en: string | null }>(
        `select id, source_id as "sourceId", ordinal, start, "end", text, text_en as "textEn"
         from segments where source_id = $1 order by ordinal limit 600`,
        [id],
      );
      segments = segs;
    }
  } else {
    const fs = await fileStore();
    source = fs.sources.find((s) => s.id === id) ?? null;
    segments = fs.segments.filter((g) => g.sourceId === id);
  }
  if (!source) return null;
  const clipped = isPress(source);
  if (clipped) {
    let budget = PRESS_SNIPPET_CHARS * 2;
    segments = segments.flatMap((g) => {
      if (budget <= 0) return [];
      const text = g.text.length > budget ? `${g.text.slice(0, budget).trimEnd()} …` : g.text;
      budget -= text.length;
      return [{ ...g, text }];
    });
  }
  const maskedCount = segments.reduce((n, g) => n + g.text.split(MASK_TOKEN).length - 1, 0);
  return {
    source,
    segments,
    maskedCount,
    draftLaw: draftLawOf(source),
    licenceLabel: licenceOf(source),
    clipped,
  };
}

export interface SimilarPassage {
  source: Source;
  segmentId: string;
  text: string;
  similarity: number;
}

/**
 * "Similar passages" on the source detail page: nearest segments of other sources to
 * the centroid of this source's segment vectors, best passage per source. Empty when
 * the source has no embeddings yet or the database is down.
 */
export async function similarPassages(sourceId: string, limit = 6): Promise<SimilarPassage[]> {
  const db = await pool();
  if (!db) return [];
  try {
    const store = await import("@sv/db");
    const rows = await withVectorSession(db, 200, async (c) => {
      const { rows: centroid } = await c.query<{ v: string | null }>(
        `select avg(e.embedding)::text as v from segment_embeddings e
         join segments g on g.id = e.segment_id
         where g.source_id = $1 and e.model = $2`,
        [sourceId, store.EMBED_MODEL],
      );
      const v = centroid[0]?.v;
      if (!v) return [];
      const res = await c.query<{
        data: unknown;
        segment_id: string;
        text: string;
        similarity: number;
      }>(
        `with nn as (
           select e.segment_id, e.embedding <=> $1::vector as dist
           from segment_embeddings e
           join segments g0 on g0.id = e.segment_id
           where e.model = $2 and g0.source_id <> $3 and length(g0.text) >= ${SEMANTIC_MIN_CHARS}
           order by e.embedding <=> $1::vector
           limit 120
         ), best as (
           select distinct on (g.source_id) g.source_id, g.id as segment_id, g.text, nn.dist
           from nn join segments g on g.id = nn.segment_id
           order by g.source_id, nn.dist
         )
         select s.data, b.segment_id, b.text, 1 - b.dist as similarity
         from best b join sources s on s.id = b.source_id
         where s.person_filtered = true and ${live("s.")}
         order by b.dist
         limit ${Math.max(1, Math.min(20, limit))}`,
        [v, store.EMBED_MODEL, sourceId],
      );
      return res.rows;
    });
    return rows.flatMap((r) => {
      const source = asSource(r.data);
      if (!source) return [];
      return [
        {
          source,
          segmentId: r.segment_id,
          text: clipPress(source, r.text),
          similarity: Math.round(Number(r.similarity) * 1000) / 1000,
        },
      ];
    });
  } catch (error) {
    console.warn("archive_similar_failed", error instanceof Error ? error.message : error);
    return [];
  }
}

/** Lightweight lookup for previews and backlinks. */
export async function getSourcesByIds(ids: string[]): Promise<Map<string, Source>> {
  const out = new Map<string, Source>();
  if (!ids.length) return out;
  const db = await pool();
  if (db) {
    const { rows } = await db.query<{ data: unknown }>(
      "select data from sources where id = any($1) and person_filtered = true",
      [ids],
    );
    for (const r of rows) {
      const s = asSource(r.data);
      if (s) out.set(s.id, s);
    }
    return out;
  }
  const fs = await fileStore();
  for (const s of fs.sources) if (ids.includes(s.id)) out.set(s.id, s);
  return out;
}

export async function firstSegmentText(sourceId: string): Promise<string | null> {
  const db = await pool();
  if (db) {
    const { rows } = await db.query<{ text: string }>(
      "select text from segments where source_id = $1 and length(text) > 40 order by ordinal limit 1",
      [sourceId],
    );
    return rows[0]?.text ?? null;
  }
  const fs = await fileStore();
  return fs.segments.find((g) => g.sourceId === sourceId)?.text ?? null;
}

export async function getSegment(segmentId: string): Promise<Segment | null> {
  const db = await pool();
  if (db) {
    const { rows } = await db.query<Segment>(
      `select g.id, g.source_id as "sourceId", g.ordinal, g.start, g."end", g.text, g.text_en as "textEn"
       from segments g join sources s on s.id = g.source_id
       where g.id = $1 and s.person_filtered = true`,
      [segmentId],
    );
    return rows[0] ?? null;
  }
  const fs = await fileStore();
  return fs.segments.find((g) => g.id === segmentId) ?? null;
}

/** All sources of one institution (code) or role, newest first. */
export async function sourcesFor(filter: { code?: string; role?: string }, limit = 50) {
  const db = await pool();
  if (db) {
    const { rows } = await db.query<{ data: unknown }>(
      `select data from sources where person_filtered = true and ${live()}
       and ($1::text is null or institution_code = $1)
       and ($2::text is null or institution_role = $2)
       order by date desc limit ${limit}`,
      [filter.code ?? null, filter.role ?? null],
    );
    return rows.flatMap((r) => asSource(r.data) ?? []);
  }
  const fs = await fileStore();
  return fs.sources
    .filter(
      (s) =>
        (!filter.code || s.institution.code === filter.code) &&
        (!filter.role || s.institution.role === filter.role),
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}

/** Sources tied to one Ministerialentwurf, by registry case_id ("XXVII-ME-326"). */
export async function sourcesForDraftLaw(caseId: string, limit = 120) {
  const m = caseId.match(/^([IVXL]+)-ME-(\d+)$/);
  if (!m) return [];
  const [, gp, num] = m;
  const db = await pool();
  if (db) {
    const { rows } = await db.query<{ data: unknown }>(
      `select data from sources where person_filtered = true and ${live()}
       and legal_ref like $1 and id like $2
       order by date asc limit ${limit}`,
      [`%SN-${num}/ME`, `${gp}/%`],
    );
    return rows.flatMap((r) => asSource(r.data) ?? []);
  }
  return [];
}

export async function archiveStats() {
  const db = await pool();
  if (db) {
    const { rows } = await db.query<{ sources: string; segments: string }>(
      `select (select count(*) from sources where person_filtered and ${live()}) as sources,
              (select count(*) from segments g join sources s on s.id = g.source_id
                where ${live("s.")}) as segments`,
    );
    return { sources: Number(rows[0]?.sources ?? 0), segments: Number(rows[0]?.segments ?? 0) };
  }
  const fs = await fileStore();
  return { sources: fs.sources.length, segments: fs.segments.length };
}

export interface ArchiveOverview {
  /** Sources per kind (person-filtered, live corpus). */
  kinds: Record<string, number>;
  /** Passages in the live corpus, and how many of them carry a semantic embedding. */
  segments: number;
  embedded: number;
  years: { min: number; max: number } | null;
  /** Sources per year and kind, years ascending. */
  perYear: Array<{ year: number; kinds: Record<string, number> }>;
  backend: ArchiveResult["backend"];
}

const OVERVIEW_TTL_MS = 5 * 60_000;
let overviewCache: { at: number; value: ArchiveOverview } | null = null;

/**
 * Counts for the home page's data tiles. Three aggregate queries over sources and segments,
 * cached per process for five minutes (the corpus changes by import, not by request).
 */
export async function archiveOverview(): Promise<ArchiveOverview> {
  if (overviewCache && Date.now() - overviewCache.at < OVERVIEW_TTL_MS) return overviewCache.value;
  const value = await computeOverview();
  overviewCache = { at: Date.now(), value };
  return value;
}

function foldOverview(
  rows: Array<{ year: number; kind: string; n: number }>,
  segments: number,
  embedded: number,
  backend: ArchiveResult["backend"],
): ArchiveOverview {
  const kinds: Record<string, number> = {};
  const byYear = new Map<number, Record<string, number>>();
  for (const r of rows) {
    kinds[r.kind] = (kinds[r.kind] ?? 0) + r.n;
    const y = byYear.get(r.year) ?? {};
    y[r.kind] = (y[r.kind] ?? 0) + r.n;
    byYear.set(r.year, y);
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);
  return {
    kinds,
    segments,
    embedded,
    years: years.length ? { min: years[0] ?? 0, max: years.at(-1) ?? 0 } : null,
    perYear: years.map((year) => ({ year, kinds: byYear.get(year) ?? {} })),
    backend,
  };
}

async function computeOverview(): Promise<ArchiveOverview> {
  const db = await pool();
  if (db) {
    const [perYear, seg] = await Promise.all([
      db.query<{ year: number; kind: string; n: number }>(
        `select extract(year from date)::int as year, kind, count(*)::int as n
           from sources where person_filtered and ${live()}
           group by 1, 2 order by 1, 2`,
      ),
      db.query<{ segments: number; embedded: number }>(
        `select (select count(*) from segments g join sources s on s.id = g.source_id
                  where s.person_filtered and ${live("s.")})::int as segments,
                (select count(*) from segment_embeddings e
                  join segments g on g.id = e.segment_id
                  join sources s on s.id = g.source_id
                  where s.person_filtered and ${live("s.")})::int as embedded`,
      ),
    ]);
    return foldOverview(
      perYear.rows,
      seg.rows[0]?.segments ?? 0,
      seg.rows[0]?.embedded ?? 0,
      "postgres",
    );
  }
  const fs = await fileStore();
  const rows = new Map<string, { year: number; kind: string; n: number }>();
  for (const s of fs.sources) {
    const year = Number(s.date.slice(0, 4));
    const key = `${year}:${s.kind}`;
    const r = rows.get(key) ?? { year, kind: s.kind, n: 0 };
    r.n++;
    rows.set(key, r);
  }
  return foldOverview([...rows.values()], fs.segments.length, 0, "file");
}

/** Quick source lookup for the command palette: title/institution match plus FTS. */
export async function quickSources(q: string, limit = 8): Promise<Source[]> {
  const db = await pool();
  if (db) {
    const { rows } = await db.query<{ data: unknown }>(
      `select s.data from sources s where s.person_filtered = true and ${live("s.")} and (
         s.id ilike $1 or s.title ilike $1 or s.legal_ref ilike $1
         or s.data->'institution'->>'nameDe' ilike $1
         or exists (select 1 from segments g where g.source_id = s.id
                    and g.tsv @@ websearch_to_tsquery('german', $2)))
       order by s.date desc limit ${limit}`,
      [`%${q}%`, q],
    );
    return rows.flatMap((r) => asSource(r.data) ?? []);
  }
  const fs = await fileStore();
  const lower = q.toLowerCase();
  return fs.sources
    .filter(
      (s) =>
        (s.title ?? "").toLowerCase().includes(lower) ||
        s.institution.nameDe.toLowerCase().includes(lower) ||
        fs.segments.some((g) => g.sourceId === s.id && g.text.toLowerCase().includes(lower)),
    )
    .slice(0, limit);
}

export interface InstitutionRow {
  code: string;
  nameDe: string;
  glossEn: string;
  role: string;
  count: number;
}

export async function institutions(): Promise<InstitutionRow[]> {
  const db = await pool();
  if (db) {
    const { rows } = await db.query<{
      code: string;
      name: string;
      gloss: string;
      role: string;
      n: string;
    }>(
      `select institution_code as code, max(data->'institution'->>'nameDe') as name,
              max(data->'institution'->>'glossEn') as gloss, max(institution_role) as role, count(*) as n
       from sources where person_filtered = true and ${live()} group by institution_code order by count(*) desc`,
    );
    return rows.map((r) => ({
      code: r.code,
      nameDe: r.name,
      glossEn: r.gloss,
      role: r.role,
      count: Number(r.n),
    }));
  }
  const fs = await fileStore();
  const m = new Map<string, InstitutionRow>();
  for (const s of fs.sources) {
    const row = m.get(s.institution.code) ?? { ...s.institution, count: 0 };
    row.count++;
    m.set(s.institution.code, row);
  }
  return [...m.values()];
}

/** Red lines and stance profiles for one role (W-47). Empty when the tables are not loaded. */
export async function shelfFor(role: string) {
  const db = await pool();
  if (!db) return { redLines: [] as RedLine[], stances: [] as StanceProfile[] };
  const [rl, sp] = await Promise.all([
    db.query<{ data: unknown }>("select data from red_lines where role = $1 order by tier, id", [
      role,
    ]),
    db.query<{ data: unknown }>(
      "select data from stance_profiles where role = $1 order by topic_key, year nulls first",
      [role],
    ),
  ]);
  return {
    redLines: rl.rows.map((r) => r.data as RedLine),
    stances: sp.rows.map((r) => r.data as StanceProfile),
  };
}
