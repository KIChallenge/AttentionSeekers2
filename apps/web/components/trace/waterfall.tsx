"use client";

import { type Lang, type LlmCall, modelFamily, type Run } from "@sv/contracts";
import { useState } from "react";
import { Tile } from "@/components/run/bits";
import { agentLook } from "@/components/run/helpers";
import { cn } from "@/lib/utils";
import { fmtClock, fmtCompact, fmtMs, fmtUsd } from "./format";
import {
  endOf,
  familyColor,
  hasTiming,
  type TraceGroup,
  type TraceRound,
  type TraceTurn,
} from "./model";
import type { TraceStrings } from "./strings";

// Row grid: label | bar | tokens | cost | running total. Numeric columns drop on phones.
const ROW =
  "grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-x-3 md:grid-cols-[260px_minmax(0,1fr)_64px_72px_72px]";

interface Ctx {
  run: Run;
  lang: Lang;
  t: TraceStrings;
  selected: string | null;
  onSelect: (c: LlmCall) => void;
  running: Map<string, { tokens: number; costUsd: number }>;
  /** Engineer level: utterance ids, exchange ids and schema names in the rows. */
  engineer: boolean;
  /** Executive level: rounds start closed, one line per round. */
  roundsClosed: boolean;
}

const pct = (v: number, lo: number, hi: number) =>
  hi > lo ? Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100)) : 0;

function Axis({ lo, hi }: { lo: number; hi: number }) {
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <div className="relative h-4 text-[10px] text-muted-foreground tabular-nums">
      {ticks.map((f) => (
        <span
          key={f}
          className={cn(
            "absolute top-0",
            f === 0 ? "" : f === 1 ? "-translate-x-full" : "-translate-x-1/2",
          )}
          style={{ left: `${f * 100}%` }}
        >
          {fmtClock(lo + (hi - lo) * f)}
        </span>
      ))}
    </div>
  );
}

function Grid() {
  return (
    <>
      {[25, 50, 75].map((p) => (
        <span
          key={p}
          className="pointer-events-none absolute inset-y-0 w-px bg-gray-alpha-100"
          style={{ left: `${p}%` }}
        />
      ))}
    </>
  );
}

function CallBar({ c, lo, hi, ctx }: { c: LlmCall; lo: number; hi: number; ctx: Ctx }) {
  const color = familyColor(modelFamily(c.model));
  const left = pct(c.startedAtMs, lo, hi);
  if (!hasTiming(c))
    return (
      <span
        className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border"
        style={{ left: `${left}%`, borderColor: color, background: "var(--card)" }}
        title={ctx.t.unknownTiming}
      />
    );
  const width = Math.max(0.4, pct(endOf(c), lo, hi) - left);
  return (
    <span
      className={cn(
        "absolute top-1/2 h-3 -translate-y-1/2 rounded-[3px]",
        c.origin === "derived" && "border border-dashed bg-clip-padding opacity-80",
        c.status === "failed" &&
          "bg-[repeating-linear-gradient(135deg,transparent_0_3px,rgba(0,0,0,.25)_3px_6px)]",
      )}
      style={{
        left: `${left}%`,
        width: `${width}%`,
        minWidth: 3,
        backgroundColor: c.status === "failed" ? "var(--destructive)" : color,
        borderColor: c.origin === "derived" ? "var(--foreground)" : undefined,
      }}
    />
  );
}

function StatusMark({ c, t }: { c: LlmCall; t: TraceStrings }) {
  if (c.status === "ok" && c.attempts === 1) return null;
  const cls =
    c.status === "failed"
      ? "text-destructive"
      : c.status === "fallback"
        ? "text-warning"
        : "text-muted-foreground";
  return (
    <span className={cn("shrink-0 text-[10px]", cls)}>
      {c.status !== "ok" ? t.status[c.status] : ""}
      {c.attempts > 1 ? ` ×${c.attempts}` : ""}
    </span>
  );
}

function Nums({ c, ctx }: { c: LlmCall; ctx: Ctx }) {
  const r = ctx.running.get(c.callId);
  const unknown = c.unknown?.includes("tokens");
  return (
    <>
      <span className="hidden text-right text-xs tabular-nums md:block">
        {unknown ? "?" : fmtCompact(c.tokensIn + c.tokensOut, ctx.lang)}
      </span>
      <span className="hidden text-right text-xs tabular-nums md:block">
        {c.costUsd === null ? "?" : fmtUsd(c.costUsd, ctx.lang)}
      </span>
      <span className="hidden text-right text-[11px] text-muted-foreground tabular-nums md:block">
        {r ? fmtUsd(r.costUsd, ctx.lang) : ""}
      </span>
    </>
  );
}

function CallRow({
  c,
  lo,
  hi,
  ctx,
  indent,
  label,
}: {
  c: LlmCall;
  lo: number;
  hi: number;
  ctx: Ctx;
  indent: number;
  label?: React.ReactNode;
}) {
  const active = ctx.selected === c.callId;
  return (
    <button
      type="button"
      id={`call-${c.callId}`}
      onClick={() => ctx.onSelect(c)}
      aria-pressed={active}
      className={cn(
        ROW,
        "w-full items-center rounded-md py-1 pr-1 text-left hover:bg-gray-alpha-100",
        active && "bg-gray-alpha-150 ring-1 ring-foreground/30",
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5" style={{ paddingLeft: indent }}>
        {label ?? (
          <span className="truncate font-mono text-[11px] text-muted-foreground">
            {c.schemaName}
          </span>
        )}
        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
          {hasTiming(c) ? fmtMs(c.durationMs, ctx.lang) : ""}
        </span>
        <StatusMark c={c} t={ctx.t} />
      </span>
      <span className="relative h-5">
        <Grid />
        <CallBar c={c} lo={lo} hi={hi} ctx={ctx} />
      </span>
      <Nums c={c} ctx={ctx} />
    </button>
  );
}

function turnLabel(turn: TraceTurn, ctx: Ctx) {
  const who = turn.speaker ?? "moderator";
  const name = agentLook(ctx.run, who, ctx.lang).name;
  const ref =
    turn.kind === "utterance" || turn.kind === "exchange_outcome" || turn.kind === "summary"
      ? turn.ref
      : null;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Tile id={who} />
      <span className="truncate text-xs" title={ref ? `${name} · ${ref}` : name}>
        {ctx.t.kind[turn.kind]}
      </span>
      {ref && ctx.engineer ? (
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{ref}</span>
      ) : null}
    </span>
  );
}

function Turn({ turn, lo, hi, ctx }: { turn: TraceTurn; lo: number; hi: number; ctx: Ctx }) {
  const [only] = turn.calls;
  if (turn.calls.length === 1 && only)
    return <CallRow c={only} lo={lo} hi={hi} ctx={ctx} indent={14} label={turnLabel(turn, ctx)} />;
  const total = turn.calls.reduce((a, c) => a + c.durationMs, 0);
  return (
    <div>
      <div className={cn(ROW, "items-center py-1 pr-1")}>
        <span className="flex min-w-0 items-center gap-1.5 pl-[14px]">
          {turnLabel(turn, ctx)}
          <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
            {fmtMs(turn.end - turn.start, ctx.lang)}
          </span>
        </span>
        <span className="relative h-5">
          <Grid />
          <span
            className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-gray-alpha-400"
            style={{
              left: `${pct(turn.start, lo, hi)}%`,
              width: `${Math.max(0.4, pct(turn.end, lo, hi) - pct(turn.start, lo, hi))}%`,
            }}
          />
        </span>
        <span className="hidden text-right text-xs text-muted-foreground tabular-nums md:block">
          {fmtCompact(
            turn.calls.reduce((a, c) => a + c.tokensIn + c.tokensOut, 0),
            ctx.lang,
          )}
        </span>
        <span className="hidden text-right text-xs text-muted-foreground tabular-nums md:block">
          {fmtUsd(
            turn.calls.reduce((a, c) => a + (c.costUsd ?? 0), 0),
            ctx.lang,
          )}
        </span>
        <span className="hidden md:block" />
      </div>
      {turn.calls.map((c) => (
        <CallRow
          key={c.callId}
          c={c}
          lo={lo}
          hi={hi}
          ctx={ctx}
          indent={34}
          label={
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                className="size-2 shrink-0 rounded-[2px]"
                style={{ background: familyColor(modelFamily(c.model)) }}
              />
              <span className="truncate text-xs text-muted-foreground" title={c.schemaName}>
                {ctx.t.kind[c.parent.kind]}
                {ctx.engineer ? (
                  <span className="font-mono text-[11px]"> · {c.schemaName}</span>
                ) : null}
              </span>
              {total > 0 && hasTiming(c) ? (
                <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                  {Math.round((c.durationMs / total) * 100)} %
                </span>
              ) : null}
            </span>
          }
        />
      ))}
    </div>
  );
}

/** "Plenum", "Einzelgespräch: Ärztekammer, Pflegevertretung"; the exchange id at Engineer. */
function groupTitle(g: TraceGroup, ctx: Ctx) {
  if (!g.exchangeId) return { text: ctx.t.work[g.work ?? "other"], id: null };
  const kind = g.exchangeKind ? ctx.t.exchange[g.exchangeKind] : "";
  const names =
    g.exchangeKind === "plenary"
      ? ""
      : g.participants.map((p) => agentLook(ctx.run, p, ctx.lang).name).join(", ");
  return { text: names ? `${kind}: ${names}` : kind, id: g.exchangeId };
}

function Group({ g, lo, hi, ctx }: { g: TraceGroup; lo: number; hi: number; ctx: Ctx }) {
  const calls = g.turns.flatMap((x) => x.calls);
  const title = groupTitle(g, ctx);
  return (
    <div className="border-t border-dashed first:border-t-0">
      <div className={cn(ROW, "items-center pt-1.5 pb-0.5 pr-1")}>
        <span
          className="min-w-0 text-[11px] leading-tight font-medium tracking-wide text-muted-foreground uppercase"
          title={title.id ? `${title.text} · ${title.id}` : undefined}
        >
          {title.text}
          {title.id && ctx.engineer ? (
            <span className="ml-1.5 font-mono font-normal tracking-normal normal-case">
              {title.id}
            </span>
          ) : null}
        </span>
        <span className="relative h-3">
          <span
            className="absolute inset-y-0.5 rounded-sm border border-foreground/15 bg-gray-alpha-50"
            style={{
              left: `${pct(g.start, lo, hi)}%`,
              width: `${Math.max(0.4, pct(g.end, lo, hi) - pct(g.start, lo, hi))}%`,
            }}
          />
        </span>
        <span className="hidden text-right text-[11px] text-muted-foreground tabular-nums md:block">
          {calls.length}
        </span>
        <span className="hidden md:block" />
        <span className="hidden md:block" />
      </div>
      {g.turns.map((turn) => (
        <Turn key={turn.key} turn={turn} lo={lo} hi={hi} ctx={ctx} />
      ))}
    </div>
  );
}

export function Waterfall({ rounds, ...ctx }: Ctx & { rounds: TraceRound[] }) {
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const { t, lang } = ctx;
  return (
    <div className="rounded-2xl border bg-card shadow-xs">
      <div
        className={cn(
          ROW,
          "sticky top-[94px] z-[5] items-end rounded-t-2xl border-b bg-card/95 px-3 py-2 text-[11px] text-muted-foreground backdrop-blur",
        )}
      >
        <span>{t.cols.call}</span>
        <span>{t.cols.timeline}</span>
        <span className="hidden text-right md:block">{t.cols.tokens}</span>
        <span className="hidden text-right md:block">{t.cols.cost}</span>
        <span className="hidden text-right md:block">{t.cols.running}</span>
      </div>
      {rounds.map((r) => {
        const key = String(r.round);
        const open = key in closed ? !closed[key] : !ctx.roundsClosed;
        const lo = r.start;
        const hi = Math.max(r.end, r.start + 1);
        const tokens = r.calls.reduce((a, c) => a + c.tokensIn + c.tokensOut, 0);
        const cost = r.calls.reduce((a, c) => a + (c.costUsd ?? 0), 0);
        return (
          <section key={key} className="border-b px-3 pb-2 last:border-b-0">
            <div className={cn(ROW, "items-center pt-2.5 pb-1")}>
              <button
                type="button"
                onClick={() => setClosed((s) => ({ ...s, [key]: open }))}
                aria-expanded={open}
                className="flex min-w-0 items-center gap-2 text-left text-sm font-semibold"
              >
                <span className="w-3 text-muted-foreground">{open ? "▾" : "▸"}</span>
                <span className="truncate">
                  {t.round(r.round)}
                  {r.phase ? (
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      {t.phase(r.phase)}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs font-normal text-muted-foreground tabular-nums">
                  {fmtMs(r.end - r.start, lang)} · {r.calls.length}
                </span>
              </button>
              <Axis lo={lo} hi={hi} />
              <span className="hidden text-right text-xs font-medium tabular-nums md:block">
                {fmtCompact(tokens, lang)}
              </span>
              <span className="hidden text-right text-xs font-medium tabular-nums md:block">
                {fmtUsd(cost, lang)}
              </span>
              <span className="hidden md:block" />
            </div>
            {open
              ? r.groups.map((g) => <Group key={g.key} g={g} lo={lo} hi={hi} ctx={ctx} />)
              : null}
          </section>
        );
      })}
      {ctx.roundsClosed && rounds.every((r) => !(String(r.round) in closed)) ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">{t.roundsClosed}</p>
      ) : null}
    </div>
  );
}
