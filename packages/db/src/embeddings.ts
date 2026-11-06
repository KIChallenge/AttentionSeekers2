// Semantic embeddings for segments (Amazon Bedrock Titan Text Embeddings v2, 1024 dims,
// multilingual). Used by the embed job, the importer, engine retrieval and the archive.
// Only the stored, already person-filtered segment text is ever sent.
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Db } from "./client.ts";
import { SEMANTIC_DIMENSIONS } from "./schema.ts";

export const EMBED_MODEL = "amazon.titan-embed-text-v2:0";
/** USD per 1M input tokens (Titan Text Embeddings v2 on-demand). */
export const EMBED_USD_PER_MTOK = 0.02;
const MAX_CHARS = 40_000;

export function embeddingConfigured(): boolean {
  return Boolean(process.env.BIFROST_SEED_BEDROCK_KEY);
}

/** Same value as Postgres md5(text), so the job can compare hashes in SQL. */
export function textHash(text: string): string {
  return createHash("md5").update(text, "utf8").digest("hex");
}

export function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}

export interface Embedding {
  vector: number[];
  tokens: number;
}

export class EmbedError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null) {
    super(message);
    this.status = status;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Regions to call, first = preferred. SV_EMBED_REGIONS (comma list) spreads the bulk
 * job over several regional quotas; the default is the single configured Bedrock region.
 */
export function embedRegions(): string[] {
  const list = (process.env.SV_EMBED_REGIONS ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter((r) => /^[a-z]{2}(-[a-z]+)+-\d$/.test(r));
  return list.length ? list : [process.env.BIFROST_SEED_BEDROCK_REGION ?? "eu-north-1"];
}

function endpoint(region: string): string {
  return `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(EMBED_MODEL)}/invoke`;
}

/**
 * One InvokeModel call with retry: 429 / 5xx / network errors back off exponentially
 * with jitter (0.5 s doubling, capped at 20 s); 4xx other than 429 fails at once.
 */
export async function embedText(
  text: string,
  opts: { retries?: number; timeoutMs?: number; region?: string } = {},
): Promise<Embedding> {
  const key = process.env.BIFROST_SEED_BEDROCK_KEY;
  if (!key) throw new EmbedError("BIFROST_SEED_BEDROCK_KEY is not set", null);
  const retries = opts.retries ?? 8;
  const body = JSON.stringify({
    inputText: text.slice(0, MAX_CHARS),
    dimensions: SEMANTIC_DIMENSIONS,
    normalize: true,
  });
  const regions = opts.region ? [opts.region] : embedRegions();
  let lastError: EmbedError | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    // Without a pinned region, a retry moves on to the next region's quota.
    const region = regions[attempt % regions.length] ?? "eu-north-1";
    if (attempt > 0) {
      const base = Math.min(20_000, 500 * 2 ** (attempt - 1));
      await sleep(base / 2 + Math.random() * base);
    }
    try {
      const res = await fetch(endpoint(region), {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body,
        signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
      });
      if (res.ok) {
        const j = (await res.json()) as { embedding?: number[]; inputTextTokenCount?: number };
        if (!j.embedding || j.embedding.length !== SEMANTIC_DIMENSIONS)
          throw new EmbedError("embedding missing or wrong size", res.status);
        return { vector: j.embedding, tokens: j.inputTextTokenCount ?? 0 };
      }
      const detail = (await res.text()).slice(0, 160);
      lastError = new EmbedError(`bedrock ${res.status}: ${detail}`, res.status);
      if (res.status !== 429 && res.status < 500) throw lastError;
    } catch (error) {
      if (
        error instanceof EmbedError &&
        error.status !== null &&
        error.status !== 429 &&
        error.status < 500
      )
        throw error;
      lastError =
        error instanceof EmbedError
          ? error
          : new EmbedError(error instanceof Error ? error.message : String(error), null);
    }
  }
  throw lastError ?? new EmbedError("embedding failed", null);
}

// Query embeddings repeat a lot (archive paging, agents re-asking): small LRU.
const queryCache = new Map<string, Promise<number[] | null>>();

/** Embedding for a search query, or null when not configured or the call fails. */
export function embedQuery(text: string): Promise<number[] | null> {
  const q = text.trim().slice(0, 2000);
  if (!q || !embeddingConfigured()) return Promise.resolve(null);
  const hit = queryCache.get(q);
  if (hit) {
    queryCache.delete(q);
    queryCache.set(q, hit);
    return hit;
  }
  const p = embedText(q, { retries: Math.max(2, embedRegions().length), timeoutMs: 8_000 })
    .then((e) => e.vector)
    .catch((error) => {
      console.warn(
        "embed_query_failed",
        error instanceof Error ? error.message.slice(0, 160) : error,
      );
      queryCache.delete(q);
      return null;
    });
  queryCache.set(q, p);
  if (queryCache.size > 200) queryCache.delete(queryCache.keys().next().value as string);
  return p;
}

export interface EmbedProgress {
  /** Distinct texts embedded through the API in this run. */
  done: number;
  failed: number;
  /** Distinct texts still missing. */
  pending: number;
  /** Segments that reused the vector of an identical text (no API call). */
  copied: number;
  tokens: number;
  usd: number;
  ratePerSec: number;
}

/**
 * Embeds every segment that has no embedding for EMBED_MODEL yet, or whose text changed
 * since (md5 mismatch). Identical texts (boilerplate repeated across Stellungnahmen) are
 * embedded once and the vector is copied to every segment carrying that text. Idempotent
 * and resumable: results are committed in chunks while the job runs, a rerun picks up
 * where the last one stopped. `segmentIds` limits the job to those rows.
 */
export async function embedMissingSegments(
  db: Db,
  opts: {
    concurrency?: number;
    batch?: number;
    limit?: number;
    segmentIds?: string[];
    /** Workers per region; each worker is pinned to one region of embedRegions(). */
    perRegion?: number;
    log?: (p: EmbedProgress) => void;
    logEveryMs?: number;
  } = {},
): Promise<EmbedProgress> {
  const regions = embedRegions();
  const concurrency = opts.concurrency ?? regions.length * (opts.perRegion ?? 4);
  const batch = opts.batch ?? 600;
  const ids = sql.param(opts.segmentIds ?? null);
  const missing = sql`
    length(btrim(g.text)) > 0
    and not exists (select 1 from segment_embeddings x
                    where x.segment_id = g.id and x.model = ${EMBED_MODEL} and x.text_hash = md5(g.text))
    and (${ids}::text[] is null or g.id = any(${ids}::text[]))`;
  // Reuse vectors of identical texts before spending API calls on them.
  const copyPass = async () => {
    const res = await db.execute(sql`
      insert into segment_embeddings (segment_id, model, text_hash, tokens, embedding)
      select distinct on (g.id) g.id, e.model, e.text_hash, 0, e.embedding
      from segments g
      join segment_embeddings e on e.model = ${EMBED_MODEL} and e.text_hash = md5(g.text)
      where ${missing}
      order by g.id
      on conflict (segment_id, model) do update set text_hash = excluded.text_hash,
        tokens = excluded.tokens, embedding = excluded.embedding, created_at = now()`);
    return res.rowCount ?? 0;
  };
  const p: EmbedProgress = {
    done: 0,
    failed: 0,
    pending: 0,
    copied: await copyPass(),
    tokens: 0,
    usd: 0,
    ratePerSec: 0,
  };
  const pendingQuery = await db.execute<{ n: string }>(
    sql`select count(distinct md5(g.text)) as n from segments g where ${missing}`,
  );
  const total = Math.min(
    Number(pendingQuery.rows[0]?.n ?? 0),
    opts.limit ?? Number.POSITIVE_INFINITY,
  );
  p.pending = total;
  const started = Date.now();
  let lastLog = 0;
  const report = (force = false) => {
    const now = Date.now();
    if (!force && now - lastLog < (opts.logEveryMs ?? 10_000)) return;
    lastLog = now;
    p.ratePerSec = p.done / Math.max(1, (now - started) / 1000);
    p.usd = (p.tokens / 1e6) * EMBED_USD_PER_MTOK;
    p.pending = Math.max(0, total - p.done - p.failed);
    opts.log?.(p);
  };
  const failedHashes = new Set<string>();
  while (p.done + p.failed < total) {
    const want = Math.min(batch, total - p.done - p.failed);
    // One row per distinct text, in priority order so a partial run is already useful:
    // press and the small source kinds first, then substantive (>= 60 chars) Stellungnahme
    // passages newest first, short headings and fragments last.
    const res = await db.execute<{ id: string; text: string; hash: string }>(sql`
      select id, text, hash from (
        select distinct on (md5(g.text)) g.id, g.text, md5(g.text) as hash,
               (s.kind = 'stellungnahme') as late_kind, (length(g.text) < 60) as short, s.date
        from segments g join sources s on s.id = g.source_id
        where ${missing} and not (md5(g.text) = any(${sql.param([...failedHashes])}::text[]))
        order by md5(g.text), s.date desc
      ) t
      order by late_kind, short, date desc, id limit ${want}`);
    const rows = res.rows;
    if (!rows.length) break;
    const out: Array<{ id: string; hash: string; tokens: number; vec: string }> = [];
    // Committed in chunks of 50 while the batch runs, so an interrupted job loses at
    // most a few in-flight rows.
    const flush = async (min: number) => {
      if (out.length < min || !out.length) return;
      const chunk = out.splice(0, out.length);
      const values = sql.join(
        chunk.map((r) => sql`(${r.id}, ${EMBED_MODEL}, ${r.hash}, ${r.tokens}, ${r.vec}::vector)`),
        sql`, `,
      );
      await db.execute(sql`
        insert into segment_embeddings (segment_id, model, text_hash, tokens, embedding)
        values ${values}
        on conflict (segment_id, model) do update set text_hash = excluded.text_hash,
          tokens = excluded.tokens, embedding = excluded.embedding, created_at = now()`);
    };
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(concurrency, rows.length) }, async (_, w) => {
        const region = regions[w % regions.length];
        while (next < rows.length) {
          const row = rows[next++];
          if (!row) break;
          try {
            const e = await embedText(row.text, { region, retries: 12 });
            out.push({
              id: row.id,
              hash: row.hash,
              tokens: e.tokens,
              vec: toVectorLiteral(e.vector),
            });
            p.tokens += e.tokens;
            p.done++;
            await flush(50);
          } catch (error) {
            p.failed++;
            failedHashes.add(row.hash);
            console.warn(
              "embed_failed",
              row.id,
              error instanceof Error ? error.message.slice(0, 160) : error,
            );
          }
          report();
        }
      }),
    );
    await flush(1);
    p.copied += await copyPass();
  }
  report(true);
  return p;
}
