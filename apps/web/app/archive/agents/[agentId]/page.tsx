import { catalogAgent, localize } from "@sv/contracts";
import { ArchiveNav } from "@/components/archive/archive-nav";
import { shelfFor, sourcesFor } from "@/components/archive/data.server";
import { Backlinks } from "@/components/entity/backlinks";
import { EntityLink } from "@/components/entity/entity-link";
import { laneT, pick } from "@/components/entity/messages";
import { usageIndex } from "@/components/entity/usage.server";
import { AgentTile } from "@/components/run/agent-tile";
import { Page, StubNote } from "@/components/shell/page";
import { Badge } from "@/components/ui/badge";
import { serverPrefs } from "@/lib/server-prefs";

export const dynamic = "force-dynamic";

// Per-agent evidence shelf (W-47, FR-C1, FR-J13): what this institution's stance is fitted from.
export default async function AgentShelfPage({ params }: { params: Promise<{ agentId: string }> }) {
  const id = decodeURIComponent((await params).agentId);
  const { lang } = await serverPrefs();
  const t = laneT(lang);
  const a = catalogAgent(id);
  if (!a)
    return (
      <Page>
        <ArchiveNav lang={lang} active={null} />
        <StubNote>
          {t.entity.notFound}: {id}
        </StubNote>
      </Page>
    );
  const [sources, shelf, idx] = await Promise.all([
    sourcesFor({ role: a.role }, 60),
    shelfFor(a.role),
    usageIndex(),
  ]);
  const cited = new Map<string, number>();
  for (const [sid, uses] of idx.bySource)
    for (const u of uses) if (u.agentId === id) cited.set(sid, (cited.get(sid) ?? 0) + 1);
  return (
    <Page>
      <ArchiveNav lang={lang} active={null} />
      <header className="mb-5 flex flex-wrap items-center gap-3">
        <AgentTile agentId={id} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">{t.archive.agent.title}</div>
          <h1 className="text-2xl">{lang === "de" ? a.nameDe : a.glossEn}</h1>
          <p className="text-sm text-muted-foreground">{t.archive.agent.sub}</p>
        </div>
        <Badge
          variant="outline"
          className={a.mode === "fitted" ? "border-success/40 text-success" : "border-dashed"}
        >
          {a.mode === "fitted" ? t.setup.fitted : t.setup.prompted}
        </Badge>
        <Badge variant="outline" className="text-muted-foreground">
          {a.role}
        </Badge>
      </header>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <section className="rounded-2xl border bg-card p-4">
            <h2 className="mb-3 text-base">
              {t.archive.agent.sources}{" "}
              <span className="num text-xs text-muted-foreground">{sources.length}</span>
            </h2>
            {sources.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.archive.agent.none}</p>
            ) : (
              <ul className="divide-y">
                {sources.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-baseline gap-2 py-2 text-sm">
                    <span className="num w-24 font-mono text-xs text-muted-foreground">
                      {s.date}
                    </span>
                    <Badge variant="outline" className="h-5 text-[11px] text-muted-foreground">
                      {pick(t.archive.kinds, s.kind)}
                    </Badge>
                    <EntityLink type="source" id={s.id} className="min-w-0 flex-1">
                      {s.title ?? s.legalRef ?? s.id}
                    </EntityLink>
                    {cited.get(s.id) ? (
                      <span className="rounded-md bg-warning/10 px-1.5 text-[11px] text-warning">
                        {t.archive.agent.citedInRuns} {cited.get(s.id)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="rounded-2xl border bg-card p-4">
            <h2 className="mb-3 text-base">{t.archive.agent.redLines}</h2>
            {shelf.redLines.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.archive.agent.none}</p>
            ) : (
              <ul className="space-y-2">
                {shelf.redLines.map((r) => (
                  <li key={r.id} className="rounded-xl border p-3 text-sm">
                    <div className="mb-1 flex items-center gap-2 text-xs">
                      <span className="font-mono">{r.id}</span>
                      <Badge variant="outline" className="h-5 text-[11px]">
                        {r.tier}
                      </Badge>
                      {r.basis ? (
                        <EntityLink
                          type="source"
                          id={r.basis.sourceId}
                          className="font-mono text-[11px]"
                        >
                          {r.basis.sourceId}
                        </EntityLink>
                      ) : null}
                    </div>
                    {localize(r.text, lang)}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <aside className="space-y-4 lg:sticky lg:top-[66px] lg:self-start">
          <section className="rounded-2xl border bg-card p-4 text-sm">
            <h2 className="mb-2 text-sm font-medium">{t.archive.agent.split}</h2>
            {shelf.stances.length ? (
              <ul className="space-y-1 text-xs">
                {shelf.stances.slice(0, 20).map((p) => (
                  <li key={`${p.topicKey}-${p.year}`} className="flex justify-between gap-2">
                    <span>
                      {p.topicKey}
                      {p.year ? ` ${p.year}` : ""}
                    </span>
                    <span className="num">
                      {p.stance.toFixed(2)} (n {p.fit.n})
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">{t.archive.agent.splitPending}</p>
            )}
          </section>
          <Backlinks type="agent" id={id} lang={lang} exclude={["source"]} />
        </aside>
      </div>
    </Page>
  );
}
