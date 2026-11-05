import { AGENT_CATALOG, type Source } from "@sv/contracts";
import Link from "next/link";
import { ArchiveNav } from "@/components/archive/archive-nav";
import { firstSegmentText, sourcesForDraftLaw } from "@/components/archive/data.server";
import { MaskedText } from "@/components/archive/masked-text";
import { getEpisode, type RegistryCase } from "@/components/archive/registry.server";
import { Backlinks } from "@/components/entity/backlinks";
import { EntityLink } from "@/components/entity/entity-link";
import { laneT, pick } from "@/components/entity/messages";
import { AgentTile } from "@/components/run/agent-tile";
import { Page, StubNote } from "@/components/shell/page";
import { Badge } from "@/components/ui/badge";
import { serverPrefs } from "@/lib/server-prefs";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface Step {
  key: string;
  label: string;
  date: string | null;
  detail: string | null;
  url: string | null;
}

function steps(c: RegistryCase, t: ReturnType<typeof laneT>): Step[] {
  const e = t.archive.episode;
  const out: Step[] = [
    { key: "me", label: e.me, date: c.first_draft_date, detail: c.me_citation, url: c.me_url },
    {
      key: "beg",
      label: e.begutachtung,
      date: c.begutachtung_end,
      detail: `${c.n_stellungnahmen} ${e.stellungnahmen}`,
      url: null,
    },
  ];
  for (const l of c.links) {
    out.push({
      key: `rv-${l.bill}`,
      label: `${e.rv} (${l.doktyp})`,
      date: l.einlangen,
      detail: l.bill,
      url: l.url,
    });
    if (l.third_reading)
      out.push({
        key: `3-${l.bill}`,
        label: e.third,
        date: l.third_reading,
        detail: l.vote_text,
        url: null,
      });
    if (l.br_date)
      out.push({ key: `br-${l.bill}`, label: e.br, date: l.br_date, detail: null, url: null });
    if (l.bgbl.length)
      out.push({
        key: `bgbl-${l.bill}`,
        label: e.bgbl,
        date: l.br_date ?? l.third_reading,
        detail: l.bgbl.join(", "),
        url: null,
      });
  }
  for (const v of c.vfgh_repeals)
    out.push({
      key: `vfgh-${String(v.date ?? v.identifier ?? out.length)}`,
      label: e.vfgh,
      date: typeof v.date === "string" ? v.date : null,
      detail: typeof v.identifier === "string" ? v.identifier : JSON.stringify(v).slice(0, 80),
      url: typeof v.url === "string" ? v.url : null,
    });
  return out;
}

const OUTCOME_CLS: Record<string, string> = {
  implemented: "border-success/40 bg-success/10 text-success",
  partially_implemented: "",
  lapsed: "border-warning/40 bg-warning/10 text-warning",
  rejected: "border-destructive/40 text-destructive",
};

// Historical episode (W-48, FR-H7, FR-H13, FR-J1a): ME to RV to BGBl to VfGH timeline,
// the institutions' Stellungnahmen side by side, the label and how it was derived.
export default async function EpisodePage({ params }: { params: Promise<{ episodeId: string }> }) {
  const id = decodeURIComponent((await params).episodeId);
  const { lang } = await serverPrefs();
  const t = laneT(lang);
  const ep = await getEpisode(id);
  if (!ep)
    return (
      <Page>
        <ArchiveNav lang={lang} active="episodes" />
        <StubNote>
          {t.entity.notFound}: <span className="font-mono">{id}</span>
        </StubNote>
      </Page>
    );
  const { episode: e, cases } = ep;
  const statements: Array<{ caseId: string; s: Source; text: string | null }> = [];
  for (const c of cases)
    for (const s of await sourcesForDraftLaw(c.case_id, 60))
      statements.push({ caseId: c.case_id, s, text: await firstSegmentText(s.id) });
  return (
    <Page>
      <ArchiveNav lang={lang} active="episodes" />
      <Link
        href="/archive/episodes"
        className="mb-3 inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        ← {t.archive.episode.list}
      </Link>
      <header className="mb-5 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">{t.archive.episode.title}</Badge>
          <Badge variant="outline" className={cn(OUTCOME_CLS[e.outcome])}>
            {pick(t.archive.episode.outcomes, e.outcome)}
          </Badge>
          <Badge variant="outline" className="text-muted-foreground">
            {e.measure_class}
          </Badge>
          {e.censored ? (
            <Badge variant="outline" className="border-dashed">
              {t.archive.episode.censored}
            </Badge>
          ) : null}
          <span className="font-mono text-xs text-muted-foreground">{e.episode_id}</span>
        </div>
        <h1 className="text-2xl leading-snug">{e.title}</h1>
        <div className="font-mono text-xs text-muted-foreground">
          {e.gp}. GP · {e.ressort} · {e.coalition}
        </div>
      </header>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          {cases.map((c) => (
            <section
              key={c.case_id}
              id={c.case_id}
              className="rounded-2xl border bg-card p-4 sm:p-5"
            >
              <div className="mb-4 flex flex-wrap items-baseline gap-2">
                <h2 className="text-base">{t.archive.episode.timeline}</h2>
                <span className="font-mono text-xs text-muted-foreground">{c.case_id}</span>
                <span className="flex-1" />
                <span className="text-xs text-muted-foreground">{c.ressort_name}</span>
              </div>
              <ol className="relative ml-2 space-y-3 border-l pl-5">
                {steps(c, t).map((st) => (
                  <li key={st.key} className="relative">
                    <span className="absolute top-1.5 -left-[26px] size-2.5 rounded-full border-2 border-background bg-foreground" />
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="num w-24 font-mono text-xs text-muted-foreground">
                        {st.date ?? "–"}
                      </span>
                      <span className="text-sm font-medium">{st.label}</span>
                      {st.url ? (
                        <a
                          href={st.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="font-mono text-xs underline"
                        >
                          {st.detail} ↗
                        </a>
                      ) : st.detail ? (
                        <span className="text-xs text-muted-foreground">{st.detail}</span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
              <div className="mt-4 grid gap-3 border-t pt-3 text-sm sm:grid-cols-3">
                <div>
                  <div className="text-xs text-muted-foreground">{t.archive.episode.label}</div>
                  <div>{pick(t.archive.episode.outcomes, c.outcome)}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">{c.label_basis}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">
                    {t.archive.episode.similarity}
                  </div>
                  <div className="num">
                    {c.text_similarity !== null ? c.text_similarity.toFixed(3) : "–"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t.archive.episode.knowable}</div>
                  <div className="num font-mono text-xs">{c.knowable_date ?? "–"}</div>
                  {c.outcome_record ? (
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {c.outcome_record.identifier}
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
          ))}
          <section className="rounded-2xl border bg-card p-4 sm:p-5">
            <div className="mb-3 flex items-baseline gap-2">
              <h2 className="text-base">{t.archive.episode.stellungnahmen}</h2>
              <span className="num text-xs text-muted-foreground">
                {statements.length} {t.archive.episode.inArchive} / {e.n_stellungnahmen}
              </span>
            </div>
            {statements.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.archive.agent.none}</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {statements.map(({ s, text }) => {
                  const agent = AGENT_CATALOG.find((a) => a.role === s.institution.role);
                  return (
                    <article key={s.id} className="rounded-xl border p-3 text-sm">
                      <div className="mb-1 flex items-center gap-1.5 text-xs">
                        {agent ? <AgentTile agentId={agent.id} /> : null}
                        <EntityLink
                          type="institution"
                          id={s.institution.code}
                          className="font-medium"
                        >
                          {s.institution.nameDe}
                        </EntityLink>
                        <span className="font-mono text-muted-foreground">{s.date}</span>
                      </div>
                      <EntityLink type="source" id={s.id} className="font-mono text-[11px]">
                        {s.legalRef ?? s.id}
                      </EntityLink>
                      {text ? (
                        <p className="mt-1.5 line-clamp-5 text-muted-foreground">
                          <MaskedText text={text} maskedLabel={t.archive.detail.masked} />
                        </p>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">{t.archive.episode.reuse}</p>
          </section>
        </div>
        <aside className="space-y-4 lg:sticky lg:top-[66px] lg:self-start">
          {e.vote_text ? (
            <section className="rounded-2xl border bg-card p-4 text-sm">
              <div className="mb-1 text-xs text-muted-foreground">{t.archive.episode.vote}</div>
              {e.vote_text}
            </section>
          ) : null}
          <Backlinks type="episode" id={e.episode_id} lang={lang} />
        </aside>
      </div>
    </Page>
  );
}
