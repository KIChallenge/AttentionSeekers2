// Retrieval evaluation: full-text vs hybrid top-5 on 20 German queries about the brief's
// topics, relevance graded blind by a cross-family judge (OpenAI-compatible gateway,
// default azure/gpt-6-sol; the embeddings are Amazon Titan). Writes docs/retrieval-eval.md.
//   pnpm --filter @sv/engine eval:retrieval
// Only segment ids and grades go into the report, never passage text.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { type Passage, retrieve } from "./retrieval.ts";

const AS_OF = process.env.SV_EVAL_AS_OF ?? new Date().toISOString().slice(0, 10);
const JUDGE = process.env.SV_EVAL_JUDGE ?? "azure/gpt-6-sol";
const K = 5;

const QUERIES: Array<{ topic: string; q: string }> = [
  { topic: "Wartezeiten", q: "Wartezeiten auf Facharzttermine verkürzen" },
  { topic: "Wartezeiten", q: "Patienten warten monatelang auf einen Termin beim Spezialisten" },
  {
    topic: "Wartezeiten",
    q: "Terminservicestelle und Terminvergabe über die Gesundheitshotline 1450",
  },
  { topic: "Wartezeiten", q: "lange Wartezeiten auf planbare Operationen im Spital" },
  { topic: "Kassenstellen", q: "unbesetzte Kassenstellen in ländlichen Regionen" },
  {
    topic: "Kassenstellen",
    q: "Warum wollen junge Ärztinnen keinen Vertrag mit der Krankenkasse?",
  },
  { topic: "Kassenstellen", q: "Wahlärzte statt Vertragsärzte, Zwei-Klassen-Medizin" },
  { topic: "Telemedizin", q: "Telemedizin und Videosprechstunde in der Regelversorgung" },
  { topic: "Telemedizin", q: "Behandlung aus der Ferne per Bildschirm statt Praxisbesuch" },
  { topic: "Telemedizin", q: "elektronische Gesundheitsakte ELGA und Datenschutz" },
  {
    topic: "Primärversorgung",
    q: "Primärversorgungseinheiten und Primärversorgungsnetzwerke ausbauen",
  },
  {
    topic: "Primärversorgung",
    q: "Hausarztpraxis als erste Anlaufstelle mit Team aus mehreren Gesundheitsberufen",
  },
  { topic: "Primärversorgung", q: "Patientenlenkung weg von den Spitalsambulanzen" },
  { topic: "Pflegekompetenzen", q: "Kompetenzen der diplomierten Pflege erweitern" },
  { topic: "Pflegekompetenzen", q: "Dürfen Pflegekräfte künftig Medikamente verschreiben?" },
  { topic: "Pflegekompetenzen", q: "Pflegepersonalmangel und Ausbildung in der Pflegeassistenz" },
  { topic: "Finanzierung", q: "Finanzierung aus einer Hand für ambulant und stationär" },
  { topic: "Finanzierung", q: "Wer bezahlt die Spitäler: Länder, Bund oder Sozialversicherung?" },
  { topic: "Finanzierung", q: "Beitragseinnahmen der Krankenversicherung und Defizit der Kassen" },
  { topic: "Finanzierung", q: "Zielsteuerung Gesundheit und Kostendämpfungspfad" },
];

type Grade = 0 | 1 | 2;

async function judge(q: string, passages: Passage[]): Promise<Map<string, Grade>> {
  const base = (process.env.OPENAI_COMPATIBLE_BASE_URL ?? "").replace(/\/+$/, "");
  const key = process.env.OPENAI_COMPATIBLE_API_KEY ?? "";
  if (!base || !key) throw new Error("OPENAI_COMPATIBLE_BASE_URL / _API_KEY not set");
  const items = passages.map((p, i) => `[${i}] ${p.text.replace(/\s+/g, " ").slice(0, 600)}`);
  const prompt = [
    "Du bewertest Suchergebnisse aus einem Archiv österreichischer gesundheitspolitischer Stellungnahmen und Pressemeldungen.",
    `Suchanfrage: "${q}"`,
    "Bewerte jede Passage: 2 = beantwortet die Anfrage direkt oder behandelt genau dieses Thema, 1 = thematisch verwandt, aber nur am Rand, 0 = nicht relevant.",
    'Antworte nur mit JSON: {"grades": [Zahl je Passage in Reihenfolge]}.',
    "",
    ...items,
  ].join("\n");
  const model = JUDGE.includes("/") ? JUDGE.slice(JUDGE.indexOf("/") + 1) : JUDGE;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "api-key": key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) throw new Error(`judge ${res.status}`);
      const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const grades = (JSON.parse(j.choices?.[0]?.message?.content ?? "{}") as { grades?: number[] })
        .grades;
      if (!Array.isArray(grades) || grades.length !== passages.length)
        throw new Error("judge returned a wrong number of grades");
      return new Map(
        passages.map((p, i) => [
          p.segmentId,
          Math.max(0, Math.min(2, Math.round(grades[i] ?? 0))) as Grade,
        ]),
      );
    } catch (error) {
      console.warn("judge_retry", attempt, error instanceof Error ? error.message : error);
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  throw new Error(`judge failed for: ${q}`);
}

function ndcg(grades: Grade[], ideal: Grade[]): number {
  const dcg = (g: Grade[]) =>
    g.slice(0, K).reduce<number>((s, x, i) => s + (2 ** x - 1) / Math.log2(i + 2), 0);
  const best = dcg([...ideal].sort((a, b) => b - a));
  return best > 0 ? dcg(grades) / best : 0;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const f2 = (x: number) => x.toFixed(2);

type SysResult = { ids: string[]; grades: Grade[] };
const rows: Array<{
  topic: string;
  q: string;
  ft: SysResult;
  hy: SysResult;
  hybridOnlyRelevant: number;
}> = [];

const store = await import("@sv/db");
const { sql } = await import("drizzle-orm");
const db = store.getDb();
const cov = await db.execute<{ total: string; embedded: string }>(sql`
  select (select count(*) from segments where length(text) >= 50) as total,
         (select count(*) from segment_embeddings e join segments g on g.id = e.segment_id
           where e.model = ${store.EMBED_MODEL} and length(g.text) >= 50) as embedded`);
const coverage = {
  total: Number(cov.rows[0]?.total ?? 0),
  embedded: Number(cov.rows[0]?.embedded ?? 0),
};

for (const { topic, q } of QUERIES) {
  // Warm the query-vector cache patiently: a throttled call would otherwise make the
  // hybrid run silently fall back to full text and compare full text with itself.
  if (!(await store.embedQuery(q, { retries: 12, timeoutMs: 30_000 })))
    throw new Error(`no query embedding for: ${q}`);
  const [ft, hy] = await Promise.all([
    retrieve({ query: q, role: "__eval__", asOf: AS_OF, use: K, mode: "fulltext" }),
    retrieve({ query: q, role: "__eval__", asOf: AS_OF, use: K, mode: "hybrid" }),
  ]);
  const pool = new Map<string, Passage>();
  for (const p of [...ft.passages, ...hy.passages]) pool.set(p.segmentId, p);
  const grades = pool.size ? await judge(q, [...pool.values()]) : new Map<string, Grade>();
  const res = (ps: Passage[]): SysResult => ({
    ids: ps.map((p) => p.segmentId),
    grades: ps.map((p) => grades.get(p.segmentId) ?? 0),
  });
  const ftIds = new Set(ft.passages.map((p) => p.segmentId));
  rows.push({
    topic,
    q,
    ft: res(ft.passages),
    hy: res(hy.passages),
    hybridOnlyRelevant: hy.passages.filter(
      (p) => !ftIds.has(p.segmentId) && (grades.get(p.segmentId) ?? 0) >= 1,
    ).length,
  });
  console.log(
    `${topic.padEnd(18)} ft ${res(ft.passages).grades.join("")} | hy ${res(hy.passages).grades.join("")}  ${q}`,
  );
}

const ideal = (r: (typeof rows)[number]) => [...r.ft.grades, ...r.hy.grades];
const p5 = (s: SysResult, min: Grade) => s.grades.filter((g) => g >= min).length / K;
const summary = (pick: (r: (typeof rows)[number]) => SysResult) => ({
  p5: mean(rows.map((r) => p5(pick(r), 1))),
  p5strict: mean(rows.map((r) => p5(pick(r), 2))),
  ndcg: mean(rows.map((r) => ndcg(pick(r).grades, ideal(r)))),
  empty: rows.filter((r) => pick(r).ids.length === 0).length,
});
const S = { ft: summary((r) => r.ft), hy: summary((r) => r.hy) };
const wins = rows.filter(
  (r) => ndcg(r.hy.grades, ideal(r)) > ndcg(r.ft.grades, ideal(r)) + 1e-9,
).length;
const losses = rows.filter(
  (r) => ndcg(r.hy.grades, ideal(r)) < ndcg(r.ft.grades, ideal(r)) - 1e-9,
).length;

const md = `# Retrieval evaluation: full text vs hybrid

Generated by \`pnpm --filter @sv/engine eval:retrieval\` on ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC.

**Setup.** 20 German queries over the brief's six topics, run through the engine's
\`retrieve()\` exactly as agents use it (as-of ${AS_OF}, recency weighting, at most two
passages per source, top ${K}), once with \`mode: "fulltext"\` and once with
\`mode: "hybrid"\` (German full text + Titan v2 vector top-40, reciprocal rank fusion, k = 60).
The neutral role \`__eval__\` switches the own-institution list off. Both systems' top ${K}
are pooled per query and graded blind (no system label, pooled order) by a cross-family
judge, \`${JUDGE}\`: 2 = directly on topic, 1 = related, 0 = not relevant.

**Embedding coverage at run time:** ${coverage.embedded.toLocaleString("en")} of
${coverage.total.toLocaleString("en")} substantive segments (>= 50 chars,
${f2((100 * coverage.embedded) / Math.max(1, coverage.total))} %) had a vector. Rerun the
command after \`pnpm db:embed\` has finished for final numbers.

## Summary

| metric | full text | hybrid |
|---|---|---|
| P@5 (grade >= 1) | ${f2(S.ft.p5)} | ${f2(S.hy.p5)} |
| P@5 strict (grade 2) | ${f2(S.ft.p5strict)} | ${f2(S.hy.p5strict)} |
| nDCG@5 (pooled ideal) | ${f2(S.ft.ndcg)} | ${f2(S.hy.ndcg)} |
| queries with no result | ${S.ft.empty} | ${S.hy.empty} |

Hybrid has the higher nDCG@5 on ${wins} queries, full text on ${losses}, ties on
${rows.length - wins - losses}. Relevant passages that only hybrid surfaced:
${rows.reduce((s, r) => s + r.hybridOnlyRelevant, 0)}.

## Per query

Grades of the top ${K} in rank order (\`-\` = fewer than ${K} passages).

| topic | query | full text | hybrid | hybrid-only relevant |
|---|---|---|---|---|
${rows
  .map(
    (r) =>
      `| ${r.topic} | ${r.q} | \`${r.ft.grades.join("").padEnd(K, "-")}\` | \`${r.hy.grades.join("").padEnd(K, "-")}\` | ${r.hybridOnlyRelevant} |`,
  )
  .join("\n")}

## Reading the numbers

- The engine's full-text branch ORs the query's content words and ranks by
  \`ts_rank_cd\`, so natural questions and paraphrases ("Patienten warten monatelang ...")
  match on incidental words or not at all. The vector branch matches on meaning.
- Keyword-heavy queries ("Primärversorgungseinheiten") are already served well by full
  text. Fusion can still push such hits down when the vector neighbours are recent press
  items with a higher recency weight; with partial coverage the vector branch only sees
  the embedded subset, which biases it towards press and recent Stellungnahmen.
- The judge sees only query and passage text. Grades are one model's view on 20 queries;
  treat differences of a few hundredths as noise.
`;
const out = path.resolve(import.meta.dirname, "../../../docs/retrieval-eval.md");
writeFileSync(out, md);
// Keep the report in the repo formatter's table layout so `pnpm lint` stays green.
try {
  execFileSync("pnpm", ["exec", "biome", "format", "--write", out], { stdio: "ignore" });
} catch {
  console.warn("biome format failed; run pnpm format");
}
console.log(`wrote ${out}`);
console.log(JSON.stringify(S));
await store.closeDb();
