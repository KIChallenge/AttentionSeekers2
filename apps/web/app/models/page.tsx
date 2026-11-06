import { AGENT_CATALOG } from "@sv/contracts";
import type { ReactNode } from "react";
import { loadModelsData } from "@/components/models/data.server";
import { type Verdict, verdict } from "@/components/models/parse";
import { Playground } from "@/components/models/playground";
import { modelsT } from "@/components/models/strings";
import { Page, PageHead, SectionHead } from "@/components/shell/page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { levelRank } from "@/lib/prefs";
import { serverPrefs } from "@/lib/server-prefs";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function Section({
  title,
  sub,
  id,
  children,
}: {
  title: string;
  sub?: string;
  id?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 space-y-4">
      <SectionHead title={title} description={sub} />
      {children}
    </section>
  );
}

// One accent per meaning: success when training helped, destructive when it hurt, quiet
// for a tie. The same tone is used on the badges, the "for whom" strip and the deltas.
const verdictClass: Record<Verdict, string> = {
  better: "border-success/30 bg-success/10 text-success",
  worse: "border-destructive/30 bg-destructive/10 text-destructive",
  tie: "border-border text-muted-foreground",
};
const deltaClass = (d: number | null) =>
  d === null
    ? "text-muted-foreground"
    : d > 0.05
      ? "text-success"
      : d < -0.05
        ? "text-destructive"
        : "text-muted-foreground";

// /models: the persona-model track as a measured experiment (FR-C1 to C6). Numbers come
// from models/out/eval_sagemaker.md, persona_fidelity.json, cards/classifier_report.md and
// the README cost table at request time.
export default async function ModelsPage() {
  const { lang, level } = await serverPrefs();
  const t = modelsT(lang);
  const rank = levelRank[level];
  const d = await loadModelsData();
  const loc = lang === "de" ? "de-AT" : "en-GB";
  const f2 = new Intl.NumberFormat(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const f0 = new Intl.NumberFormat(loc);
  const fmt = (v: number | null | undefined, f = f2) =>
    v === null || v === undefined ? "?" : f.format(v);
  const signed = (v: number | null) =>
    v === null ? "?" : `${v > 0 ? "+" : v < 0 ? "−" : "±"}${f2.format(Math.abs(v))}`;
  const roleName = (role: string) => {
    const a = AGENT_CATALOG.find((x) => x.role === role);
    return a ? (lang === "de" ? a.nameDe : a.glossEn) : role;
  };
  const roleCode = (role: string) => AGENT_CATALOG.find((x) => x.role === role)?.code ?? "";
  const roleColor = (role: string) => AGENT_CATALOG.find((x) => x.role === role)?.color;

  // Per-institution rows: the JSON is authoritative for in-character and stance sign, the
  // markdown adds within-one-step, sizes and losses.
  const rows = (d.eval?.rows ?? []).map((r) => {
    const fid = d.fidelity?.institutions[r.role];
    const tr = d.eval?.training.find((x) => x.role === r.role);
    const a = fid?.adapter ?? r.inCharAdapter;
    const b = fid?.baseline ?? r.inCharBase;
    const sa = fid?.stance_sign_adapter ?? r.signAdapter;
    const sb = fid?.stance_sign_baseline ?? r.signBase;
    const v = verdict(a, b);
    const stance =
      sa === null || sb === null
        ? "same"
        : sa - sb > 0.05
          ? "more"
          : sb - sa > 0.05
            ? "less"
            : "same";
    const delta = a !== null && b !== null ? a - b : null;
    return { ...r, a, b, sa, sb, v, delta, stance: stance as "more" | "less" | "same", tr };
  });
  const order: Record<Verdict, number> = { better: 0, tie: 1, worse: 2 };
  rows.sort(
    (x, y) =>
      order[x.v ?? "tie"] - order[y.v ?? "tie"] ||
      (y.a ?? 0) - (y.b ?? 0) - ((x.a ?? 0) - (x.b ?? 0)),
  );
  const wins = rows.filter((r) => r.v === "better").length;
  const all = d.eval?.all;
  const allA = d.fidelity?.all.adapter ?? all?.inCharAdapter ?? null;
  const allB = d.fidelity?.all.baseline ?? all?.inCharBase ?? null;
  const allV = verdict(allA, allB);
  const loops = d.eval?.loops;
  const versions = Object.entries(d.fidelity?.versions ?? {});
  const versionRoles = versions.length
    ? Object.keys(versions[0][1].institutions).sort((x, y) =>
        roleName(x).localeCompare(roleName(y)),
      )
    : [];
  const institutions = rows.map((r) => ({
    role: r.role,
    name: roleName(r.role),
    code: roleCode(r.role),
    verdict: r.v,
  }));
  const kpis = [
    { label: t.verdict.kpis.inChar, a: allA, b: allB },
    { label: t.verdict.kpis.sign, a: all?.signAdapter ?? null, b: all?.signBase ?? null },
    { label: t.verdict.kpis.within1, a: all?.within1Adapter ?? null, b: all?.within1Base ?? null },
  ];
  const groups: Verdict[] = ["better", "tie", "worse"];

  return (
    <Page>
      <PageHead
        title={t.title}
        sub={rank >= 1 ? t.sub : undefined}
        actions={
          <>
            <Button asChild variant="outline">
              <a href="#playground">{t.verdict.tryIt}</a>
            </Button>
            <Button asChild variant="outline">
              <a href={t.hf.link} target="_blank" rel="noreferrer">
                {t.hf.linkLabel} ↗
              </a>
            </Button>
          </>
        }
      />
      <div className="space-y-12">
        {d.missing.length ? (
          <Alert variant="destructive">
            <AlertTitle>{t.missing}</AlertTitle>
            <AlertDescription className="font-mono text-xs">
              {d.missing.join(", ")}
            </AlertDescription>
          </Alert>
        ) : null}

        <section className="space-y-4 rounded-2xl border bg-card p-5">
          <div className="text-xs tracking-wide text-muted-foreground uppercase">
            {t.verdict.title}
          </div>
          <p className="max-w-4xl text-lg leading-snug">{t.verdict.text(wins, rows.length)}</p>
          <p className="max-w-4xl text-sm text-muted-foreground">{t.verdict.decision}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {kpis.map((k) => {
              const delta = k.a !== null && k.b !== null ? k.a - k.b : null;
              return (
                <div key={k.label} className="rounded-xl border p-3">
                  <div className="text-xs text-muted-foreground">{k.label}</div>
                  <div className="num mt-1 flex flex-wrap items-baseline gap-x-2 tabular-nums">
                    <span
                      className={cn("text-xl", (k.a ?? 0) < (k.b ?? 0) && "text-muted-foreground")}
                    >
                      {fmt(k.a)}
                    </span>
                    <span className="text-xs text-muted-foreground">{t.verdict.adapter}</span>
                    <span
                      className={cn("text-xl", (k.b ?? 0) < (k.a ?? 0) && "text-muted-foreground")}
                    >
                      {fmt(k.b)}
                    </span>
                    <span className="text-xs text-muted-foreground">{t.verdict.base}</span>
                    <span
                      className={cn("ml-auto text-xs", deltaClass(delta))}
                      title={t.verdict.delta}
                    >
                      {signed(delta)}
                    </span>
                  </div>
                </div>
              );
            })}
            <div className="rounded-xl border p-3">
              <div className="text-xs text-muted-foreground">{t.verdict.kpis.loops}</div>
              <div className="num mt-1 text-xl tabular-nums">
                {loops ? `${loops.n} ${t.verdict.of} ${loops.of}` : "?"}
              </div>
            </div>
          </div>
          {rows.length ? (
            <div className="space-y-1.5 border-t pt-3">
              <div className="text-xs text-muted-foreground">{t.verdict.forWhom}</div>
              <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                {groups.map((g) => {
                  const list = rows.filter((r) => r.v === g);
                  if (!list.length) return null;
                  return (
                    <div key={g} className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className={verdictClass[g]}>
                        {t.table.verdicts[g]} · {list.length}
                      </Badge>
                      {list.map((r) => (
                        <span
                          key={r.role}
                          className="inline-flex items-center gap-1.5 text-sm"
                          title={`${t.table.inChar} ${fmt(r.a)} / ${fmt(r.b)}`}
                        >
                          <span
                            className="inline-block size-2 rounded-full"
                            style={{ background: roleColor(r.role) }}
                          />
                          {roleName(r.role)}
                        </span>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </section>

        <Section title={t.table.title} sub={rank >= 1 ? t.table.sub : undefined}>
          <div className="rounded-2xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.table.institution}</TableHead>
                  {rank >= 2 ? (
                    <>
                      <TableHead className="text-right">{t.table.train}</TableHead>
                      <TableHead className="text-right">{t.table.heldout}</TableHead>
                      <TableHead className="text-right">{t.table.trainLoss}</TableHead>
                      <TableHead className="text-right">{t.table.seconds}</TableHead>
                      <TableHead className="text-right">{t.table.evalLoss}</TableHead>
                    </>
                  ) : null}
                  <TableHead className="text-right">
                    {t.table.inChar} {t.table.adapter} / {t.table.base}
                  </TableHead>
                  {rank >= 1 ? (
                    <>
                      <TableHead className="text-right">
                        {t.table.sign} {t.table.adapter} / {t.table.base}
                      </TableHead>
                      <TableHead className="text-right">
                        {t.table.within1} {t.table.adapter} / {t.table.base}
                      </TableHead>
                    </>
                  ) : null}
                  <TableHead>{t.table.verdict}</TableHead>
                  <TableHead>{t.table.note}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.role}>
                    <TableCell className="font-medium whitespace-nowrap">
                      <span
                        className="mr-2 inline-block size-2 rounded-full align-middle"
                        style={{ background: roleColor(r.role) }}
                      />
                      {roleName(r.role)}
                      {rank >= 2 ? (
                        <span className="ml-2 font-mono text-xs text-muted-foreground">
                          sv-{r.role}
                        </span>
                      ) : null}
                    </TableCell>
                    {rank >= 2 ? (
                      <>
                        <Num>{fmt(r.tr?.nTrain, f0)}</Num>
                        <Num>{fmt(r.tr?.nHeldout, f0)}</Num>
                        <Num>{fmt(r.tr?.trainLoss)}</Num>
                        <Num>{fmt(r.tr?.seconds, f0)}</Num>
                        <Num>{fmt(r.tr?.evalLoss)}</Num>
                      </>
                    ) : null}
                    <Pair
                      a={r.a}
                      b={r.b}
                      fmt={fmt}
                      delta={signed(r.delta)}
                      tone={deltaClass(r.delta)}
                    />
                    {rank >= 1 ? (
                      <>
                        <Pair a={r.sa} b={r.sb} fmt={fmt} />
                        <Pair a={r.within1Adapter} b={r.within1Base} fmt={fmt} />
                      </>
                    ) : null}
                    <TableCell>
                      {r.v ? (
                        <Badge variant="outline" className={verdictClass[r.v]}>
                          {t.table.verdicts[r.v]}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">
                          {t.notMeasured}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="min-w-[16rem] text-sm whitespace-normal text-muted-foreground">
                      {r.v ? t.table.noteText(r.v, r.stance) : null}
                    </TableCell>
                  </TableRow>
                ))}
                {all ? (
                  <TableRow className="bg-muted/40 font-medium">
                    <TableCell>{t.table.all}</TableCell>
                    {rank >= 2 ? (
                      <>
                        <Num>
                          {fmt(
                            d.eval?.training.reduce((s, x) => s + (x.nTrain ?? 0), 0),
                            f0,
                          )}
                        </Num>
                        <Num>{fmt(all.n, f0)}</Num>
                        <TableCell />
                        <TableCell />
                        <TableCell />
                      </>
                    ) : null}
                    <Pair
                      a={allA}
                      b={allB}
                      fmt={fmt}
                      delta={signed(allA !== null && allB !== null ? allA - allB : null)}
                      tone={deltaClass(allA !== null && allB !== null ? allA - allB : null)}
                    />
                    {rank >= 1 ? (
                      <>
                        <Pair a={all.signAdapter} b={all.signBase} fmt={fmt} />
                        <Pair a={all.within1Adapter} b={all.within1Base} fmt={fmt} />
                      </>
                    ) : null}
                    <TableCell>
                      {allV ? (
                        <Badge variant="outline" className={verdictClass[allV]}>
                          {t.table.verdicts[allV]}
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            {t.table.legend}. {rank >= 1 ? t.table.caveat : null}
          </p>
        </Section>

        <Section id="playground" title={t.playground.title} sub={t.playground.sub}>
          <Playground lang={lang} institutions={institutions} examples={d.examples} />
        </Section>

        {versions.length && rank >= 1 ? (
          <Section
            title={`${t.versions.title}: ${versions.map(([k]) => k).join(", ")}`}
            sub={t.versions.sub}
          >
            <div className="rounded-2xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead rowSpan={2} className="align-bottom">
                      {t.table.institution}
                    </TableHead>
                    <TableHead
                      colSpan={versions.length + 1}
                      className="border-l text-center font-medium text-foreground"
                    >
                      {t.versions.sign}
                    </TableHead>
                    <TableHead
                      colSpan={versions.length + 1}
                      className="border-l text-center font-medium text-foreground"
                    >
                      {t.versions.inChar}
                    </TableHead>
                  </TableRow>
                  <TableRow>
                    {versions.map(([k, v], i) => (
                      <TableHead key={`s-${k}`} className={cn("text-right", i === 0 && "border-l")}>
                        {v.label ?? k}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">{t.versions.base}</TableHead>
                    {versions.map(([k, v], i) => (
                      <TableHead key={`i-${k}`} className={cn("text-right", i === 0 && "border-l")}>
                        {v.label ?? k}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">{t.versions.base}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...versionRoles, "all"].map((role) => {
                    const pick = (v: (typeof versions)[number][1]) =>
                      role === "all" ? v.all : v.institutions[role];
                    const base = pick(versions[0][1]);
                    const signVals = [
                      ...versions.map(([, v]) => pick(v)?.stance_sign_adapter ?? null),
                      base?.stance_sign_baseline ?? null,
                    ];
                    const charVals = [
                      ...versions.map(([, v]) => pick(v)?.adapter ?? null),
                      base?.baseline ?? null,
                    ];
                    const bestOf = (xs: Array<number | null>) =>
                      Math.max(...xs.map((x) => x ?? Number.NEGATIVE_INFINITY));
                    const bestSign = bestOf(signVals);
                    const bestChar = bestOf(charVals);
                    return (
                      <TableRow
                        key={role}
                        className={role === "all" ? "bg-muted/40 font-medium" : undefined}
                      >
                        <TableCell className="whitespace-nowrap">
                          {role === "all" ? t.table.all : roleName(role)}
                        </TableCell>
                        {signVals.map((v, i) => (
                          <Num
                            // biome-ignore lint/suspicious/noArrayIndexKey: fixed column order
                            key={`s-${i}`}
                            className={cn(
                              i === 0 && "border-l",
                              v !== null && v === bestSign
                                ? "font-semibold"
                                : "text-muted-foreground",
                            )}
                          >
                            {fmt(v)}
                          </Num>
                        ))}
                        {charVals.map((v, i) => (
                          <Num
                            // biome-ignore lint/suspicious/noArrayIndexKey: fixed column order
                            key={`i-${i}`}
                            className={cn(
                              i === 0 && "border-l",
                              v !== null && v === bestChar
                                ? "font-semibold"
                                : "text-muted-foreground",
                            )}
                          >
                            {fmt(v)}
                          </Num>
                        ))}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {rank >= 2 ? (
              <p className="text-xs text-muted-foreground">
                {t.sources} <span className="font-mono">{t.versions.source}</span>
              </p>
            ) : null}
          </Section>
        ) : null}

        {rank >= 1 ? (
          <Section title={t.why.title}>
            <div className="grid gap-3 md:grid-cols-3">
              {t.why.items.map((i) => (
                <article key={i.name} className="rounded-2xl border bg-card p-4">
                  <div className="mb-1 font-medium">{i.name}</div>
                  <p className="text-sm leading-relaxed text-muted-foreground">{i.text}</p>
                </article>
              ))}
            </div>
          </Section>
        ) : null}

        {rank >= 1 ? (
          <Section title={t.pipeline.title}>
            <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {t.pipeline.steps.map((s, i) => (
                <li key={s.name} className="rounded-2xl border bg-card p-4">
                  <div className="mb-1 flex items-center gap-2 font-medium">
                    <span className="inline-grid size-5 place-items-center rounded-full border font-mono text-[11px]">
                      {i + 1}
                    </span>
                    {s.name}
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">{s.text}</p>
                </li>
              ))}
            </ol>
          </Section>
        ) : null}

        {d.classifier && rank >= 1 ? (
          <Section title={t.classifier.title} sub={t.classifier.sub}>
            <div className="grid gap-3 lg:grid-cols-[1fr_2fr]">
              <article className="space-y-3 rounded-2xl border bg-card p-4 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">{t.classifier.macro}</div>
                  <div className="num mt-1 text-3xl tabular-nums">
                    {fmt(d.classifier.macroF1.char)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t.classifier.chance} {fmt(1 / Math.max(1, d.classifier.perClass.length))},{" "}
                    {d.classifier.perClass.length} {t.classifier.classes}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {t.classifier.paragraphs}: {fmt(d.classifier.trainParagraphs, f0)}{" "}
                  {t.classifier.train}, {fmt(d.classifier.heldoutParagraphs, f0)}{" "}
                  {t.classifier.heldout}
                </div>
                <div>
                  <div className="mb-1 text-xs text-muted-foreground">{t.classifier.heads}</div>
                  <dl className="grid grid-cols-[1fr_auto] gap-y-1">
                    {(["char", "ensemble", "frozen", "setfit"] as const).map((k) => (
                      <div key={k} className="contents">
                        <dt>{t.classifier.headNames[k]}</dt>
                        <dd className="num tabular-nums">{fmt(d.classifier?.macroF1[k])}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <p className="text-muted-foreground">{t.classifier.reading}</p>
              </article>
              <article className="rounded-2xl border bg-card p-4 text-sm">
                <div className="mb-3 font-medium">{t.classifier.perClass}</div>
                <ul className="space-y-1.5">
                  {[...d.classifier.perClass]
                    .sort((x, y) => (y.f1 ?? 0) - (x.f1 ?? 0))
                    .map((c) => (
                      <li
                        key={c.role}
                        className="grid grid-cols-[11rem_1fr_3rem] items-center gap-3"
                      >
                        <span className="truncate" title={roleName(c.role)}>
                          {roleName(c.role)}
                        </span>
                        <span className="relative h-2 rounded-full bg-muted">
                          <span
                            className="absolute inset-y-0 left-0 rounded-full bg-foreground/70"
                            style={{ width: `${Math.round((c.f1 ?? 0) * 100)}%` }}
                          />
                        </span>
                        <span className="num text-right tabular-nums">{fmt(c.f1)}</span>
                      </li>
                    ))}
                </ul>
              </article>
            </div>
          </Section>
        ) : null}

        {d.infra && rank >= 1 ? (
          <Section title={t.infra.title}>
            <div className={cn("grid gap-3", rank >= 2 && "lg:grid-cols-[1fr_2fr]")}>
              {rank >= 2 ? (
                <article className="rounded-2xl border bg-card p-4 text-sm">
                  <dl className="grid grid-cols-[8rem_1fr] gap-y-1.5">
                    <dt className="text-muted-foreground">{t.infra.base}</dt>
                    <dd className="font-mono text-xs">Qwen/Qwen3-8B</dd>
                    <dt className="text-muted-foreground">{t.infra.job}</dt>
                    <dd className="font-mono text-xs break-all">
                      {d.infra.trainingJob ?? "?"}
                      <div className="font-sans text-muted-foreground">
                        {fmt(d.infra.billableSeconds, f0)} {t.infra.billable},{" "}
                        {fmt(d.infra.trainingUsd)} USD
                      </div>
                    </dd>
                    <dt className="text-muted-foreground">{t.infra.endpoint}</dt>
                    <dd className="font-mono text-xs break-all">{d.infra.endpoint ?? "?"}</dd>
                    <dt className="text-muted-foreground">{t.infra.instance}</dt>
                    <dd className="font-mono text-xs">{d.infra.instance ?? "?"}</dd>
                    <dt className="text-muted-foreground">{t.infra.region}</dt>
                    <dd className="font-mono text-xs">{d.infra.region ?? "?"}</dd>
                    <dt className="text-muted-foreground">{t.infra.serving}</dt>
                    <dd className="text-xs">{t.infra.servingText}</dd>
                  </dl>
                </article>
              ) : null}
              <div className="rounded-2xl border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t.infra.item}</TableHead>
                      <TableHead className="text-right">{t.infra.duration}</TableHead>
                      <TableHead className="text-right">{t.infra.usd}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.infra.costs.map((c) => (
                      <TableRow key={c.item} className={cn(c.total && "font-medium")}>
                        <TableCell className="whitespace-normal">{c.item}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{c.duration}</TableCell>
                        <TableCell className="num text-right whitespace-nowrap tabular-nums">
                          {c.usd}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="border-t px-4 py-2 text-xs text-muted-foreground">
                  {t.infra.teardown}
                </p>
              </div>
            </div>
          </Section>
        ) : null}

        <Section title={t.licences.title}>
          <div className="rounded-2xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.licences.what}</TableHead>
                  <TableHead>{t.licences.licence}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {t.licences.rows.map((r) => (
                  <TableRow key={r.what}>
                    <TableCell className="font-medium whitespace-normal">{r.what}</TableCell>
                    <TableCell className="whitespace-normal text-muted-foreground">
                      {r.licence}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <article className="rounded-2xl border border-dashed p-4 text-sm">
            <div className="mb-1 font-medium">{t.hf.title}</div>
            <p className="max-w-4xl text-muted-foreground">{t.hf.text}</p>
            <a
              href={t.hf.link}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block underline underline-offset-2"
            >
              {t.hf.linkLabel} ↗
            </a>
          </article>
        </Section>

        {rank >= 2 ? (
          <p className="text-xs text-muted-foreground">
            {t.sources}{" "}
            <span className="font-mono">
              models/out/eval_sagemaker.md, persona_fidelity.json, eval_examples.json,
              models/cards/classifier_report.md, models/README.md
            </span>
            {d.eval?.run ? ` (run ${d.eval.run})` : null}
          </p>
        ) : null}
      </div>
    </Page>
  );
}

function Num({ children, className }: { children: ReactNode; className?: string }) {
  return <TableCell className={cn("num text-right tabular-nums", className)}>{children}</TableCell>;
}

function Pair({
  a,
  b,
  fmt,
  delta,
  tone,
}: {
  a: number | null | undefined;
  b: number | null | undefined;
  fmt: (v: number | null | undefined) => string;
  /** Signed difference shown after the pair, in the verdict tone. */
  delta?: string;
  tone?: string;
}) {
  const aw = a !== null && a !== undefined && b !== null && b !== undefined && a > b;
  const bw = a !== null && a !== undefined && b !== null && b !== undefined && b > a;
  return (
    <TableCell className="num text-right whitespace-nowrap tabular-nums">
      <span className={cn(aw ? "font-semibold" : "text-muted-foreground")}>{fmt(a)}</span>
      <span className="px-1 text-muted-foreground">/</span>
      <span className={cn(bw ? "font-semibold" : "text-muted-foreground")}>{fmt(b)}</span>
      {delta ? <span className={cn("ml-2 text-xs", tone)}>{delta}</span> : null}
    </TableCell>
  );
}
