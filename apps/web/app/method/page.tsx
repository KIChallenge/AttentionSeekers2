import Link from "next/link";
import type { ReactNode } from "react";
import { loadMethodNote } from "@/components/method/note.server";
import { REFERENCE_GROUPS } from "@/components/method/references";
import { methodT } from "@/components/method/strings";
import { Page, PageHead, SectionHead } from "@/components/shell/page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { serverPrefs } from "@/lib/server-prefs";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type T = ReturnType<typeof methodT>;

function Section({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <SectionHead title={title} description={sub} />
      {children}
    </section>
  );
}

/** A measured value, or an explicit "not measured yet" marker (CON-4: gaps stay visible). */
function Val({ v, t, fmt }: { v: number | null; t: T; fmt?: (n: number) => string }) {
  if (v === null) {
    return <span className="text-xs text-muted-foreground italic">{t.notMeasured}</span>;
  }
  return <span className="font-mono tabular-nums">{fmt ? fmt(v) : v}</span>;
}

function Flag({ v, t }: { v: boolean | null; t: T }) {
  if (v === null) {
    return <span className="text-xs text-muted-foreground italic">{t.notMeasured}</span>;
  }
  return v ? (
    <Badge variant="secondary">{t.yes}</Badge>
  ) : (
    <Badge variant="destructive">{t.no}</Badge>
  );
}

// /method (W-25): method note, model palette with NFR-10 smoke results, inherited-vs-built
// boundary (CON-6), data sources and licences, limits (FR-J5, FR-J14).
export default async function MethodPage() {
  const { lang } = await serverPrefs();
  const t = methodT(lang);
  const load = await loadMethodNote();
  const note = load.ok ? load.note : null;
  const nf = new Intl.NumberFormat(lang === "de" ? "de-AT" : "en-GB", {
    maximumFractionDigits: 3,
  });

  return (
    <Page>
      <PageHead title={t.title} sub={t.sub} />
      <div className="space-y-12">
        <Section title={t.claims.title}>
          <div className="grid gap-3 md:grid-cols-3">
            {t.claims.items.map((c) => (
              <article
                key={c.name}
                className={cn(
                  "flex flex-col gap-2 rounded-2xl border bg-card p-4",
                  c.tone === "open" && "border-dashed",
                )}
              >
                <div className="font-medium">{c.name}</div>
                <p className="text-sm text-muted-foreground">{c.how}</p>
                <Badge variant={c.tone === "open" ? "outline" : "secondary"} className="mt-auto">
                  {c.state}
                </Badge>
              </article>
            ))}
          </div>
        </Section>

        <Section title={t.approach.title}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {t.approach.items.map((a) => (
              <article key={a.name} className="rounded-2xl border bg-card p-4">
                <div className="mb-1 font-medium">{a.name}</div>
                <p className="text-sm leading-relaxed text-muted-foreground">{a.text}</p>
              </article>
            ))}
          </div>
        </Section>

        {load.ok ? null : (
          <Alert variant="destructive">
            <AlertTitle>{t.fileError}</AlertTitle>
            <AlertDescription>
              <span className="font-mono">{load.file}</span>: {load.reason}
            </AlertDescription>
          </Alert>
        )}

        {note ? (
          <>
            <Section title={t.palette.title} sub={t.palette.sub}>
              <div className="rounded-2xl border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t.palette.model}</TableHead>
                      <TableHead>{t.palette.family}</TableHead>
                      <TableHead>{t.palette.roles}</TableHead>
                      <TableHead>{t.palette.streaming}</TableHead>
                      <TableHead>{t.palette.structured}</TableHead>
                      <TableHead>{t.palette.reasoning}</TableHead>
                      <TableHead className="text-right">{t.palette.latency}</TableHead>
                      <TableHead className="text-right">{t.palette.concession}</TableHead>
                      <TableHead>{t.palette.checked}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {note.palette.map((m, i) => (
                      <TableRow key={m.model ?? `slot-${i}`}>
                        <TableCell className="font-mono text-xs">
                          {m.model ?? (
                            <span className="font-sans text-muted-foreground italic">
                              {t.notSet}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>{m.family ?? "?"}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {m.roles.map((r) => (
                              <Badge key={r} variant="outline">
                                {t.palette.roleNames[r] ?? r}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Flag v={m.smoke.streaming} t={t} />
                        </TableCell>
                        <TableCell>
                          <Flag v={m.smoke.structuredOutput} t={t} />
                        </TableCell>
                        <TableCell>
                          <Flag v={m.smoke.reasoningField} t={t} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Val v={m.smoke.latencyMs} t={t} fmt={(n) => `${nf.format(n)} ms`} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Val v={m.concessionBaseline} t={t} fmt={nf.format} />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {m.smoke.checkedAt ?? "?"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Section>

            <Section title={t.run.title}>
              <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
                <article className="space-y-2 rounded-2xl border bg-card p-4 text-sm">
                  <div className="font-mono text-xs">{note.referenceRun.runId}</div>
                  <dl className="grid grid-cols-[8rem_1fr] gap-y-1">
                    <dt className="text-muted-foreground">{t.run.models}</dt>
                    <dd className="font-mono text-xs">{note.referenceRun.models.join(", ")}</dd>
                    <dt className="text-muted-foreground">{t.run.rounds}</dt>
                    <dd>
                      <Val v={note.referenceRun.rounds} t={t} />
                    </dd>
                    <dt className="text-muted-foreground">{t.run.utterances}</dt>
                    <dd>
                      <Val v={note.referenceRun.utterances} t={t} />
                    </dd>
                  </dl>
                  <Link
                    href={`/runs/${encodeURIComponent(note.referenceRun.runId)}`}
                    className="inline-block text-sm underline"
                  >
                    {t.run.open}
                  </Link>
                </article>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {(
                    Object.keys(t.run.claimStates) as Array<
                      keyof typeof note.referenceRun.claims & keyof T["run"]["claimStates"]
                    >
                  ).map((k) => (
                    <div key={k} className="rounded-2xl border bg-card p-4">
                      <div className="text-xs text-muted-foreground">{t.run.claimStates[k]}</div>
                      <div className="mt-1 text-xl">
                        <Val v={note.referenceRun.claims[k]} t={t} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Section>

            <Section title={t.forecast.title} sub={t.forecast.labelSource}>
              <div className="grid gap-3 lg:grid-cols-3">
                <article className="rounded-2xl border bg-card p-4 text-sm">
                  <div className="mb-2 font-medium">{t.forecast.registry}</div>
                  <dl className="grid grid-cols-[1fr_auto] gap-y-1">
                    <dt className="text-muted-foreground">{t.forecast.drafts}</dt>
                    <dd>
                      <Val v={note.forecast.registry.drafts} t={t} />
                    </dd>
                    <dt className="text-muted-foreground">{t.forecast.episodes}</dt>
                    <dd>
                      <Val v={note.forecast.registry.episodes} t={t} />
                    </dd>
                    {Object.entries(note.forecast.registry.labels).map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="pl-3 text-muted-foreground">{t.forecast.labels[k] ?? k}</dt>
                        <dd className="font-mono tabular-nums">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {t.forecast.asOf} {note.forecast.registry.asOf}
                  </div>
                </article>
                <article className="rounded-2xl border bg-card p-4 text-sm">
                  <div className="mb-2 font-medium">{t.forecast.brier}</div>
                  <dl className="grid grid-cols-[1fr_auto] gap-y-1">
                    <dt className="text-muted-foreground">{t.forecast.brierRc}</dt>
                    <dd>
                      <Val v={note.forecast.brier.referenceClass} t={t} fmt={nf.format} />
                    </dd>
                    <dt className="text-muted-foreground">{t.forecast.brierSq}</dt>
                    <dd>
                      <Val v={note.forecast.brier.statusQuo} t={t} fmt={nf.format} />
                    </dd>
                    <dt className="text-muted-foreground">{t.forecast.brierN}</dt>
                    <dd>
                      <Val v={note.forecast.brier.nEpisodes} t={t} />
                    </dd>
                  </dl>
                </article>
                <article className="space-y-3 rounded-2xl border bg-card p-4 text-sm">
                  <div>
                    <div className="mb-1 font-medium">{t.forecast.ablation}</div>
                    <p className="text-muted-foreground">
                      {note.forecast.ablationVerdict?.[lang] ?? t.forecast.ablationPending}
                    </p>
                  </div>
                  <div>
                    <div className="mb-1 font-medium">{t.forecast.regime}</div>
                    <p className="text-muted-foreground">{note.forecast.regimeCaveat[lang]}</p>
                  </div>
                </article>
              </div>
            </Section>

            <Section title={`${t.backtest.title}: ${note.backtest.case}`} sub={t.backtest.scoring}>
              <div className="grid gap-3 md:grid-cols-2">
                <article className="rounded-2xl border bg-card p-4 text-sm">
                  <div className="mb-1 flex items-center gap-2 font-medium">
                    {t.backtest.hypothesis}
                    <Badge variant="outline">{t.backtest.status[note.backtest.status]}</Badge>
                  </div>
                  <p className="text-muted-foreground">{note.backtest.hypothesis[lang]}</p>
                </article>
                <article
                  className={cn(
                    "rounded-2xl border bg-card p-4 text-sm",
                    !note.backtest.result && "border-dashed",
                  )}
                >
                  <div className="mb-1 font-medium">{t.backtest.result}</div>
                  <p className="text-muted-foreground">
                    {note.backtest.result?.[lang] ?? t.notMeasured}
                  </p>
                  {note.backtest.runs?.length ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {note.backtest.runs.map((id) => (
                        <Badge key={id} variant="outline" asChild>
                          <Link href={`/runs/${encodeURIComponent(id)}`} className="font-mono">
                            {id}
                          </Link>
                        </Badge>
                      ))}
                      {note.backtest.doc ? (
                        <span className="font-mono text-xs text-muted-foreground">
                          {note.backtest.doc}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              </div>
            </Section>
          </>
        ) : null}

        <Section title={t.boundary.title} sub={t.boundary.sentence}>
          <div className="grid gap-3 md:grid-cols-2">
            <BoundaryList title={t.boundary.inherited} items={t.boundary.inheritedItems} muted />
            <BoundaryList title={t.boundary.built} items={t.boundary.builtItems} />
          </div>
          <p className="text-xs text-muted-foreground">{t.boundary.licence}</p>
        </Section>

        <Section title={t.sources.title}>
          <div className="rounded-2xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.sources.source}</TableHead>
                  <TableHead>{t.sources.use}</TableHead>
                  <TableHead>{t.sources.licence}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {t.sources.rows.map((r) => (
                  <TableRow key={r.source}>
                    <TableCell className="font-medium whitespace-normal">{r.source}</TableCell>
                    <TableCell className="whitespace-normal">{r.use}</TableCell>
                    <TableCell className="whitespace-normal text-muted-foreground">
                      {r.licence}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Section>

        <Section title={t.refs.title}>
          <div className="grid gap-3 md:grid-cols-2">
            {REFERENCE_GROUPS.map((g) => (
              <article key={g.name.de} className="rounded-2xl border bg-card p-4">
                <div className="mb-2 font-medium">{g.name[lang]}</div>
                <ul className="space-y-1.5 text-sm">
                  {g.papers.map((p) => (
                    <li key={p.url}>
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-2"
                      >
                        {p.cite}
                      </a>{" "}
                      <span className="text-muted-foreground">{p.title}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {t.refs.full} <span className="font-mono">docs/references.md</span>
          </p>
        </Section>

        <Section title={t.limits.title}>
          <ol className="max-w-4xl list-decimal space-y-1.5 pl-5 text-sm">
            {t.limits.items.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ol>
        </Section>

        <p className="text-xs text-muted-foreground">
          {t.fileNote} <span className="font-mono">{load.file}</span>
          {note ? ` (v${note.version}, ${t.updated} ${note.updatedAt})` : null}
        </p>
      </div>
    </Page>
  );
}

function BoundaryList({
  title,
  items,
  muted,
}: {
  title: string;
  items: string[];
  muted?: boolean;
}) {
  return (
    <article className={cn("rounded-2xl border p-4", muted ? "bg-muted/40" : "bg-card")}>
      <div className="mb-2 font-medium">{title}</div>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </article>
  );
}
