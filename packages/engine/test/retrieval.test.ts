import { existsSync } from "node:fs";
import path from "node:path";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  fuse,
  includeSegmentsQuery,
  queryTerms,
  type Row,
  retrievalMode,
  retrieve,
} from "../src/retrieval.ts";

// Invented rows; ids and texts are placeholders, not corpus content.
function row(id: string, date: string, text: string, role = "other", similarity?: number): Row {
  return {
    segment_id: id,
    source_id: `src-${id}`,
    text,
    date,
    institution_code: role,
    institution_role: role,
    kind: "stellungnahme",
    title: null,
    outlet: null,
    corpus_revision: "test",
    rank: 0,
    similarity,
  };
}

describe("hybrid retrieval fusion", () => {
  const asOf = "2024-06-30";

  it("never lets a document dated after asOf through, in any branch", () => {
    const later = row("late", "2024-07-01", "Wartezeiten auf Facharzttermine");
    const ok = row("ok", "2024-06-30", "Wartezeiten auf Facharzttermine");
    const out = fuse({
      lexical: [later, ok],
      vector: [{ ...later, similarity: 0.99 }],
      own: [later],
      extra: [later],
      asOf,
      role: "other",
    });
    expect(out.map((s) => s.r.segment_id)).toEqual(["ok"]);
    expect(out.every((s) => s.date <= asOf)).toBe(true);
  });

  it("ranks a paraphrase match that full-text misses", () => {
    // Full-text only finds rows sharing the literal terms; the paraphrase (no shared
    // keyword) arrives through the vector branch alone.
    const lexical = Array.from({ length: 8 }, (_, i) =>
      row(`lex${i}`, "2024-01-01", "Termin Wartezeit Facharzt Kassenvertrag"),
    );
    const paraphrase = row(
      "para",
      "2024-01-01",
      "Versicherte müssen oft monatelang ausharren, bis sie bei Spezialisten drankommen.",
      "other",
      0.82,
    );
    const fulltextOnly = fuse({ lexical, asOf, role: "x" });
    expect(fulltextOnly.some((s) => s.r.segment_id === "para")).toBe(false);

    const hybrid = fuse({
      lexical,
      vector: [paraphrase, { ...lexical[5], similarity: 0.7 } as Row],
      asOf,
      role: "x",
    });
    const pos = hybrid.findIndex((s) => s.r.segment_id === "para");
    expect(pos).toBeGreaterThanOrEqual(0);
    expect(pos).toBeLessThan(5);
    expect(hybrid[pos]?.vectorRank).toBe(1);
    expect(hybrid[pos]?.bm25Rank).toBeNull();
    expect(hybrid[pos]?.similarity).toBeCloseTo(0.82);
    // A row found by both branches beats rows found by one.
    expect(hybrid[0]?.r.segment_id).toBe("lex5");
  });

  it("weights by recency after fusion", () => {
    const old = row("old", "2016-06-30", "a");
    const fresh = row("fresh", "2024-06-01", "a");
    const out = fuse({ lexical: [old, fresh], asOf, role: "x" });
    expect(out[0]?.r.segment_id).toBe("fresh");
  });

  it("falls back to full-text when SV_RETRIEVAL=fulltext", () => {
    const prev = process.env.SV_RETRIEVAL;
    process.env.SV_RETRIEVAL = "fulltext";
    expect(retrievalMode()).toBe("fulltext");
    if (prev === undefined) delete process.env.SV_RETRIEVAL;
    else process.env.SV_RETRIEVAL = prev;
  });

  it("drops stopwords and short tokens from the lexical query", () => {
    expect(queryTerms("Wie können die Wartezeiten in der Primärversorgung sinken")).toEqual([
      "Wartezeiten",
      "Primärversorgung",
      "sinken",
    ]);
  });
});

describe("includeSegmentIds lookup", () => {
  it("binds the id list as one text[] parameter behind the as-of predicate", () => {
    const ids = ["a#1", "b#2", "c#3"];
    const q = new PgDialect().sqlToQuery(includeSegmentsQuery(ids, "2024-06-30"));
    expect(q.sql).toMatch(/any\(\$1::text\[\]\)/);
    expect(q.sql).toMatch(/src\.date <= \$2::date/);
    expect(q.params).toEqual([ids, "2024-06-30"]);
  });

  it("keeps a single id an array, never a scalar", () => {
    const q = new PgDialect().sqlToQuery(includeSegmentsQuery(["only#1"], "2024-06-30"));
    expect(q.params[0]).toEqual(["only#1"]);
  });
});

// Live check against the shared database: SV_RETRIEVAL_IT=1 pnpm --filter @sv/engine test
const rootEnv = path.resolve(import.meta.dirname, "../../../.env");
describe.skipIf(process.env.SV_RETRIEVAL_IT !== "1")("hybrid retrieval (live database)", () => {
  if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

  it("returns no passage dated after asOf, with the vector branch active", async () => {
    const asOf = "2023-12-31";
    // Warm the query vector patiently; a throttled call would test the fallback instead.
    const { embedQuery } = await import("@sv/db");
    expect(
      await embedQuery("Wartezeiten auf Termine bei Fachärztinnen und Fachärzten verkürzen", {
        retries: 12,
        timeoutMs: 30_000,
      }),
    ).not.toBeNull();
    const r = await retrieve({
      query: "Wartezeiten auf Termine bei Fachärztinnen und Fachärzten verkürzen",
      role: "social_insurance",
      asOf,
      mode: "hybrid",
      use: 10,
    });
    expect(r.passages.length).toBeGreaterThan(0);
    expect(r.passages.every((p) => p.date <= asOf)).toBe(true);
    expect(r.trace.candidates.some((c) => c.vectorRank !== null)).toBe(true);
  }, 30_000);

  it("injects included segments and keeps retrieving afterwards", async () => {
    const asOf = "2026-11-06";
    const base = await retrieve({ query: "Primärversorgung", role: "x", asOf, mode: "fulltext" });
    const ids = base.passages.slice(0, 2).map((p) => p.segmentId);
    expect(ids.length).toBe(2);
    const r = await retrieve({
      query: "Pflegeassistenz Ausbildung",
      role: "x",
      asOf,
      mode: "fulltext",
      includeSegmentIds: [...ids, "does-not-exist#0"],
      use: 10,
    });
    const got = new Set(r.trace.candidates.map((c) => c.segmentId));
    for (const id of ids) expect(got.has(id)).toBe(true);
    const again = await retrieve({ query: "Telemedizin", role: "x", asOf, mode: "fulltext" });
    expect(again.passages.length).toBeGreaterThan(0);
  }, 30_000);
});
