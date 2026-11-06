import Link from "next/link";
import type { ReactNode } from "react";
import { pickArms } from "@/components/models/arms";
import { Meta, Section } from "@/components/shell/page";
import { FamilyDot, runLabel } from "@/components/topics/family";
import { topicT } from "@/components/topics/messages";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  adapterVersions,
  adapterWins,
  bestApproach,
  KIND_ORDER,
  type KindKey,
  stanceArms,
} from "@/lib/overview";
import type { Overview } from "@/lib/overview-data";
import { cn } from "@/lib/utils";
import funnel from "../../../../press/derived/archive_funnel.json";
import { type ArmRow, SourcesByYear, StanceArms, type YearRow } from "./charts";
import { overviewT } from "./messages";

type Lang = "de" | "en";

// Home page overview (docs/ui-simplification.md): four section cards below the scenarios,
// each with three to five tiles or one small chart. Every number comes from Overview; a
// missing source hides its tile instead of showing a placeholder figure.

function formats(lang: Lang) {
  const locale = lang === "de" ? "de-AT" : "en-GB";
  const int = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const compact = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
  const money = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  return {
    int: (n: number) => int.format(n),
    compact: (n: number) => (n >= 10_000 ? compact.format(n) : int.format(n)),
    pct: (x: number) => `${int.format(Math.round(x * 100))} %`,
    /** Floored, for shares that must not read as complete before they are. */
    pctFloor: (x: number) => `${int.format(Math.floor(x * 100))} %`,
    usd: (n: number) => `${money.format(Math.round(n))} USD`,
  };
}

function Tile({
  label,
  children,
  sub,
}: {
  label: ReactNode;
  children: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="num mt-1 text-2xl font-semibold tracking-tight">{children}</dd>
      {sub ? <dd className="num mt-0.5 text-xs text-muted-foreground">{sub}</dd> : null}
    </div>
  );
}

function Tiles({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3", className)}>{children}</dl>
  );
}

function Links({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-1">{children}</div>;
}

function LinkButton({
  href,
  children,
  external = false,
}: {
  href: string;
  children: ReactNode;
  external?: boolean;
}) {
  return (
    <Button asChild variant="ghost" size="sm">
      {external ? (
        <a href={href} target="_blank" rel="noreferrer noopener">
          {children}
        </a>
      ) : (
        <Link href={href}>{children}</Link>
      )}
    </Button>
  );
}

export function OverviewSection({ data, lang }: { data: Overview; lang: Lang }) {
  const t = overviewT(lang);
  return (
    <Section variant="plain" title={t.title}>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <DataCard data={data} lang={lang} />
        <ModelsCard data={data} lang={lang} />
        <ForecastCard data={data} lang={lang} />
        <SimulationCard data={data} lang={lang} />
      </div>
    </Section>
  );
}

function DataCard({ data, lang }: { data: Overview; lang: Lang }) {
  const t = overviewT(lang).data;
  const f = formats(lang);
  const a = data.archive;
  const rows: YearRow[] = a.perYear.map((y) => {
    const row: YearRow = { year: y.year, stellungnahme: 0, press: 0, law: 0, other: 0 };
    for (const [kind, n] of Object.entries(y.kinds)) {
      const k = (KIND_ORDER as readonly string[]).includes(kind) ? (kind as KindKey) : "other";
      row[k] += n;
    }
    return row;
  });
  return (
    <Section
      title={t.title}
      action={
        <Links>
          <LinkButton href="/archive">{t.archive}</LinkButton>
          <LinkButton href="/archive/presse">{t.press_browser}</LinkButton>
        </Links>
      }
      bodyClassName="space-y-6"
    >
      <Tiles>
        <Tile label={t.stellungnahme}>{f.int(a.kinds.stellungnahme ?? 0)}</Tile>
        <Tile label={t.press}>{f.int(a.kinds.press ?? 0)}</Tile>
        {data.pressPages > 0 ? <Tile label={t.pressPages}>{f.int(data.pressPages)}</Tile> : null}
        {(a.kinds.law ?? 0) > 0 ? <Tile label={t.law}>{f.int(a.kinds.law ?? 0)}</Tile> : null}
        <Tile label={t.embedded} sub={`${f.int(a.embedded)} / ${f.int(a.segments)}`}>
          {a.segments ? f.pctFloor(a.embedded / a.segments) : "0 %"}
        </Tile>
        {a.years ? <Tile label={t.years}>{t.yearsRange(a.years.min, a.years.max)}</Tile> : null}
      </Tiles>
      {rows.length ? <SourcesByYear rows={rows} labels={t.kinds} title={t.chart} /> : null}
      <PressFunnel lang={lang} />
      {a.backend === "file" ? <Meta>{t.fileBackend}</Meta> : null}
    </Section>
  );
}

function ModelsCard({ data, lang }: { data: Overview; lang: Lang }) {
  const t = overviewT(lang).models;
  const f = formats(lang);
  const versions = adapterVersions(data.fidelity);
  const best = bestApproach(data.fidelity);
  const pick = pickArms(data.fidelity);
  const wins = pick ? adapterWins(pick.adapter[1]) : null;
  const arms: ArmRow[] = stanceArms(data.fidelity).map((a) => ({
    key: a.key,
    label:
      a.kind === "base"
        ? t.arm.base
        : a.kind === "adapter"
          ? t.arm.adapter(a.key)
          : t.arm.context(
              a.key.startsWith("card-") ? "card" : "dossier",
              a.key.replace(/^(dossier|card)-/, ""),
            ),
    value: Math.round(a.sign * 100),
    highlight: a.kind === "context",
  }));
  return (
    <Section
      title={t.title}
      action={
        <Links>
          <LinkButton href="/models">{t.link}</LinkButton>
          <LinkButton href="https://huggingface.co/Aryt3" external>
            {t.hf}
          </LinkButton>
        </Links>
      }
      bodyClassName="space-y-6"
    >
      {data.fidelity ? (
        <>
          <Tiles>
            {versions.length ? (
              <Tile label={t.adapters} sub={t.perVersion(versions)}>
                {f.int(versions.reduce((n, v) => n + v.adapters, 0))}
              </Tile>
            ) : null}
            {best ? (
              <Tile
                label={t.best}
                sub={`${t.stance} ${best.sign === null ? "?" : f.pct(best.sign)}, ${t.inCharacter} ${best.char === null ? "?" : f.pct(best.char)}`}
              >
                <span className="text-lg leading-tight">{t.approach(best.prompt, best.model)}</span>
              </Tile>
            ) : null}
            {pick && wins ? (
              <Tile label={t.wins(pick.adapter[0])} sub={t.winsSub}>
                {t.winsValue(wins.wins, wins.of)}
              </Tile>
            ) : null}
          </Tiles>
          {arms.length ? <StanceArms rows={arms} title={t.chart} /> : null}
        </>
      ) : (
        <Meta>{t.missing}</Meta>
      )}
    </Section>
  );
}

function ForecastCard({ data, lang }: { data: Overview; lang: Lang }) {
  const t = overviewT(lang).forecast;
  const f = formats(lang);
  const fc = data.forecast;
  const bt = data.backtest;
  return (
    <Section
      title={t.title}
      action={
        <Links>
          <LinkButton href="/method">{t.link}</LinkButton>
        </Links>
      }
      bodyClassName="space-y-6"
    >
      {fc ? (
        <Tiles>
          <Tile
            label={t.drafts}
            sub={fc.years ? t.draftYears(fc.years.min, fc.years.max) : undefined}
          >
            {f.int(fc.drafts)}
          </Tile>
          <Tile label={t.episodes} sub={t.episodesOf(fc.episodes)}>
            {f.int(fc.labelled)}
          </Tile>
          {fc.scored > 0 ? (
            <Tile label={t.enacted} sub={t.enactedOf(fc.enacted, fc.scored)}>
              {f.pct(fc.enacted / fc.scored)}
            </Tile>
          ) : null}
          {fc.verdict ? (
            <Tile label={t.verdict}>
              <span className="text-lg leading-tight">
                {t.verdictText[fc.verdict] ?? fc.verdict}
              </span>
            </Tile>
          ) : null}
          {bt ? (
            <Tile label={t.backtest} sub={t.backtestSub}>
              <span className="text-lg leading-tight">{t.backtestValue(bt.softer, bt.of)}</span>
            </Tile>
          ) : null}
        </Tiles>
      ) : (
        <Meta>{t.missing}</Meta>
      )}
    </Section>
  );
}

function SimulationCard({ data, lang }: { data: Overview; lang: Lang }) {
  const t = overviewT(lang).sim;
  const f = formats(lang);
  const s = data.simulation;
  const fam = topicT(lang).fam;
  const tt = topicT(lang);
  const r = data.ranking;
  return (
    <Section
      title={t.title}
      action={
        r ? (
          <Links>
            <LinkButton href={`/scenarios/${encodeURIComponent(r.scenarioKey)}?tab=modelle`}>
              {t.rankLink}
            </LinkButton>
          </Links>
        ) : undefined
      }
      bodyClassName="space-y-6"
    >
      <Tiles>
        <Tile label={t.runs} sub={t.completed(s.completed)}>
          {f.int(s.runs)}
        </Tile>
        <Tile label={t.families} sub={s.families.map((x) => fam[x] ?? x).join(", ")}>
          {f.int(s.families.length)}
        </Tile>
        <Tile label={t.calls}>{f.int(s.calls)}</Tile>
        <Tile label={t.tokens}>{f.compact(s.tokens)}</Tile>
        {s.costUsd !== null ? (
          <Tile label={t.cost} sub={t.costSub}>
            {f.usd(s.costUsd)}
          </Tile>
        ) : null}
        {s.quality !== null ? (
          <Tile label={t.quality} sub={t.qualitySub(s.audited)}>
            {f.pct(s.quality)}
          </Tile>
        ) : null}
      </Tiles>
      {r ? (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">{t.rank}</div>
          <ol className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            {r.rows.map(({ rank, run, tier }) => (
              <li key={run.id} className="flex items-start gap-1.5 leading-6">
                <span className="num w-4 shrink-0 text-right text-xs leading-6 text-muted-foreground">
                  {rank}
                </span>
                <FamilyDot family={run.seatFamilies} className="mt-2" />
                <span className="min-w-0">
                  {runLabel(run, tt)}{" "}
                  <Badge
                    variant="outline"
                    className={cn(
                      "ml-1 align-middle font-normal text-muted-foreground",
                      tier === "far" && "font-medium text-foreground",
                    )}
                  >
                    {t.tier[tier]}
                  </Badge>
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </Section>
  );
}

/**
 * Every page of the press archive was searched; this strip shows how the 223,909 pages
 * narrow down to the person-free institution positions the agents use.
 */
function PressFunnel({ lang }: { lang: Lang }) {
  const t = overviewT(lang).data.funnel;
  const f = formats(lang);
  const n = funnel;
  const steps: Array<[string, number]> = [
    [t.pages, n.pages],
    [t.hits, n.institutionPageHits],
    [t.candidates, n.candidates],
    [t.evaluated, n.evaluated],
    [t.positions, n.positions],
  ];
  return (
    <div className="space-y-3 border-t pt-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm font-medium">{t.title}</div>
        <Meta>
          {f.int(n.editions)} {t.editions} · {t.range(n.from.slice(0, 4), n.to.slice(0, 4))}
        </Meta>
      </div>
      <ol className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {steps.map(([label, value], i) => (
          <li key={label} className="rounded-xl border bg-muted/30 p-3">
            <div className="num text-lg font-semibold">{f.int(value)}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
            {i > 0 ? (
              <div className="mt-1 h-1 rounded bg-muted">
                <div
                  className="h-1 rounded bg-foreground/60"
                  style={{ width: `${Math.max(2, Math.sqrt(value / n.pages) * 100)}%` }}
                />
              </div>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
