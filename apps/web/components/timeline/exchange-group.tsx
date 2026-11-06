"use client";

import type { Exchange, Lang, Run } from "@sv/contracts";
import type { ReactNode } from "react";
import { agentLook, L } from "@/components/run/helpers";
import { cn } from "@/lib/utils";
import { exchangeKindKey, fmtMin } from "./model";
import { timelineStrings } from "./strings";

// Transcript grouping: a small header per exchange (kind, participants, trigger), the
// utterances, then the moderator's closing outcome. Context-free for live view and replay.

const ACCENT: Record<string, string> = {
  plenary: "border-border",
  bilateral: "border-info/50",
  trilateral: "border-info/50",
  caucus: "border-dashed border-foreground/40",
};

export function ExchangeGroup({
  exchange,
  run,
  lang,
  parallel = false,
  children,
}: {
  exchange: Exchange | null | undefined;
  run: Run | null;
  lang: Lang;
  parallel?: boolean;
  children: ReactNode;
}) {
  if (!exchange) return <>{children}</>;
  const t = timelineStrings[lang];
  const key = exchangeKindKey(exchange);
  const topic = run?.mandate.topics.find((tp) => tp.id === exchange.topicId);
  const time =
    exchange.startMin !== undefined
      ? `${fmtMin(exchange.startMin)}${exchange.endMin !== undefined ? ` - ${fmtMin(exchange.endMin)}` : ""}`
      : null;
  return (
    <section
      aria-label={`${t.kind[key]}: ${L(exchange.trigger, lang)}`}
      data-exchange={exchange.id}
      className={cn("space-y-3 border-l-2 pl-4", ACCENT[key])}
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span
          className={cn(
            "inline-flex h-5 items-center rounded-full border px-2 font-medium",
            key === "plenary" ? "bg-gray-alpha-100 text-foreground" : "",
            (key === "bilateral" || key === "trilateral") && "border-info/40 bg-info/10 text-info",
            key === "caucus" && "border-dashed border-foreground/40 text-foreground",
          )}
        >
          {t.kind[key]}
        </span>
        {key === "plenary" ? null : (
          <span className="inline-flex items-center gap-0.5">
            {exchange.participants.map((p, i) => {
              const a = agentLook(run, p, lang);
              return (
                <span key={p} className="inline-flex items-center gap-0.5" title={a.name}>
                  {i > 0 ? (
                    <span aria-hidden="true" className="px-0.5">
                      {key === "caucus" ? "+" : "↔"}
                    </span>
                  ) : null}
                  <span
                    className="inline-grid h-4 min-w-5 place-items-center rounded-[4px] px-0.5 text-[8px] font-semibold text-white"
                    style={{ background: a.color }}
                  >
                    {a.code}
                  </span>
                  <span className="sr-only">{a.name}</span>
                </span>
              );
            })}
          </span>
        )}
        <span className="min-w-0 text-foreground/80">
          {topic ? `${L(topic.label, lang)}: ` : ""}
          {L(exchange.trigger, lang)}
        </span>
        {parallel ? (
          <span className="rounded-full border border-dashed px-1.5 text-[10px]">{t.parallel}</span>
        ) : null}
        {time ? <span className="ml-auto font-mono text-[10px]">{time}</span> : null}
      </header>
      {children}
      {exchange.outcome ? (
        <p className="flex gap-2 rounded-xl bg-gray-alpha-50 px-3.5 py-2 text-xs">
          <span className="shrink-0 text-muted-foreground">{t.outcome}</span>
          <span>{L(exchange.outcome, lang)}</span>
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">{t.open}</p>
      )}
    </section>
  );
}
