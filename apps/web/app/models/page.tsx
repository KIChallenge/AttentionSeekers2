import { AGENT_CATALOG } from "@sv/contracts";
import type { ReactNode } from "react";
import { loadModelsData } from "@/components/models/data.server";
import { type Verdict, verdict } from "@/components/models/parse";
import { Playground } from "@/components/models/playground";
import { modelsT } from "@/components/models/strings";
import { Page, PageHead } from "@/components/shell/page";
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
import { levelRank } from "@/lib/prefs";
import { serverPrefs } from "@/lib/server-prefs";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function Section({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-medium">{title}</h2>
        {sub ? <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground">{sub}</p> : null}
      </div>
      {children}
    </section>
  );
}

const verdictVariant: Record<Verdict, "secondary" | "destructive" | "outline"> = {
  better: "secondary",
  worse: "destructive",
  tie: "outline",
};

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
    return { ...r, a, b, sa, sb, v, stance: stance as "more" | "less" | "same", tr };
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

  return (
    <Page>
      <PageHead title={t.title} sub={t.sub} />
      <div className="space-y-10">
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
            {kpis.map((k) => (
              <div key={k.label} className="rounded-xl border p-3">
                <div className="text-xs text-muted-foreground">{k.label}</div>
                <div className="mt-1 flex items-baseline gap-3 font-mono tabular-nums">
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
                </div>
              </div>
            ))}
            <div className="rounded-xl border p-3">
              <div className="text-xs text-muted-foreground">{t.verdict.kpis.loops}</div>
              <div className="mt-1 font-mono text-xl tabular-nums">
                {loops ? `${loops.n} ${t.verdict.of} ${loops.of}` : "?"}
              </div>
            </div>
          </div>
        </section>

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

        <Section title={t.table.title} sub={rank >= 1 ? t.table.sub : undefined}>
          <div className="rounded-2xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.table.institution}</TableHead>
                  {rank >= 1 ? (
                    <>
                      <TableHead className="text-right">{t.table.train}</TableHead>
                      <TableHead className="text-right">{t.table.heldout}</TableHead>
                      {rank >= 2 ? (
                        <>
                          <TableHead className="text-right">{t.table.trainLoss}</TableHead>
                          <TableHead className="text-right">{t.table.seconds}</TableHead>
                        </>
                      ) : null}
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
                    {rank >= 1 ? (
                      <>
                        <Num>{fmt(r.tr?.nTrain, f0)}</Num>
                        <Num>{fmt(r.tr?.nHeldout, f0)}</Num>
                        {rank >= 2 ? (
                          <>
                            <Num>{fmt(r.tr?.trainLoss)}</Num>
                            <Num>{fmt(r.tr?.seconds, f0)}</Num>
                          </>
                        ) : null}
                        <Num>{fmt(r.tr?.evalLoss)}</Num>
                      </>
                    ) : null}
                    <Pair a={r.a} b={r.b} fmt={fmt} />
                    {rank >= 1 ? (
                      <>
                        <Pair a={r.sa} b={r.sb} fmt={fmt} />
                        <Pair a={r.within1Adapter} b={r.within1Base} fmt={fmt} />
                      </>
                    ) : null}
                    <TableCell>
                      {r.v ? (
                        <Badge variant={verdictVariant[r.v]}>{t.table.verdicts[r.v]}</Badge>
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
                    {rank >= 1 ? (
                      <>
                        <Num>
                          {fmt(
                            d.eval?.training.reduce((s, x) => s + (x.nTrain ?? 0), 0),
                            f0,
                          )}
                        </Num>
                        <Num>{fmt(all.n, f0)}</Num>
                        {rank >= 2 ? (
                          <>
                            <TableCell />
                            <TableCell />
                          </>
                        ) : null}
                        <TableCell />
                      </>
                    ) : null}
                    <Pair a={allA} b={allB} fmt={fmt} />
                    {rank >= 1 ? (
                      <>
                        <Pair a={all.signAdapter} b={all.signBase} fmt={fmt} />
                        <Pair a={all.within1Adapter} b={all.within1Base} fmt={fmt} />
                      </>
                    ) : null}
                    <TableCell>
                      {verdict(allA, allB) ? (
                        <Badge variant={verdictVariant[verdict(allA, allB) as Verdict]}>
                          {t.table.verdicts[verdict(allA, allB) as Verdict]}
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

        {versions.length ? (
          <Section title={t.versions.title} sub={t.versions.sub}>
            <div className="rounded-2xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.table.institution}</TableHead>
                    {versions.map(([k, v]) => (
                      <TableHead key={`s-${k}`} className="text-right">
                        {t.versions.sign} {v.label ?? k}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">
                      {t.versions.sign} {t.versions.base}
                    </TableHead>
                    {versions.map(([k, v]) => (
                      <TableHead key={`i-${k}`} className="text-right">
                        {t.versions.inChar} {v.label ?? k}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">
                      {t.versions.inChar} {t.versions.base}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...versionRoles, "all"].map((role) => {
                    const pick = (v: (typeof versions)[number][1]) =>
                      role === "all" ? v.all : v.institutions[role];
                    const base = pick(versions[0][1]);
                    return (
                      <TableRow
                        key={role}
                        className={role === "all" ? "bg-muted/40 font-medium" : undefined}
                      >
                        <TableCell className="whitespace-nowrap">
                          {role === "all" ? t.table.all : roleName(role)}
                        </TableCell>
                        {versions.map(([k, v]) => (
                          <Num key={`s-${k}`}>{fmt(pick(v)?.stance_sign_adapter)}</Num>
                        ))}
                        <Num>{fmt(base?.stance_sign_baseline)}</Num>
                        {versions.map(([k, v]) => (
                          <Num key={`i-${k}`}>{fmt(pick(v)?.adapter)}</Num>
                        ))}
                        <Num>{fmt(base?.baseline)}</Num>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">
              {t.sources} {t.versions.source}
            </p>
          </Section>
        ) : null}

        <Section title={t.playground.title} sub={t.playground.sub}>
          <Playground lang={lang} institutions={institutions} examples={d.examples} />
        </Section>

        {d.classifier ? (
          <Section title={t.classifier.title} sub={t.classifier.sub}>
            <div className="grid gap-3 lg:grid-cols-[1fr_2fr]">
              <article className="space-y-3 rounded-2xl border bg-card p-4 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">{t.classifier.macro}</div>
                  <div className="mt-1 font-mono text-3xl tabular-nums">
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
                {rank >= 1 ? (
                  <div>
                    <div className="mb-1 text-xs text-muted-foreground">{t.classifier.heads}</div>
                    <dl className="grid grid-cols-[1fr_auto] gap-y-1">
                      {(["char", "ensemble", "frozen", "setfit"] as const).map((k) => (
                        <div key={k} className="contents">
                          <dt>{t.classifier.headNames[k]}</dt>
                          <dd className="font-mono tabular-nums">
                            {fmt(d.classifier?.macroF1[k])}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ) : null}
                <p className="text-muted-foreground">{t.classifier.reading}</p>
              </article>
              {rank >= 1 ? (
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
                          <span className="truncate">{roleName(c.role)}</span>
                          <span className="relative h-2 rounded-full bg-muted">
                            <span
                              className="absolute inset-y-0 left-0 rounded-full bg-foreground/70"
                              style={{ width: `${Math.round((c.f1 ?? 0) * 100)}%` }}
                            />
                          </span>
                          <span className="text-right font-mono tabular-nums">{fmt(c.f1)}</span>
                        </li>
                      ))}
                  </ul>
                </article>
              ) : null}
            </div>
          </Section>
        ) : null}

        {d.infra ? (
          <Section title={t.infra.title}>
            <div className="grid gap-3 lg:grid-cols-[1fr_2fr]">
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
                    {d.infra.costs
                      .filter((c) => rank >= 1 || c.total)
                      .map((c) => (
                        <TableRow key={c.item} className={cn(c.total && "font-medium")}>
                          <TableCell className="whitespace-normal">{c.item}</TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            {c.duration}
                          </TableCell>
                          <TableCell className="text-right font-mono whitespace-nowrap tabular-nums">
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

        <p className="text-xs text-muted-foreground">
          {t.sources}{" "}
          <span className="font-mono">
            models/out/eval_sagemaker.md, persona_fidelity.json, eval_examples.json,
            models/cards/classifier_report.md, models/README.md
          </span>
          {d.eval?.run ? ` (run ${d.eval.run})` : null}
        </p>
      </div>
    </Page>
  );
}

function Num({ children }: { children: ReactNode }) {
  return <TableCell className="text-right font-mono tabular-nums">{children}</TableCell>;
}

function Pair({
  a,
  b,
  fmt,
}: {
  a: number | null | undefined;
  b: number | null | undefined;
  fmt: (v: number | null | undefined) => string;
}) {
  const aw = a !== null && a !== undefined && b !== null && b !== undefined && a > b;
  const bw = a !== null && a !== undefined && b !== null && b !== undefined && b > a;
  return (
    <TableCell className="text-right font-mono whitespace-nowrap tabular-nums">
      <span className={cn(aw ? "font-semibold" : "text-muted-foreground")}>{fmt(a)}</span>
      <span className="px-1 text-muted-foreground">/</span>
      <span className={cn(bw ? "font-semibold" : "text-muted-foreground")}>{fmt(b)}</span>
    </TableCell>
  );
}
