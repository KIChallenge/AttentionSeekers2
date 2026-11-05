import { ArchiveNav } from "@/components/archive/archive-nav";
import { statsCatalogue } from "@/components/archive/registry.server";
import { laneT } from "@/components/entity/messages";
import { Page, PageHead } from "@/components/shell/page";
import { serverPrefs } from "@/lib/server-prefs";

export const dynamic = "force-dynamic";

// Statistics catalogue (W-49, FR-N3, FR-P1) from data/STATS.md.
export default async function StatsPage() {
  const { lang } = await serverPrefs();
  const t = laneT(lang);
  const cat = await statsCatalogue();
  const publishers = [...new Set(cat.series.map((s) => s.publisher))];
  return (
    <Page>
      <PageHead title={t.archive.stats.title} sub={t.archive.stats.sub} />
      <ArchiveNav lang={lang} active="stats" />
      {cat.preamble.length ? (
        <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
          {cat.preamble.join(" ").replace(/`/g, "")}
        </p>
      ) : null}
      <div className="space-y-6">
        {publishers.map((p) => (
          <section key={p}>
            <h2 className="mb-2 text-base">{p}</h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {cat.series
                .filter((s) => s.publisher === p)
                .map((s) => (
                  <article
                    key={s.id}
                    id={s.id}
                    className="flex flex-col gap-2 rounded-2xl border bg-card p-4 target:ring-2 target:ring-foreground"
                  >
                    <div className="font-mono text-xs break-all">{s.dir}</div>
                    <p className="text-sm leading-relaxed">{s.contains}</p>
                    <dl className="mt-auto grid grid-cols-[5.5rem_1fr] gap-y-1 text-xs">
                      <dt className="text-muted-foreground">{t.archive.stats.licence}</dt>
                      <dd>{s.licence}</dd>
                      <dt className="text-muted-foreground">{t.archive.stats.coverage}</dt>
                      <dd>{s.coverage}</dd>
                      <dt className="text-muted-foreground">{t.archive.stats.format}</dt>
                      <dd>{s.format}</dd>
                    </dl>
                    {s.url ? (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="truncate font-mono text-[11px] underline"
                      >
                        {s.url} ↗
                      </a>
                    ) : null}
                  </article>
                ))}
            </div>
          </section>
        ))}
        {cat.notes.length ? (
          <section className="rounded-2xl border border-dashed p-4">
            <h2 className="mb-2 text-sm font-medium">{t.archive.stats.gaps}</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {cat.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </Page>
  );
}
