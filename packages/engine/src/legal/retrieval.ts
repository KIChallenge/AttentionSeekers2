// Law branch of the hybrid retrieval (FR-P6). The legal basis is a few hundred Absätze next to
// tens of thousands of press and Stellungnahme segments, so it gets its own small ranked list
// in the fusion instead of competing for the general lexical top 40. Same as-of predicate as
// every other branch: a provision whose stored version entered into force after the run's
// as-of date is invisible (date = Inkrafttretensdatum).
import { type SQL, sql } from "drizzle-orm";

export const LAW_KIND = "law";
/** Law passages per query in the fusion; at most two survive the per-source cap anyway. */
export const LAW_TOP_K = 6;

/** Statutes in force do not age: recency weight 1 instead of the two-year half-life. */
export function lawRecencyWeight(kind: string, weight: number): number {
  return kind === LAW_KIND ? 1 : weight;
}

export function lawBranchQuery(tsq: string, asOf: string, excludedRevision: string): SQL {
  return sql`
    with q as (select websearch_to_tsquery('german', ${tsq}) as q)
    select s.id as segment_id, s.source_id, s.text, src.date::text as date, src.institution_code,
           src.institution_role, src.kind, src.title, src.outlet, src.corpus_revision,
           ts_rank_cd(s.tsv, q.q) as rank
    from segments s join sources src on src.id = s.source_id, q
    where src.kind = ${LAW_KIND} and s.tsv @@ q.q and src.date <= ${asOf}::date
      and src.person_filtered = true and src.corpus_revision <> ${excludedRevision}
    order by ts_rank_cd(s.tsv, q.q) desc
    limit ${LAW_TOP_K}`;
}
