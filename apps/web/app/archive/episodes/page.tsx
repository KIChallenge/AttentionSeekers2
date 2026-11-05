import Link from "next/link";
import { ArchiveNav } from "@/components/archive/archive-nav";
import { listEpisodes } from "@/components/archive/registry.server";
import { laneT, pick } from "@/components/entity/messages";
import { Page, PageHead } from "@/components/shell/page";
import { serverPrefs } from "@/lib/server-prefs";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const OUTCOME_CLS: Record<string, string> = {
  implemented: "border-success/40 bg-success/10 text-success",
  partially_implemented: "border-border bg-gray-alpha-100",
  lapsed: "border-warning/40 bg-warning/10 text-warning",
  superseded: "text-muted-foreground",
  rejected: "border-destructive/40 text-destructive",
  unknown: "border-dashed text-muted-foreground",
};

// Episode list (W-48): the forecasting registry, newest first.
export default async function EpisodesPage({
  searchParams,
}: {
  searchParams: Promise<{ outcome?: string }>;
}) {
  const { lang } = await serverPrefs();
  const t = laneT(lang);
  const sp = await searchParams;
  const all = await listEpisodes();
  const counts = new Map<string, number>();
  for (const e of all) counts.set(e.outcome, (counts.get(e.outcome) ?? 0) + 1);
  const list = sp.outcome ? all.filter((e) => e.outcome === sp.outcome) : all;
  return (
    <Page>
      <PageHead title={t.archive.episode.list} sub={t.archive.episode.listSub} />
      <ArchiveNav lang={lang} active="episodes" />
      <div className="mb-4 flex flex-wrap gap-1.5">
        <Link
          href="/archive/episodes"
          className={cn(
            "rounded-md border px-2 py-1 text-xs",
            !sp.outcome && "bg-foreground text-background",
          )}
        >
          {t.dash.any} <span className="num opacity-70">{all.length}</span>
        </Link>
        {[...counts.entries()].map(([k, n]) => (
          <Link
            key={k}
            href={`/archive/episodes?outcome=${k}`}
            className={cn(
              "rounded-md border px-2 py-1 text-xs",
              OUTCOME_CLS[k],
              sp.outcome === k && "ring-2 ring-foreground/60",
            )}
          >
            {pick(t.archive.episode.outcomes, k)} <span className="num opacity-70">{n}</span>
          </Link>
        ))}
      </div>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b bg-gray-alpha-50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-normal">{t.archive.episode.me}</th>
              <th className="px-3 py-2 font-normal">GP</th>
              <th className="px-3 py-2 font-normal">{t.archive.detail.date}</th>
              <th className="px-3 py-2 font-normal">{t.archive.episode.stellungnahmen}</th>
              <th className="px-3 py-2 font-normal">{t.archive.episode.outcome}</th>
              <th className="px-3 py-2 font-normal">{t.archive.episode.similarity}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((e) => (
              <tr key={e.episode_id} className="border-b last:border-0 hover:bg-gray-alpha-50">
                <td className="max-w-md px-4 py-2.5">
                  <Link
                    href={`/archive/episodes/${encodeURIComponent(e.episode_id)}`}
                    className="line-clamp-2 hover:underline"
                  >
                    {e.title}
                  </Link>
                  <div className="font-mono text-[11px] text-muted-foreground">
                    {e.episode_id} · {e.ressort} · {e.measure_class}
                    {e.members.length > 1 ? ` · ${e.members.length} ME` : ""}
                  </div>
                </td>
                <td className="px-3 py-2.5 font-mono text-xs">{e.gp}</td>
                <td className="num px-3 py-2.5 font-mono text-xs">{e.first_draft_date}</td>
                <td className="num px-3 py-2.5">{e.n_stellungnahmen}</td>
                <td className="px-3 py-2.5">
                  <span
                    className={cn(
                      "rounded-md border px-1.5 py-0.5 text-xs",
                      OUTCOME_CLS[e.outcome],
                    )}
                  >
                    {pick(t.archive.episode.outcomes, e.outcome)}
                  </span>
                  {e.censored ? (
                    <span className="ml-1 text-xs text-muted-foreground">*</span>
                  ) : null}
                </td>
                <td className="num px-3 py-2.5 text-xs">
                  {e.text_similarity !== null ? e.text_similarity.toFixed(2) : "–"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Page>
  );
}
