import { AGENT_CATALOG, catalogAgent } from "@sv/contracts";
import Link from "next/link";
import { Suspense } from "react";
import { ArchiveControls } from "@/components/archive/archive-controls";
import { ArchiveNav } from "@/components/archive/archive-nav";
import { archiveStats, type Facet, searchArchive } from "@/components/archive/data.server";
import { MaskedText } from "@/components/archive/masked-text";
import { parseArchiveQuery } from "@/components/archive/query";
import { EntityLink } from "@/components/entity/entity-link";
import { laneT, pick } from "@/components/entity/messages";
import { AgentTile } from "@/components/run/agent-tile";
import { Page, PageHead } from "@/components/shell/page";
import { Badge } from "@/components/ui/badge";
import { serverPrefs } from "@/lib/server-prefs";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

function toggleHref(sp: SP, key: string, value: string): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === "page" || v === undefined) continue;
    for (const x of Array.isArray(v) ? v : [v]) next.append(k, x);
  }
  const cur = next.getAll(key).flatMap((x) => x.split(","));
  next.delete(key);
  const has = cur.includes(value);
  for (const x of has ? cur.filter((c) => c !== value) : [...cur, value]) next.append(key, x);
  const s = next.toString();
  return s ? `/archive?${s}` : "/archive";
}

function pageHref(sp: SP, page: number) {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === "page" || v === undefined) continue;
    for (const x of Array.isArray(v) ? v : [v]) next.append(k, x);
  }
  next.set("page", String(page));
  return `/archive?${next.toString()}`;
}

// Evidence archive (W-45, FR-H1, FR-H2, FR-P1, CON-1/2). Masked text only, no bulk download.
export default async function ArchivePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { t: base, lang } = await serverPrefs();
  const t = laneT(lang);
  const query = parseArchiveQuery(sp);
  const [res, stats] = await Promise.all([searchArchive(query), archiveStats()]);
  const selected: Record<string, string[]> = {
    kind: query.kinds,
    institution: query.institutions,
    year: query.years,
    draftLaw: query.draftLaws,
    licence: query.licences,
  };
  const facetLabel = (key: string, f: Facet) =>
    key === "kind"
      ? pick(t.archive.kinds, f.value)
      : key === "licence"
        ? pick(t.archive.licences, f.value)
        : f.label;
  const anyFilter = Object.values(selected).some((v) => v.length) || query.q || query.asOf;
  const pages = Math.ceil(res.total / res.pageSize);

  return (
    <Page>
      <PageHead title={base.archive.title} sub={base.archive.sub} />
      <ArchiveNav lang={lang} active="search" />
      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside
          className="order-2 space-y-5 lg:order-1 lg:sticky lg:top-[66px] lg:self-start"
          aria-label="Facets"
        >
          <div className="rounded-2xl border bg-card p-3 text-xs text-muted-foreground">
            <div className="mb-1 font-medium text-foreground">{t.archive.corpus}</div>
            <div className="num">
              {stats.sources.toLocaleString(lang)} {t.archive.sources} ·{" "}
              {stats.segments.toLocaleString(lang)} {t.archive.segments}
            </div>
            <div className="mt-1">{t.archive.backend[res.backend]}</div>
            <div className="mt-2 border-t pt-2">{t.archive.detail.noBulk}</div>
          </div>
          {(Object.keys(res.facets) as Array<keyof typeof res.facets>).map((key) => {
            const list = res.facets[key];
            if (!list.length) return null;
            return (
              <div key={key}>
                <div className="mb-1.5 text-xs font-medium">{t.archive.facets[key]}</div>
                <ul className="max-h-64 space-y-0.5 overflow-y-auto pr-1">
                  {list.slice(0, 40).map((f) => {
                    const on = selected[key]?.includes(f.value);
                    return (
                      <li key={f.value}>
                        <Link
                          href={toggleHref(sp, key, f.value)}
                          scroll={false}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-gray-alpha-100",
                            on && "bg-gray-alpha-150",
                          )}
                          aria-pressed={on}
                        >
                          <span
                            className={cn(
                              "grid size-3.5 shrink-0 place-items-center rounded-[4px] border text-[9px]",
                              on && "border-foreground bg-foreground text-background",
                            )}
                          >
                            {on ? "✓" : ""}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{facetLabel(key, f)}</span>
                          <span className="num text-xs text-muted-foreground">{f.count}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
          {anyFilter ? (
            <Link href="/archive" className="text-xs underline">
              {t.archive.clear}
            </Link>
          ) : null}
        </aside>

        <div className="order-1 min-w-0 space-y-4 lg:order-2">
          <Suspense>
            <ArchiveControls min={res.dateRange.min} max={res.dateRange.max} />
          </Suspense>
          <div className="flex items-baseline gap-2 text-sm text-muted-foreground">
            <span className="num text-foreground">{res.total.toLocaleString(lang)}</span>{" "}
            {t.archive.results}
            {query.asOf ? (
              <span>
                · {res.hits.filter((h) => h.afterAsOf).length} {t.archive.afterAsOf} (
                {t.archive.page} {res.page})
              </span>
            ) : null}
          </div>
          {res.hits.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
              {t.archive.noResults}
            </div>
          ) : (
            <ol className="space-y-2.5">
              {res.hits.map((h) => {
                const s = h.source;
                const agent = AGENT_CATALOG.find((a) => a.role === s.institution.role);
                return (
                  <li
                    key={s.id}
                    className={cn(
                      "rounded-2xl border bg-card p-4 transition-opacity",
                      h.afterAsOf && "border-dashed opacity-45 grayscale",
                    )}
                    data-after-asof={h.afterAsOf || undefined}
                  >
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                      {agent ? <AgentTile agentId={agent.id} /> : null}
                      <EntityLink
                        type="institution"
                        id={s.institution.code}
                        className="font-medium"
                      >
                        {s.institution.nameDe}
                      </EntityLink>
                      <span className="font-mono text-muted-foreground">
                        {s.date}
                        {s.outlet ? ` · ${s.outlet}` : ""}
                      </span>
                      <Badge variant="outline" className="h-5 text-[11px] text-muted-foreground">
                        {pick(t.archive.kinds, s.kind)}
                      </Badge>
                      {h.draftLaw ? (
                        <EntityLink
                          type="draft_law"
                          id={h.draftLaw}
                          className="font-mono text-[11px]"
                        >
                          {s.legalRef}
                        </EntityLink>
                      ) : s.legalRef ? (
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {s.legalRef}
                        </span>
                      ) : null}
                      {h.afterAsOf ? (
                        <Badge
                          variant="outline"
                          className="h-5 border-warning/40 text-[11px] text-warning"
                        >
                          {t.archive.afterAsOf} {query.asOf}
                        </Badge>
                      ) : null}
                    </div>
                    <EntityLink type="source" id={s.id} className="text-[15px] leading-snug">
                      {s.title ?? s.id}
                    </EntityLink>
                    {h.snippet ? (
                      <p className="mt-1.5 line-clamp-4 text-sm leading-relaxed text-muted-foreground">
                        <MaskedText text={h.snippet} maskedLabel={t.archive.detail.masked} />
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-x-3 font-mono text-[10px] text-muted-foreground">
                      <span>{s.id}</span>
                      <span>{pick(t.archive.licences, h.licenceLabel)}</span>
                      {agent ? <span>→ {catalogAgent(agent.id)?.code}</span> : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          {pages > 1 ? (
            <div className="flex items-center justify-center gap-3 text-sm">
              {res.page > 1 ? (
                <Link href={pageHref(sp, res.page - 1)} className="underline">
                  {t.archive.prev}
                </Link>
              ) : null}
              <span className="num text-muted-foreground">
                {t.archive.page} {res.page} / {pages}
              </span>
              {res.page < pages ? (
                <Link href={pageHref(sp, res.page + 1)} className="underline">
                  {t.archive.next}
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </Page>
  );
}
