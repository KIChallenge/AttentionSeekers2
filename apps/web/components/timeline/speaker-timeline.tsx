"use client";

import type { Lang, Run, RunSnapshot } from "@sv/contracts";
import { type KeyboardEvent, useId, useMemo, useRef, useState } from "react";
import { agentLook, L, speakerLine } from "@/components/run/helpers";
import { runStrings } from "@/components/run/strings";
import { cn } from "@/lib/utils";
import {
  bandFor,
  buildTimeline,
  exchangeKindKey,
  fmtMin,
  focusOf,
  type TimelineBand,
  type TimelineItem,
  tickStep,
} from "./model";
import { timelineStrings } from "./strings";

// Speaker timeline: swimlanes per institution over simulated meeting minutes. Bars are
// utterances in the institution's colour, bands are exchanges spanning their participants,
// curves link a reply to what it answers. Context-free so the live view, the replay player
// and the stage can each feed their own snapshot and playhead.

type Zoom = "all" | "follow" | { exchangeId: string };

const KIND_STYLE: Record<string, { band: string; label: string }> = {
  plenary: {
    band: "bg-gray-alpha-100",
    label: "border-border bg-background text-muted-foreground",
  },
  bilateral: {
    band: "bg-info/10 border-y border-info/30",
    label: "border-info/40 bg-info/10 text-info",
  },
  trilateral: {
    band: "bg-info/10 border-y border-info/30",
    label: "border-info/40 bg-info/10 text-info",
  },
  caucus: {
    band: "border-y border-dashed border-foreground/30 [background:repeating-linear-gradient(135deg,var(--gray-alpha-100)_0_4px,transparent_4px_8px)]",
    label: "border-dashed border-foreground/40 bg-background text-foreground",
  },
};

export interface SpeakerTimelineProps {
  /** Snapshot whose utterances and exchanges are drawn (the full record for replay and stage). */
  snap: Pick<RunSnapshot, "utteranceOrder" | "utterances" | "exchanges" | "pending">;
  run: Run | null;
  lang: Lang;
  /** Utterance at the playhead: highlighted, its speaker's row lit, its addressees marked. */
  activeId?: string | null;
  selectedId?: string | null;
  /** Utterances with a higher seq are not yet played and drawn as ghosts. */
  cursorSeq?: number | null;
  /** Share of the active utterance already spoken, 0..1 (default 1). */
  progress?: number;
  onSelect?: (id: string) => void;
  compact?: boolean;
  /** Header with a show/hide toggle. */
  collapsible?: boolean;
  defaultOpen?: boolean;
  defaultZoom?: "all" | "follow";
  className?: string;
}

export function SpeakerTimeline({
  snap,
  run,
  lang,
  activeId = null,
  selectedId = null,
  cursorSeq = null,
  progress = 1,
  onSelect,
  compact = false,
  collapsible = false,
  defaultOpen = true,
  defaultZoom = "all",
  className,
}: SpeakerTimelineProps) {
  const t = timelineStrings[lang];
  const kinds = runStrings[lang].kind;
  const uid = useId();
  const model = useMemo(() => buildTimeline(snap, run), [snap, run]);
  const [open, setOpen] = useState(defaultOpen);
  const [zoom, setZoom] = useState<Zoom>(defaultZoom);
  const [hover, setHover] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const trackRef = useRef<HTMLFieldSetElement>(null);

  const rowH = compact ? 12 : 18;
  const laneH = compact ? 16 : 20;
  const labelW = compact ? 40 : 172;
  const lanesH = model.lanes * laneH;
  const rowsH = model.rows.length * rowH;

  const active = activeId ? (model.byId.get(activeId) ?? null) : null;
  const focus = focusOf(snap, activeId);
  const activeBand = bandFor(model, activeId);

  // visible domain in minutes
  const [d0, d1] = useMemo((): [number, number] => {
    let band: TimelineBand | null = null;
    if (zoom === "follow") band = activeBand;
    else if (zoom !== "all")
      band = model.bands.find((b) => b.exchange.id === zoom.exchangeId) ?? null;
    if (!band) return [0, model.end];
    const span = Math.max(4, band.end - band.start);
    const pad = Math.max(1, span * 0.08);
    return [Math.max(0, band.start - pad), band.end + pad];
  }, [zoom, activeBand, model]);
  const span = Math.max(0.001, d1 - d0);
  const x = (min: number) => ((min - d0) / span) * 100;
  const visible = (a: number, b: number) => b >= d0 && a <= d1;

  const isFuture = (i: TimelineItem) => cursorSeq !== null && !i.pending && i.seq > cursorSeq;

  const ordered = useMemo(
    () => [...model.items].sort((a, b) => a.seq - b.seq || a.start - b.start),
    [model.items],
  );
  const tabTarget = focusId ?? selectedId ?? activeId ?? ordered[0]?.id ?? null;

  const focusItem = (id: string | undefined) => {
    if (!id) return;
    setFocusId(id);
    const it = model.byId.get(id);
    // keep the focused bar inside a zoomed window
    if (it && zoom !== "all" && (it.start < d0 || it.start + it.dur > d1)) setZoom("all");
    requestAnimationFrame(() =>
      trackRef.current?.querySelector<HTMLElement>(`[data-tl-item="${id}"]`)?.focus(),
    );
  };

  const onKey = (e: KeyboardEvent<HTMLFieldSetElement>) => {
    const id = (e.target as HTMLElement).dataset.tlItem;
    if (!id) return;
    const i = ordered.findIndex((o) => o.id === id);
    const cur = ordered[i];
    if (!cur) return;
    if (e.key === "ArrowRight") focusItem(ordered[i + 1]?.id);
    else if (e.key === "ArrowLeft") focusItem(ordered[i - 1]?.id);
    else if (e.key === "Home") focusItem(ordered[0]?.id);
    else if (e.key === "End") focusItem(ordered.at(-1)?.id);
    else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      // nearest utterance in the next populated row above or below
      const dir = e.key === "ArrowUp" ? -1 : 1;
      for (let r = cur.row + dir; r >= 0 && r < model.rows.length; r += dir) {
        const inRow = model.items.filter((o) => o.row === r);
        if (!inRow.length) continue;
        const near = inRow.reduce((a, b) =>
          Math.abs(b.start - cur.start) < Math.abs(a.start - cur.start) ? b : a,
        );
        focusItem(near.id);
        break;
      }
    } else if (e.key === "z" || e.key === "Z") {
      const b = bandFor(model, id);
      if (b) setZoom({ exchangeId: b.exchange.id });
    } else if (e.key === "Escape") setZoom("all");
    else return;
    e.preventDefault();
  };

  const look = (id: string) => agentLook(run, id, lang);
  const bandLabel = (b: TimelineBand) => {
    const topic = run?.mandate.topics.find((tp) => tp.id === b.exchange.topicId);
    const kind = t.kind[exchangeKindKey(b.exchange)];
    return topic ? `${kind} · ${L(topic.label, lang)}` : `${kind} · ${L(b.exchange.trigger, lang)}`;
  };

  const tip = hover ? model.byId.get(hover) : null;
  const tipText = (() => {
    if (!tip) return "";
    const u = snap.utterances[tip.id];
    const raw = u ? L(u.text, lang) : (snap.pending[tip.id]?.text ?? "");
    return raw.length > 160 ? `${raw.slice(0, 157).trimEnd()}...` : raw;
  })();

  const step = tickStep(span);
  const ticks: number[] = [];
  for (let m = Math.ceil(d0 / step) * step; m <= d1 + 1e-6; m += step) ticks.push(m);

  const playhead = active ? active.start + active.dur * Math.max(0, Math.min(1, progress)) : null;
  const derived = model.items.some((i) => i.derived && !i.pending);
  const zoomedBand =
    typeof zoom === "object" ? model.bands.find((b) => b.exchange.id === zoom.exchangeId) : null;

  const rowState = (r: number) => {
    const id = model.rows[r] ?? "";
    if (!focus) return "idle" as const;
    if (focus.speaker === id) return "active" as const;
    if (focus.addressedTo.includes(id)) return "addressed" as const;
    return "dim" as const;
  };

  const header = compact ? null : (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 pt-2.5 pb-1.5">
      <div className="min-w-0">
        <h2 id={`${uid}-title`} className="text-sm font-semibold">
          {t.title}
        </h2>
        <p className="text-[11px] text-muted-foreground">
          {t.sub}
          {derived ? ` · ${t.derived}` : ""}
        </p>
      </div>
      <span className="flex-1" />
      {open ? (
        <>
          {zoomedBand ? (
            <button
              type="button"
              onClick={() => setZoom("all")}
              className="inline-flex h-6 max-w-[22rem] items-center gap-1 rounded-full border px-2 text-[11px] hover:border-foreground/40"
              title={t.zoomAll}
            >
              <span className="truncate">
                {t.zoomed}: {bandLabel(zoomedBand)}
              </span>
              <span aria-hidden="true">×</span>
            </button>
          ) : null}
          <fieldset
            aria-label={t.zoomAll}
            className="inline-flex rounded-control border bg-gray-alpha-50 p-0.5"
          >
            {(["all", "follow"] as const).map((z) => (
              <button
                key={z}
                type="button"
                aria-pressed={zoom === z}
                onClick={() => setZoom(z)}
                className={cn(
                  "h-6 rounded-[7px] px-2 text-[11px] text-muted-foreground hover:text-foreground",
                  zoom === z && "bg-background text-foreground shadow-xs",
                )}
              >
                {z === "all" ? t.zoomAll : t.zoomFollow}
              </button>
            ))}
          </fieldset>
        </>
      ) : null}
      {collapsible ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${uid}-body`}
          onClick={() => setOpen((o) => !o)}
          className="h-6 rounded-control border px-2 text-[11px] text-muted-foreground hover:text-foreground"
        >
          {open ? t.hide : t.show}
        </button>
      ) : null}
    </div>
  );

  return (
    <section
      aria-labelledby={compact ? undefined : `${uid}-title`}
      aria-label={compact ? t.label : undefined}
      className={cn("rounded-2xl border bg-card", className)}
    >
      {header}
      {open ? (
        <div id={`${uid}-body`} className={cn("relative", compact ? "px-2 py-1.5" : "px-3 pb-2")}>
          <p id={`${uid}-keys`} className="sr-only">
            {t.keys}
          </p>
          {model.items.length === 0 ? (
            <p className="py-3 text-xs text-muted-foreground">{t.noData}</p>
          ) : (
            <div className="flex">
              {/* row labels */}
              <div className="shrink-0" style={{ width: labelW }}>
                <div style={{ height: lanesH }} />
                {model.rows.map((id, r) => {
                  const a = look(id);
                  const st = rowState(r);
                  return (
                    <div
                      key={id}
                      className={cn(
                        "flex items-center gap-1.5 overflow-hidden pr-2 transition-opacity",
                        st === "dim" && "opacity-45",
                      )}
                      style={{ height: rowH }}
                      title={a.name}
                    >
                      <span
                        className={cn(
                          "inline-grid shrink-0 place-items-center rounded-[4px] font-semibold text-white",
                          compact
                            ? "h-[10px] min-w-[18px] px-0.5 text-[7px]"
                            : "h-3.5 min-w-6 px-0.5 text-[8px]",
                          st === "active" &&
                            "ring-2 ring-foreground/70 ring-offset-1 ring-offset-card",
                          st === "addressed" &&
                            "ring-1 ring-foreground/50 ring-offset-1 ring-offset-card",
                        )}
                        style={{ background: a.color }}
                      >
                        {a.code}
                      </span>
                      {compact ? null : (
                        <span
                          className={cn(
                            "min-w-0 truncate text-[11px]",
                            st === "active" ? "font-medium" : "text-muted-foreground",
                          )}
                        >
                          {a.name}
                        </span>
                      )}
                      {!compact && st === "addressed" ? (
                        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                          ← {t.addressedRow}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {/* track */}
              <div className="relative min-w-0 flex-1">
                <div className="relative overflow-hidden" style={{ height: lanesH + rowsH }}>
                  {/* row backgrounds */}
                  {model.rows.map((id, r) => {
                    const st = rowState(r);
                    return (
                      <div
                        key={id}
                        className={cn(
                          "absolute inset-x-0",
                          r % 2 === 1 && st === "idle" && "bg-gray-alpha-50",
                        )}
                        style={{
                          top: lanesH + r * rowH,
                          height: rowH,
                          background:
                            st === "active"
                              ? `color-mix(in srgb, ${look(id).color} 16%, transparent)`
                              : st === "addressed"
                                ? `color-mix(in srgb, ${look(id).color} 8%, transparent)`
                                : undefined,
                        }}
                      />
                    );
                  })}

                  {/* exchange bands */}
                  {model.bands.map((b) => {
                    if (!visible(b.start, b.end)) return null;
                    const key = exchangeKindKey(b.exchange);
                    const style = KIND_STYLE[key] ?? KIND_STYLE.plenary;
                    const left = x(b.start);
                    const width = x(b.end) - left;
                    const isActive = activeBand?.exchange.id === b.exchange.id;
                    const minRow = b.rows[0] ?? 0;
                    const maxRow = b.rows.at(-1) ?? 0;
                    return (
                      <div
                        key={b.exchange.id}
                        className={cn(!isActive && activeBand && "opacity-60")}
                      >
                        {key === "plenary" ? (
                          <div
                            className={cn("absolute", style?.band)}
                            style={{
                              left: `${left}%`,
                              width: `${width}%`,
                              top: lanesH,
                              height: rowsH,
                            }}
                          />
                        ) : (
                          <>
                            {b.rows.map((r) => (
                              <div
                                key={r}
                                className={cn("absolute", style?.band)}
                                style={{
                                  left: `${left}%`,
                                  width: `${width}%`,
                                  top: lanesH + r * rowH + 1,
                                  height: rowH - 2,
                                }}
                              />
                            ))}
                            {/* bracket joining the participants' rows */}
                            <div
                              className={cn(
                                "absolute w-0 border-l-2",
                                key === "caucus"
                                  ? "border-dashed border-foreground/40"
                                  : "border-info/60",
                              )}
                              style={{
                                left: `${left}%`,
                                top: lanesH + minRow * rowH + 2,
                                height: (maxRow - minRow + 1) * rowH - 4,
                              }}
                            />
                          </>
                        )}
                      </div>
                    );
                  })}

                  {/* round markers */}
                  {model.rounds.map((r) =>
                    r.start > d0 && r.start < d1 ? (
                      <div
                        key={r.round}
                        className="absolute w-0 border-l border-dashed border-foreground/25"
                        style={{ left: `${x(r.start)}%`, top: 0, height: lanesH + rowsH }}
                      />
                    ) : null,
                  )}

                  {/* reply connectors */}
                  <svg
                    className="pointer-events-none absolute inset-x-0"
                    style={{ top: lanesH, height: rowsH, width: "100%" }}
                    viewBox={`0 0 1000 ${rowsH}`}
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    {model.links.map((l) => {
                      const a = model.byId.get(l.from);
                      const b = model.byId.get(l.to);
                      if (!a || !b) return null;
                      if (
                        !visible(
                          Math.min(a.start, b.start),
                          Math.max(a.start + a.dur, b.start + b.dur),
                        )
                      )
                        return null;
                      const hot =
                        l.to === activeId ||
                        l.to === selectedId ||
                        l.to === hover ||
                        l.to === focusId;
                      if (compact && !hot) return null;
                      const x1 = x(a.start + a.dur) * 10;
                      const x2 = x(b.start) * 10;
                      const y1 = a.row * rowH + rowH / 2;
                      const y2 = b.row * rowH + rowH / 2;
                      const dx = Math.max(12, Math.abs(x2 - x1) * 0.5);
                      return (
                        <path
                          key={`${l.from}-${l.to}`}
                          d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`}
                          fill="none"
                          stroke={hot ? look(b.speaker).color : "currentColor"}
                          strokeOpacity={hot ? 0.95 : 0.14}
                          strokeWidth={hot ? 2 : 1}
                          vectorEffect="non-scaling-stroke"
                          className="text-foreground"
                        />
                      );
                    })}
                  </svg>

                  {/* exchange labels (zoom buttons) */}
                  {model.bands.map((b) => {
                    if (!visible(b.start, b.end)) return null;
                    const key = exchangeKindKey(b.exchange);
                    const left = Math.max(0, x(b.start));
                    const right = Math.min(100, x(b.end));
                    const label = bandLabel(b);
                    const zoomed = typeof zoom === "object" && zoom.exchangeId === b.exchange.id;
                    return (
                      <button
                        key={b.exchange.id}
                        type="button"
                        onClick={() => setZoom(zoomed ? "all" : { exchangeId: b.exchange.id })}
                        aria-label={t.zoomTo(label)}
                        aria-pressed={zoomed}
                        title={[
                          label,
                          `${t.trigger}: ${L(b.exchange.trigger, lang)}`,
                          b.exchange.outcome
                            ? `${t.outcome}: ${L(b.exchange.outcome, lang)}`
                            : t.open,
                          `${fmtMin(b.start)} - ${fmtMin(b.end)}`,
                        ].join("\n")}
                        className={cn(
                          "absolute flex items-center truncate rounded-[5px] border px-1 text-left leading-none hover:border-foreground/50 focus-visible:outline-2 focus-visible:outline-ring",
                          compact ? "text-[9px]" : "text-[10px]",
                          KIND_STYLE[key]?.label,
                          zoomed && "ring-1 ring-foreground",
                        )}
                        style={{
                          left: `${left}%`,
                          width: `calc(${right - left}% - 2px)`,
                          top: b.lane * laneH + 2,
                          height: laneH - 4,
                        }}
                      >
                        <span className="truncate">{label}</span>
                      </button>
                    );
                  })}

                  {/* utterance bars */}
                  <fieldset
                    ref={trackRef}
                    className="m-0 min-w-0 border-0 p-0"
                    aria-label={t.label}
                    aria-describedby={`${uid}-keys`}
                    onKeyDown={onKey}
                  >
                    {model.items.map((it) => {
                      if (!visible(it.start, it.start + it.dur)) return null;
                      const a = look(it.speaker);
                      const isActive = it.id === activeId;
                      const isSel = it.id === selectedId;
                      const future = isFuture(it);
                      const inActiveRow = focus?.speaker === it.speaker;
                      const opacity = future
                        ? 0.18
                        : !focus || isActive
                          ? 1
                          : inActiveRow
                            ? 0.75
                            : 0.38;
                      const u = snap.utterances[it.id];
                      const line = speakerLine(run, it.speaker, u?.delegateId, lang);
                      return (
                        <button
                          key={it.id}
                          type="button"
                          data-tl-item={it.id}
                          tabIndex={it.id === tabTarget ? 0 : -1}
                          aria-label={`${it.id}, ${line}, ${u ? kinds[u.kind] : t.speaking}, ${fmtMin(it.start)}`}
                          aria-current={isActive ? "step" : undefined}
                          aria-pressed={onSelect ? isSel : undefined}
                          onClick={() => onSelect?.(it.id)}
                          onMouseEnter={() => setHover(it.id)}
                          onMouseLeave={() => setHover((h) => (h === it.id ? null : h))}
                          onFocus={() => {
                            setFocusId(it.id);
                            setHover(it.id);
                          }}
                          onBlur={() => setHover((h) => (h === it.id ? null : h))}
                          className={cn(
                            "absolute rounded-[3px] transition-opacity outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                            it.pending && "animate-pulse motion-reduce:animate-none",
                            isActive &&
                              "z-10 shadow-[0_0_0_2px_var(--background),0_0_0_3.5px_var(--foreground)]",
                            isSel && !isActive && "z-10 shadow-[0_0_0_1.5px_var(--foreground)]",
                          )}
                          style={{
                            left: `${x(it.start)}%`,
                            width: `${Math.max(0.25, x(it.start + it.dur) - x(it.start))}%`,
                            minWidth: 3,
                            top: lanesH + it.row * rowH + (compact ? 2 : 3),
                            height: rowH - (compact ? 4 : 6),
                            background: future ? "transparent" : a.color,
                            border: future ? `1px dashed ${a.color}` : undefined,
                            opacity,
                          }}
                        />
                      );
                    })}
                  </fieldset>

                  {/* playhead */}
                  {playhead !== null && playhead >= d0 && playhead <= d1 ? (
                    <div
                      className="pointer-events-none absolute z-20 w-0.5 -translate-x-1/2 rounded-full bg-foreground"
                      style={{ left: `${x(playhead)}%`, top: lanesH - 2, height: rowsH + 4 }}
                    >
                      <span className="absolute -top-1 left-1/2 size-2 -translate-x-1/2 rounded-full bg-foreground" />
                    </div>
                  ) : null}
                </div>

                {/* time axis */}
                <div className="relative h-4 border-t" aria-hidden="true">
                  {ticks.map((m) => (
                    <span
                      key={m}
                      className="absolute top-0 -translate-x-1/2 font-mono text-[9px] text-muted-foreground"
                      style={{ left: `${x(m)}%` }}
                    >
                      {fmtMin(m)}
                    </span>
                  ))}
                  {compact
                    ? null
                    : model.rounds.map((r) =>
                        r.start >= d0 && r.start < d1 ? (
                          <span
                            key={r.round}
                            className="absolute top-0 ml-1 font-mono text-[9px] font-medium"
                            style={{ left: `${x(r.start)}%` }}
                          >
                            R{r.round}
                          </span>
                        ) : null,
                      )}
                </div>

                {/* hover / focus preview */}
                {tip && visible(tip.start, tip.start + tip.dur) ? (
                  <div
                    role="tooltip"
                    className={cn(
                      "pointer-events-none absolute z-30 w-[min(22rem,80vw)] rounded-xl border bg-popover p-2.5 text-xs text-popover-foreground shadow-lg",
                    )}
                    style={{
                      ...(x(tip.start) > 60
                        ? { right: `${Math.max(0, 100 - x(tip.start + tip.dur))}%` }
                        : { left: `${Math.max(0, x(tip.start))}%` }),
                      ...(tip.row > model.rows.length / 2
                        ? { bottom: `calc(100% - ${lanesH + tip.row * rowH}px + 4px)` }
                        : { top: lanesH + (tip.row + 1) * rowH + 4 }),
                    }}
                  >
                    <TipBody
                      item={tip}
                      text={tipText}
                      snap={snap}
                      run={run}
                      lang={lang}
                      kindLabel={(k) => kinds[k as keyof typeof kinds] ?? k}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

function TipBody({
  item,
  text,
  snap,
  run,
  lang,
  kindLabel,
}: {
  item: TimelineItem;
  text: string;
  snap: SpeakerTimelineProps["snap"];
  run: Run | null;
  lang: Lang;
  kindLabel: (k: string) => string;
}) {
  const t = timelineStrings[lang];
  const u = snap.utterances[item.id];
  const a = agentLook(run, item.speaker, lang);
  const to = (u?.addressedTo ?? []).filter((s) => s !== item.speaker);
  const reply = item.respondsTo ? snap.utterances[item.respondsTo] : null;
  return (
    <>
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <span
          className="inline-grid h-4 min-w-5 place-items-center rounded-[4px] px-0.5 text-[8px] font-semibold text-white"
          style={{ background: a.color }}
        >
          {a.code}
        </span>
        <span className="font-medium">{speakerLine(run, item.speaker, u?.delegateId, lang)}</span>
      </div>
      <div className="mb-1 flex flex-wrap gap-x-2 font-mono text-[10px] text-muted-foreground">
        <span>{item.id}</span>
        {u ? <span>{kindLabel(u.kind)}</span> : <span>{t.speaking}</span>}
        <span>
          {t.at} {fmtMin(item.start)} · {t.minutes(item.dur)}
        </span>
      </div>
      <div className="mb-1 text-[11px] text-muted-foreground">
        {to.length
          ? `${t.addressed} ${to.map((s) => agentLook(run, s, lang).code).join(", ")}`
          : t.table}
        {reply
          ? ` · ↩ ${t.respondsTo} ${reply.id} (${agentLook(run, reply.speaker, lang).code})`
          : ""}
      </div>
      {text ? <p className="leading-snug">{text}</p> : null}
    </>
  );
}
