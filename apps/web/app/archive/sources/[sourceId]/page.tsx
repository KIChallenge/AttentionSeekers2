import { AGENT_CATALOG } from "@sv/contracts";
import Link from "next/link";
import { ArchiveNav } from "@/components/archive/archive-nav";
import {
  draftLawLabel,
  getSource,
  isFixtureSource,
  similarPassages,
} from "@/components/archive/data.server";
import { MaskedText } from "@/components/archive/masked-text";
import { caseForDraftLaw } from "@/components/archive/registry.server";
import { Backlinks } from "@/components/entity/backlinks";
import { EntityLink } from "@/components/entity/entity-link";
import { laneT, pick } from "@/components/entity/messages";
import { scopedId } from "@/components/entity/types";
import { usesOfSource } from "@/components/entity/usage.server";
import { AgentTile } from "@/components/run/agent-tile";
import { Page, StubNote } from "@/components/shell/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { pressPageFor } from "@/lib/press-originals";
import { serverPrefs } from "@/lib/server-prefs";

export const dynamic = "force-dynamic";

// Source detail (W-46, FR-P1, FR-P3, FR-T2, CON-1/2): metadata, licence line, link out to the
// original, name-masked text with masked spans marked, "used in" backlinks. No raw PDF, no download.
// Letterhead lines, page numbers and OCR fragments carry no argument; they are hidden by
// default and one click away, so the reading view shows the statement, not its scaffolding.
function isScaffold(text: string): boolean {
  const s = text.replace(/\s+/g, " ").trim();
  if (/§|\bArt\.|\bZ ?\d/.test(s)) return false;
  return s.length < 40;
}

/** "law-asvg-342#1a" -> "Abs. 1a"; unnumbered provisions keep the ordinal. */
function absatzLabel(segmentId: string, ordinal: number): string {
  const key = segmentId.split("#")[1] ?? "";
  return /^\d/.test(key) ? `Abs. ${key}` : String(ordinal);
}

export default async function SourcePage({
  params,
  searchParams,
}: {
  params: Promise<{ sourceId: string }>;
  searchParams: Promise<{ all?: string }>;
}) {
  const id = decodeURIComponent((await params).sourceId);
  const showAll = (await searchParams).all === "1";
  const { lang } = await serverPrefs();
  const t = laneT(lang);
  const d = await getSource(id);
  if (!d)
    return (
      <Page>
        <ArchiveNav lang={lang} active={null} />
        <StubNote>
          {t.entity.notFound}: <span className="font-mono">{id}</span>.{" "}
          <Link href="/archive" className="underline">
            {t.archive.detail.back}
          </Link>
        </StubNote>
      </Page>
    );
  const s = d.source;
  const agent = AGENT_CATALOG.find((a) => a.role === s.institution.role);
  const [uses, similar] = await Promise.all([usesOfSource(s.id), similarPassages(s.id)]);
  const reg = d.draftLaw ? await caseForDraftLaw(d.draftLaw) : null;
  const licenceKey = d.licenceLabel in t.archive.licenceLine ? d.licenceLabel : "unknown";
  // Legal basis (kind "law", FR-P6): heading, Absatz labels, validity and RIS version history.
  const law = s.kind === "law" ? s.law : undefined;
  const de = lang === "de";
  return (
    <Page>
      <ArchiveNav lang={lang} active={null} />
      <Link
        href="/archive"
        className="mb-3 inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        ← {t.archive.detail.back}
      </Link>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <article className="min-w-0 space-y-4">
          <header className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5 text-sm">
              {agent ? <AgentTile agentId={agent.id} /> : null}
              <EntityLink type="institution" id={s.institution.code} className="font-medium">
                {s.institution.nameDe}
              </EntityLink>
              <span className="text-muted-foreground">{s.institution.glossEn}</span>
              <Badge variant="outline" className="text-muted-foreground">
                {pick(t.archive.kinds, s.kind)}
              </Badge>
            </div>
            <h1 className="text-2xl leading-snug">{s.title ?? s.legalRef ?? s.id}</h1>
            {law?.heading ? <p className="text-muted-foreground">{law.heading}</p> : null}
            <div className="font-mono text-xs text-muted-foreground">
              {s.id} · {s.date}
              {s.outlet ? ` · ${s.outlet}` : ""}
              {s.legalRef ? ` · ${s.legalRef}` : ""}
            </div>
          </header>

          <div className="rounded-2xl border border-info/30 bg-info/5 p-4 text-sm">
            <div className="mb-1 text-xs font-medium text-info">{t.archive.detail.licence}</div>
            <p>{t.archive.licenceLine[licenceKey as keyof typeof t.archive.licenceLine]}</p>
            {s.licence ? <p className="mt-1 font-mono text-xs">{s.licence}</p> : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {s.url ? (
                <Button asChild size="sm">
                  <a href={s.url} target="_blank" rel="noreferrer noopener">
                    {law ? (de ? "Original im RIS" : "Original in RIS") : t.archive.detail.original}{" "}
                    ↗
                  </a>
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">{t.archive.detail.noOriginal}</span>
              )}
              {pressPageFor(s.id) ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/archive/original/${encodeURIComponent(s.id)}`}>
                    {lang === "de" ? "Original prüfen" : "Check the original"}
                  </Link>
                </Button>
              ) : null}
              <span className="text-xs text-muted-foreground">{t.archive.detail.noBulk}</span>
            </div>
          </div>

          {isFixtureSource(s) ? (
            <div
              role="note"
              data-fixture-source
              className="rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm font-medium text-warning"
            >
              {t.archive.detail.fixtureBanner}
            </div>
          ) : null}

          <section className="rounded-2xl border bg-card p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="text-base">{t.archive.detail.text}</h2>
              <span className="flex-1" />
              <span className="num text-xs text-muted-foreground">
                {d.segments.length} {t.archive.detail.segments}
              </span>
              {law ? null : (
                <Badge
                  variant="outline"
                  className="border-dashed text-muted-foreground"
                  title={t.archive.detail.maskedNote}
                >
                  ▒ {d.maskedCount} {t.archive.detail.maskedCount}
                </Badge>
              )}
            </div>
            {law ? null : (
              <p className="mb-3 text-xs text-muted-foreground">{t.archive.detail.maskedNote}</p>
            )}
            {d.clipped ? (
              <p className="mb-3 text-xs text-warning">{t.archive.detail.pressClip}</p>
            ) : null}
            {d.segments.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.archive.detail.noText}</p>
            ) : (
              <ol className="space-y-2">
                {(() => {
                  const hidden = law ? 0 : d.segments.filter((g) => isScaffold(g.text)).length;
                  return hidden ? (
                    <li className="pb-1 text-xs text-muted-foreground">
                      {showAll
                        ? lang === "de"
                          ? "Alle Zeilen sichtbar, inklusive Briefkopf und Seitenränder. "
                          : "All lines shown, including letterhead and margins. "
                        : lang === "de"
                          ? `${hidden} kurze Zeilen (Briefkopf, Seitenzahlen, OCR-Reste) ausgeblendet. `
                          : `${hidden} short lines (letterhead, page numbers, OCR fragments) hidden. `}
                      <Link href={showAll ? "?" : "?all=1"} className="underline">
                        {showAll
                          ? lang === "de"
                            ? "Ausblenden"
                            : "Hide"
                          : lang === "de"
                            ? "Anzeigen"
                            : "Show"}
                      </Link>
                    </li>
                  ) : null;
                })()}
                {d.segments
                  .filter(
                    (g) =>
                      showAll ||
                      law ||
                      !isScaffold(g.text) ||
                      uses.some((u) => u.segmentId === g.id),
                  )
                  .map((g) => {
                    const cited = uses.filter((u) => u.segmentId === g.id);
                    return (
                      <li
                        key={g.id}
                        id={`seg-${g.id}`}
                        className={`grid grid-cols-[3rem_minmax(0,1fr)] gap-3 rounded-lg px-1 py-1 text-[15px] leading-relaxed ${cited.length ? "bg-warning/10" : ""}`}
                      >
                        <span className="pt-1 text-right font-mono text-[10px] text-muted-foreground">
                          {law ? absatzLabel(g.id, g.ordinal) : g.ordinal}
                        </span>
                        <div>
                          <MaskedText text={g.text} maskedLabel={t.archive.detail.masked} />
                          {cited.length ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {[
                                ...new Map(
                                  cited.map((u) => [
                                    u.claimId ?? u.utteranceId ?? `${u.agentId}-${u.round}`,
                                    u,
                                  ]),
                                ).entries(),
                              ]
                                .slice(0, 8)
                                .map(([k, u]) => (
                                  <EntityLink
                                    key={`${u.runId}-${k}`}
                                    type={u.claimId ? "claim" : u.utteranceId ? "utterance" : "run"}
                                    id={
                                      u.claimId
                                        ? scopedId(u.runId, u.claimId)
                                        : u.utteranceId
                                          ? scopedId(u.runId, u.utteranceId)
                                          : u.runId
                                    }
                                    className="rounded-[5px] border bg-background px-1.5 font-mono text-[10px] no-underline"
                                  >
                                    {u.claimId ?? u.utteranceId ?? `${u.agentId} R${u.round}`}
                                    {u.recencyWeight !== null
                                      ? ` · w ${u.recencyWeight.toFixed(2)}`
                                      : ""}
                                  </EntityLink>
                                ))}
                            </div>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
              </ol>
            )}
          </section>

          {similar.length ? (
            <section className="rounded-2xl border bg-card p-4 sm:p-5" data-similar-passages>
              <h2 className="text-base">{t.archive.similar}</h2>
              <p className="mb-3 text-xs text-muted-foreground">{t.archive.similarNote}</p>
              <ol className="space-y-3">
                {similar.map((p) => (
                  <li key={p.segmentId} className="border-t pt-3 first:border-t-0 first:pt-0">
                    <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
                      <EntityLink type="source" id={p.source.id} className="font-medium">
                        {p.source.title ?? p.source.id}
                      </EntityLink>
                      <span className="text-muted-foreground">
                        {p.source.institution.nameDe} · {p.source.date}
                      </span>
                      <span className="num ml-auto font-mono text-[11px] text-muted-foreground">
                        {t.archive.semanticMatch} {p.similarity.toFixed(2)}
                      </span>
                    </div>
                    <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                      <MaskedText text={p.text} maskedLabel={t.archive.detail.masked} />
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </article>

        <aside className="space-y-4 lg:sticky lg:top-[66px] lg:self-start">
          <section className="rounded-2xl border bg-card p-4">
            <h2 className="mb-3 text-sm font-medium">{t.archive.detail.meta}</h2>
            <dl className="grid grid-cols-[max-content_minmax(0,1fr)] items-baseline gap-x-4 gap-y-2 text-sm [&>dd]:min-w-0 [&>dd]:break-words">
              <dt className="text-muted-foreground">{t.archive.detail.date}</dt>
              <dd className="font-mono text-xs">
                {s.date}
                {s.datePrecision && s.datePrecision !== "day" ? (
                  <span className="ml-1 font-sans text-muted-foreground">
                    (
                    {lang === "de"
                      ? s.datePrecision === "month"
                        ? "Monat"
                        : "Jahr"
                      : s.datePrecision}
                    )
                  </span>
                ) : null}
              </dd>
              {s.outlet ? (
                <>
                  <dt className="text-muted-foreground">{t.archive.detail.outlet}</dt>
                  <dd>{s.outlet}</dd>
                </>
              ) : null}
              {s.legalRef ? (
                <>
                  <dt className="text-muted-foreground">{t.archive.detail.legalRef}</dt>
                  <dd className="font-mono text-xs">{s.legalRef}</dd>
                </>
              ) : null}
              {d.draftLaw ? (
                <>
                  <dt className="text-muted-foreground">{t.archive.detail.draftLaw}</dt>
                  <dd>
                    <EntityLink type="draft_law" id={d.draftLaw}>
                      {reg?.title ?? draftLawLabel(d.draftLaw)}
                    </EntityLink>
                    {reg ? (
                      <div>
                        <EntityLink
                          type="episode"
                          id={reg.episode_id}
                          className="font-mono text-[11px]"
                        >
                          {reg.episode_id}
                        </EntityLink>
                      </div>
                    ) : null}
                  </dd>
                </>
              ) : null}
              {law ? (
                <>
                  <dt className="text-muted-foreground">
                    {de ? "In Kraft seit" : "In force since"}
                  </dt>
                  <dd className="font-mono text-xs">
                    {law.validFrom}
                    {law.validTo ? ` ${de ? "bis" : "until"} ${law.validTo}` : ""}
                  </dd>
                  <dt className="text-muted-foreground">{de ? "Fassung" : "Version"}</dt>
                  <dd className="text-xs">
                    {law.amendedBy ?? law.promulgation}
                    <div className="text-muted-foreground">
                      {de ? "abgerufen" : "retrieved"} {law.retrievedAt}
                    </div>
                  </dd>
                  <dt className="text-muted-foreground">{de ? "Versionen" : "Versions"}</dt>
                  <dd className="text-xs">
                    <details>
                      <summary className="cursor-pointer">
                        {law.versions.length} {de ? "Fassungen im RIS" : "versions in RIS"}
                      </summary>
                      <ol className="mt-1 space-y-0.5 font-mono text-[11px]">
                        {[...law.versions].reverse().map((v) => (
                          <li key={v.risId}>
                            {v.validFrom}
                            {v.validTo ? ` ${de ? "bis" : "to"} ${v.validTo}` : ""}
                            {v.amendedBy ? ` · ${v.amendedBy}` : ""}
                          </li>
                        ))}
                      </ol>
                    </details>
                  </dd>
                </>
              ) : null}
              <dt className="text-muted-foreground">{t.archive.facets.licence}</dt>
              <dd>{pick(t.archive.licences, d.licenceLabel)}</dd>
              <dt className="text-muted-foreground">{t.archive.detail.corpusRevision}</dt>
              <dd className="font-mono text-xs">{s.corpusRevision}</dd>
              <dt className="text-muted-foreground">CON-1/2</dt>
              <dd className="text-xs">
                {lang === "de" ? "Personennamen maskiert" : "Person names masked"}
              </dd>
            </dl>
          </section>
          <section className="rounded-2xl border bg-card p-4">
            <h2 className="mb-1 text-sm font-medium">{t.archive.detail.trainedOn}</h2>
            <p className="text-sm text-muted-foreground">{t.archive.detail.trainedOnNone}</p>
          </section>
          <Backlinks type="source" id={s.id} lang={lang} title={t.archive.detail.usedIn} />
        </aside>
      </div>
    </Page>
  );
}
