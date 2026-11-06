// pnpm db:embed                     embeds every segment still missing a Titan v2 vector
// pnpm db:embed --per-region 4      workers per region (default 4); --concurrency N overrides the total
// SV_EMBED_REGIONS=eu-north-1,us-east-1 pnpm db:embed   spreads the job over regional quotas
// pnpm db:embed --limit 500         stop after 500 segments (smoke test)
// Resumable and idempotent: rows already embedded with the same text hash are skipped.
import "./env.ts";
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "../src/client.ts";
import { EMBED_MODEL, embeddingConfigured, embedMissingSegments } from "../src/embeddings.ts";

function arg(name: string): number | undefined {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? Number(process.argv[i + 1]) : Number.NaN;
  return Number.isFinite(v) && v > 0 ? v : undefined;
}

if (!embeddingConfigured()) {
  console.error("BIFROST_SEED_BEDROCK_KEY is not set; nothing to do");
  process.exit(1);
}
const db = getDb();
const t0 = Date.now();
console.log(`embedding segments with ${EMBED_MODEL}`);
const p = await embedMissingSegments(db, {
  concurrency: arg("concurrency"),
  perRegion: arg("per-region"),
  limit: arg("limit"),
  log: (x) =>
    console.log(
      `embedded ${x.done} failed ${x.failed} pending ${x.pending} | ${x.ratePerSec.toFixed(1)}/s | ${x.tokens} tokens ~ ${x.usd.toFixed(4)} USD` +
        (x.ratePerSec > 0 ? ` | eta ${Math.round(x.pending / x.ratePerSec / 60)} min` : ""),
    ),
});
const counts = await db.execute<{ model: string; n: string; tokens: string }>(
  sql`select model, count(*) as n, coalesce(sum(tokens), 0) as tokens from segment_embeddings group by model`,
);
console.log(
  `done in ${Math.round((Date.now() - t0) / 1000)} s: ${p.done} embedded, ${p.failed} failed (rerun to retry)`,
);
for (const r of counts.rows)
  console.log(`  ${r.model}: ${r.n} segments, ${r.tokens} tokens in total`);
await closeDb();
if (p.failed) process.exitCode = 2;
