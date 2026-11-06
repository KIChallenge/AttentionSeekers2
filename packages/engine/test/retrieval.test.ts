import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fuse, queryTerms, type Row, retrievalMode, retrieve } from "../src/retrieval.ts";

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

// Live check against the shared database: SV_RETRIEVAL_IT=1 pnpm --filter @sv/engine test
const rootEnv = path.resolve(import.meta.dirname, "../../../.env");
describe.skipIf(process.env.SV_RETRIEVAL_IT !== "1")("hybrid retrieval (live database)", () => {
  if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

  it("returns no passage dated after asOf, with the vector branch active", async () => {
    const asOf = "2019-12-31";
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
});
