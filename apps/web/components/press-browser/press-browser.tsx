"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PageText } from "@/components/press-original/ocr";
import { type LayerMode, TextLayer } from "@/components/press-original/text-layer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Level } from "@/lib/prefs";

export interface PressItem {
  pageId: number;
  pageNo: number;
  file: string;
  outlet: string | null;
  date: string;
  width: number;
  height: number;
  available: boolean;
  positions: { sourceId: string; key: string; name: string }[];
}

interface Filters {
  year: string | null;
  outlet: string | null;
  inst: string | null;
}

const ALL = "__all";
/** Pages within this distance of the viewport get their image and text layer mounted. */
const NEAR_MARGIN = "1600px 0px";
/** Height of the sticky top bar; the toolbar below it is sticky from sm up. */
const TOP_BAR = 50;

const MSG = {
  de: {
    notice:
      "Originalseiten aus dem DVSV-Pressespiegel, nur zur Prüfung der Quellen; die Simulation nutzt ausschließlich personenbereinigte Paraphrasen.",
    year: "Jahr",
    outlet: "Medium",
    inst: "Institution",
    allYears: "Alle Jahre",
    allOutlets: "Alle Medien",
    allInsts: "Alle Institutionen",
    layer: "Textebene",
    off: "Aus",
    subtle: "Dezent",
    highlight: "Hervorgehoben",
    date: "Zu Datum springen",
    prev: "Vorige Seite",
    next: "Nächste Seite",
    page: "Seite",
    of: "von",
    empty: "Keine Seiten für diese Auswahl.",
    reset: "Filter zurücksetzen",
    missing: "Originalseite auf diesem Rechner nicht verfügbar.",
    alt: "Originalseite des Pressespiegels",
    aria: "Erkannter Text der Originalseite",
    used: "Verwendete Passage",
    hover: { conf: "Konfidenz", block: "Block", low: "unsicher" },
    original: "Einzeln prüfen",
    keys: "Seite vor und zurück",
  },
  en: {
    notice:
      "Original pages from the DVSV press review, shown only to check sources; the simulation uses person-free paraphrases only.",
    year: "Year",
    outlet: "Outlet",
    inst: "Institution",
    allYears: "All years",
    allOutlets: "All outlets",
    allInsts: "All institutions",
    layer: "Text layer",
    off: "Off",
    subtle: "Subtle",
    highlight: "Highlighted",
    date: "Jump to date",
    prev: "Previous page",
    next: "Next page",
    page: "page",
    of: "of",
    empty: "No pages for this selection.",
    reset: "Reset filters",
    missing: "Original page not available on this machine.",
    alt: "Original press review page",
    aria: "Recognised text of the original page",
    used: "Used passage",
    hover: { conf: "confidence", block: "block", low: "unsure" },
    original: "Check alone",
    keys: "page forward and back",
  },
} as const;

type T = (typeof MSG)[keyof typeof MSG];

// OCR text per page, shared across mounts; bounded so a long scroll does not keep every page.
const TEXT_CACHE_MAX = 48;
const textCache = new Map<number, Promise<PageText | null>>();

function loadText(pageId: number): Promise<PageText | null> {
  const hit = textCache.get(pageId);
  if (hit) {
    textCache.delete(pageId);
    textCache.set(pageId, hit);
    return hit;
  }
  const p = fetch(`/api/press/original/${pageId}/text`)
    .then((r) => (r.ok ? (r.json() as Promise<PageText>) : null))
    .catch(() => {
      textCache.delete(pageId);
      return null;
    });
  textCache.set(pageId, p);
  if (textCache.size > TEXT_CACHE_MAX) {
    const oldest = textCache.keys().next().value;
    if (oldest !== undefined) textCache.delete(oldest);
  }
  return p;
}

function formatDate(iso: string, lang: "de" | "en"): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === "de" ? "de-AT" : "en-GB", {
    day: "2-digit",
    month: lang === "de" ? "2-digit" : "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

const EMPTY: ReadonlySet<string> = new Set();

const PageBody = memo(function PageBody({
  item,
  mode,
  showHover,
  t,
}: {
  item: PressItem;
  mode: LayerMode;
  showHover: boolean;
  t: T;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [text, setText] = useState<PageText | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setNear(!!e?.isIntersecting), {
      rootMargin: NEAR_MARGIN,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!near || !item.available) {
      setText(null);
      return;
    }
    let live = true;
    loadText(item.pageId).then((p) => {
      if (live) setText(p);
    });
    return () => {
      live = false;
    };
  }, [near, item.pageId, item.available]);

  return (
    <div
      ref={ref}
      className="ptl-frame overflow-hidden rounded-xl border"
      style={{ aspectRatio: `${item.width} / ${item.height}` }}
    >
      {!item.available ? (
        <p className="p-4 text-sm text-muted-foreground">{t.missing}</p>
      ) : near ? (
        <>
          {/* biome-ignore lint/performance/noImgElement: local, unoptimised scan served by our own route */}
          <img
            src={`/api/press/original/${item.pageId}`}
            alt={t.alt}
            width={item.width}
            height={item.height}
            decoding="async"
            className="block h-auto w-full select-none"
            draggable={false}
          />
          {text ? (
            <TextLayer
              page={text}
              mode={mode}
              colorBy="block"
              usedBlockIds={EMPTY}
              usedLabel={t.used}
              hits={EMPTY}
              activeHit={null}
              showHover={showHover}
              hoverLabels={t.hover}
              ariaLabel={t.aria}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
});

function FilterSelect({
  value,
  onChange,
  label,
  allLabel,
  options,
  className,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  label: string;
  allLabel: string;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? null : v)}>
      <SelectTrigger size="sm" aria-label={label} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function PressBrowser({
  lang,
  level,
  items,
  initial,
}: {
  lang: "de" | "en";
  level: Level;
  items: PressItem[];
  initial: Filters;
}) {
  const t = MSG[lang];
  const [filters, setFilters] = useState<Filters>(initial);
  const [mode, setMode] = useState<LayerMode>("subtle");
  const [current, setCurrent] = useState(0);
  const listRef = useRef<HTMLOListElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  // Pages scroll to just below the top bar and, where it sticks, the toolbar.
  const scrollOffset = useCallback(() => {
    const bar = barRef.current;
    if (!bar || getComputedStyle(bar).position !== "sticky") return TOP_BAR;
    return TOP_BAR + bar.offsetHeight;
  }, []);

  const options = useMemo(() => {
    const years = new Set<string>();
    const outlets = new Map<string, number>();
    const insts = new Map<string, string>();
    for (const it of items) {
      if (it.date) years.add(it.date.slice(0, 4));
      if (it.outlet) outlets.set(it.outlet, (outlets.get(it.outlet) ?? 0) + 1);
      for (const p of it.positions) insts.set(p.key, p.name);
    }
    return {
      years: [...years]
        .sort()
        .reverse()
        .map((y) => ({ value: y, label: y })),
      outlets: [...outlets.keys()]
        .sort((a, b) => a.localeCompare(b, "de"))
        .map((o) => ({ value: o, label: o })),
      insts: [...insts.entries()]
        .sort((a, b) => a[1].localeCompare(b[1], "de"))
        .map(([value, label]) => ({ value, label })),
    };
  }, [items]);

  const shown = useMemo(
    () =>
      items.filter(
        (it) =>
          (!filters.year || it.date.startsWith(filters.year)) &&
          (!filters.outlet || it.outlet === filters.outlet) &&
          (!filters.inst || it.positions.some((p) => p.key === filters.inst)),
      ),
    [items, filters],
  );

  const setFilter = (key: keyof Filters, value: string | null) => {
    const next = { ...filters, [key]: value };
    setFilters(next);
    setCurrent(0);
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) q.set(k, v);
    const s = q.toString();
    window.history.replaceState(null, "", s ? `?${s}` : window.location.pathname);
    window.scrollTo({ top: 0 });
  };

  // While a programmatic scroll runs, its target is the current page; key repeats step from it.
  const target = useRef<{ idx: number; until: number } | null>(null);

  // The current page is the last one whose top has passed the line just below the toolbar.
  // Every page has a fixed height (aspect ratio from the JPEG header), so a binary search over
  // the list items on scroll is exact and cheap.
  // biome-ignore lint/correctness/useExhaustiveDependencies: shown changes the list children
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      if (target.current && performance.now() < target.current.until) return;
      target.current = null;
      const els = list.children;
      const line = scrollOffset() + 48;
      let lo = 0;
      let hi = els.length - 1;
      let found = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const top = (els[mid] as HTMLElement).getBoundingClientRect().top;
        if (top <= line) {
          found = mid;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      setCurrent(found);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scrollend", update);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("scrollend", update);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [shown, scrollOffset]);

  const goTo = useCallback(
    (idx: number) => {
      const i = Math.max(0, Math.min(shown.length - 1, idx));
      const el = listRef.current?.children[i] as HTMLElement | undefined;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY - scrollOffset();
      const smooth = Math.abs(i - current) <= 1;
      target.current = { idx: i, until: performance.now() + (smooth ? 900 : 150) };
      window.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
      setCurrent(i);
    },
    [shown.length, current, scrollOffset],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const el = e.target as HTMLElement | null;
      if (
        el?.closest(
          "input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='listbox'], [role='combobox'], [role='dialog']",
        )
      )
        return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        goTo(current + 1);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        goTo(current - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, current]);

  const jumpToDate = (iso: string) => {
    if (!iso || !shown.length) return;
    // Newest first: the first page on or before the chosen day, else the oldest page.
    const idx = shown.findIndex((it) => it.date <= iso);
    goTo(idx < 0 ? shown.length - 1 : idx);
  };

  const dates = shown.map((it) => it.date).filter(Boolean);
  const showHover = level === "engineer";
  const anyFilter = !!(filters.year || filters.outlet || filters.inst);

  return (
    <div className="flex flex-col gap-4">
      <div
        ref={barRef}
        className="z-10 sm:sticky sm:top-[50px] -mx-4 border-b bg-background/95 px-4 py-2.5 backdrop-blur sm:-mx-8 sm:px-8"
      >
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            value={filters.year}
            onChange={(v) => setFilter("year", v)}
            label={t.year}
            allLabel={t.allYears}
            options={options.years}
          />
          <FilterSelect
            value={filters.outlet}
            onChange={(v) => setFilter("outlet", v)}
            label={t.outlet}
            allLabel={t.allOutlets}
            options={options.outlets}
            className="max-w-[14rem]"
          />
          <FilterSelect
            value={filters.inst}
            onChange={(v) => setFilter("inst", v)}
            label={t.inst}
            allLabel={t.allInsts}
            options={options.insts}
            className="max-w-[14rem]"
          />
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={0}
            value={mode}
            onValueChange={(v) => {
              if (v) setMode(v as LayerMode);
            }}
            aria-label={t.layer}
            title={t.layer}
          >
            <ToggleGroupItem value="off">{t.off}</ToggleGroupItem>
            <ToggleGroupItem value="subtle">{t.subtle}</ToggleGroupItem>
            <ToggleGroupItem value="highlight">{t.highlight}</ToggleGroupItem>
          </ToggleGroup>
          <span className="flex-1" />
          <Input
            type="date"
            aria-label={t.date}
            title={t.date}
            min={dates.at(-1)}
            max={dates[0]}
            onChange={(e) => jumpToDate(e.target.value)}
            className="h-8 w-[9.5rem] text-sm"
          />
          <div className="flex items-center gap-1">
            <Button
              size="icon-sm"
              variant="outline"
              aria-label={t.prev}
              title={`${t.prev} (k)`}
              disabled={current <= 0}
              onClick={() => goTo(current - 1)}
            >
              ↑
            </Button>
            <span
              className="num min-w-[5.5rem] text-center text-sm tabular-nums"
              aria-live="polite"
              title={`j / k, ↓ / ↑: ${t.keys}`}
            >
              {shown.length ? current + 1 : 0} / {shown.length}
            </span>
            <Button
              size="icon-sm"
              variant="outline"
              aria-label={t.next}
              title={`${t.next} (j)`}
              disabled={current >= shown.length - 1}
              onClick={() => goTo(current + 1)}
            >
              ↓
            </Button>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{t.notice}</p>

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
          {t.empty}{" "}
          {anyFilter ? (
            <button
              type="button"
              className="underline underline-offset-2 hover:text-foreground"
              onClick={() => {
                setFilters({ year: null, outlet: null, inst: null });
                window.history.replaceState(null, "", window.location.pathname);
              }}
            >
              {t.reset}
            </button>
          ) : null}
        </div>
      ) : null}

      <ol ref={listRef} className="mx-auto flex w-full max-w-[920px] flex-col gap-10">
        {shown.map((it, i) => (
          <li key={it.pageId} data-idx={i} data-page={it.pageId}>
            <header className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
              {it.outlet ? <span className="font-medium">{it.outlet}</span> : null}
              <span className="num text-muted-foreground">{formatDate(it.date, lang)}</span>
              <span className="min-w-0 truncate text-xs text-muted-foreground" title={it.file}>
                {it.file}, {t.page} {it.pageNo}
              </span>
              <span className="flex-1" />
              <span className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs">
                {it.positions.map((p) => (
                  <Link
                    key={p.sourceId}
                    href={`/archive/sources/${encodeURIComponent(p.sourceId)}`}
                    className="text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
                  >
                    {p.name}
                  </Link>
                ))}
                {it.positions[0] ? (
                  <Link
                    href={`/archive/original/${encodeURIComponent(it.positions[0].sourceId)}`}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {t.original} ↗
                  </Link>
                ) : null}
              </span>
            </header>
            <PageBody item={it} mode={mode} showHover={showHover} t={t} />
          </li>
        ))}
      </ol>
    </div>
  );
}
