"use client";

import { localize, TEMPLATES } from "@sv/contracts";
import Link from "next/link";
import { OutcomeBadge } from "@/components/run/outcome-badge";
import { EmptyState, Eyebrow, Meta } from "@/components/shell/page";
import { usePrefs } from "@/components/shell/providers";
import { topicT } from "@/components/topics/messages";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ScenarioCard } from "@/lib/scenario-runs";
import { cn } from "@/lib/utils";
import { type ScenarioMessages, scenarioT, scenarioTitle } from "./messages";

type Lang = "de" | "en";

export function cardTitle(
  c: Pick<ScenarioCard, "baseKey" | "template" | "question" | "kind">,
  lang: Lang,
  s: ScenarioMessages,
): string {
  const tpl = TEMPLATES.find((x) => x.id === c.template);
  const base =
    scenarioTitle(c.baseKey, lang) ?? (tpl ? (lang === "de" ? tpl.de : tpl.en) : c.question);
  return c.kind === "main" ? base : `${base}: ${s.kind[c.kind]}`;
}

function joinList(xs: string[], lang: Lang) {
  if (xs.length <= 1) return xs.join("");
  const and = lang === "de" ? " und " : " and ";
  return `${xs.slice(0, -1).join(", ")}${and}${xs.at(-1)}`;
}

function headline(c: ScenarioCard, lang: Lang, s: ScenarioMessages): string | null {
  if (c.compared === 0) return null;
  const names = joinList(
    c.agreedAll.map((l) => localize(l, lang)),
    lang,
  );
  if (c.compared === 1) return s.agreedSingle(c.agreedAll.length, c.topicsOf);
  if (c.agreedAll.length === 0) return s.agreedNone(c.compared);
  return s.agreedAll(names, c.agreedAll.length, c.compared);
}

function Card({ c, compact = false }: { c: ScenarioCard; compact?: boolean }) {
  const { t: base, lang } = usePrefs();
  const s = scenarioT(lang);
  const fam = topicT(lang).fam;
  const line = headline(c, lang, s);
  return (
    <article
      className={cn(
        "flex min-w-0 flex-col gap-4 rounded-2xl border bg-card shadow-none",
        compact ? "p-5" : "p-5 sm:p-6",
      )}
      data-scenario={c.key}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Eyebrow>{c.kind === "main" ? s.runs(c.runCount) : s.kind[c.kind]}</Eyebrow>
        <OutcomeBadge value={c.outcomeBadge} t={base} />
      </div>
      <h2
        className={cn(
          "leading-snug font-semibold tracking-tight",
          compact ? "text-base" : "text-lg",
        )}
      >
        {cardTitle(c, lang, s)}
      </h2>
      <p className="line-clamp-2 text-sm text-muted-foreground" title={c.question}>
        {c.question}
      </p>
      {line ? <p className="text-sm leading-relaxed">{line}</p> : null}
      {c.baseRate ? (
        <p className="text-sm text-muted-foreground">{s.baseRate(c.baseRate.k, c.baseRate.n)}</p>
      ) : null}
      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        {c.kind !== "main" ? <Meta className="mr-1">{s.runs(c.runCount)}</Meta> : null}
        {c.families.map((f) => (
          <Badge key={f} variant="outline" className="text-muted-foreground">
            {fam[f] ?? f}
          </Badge>
        ))}
      </div>
      <div>
        <Button asChild size={compact ? "sm" : "default"}>
          <Link href={`/scenarios/${encodeURIComponent(c.key)}`}>{s.open}</Link>
        </Button>
      </div>
    </article>
  );
}

/** Home grid: the main scenarios as cards, check runs and demos folded below. */
export function ScenarioGrid({ cards }: { cards: ScenarioCard[] }) {
  const { lang } = usePrefs();
  const s = scenarioT(lang);
  const main = cards.filter((c) => c.kind === "main");
  const side = cards.filter((c) => c.kind !== "main");
  if (cards.length === 0) return <EmptyState title={s.noRuns} />;
  return (
    <>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {main.map((c) => (
          <Card key={c.key} c={c} />
        ))}
      </div>
      {side.length ? (
        <details className="group space-y-4">
          <summary className="flex cursor-pointer list-none items-baseline gap-3 rounded-md text-base font-semibold tracking-tight focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
            <span>{s.sideGroups}</span>
            <Meta>{side.reduce((n, c) => n + c.runCount, 0)}</Meta>
            <span className="text-sm font-normal text-muted-foreground">{s.sideGroupsHint}</span>
          </summary>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {side.map((c) => (
              <Card key={c.key} c={c} compact />
            ))}
          </div>
        </details>
      ) : null}
    </>
  );
}
