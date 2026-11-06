"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Level } from "@/lib/prefs";
import { LOW_CONF, type PageText, pageToText } from "./ocr";
import type { PassageMatch } from "./passage";
import { blockHue, type ColorBy, confColor, type LayerMode, TextLayer } from "./text-layer";

export interface Paraphrase {
  institution: string;
  title: string | null;
  text: string;
}

interface Props {
  lang: "de" | "en";
  level: Level;
  imageSrc: string;
  alt: string;
  page: PageText | null;
  used: PassageMatch | null;
  paraphrase: Paraphrase | null;
}

const MSG = {
  de: {
    layer: "Textebene",
    off: "Aus",
    subtle: "Dezent",
    highlight: "Hervorgehoben",
    byBlock: "nach Block",
    byConf: "nach Konfidenz",
    legendBlock:
      "Jede Farbe ist ein OCR-Block; der Umriss zeigt, was zusammenhängend erkannt wurde.",
    legendConf: "Konfidenz der Texterkennung:",
    confHigh: "sicher",
    confMid: "mittel",
    confLow: "unsicher",
    lowMark: "unsichere Wörter rot unterstrichen",
    offHint: "Text bleibt unsichtbar markier- und kopierbar.",
    subtleHint: "Grauer Schleier über jedem erkannten Wort.",
    search: "Auf der Seite suchen",
    searchPlaceholder: "Wort oder Wortteil",
    hits: (n: number) => (n === 1 ? "1 Treffer" : `${n} Treffer`),
    noHits: "Keine Treffer",
    prev: "Voriger Treffer",
    next: "Nächster Treffer",
    copy: "Text kopieren",
    copyPage: "Ganze Seite",
    copyPassage: "Verwendete Passage",
    copied: "Kopiert",
    copyFailed: "Kopieren fehlgeschlagen",
    fullRes: "Volle Auflösung",
    used: "Verwendete Passage",
    usedExplain:
      "Die Simulation verwendet nicht diesen Text, sondern die personenbereinigte Paraphrase unten. Der Umriss zeigt den OCR-Block mit der größten Wortüberlappung zu Institution und Paraphrase: eine Orientierung für die Prüfung, keine Zitatstelle.",
    usedNone:
      "Keine Passage mit ausreichender Überlappung gefunden. Die Paraphrase fasst die Seite freier zusammen oder der Beleg liegt in einem Bild oder einer Tabelle.",
    noParaphrase: "Die Paraphrase konnte nicht geladen werden (Datenbank nicht erreichbar).",
    jump: "Zur Passage",
    terms: "Übereinstimmende Begriffe",
    paraphrase: "Paraphrase in der Stimme der Institution",
    stats: (w: number, b: number, d: number) =>
      `${w} Wörter in ${b} Blöcken, ${d} unter ${LOW_CONF} % Konfidenz`,
    dropped: (d: number) => `${d} Wörter unter 30 % verworfen`,
    noText: "Für diese Seite liegt kein OCR-Text vor; nur das Bild wird gezeigt.",
    hover: { conf: "Konfidenz", block: "Block", low: "unsicher" },
    aria: "Erkannter Text der Originalseite",
    selectHint:
      "Text auf der Seite wie in einem PDF markieren und mit Strg+C kopieren; Zeilen und Absätze bleiben erhalten.",
  },
  en: {
    layer: "Text layer",
    off: "Off",
    subtle: "Subtle",
    highlight: "Highlighted",
    byBlock: "by block",
    byConf: "by confidence",
    legendBlock: "Each colour is one OCR block; the outline shows what was recognised as one unit.",
    legendConf: "OCR confidence:",
    confHigh: "sure",
    confMid: "medium",
    confLow: "unsure",
    lowMark: "unsure words underlined in red",
    offHint: "Text stays invisibly selectable and copyable.",
    subtleHint: "Grey veil over every recognised word.",
    search: "Search on the page",
    searchPlaceholder: "word or part of a word",
    hits: (n: number) => (n === 1 ? "1 hit" : `${n} hits`),
    noHits: "No hits",
    prev: "Previous hit",
    next: "Next hit",
    copy: "Copy text",
    copyPage: "Whole page",
    copyPassage: "Used passage",
    copied: "Copied",
    copyFailed: "Copy failed",
    fullRes: "Full resolution",
    used: "Used passage",
    usedExplain:
      "The simulation does not use this text but the person-free paraphrase below. The outline marks the OCR block with the largest word overlap with the institution and the paraphrase: a pointer for checking, not a quotation.",
    usedNone:
      "No passage with enough overlap found. The paraphrase summarises the page more freely, or the evidence sits in a picture or a table.",
    noParaphrase: "The paraphrase could not be loaded (database unreachable).",
    jump: "Go to passage",
    terms: "Matching terms",
    paraphrase: "Paraphrase in the institution's voice",
    stats: (w: number, b: number, d: number) =>
      `${w} words in ${b} blocks, ${d} below ${LOW_CONF} % confidence`,
    dropped: (d: number) => `${d} words below 30 % dropped`,
    noText: "No OCR text for this page; only the image is shown.",
    hover: { conf: "confidence", block: "block", low: "unsure" },
    aria: "Recognised text of the original page",
    selectHint:
      "Select text on the page as in a PDF and copy it with Ctrl+C; lines and paragraphs are kept.",
  },
} as const;

function norm(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

export function PressOriginalViewer({ lang, level, imageSrc, alt, page, used, paraphrase }: Props) {
  const t = MSG[lang];
  const [mode, setMode] = useState<LayerMode>("subtle");
  const [colorBy, setColorBy] = useState<ColorBy>("block");
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [copied, setCopied] = useState<"page" | "passage" | "failed" | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const usedIds = useMemo(() => new Set(used?.blockIds ?? []), [used]);

  const allWords = useMemo(() => {
    const out: { id: string; key: string }[] = [];
    if (!page) return out;
    for (const b of page.blocks)
      for (const p of b.paragraphs)
        for (const l of p.lines) for (const w of l.words) out.push({ id: w.id, key: norm(w.text) });
    return out;
  }, [page]);

  const hitList = useMemo(() => {
    const q = norm(query);
    if (q.length < 2) return [];
    return allWords.filter((w) => w.key.includes(q)).map((w) => w.id);
  }, [allWords, query]);
  const hits = useMemo(() => new Set(hitList), [hitList]);
  const activeHit = hitList.length
    ? hitList[((cursor % hitList.length) + hitList.length) % hitList.length]
    : null;

  const lowCount = useMemo(() => {
    let n = 0;
    if (!page) return n;
    for (const b of page.blocks)
      for (const p of b.paragraphs)
        for (const l of p.lines) for (const w of l.words) if (w.conf < LOW_CONF) n++;
    return n;
  }, [page]);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  async function copy(kind: "page" | "passage") {
    if (!page) return;
    const text = kind === "page" ? pageToText(page) : pageToText(page, usedIds);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
    } catch {
      setCopied("failed");
    }
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(null), 1600);
  }

  function jumpToPassage() {
    const first = used?.blockIds[0];
    if (!first) return;
    document
      .querySelector(`[data-block="${CSS.escape(first)}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  const legendSwatch = (color: string, label: string) => (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block size-3 rounded-[3px] border" style={{ background: color }} />
      {label}
    </span>
  );

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <div className="ptl-frame overflow-hidden rounded-2xl border">
          {/* biome-ignore lint/performance/noImgElement: local, unoptimised scan served by our own route */}
          <img
            src={imageSrc}
            alt={alt}
            className="block h-auto w-full select-none"
            draggable={false}
          />
          {page ? (
            <TextLayer
              page={page}
              mode={mode}
              colorBy={colorBy}
              usedBlockIds={usedIds}
              usedLabel={t.used}
              hits={hits}
              activeHit={activeHit}
              showHover={level === "engineer"}
              hoverLabels={t.hover}
              ariaLabel={t.aria}
            />
          ) : null}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{page ? t.selectHint : t.noText}</p>
      </div>

      <aside className="space-y-3 lg:sticky lg:top-[66px] lg:self-start">
        <section className="rounded-2xl border bg-card p-3 sm:p-4">
          <h2 className="mb-2 text-sm font-medium">{t.layer}</h2>
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
            disabled={!page}
          >
            <ToggleGroupItem value="off">{t.off}</ToggleGroupItem>
            <ToggleGroupItem value="subtle">{t.subtle}</ToggleGroupItem>
            <ToggleGroupItem value="highlight">{t.highlight}</ToggleGroupItem>
          </ToggleGroup>
          {mode === "highlight" ? (
            <div className="mt-3 space-y-2 text-xs">
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                spacing={0}
                value={colorBy}
                onValueChange={(v) => {
                  if (v) setColorBy(v as ColorBy);
                }}
                aria-label={`${t.byBlock} / ${t.byConf}`}
              >
                <ToggleGroupItem value="block">{t.byBlock}</ToggleGroupItem>
                <ToggleGroupItem value="conf">{t.byConf}</ToggleGroupItem>
              </ToggleGroup>
              {colorBy === "block" ? (
                <p className="text-muted-foreground">
                  <span className="mr-1 inline-flex gap-0.5 align-middle">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span
                        key={n}
                        className="inline-block size-3 rounded-[3px]"
                        style={{ background: `oklch(0.72 0.14 ${blockHue(n).toFixed(1)})` }}
                      />
                    ))}
                  </span>
                  {t.legendBlock}
                </p>
              ) : (
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
                  <span>{t.legendConf}</span>
                  {legendSwatch(confColor(95), `${t.confHigh} ≥ 90`)}
                  {legendSwatch(confColor(80), `${t.confMid} ≥ ${LOW_CONF}`)}
                  {legendSwatch(confColor(50), `${t.confLow} < ${LOW_CONF}`)}
                  <span>· {t.lowMark}</span>
                </p>
              )}
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              {mode === "off" ? t.offHint : t.subtleHint}
            </p>
          )}
        </section>

        <section className="rounded-2xl border bg-card p-3 sm:p-4">
          <label htmlFor="press-search" className="mb-2 block text-sm font-medium">
            {t.search}
          </label>
          <div className="flex items-center gap-1.5">
            <Input
              id="press-search"
              type="search"
              value={query}
              placeholder={t.searchPlaceholder}
              disabled={!page}
              onChange={(e) => {
                setQuery(e.target.value);
                setCursor(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setCursor((c) => c + (e.shiftKey ? -1 : 1));
                }
              }}
              className="h-8 text-sm"
            />
            <Button
              size="icon-sm"
              variant="outline"
              aria-label={t.prev}
              title={t.prev}
              disabled={!hitList.length}
              onClick={() => setCursor((c) => c - 1)}
            >
              ↑
            </Button>
            <Button
              size="icon-sm"
              variant="outline"
              aria-label={t.next}
              title={t.next}
              disabled={!hitList.length}
              onClick={() => setCursor((c) => c + 1)}
            >
              ↓
            </Button>
          </div>
          <p className="num mt-1.5 text-xs text-muted-foreground" aria-live="polite">
            {norm(query).length >= 2
              ? hitList.length
                ? `${t.hits(hitList.length)} · ${(((cursor % hitList.length) + hitList.length) % hitList.length) + 1}/${hitList.length}`
                : t.noHits
              : " "}
          </p>
        </section>

        <section className="rounded-2xl border bg-card p-3 sm:p-4">
          <h2 className="mb-2 text-sm font-medium">{t.copy}</h2>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" disabled={!page} onClick={() => copy("page")}>
              {copied === "page" ? t.copied : t.copyPage}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!page || !used}
              onClick={() => copy("passage")}
            >
              {copied === "passage" ? t.copied : t.copyPassage}
            </Button>
            <Button asChild size="sm" variant="ghost">
              <a href={imageSrc} target="_blank" rel="noreferrer">
                {t.fullRes} ↗
              </a>
            </Button>
          </div>
          {copied === "failed" ? (
            <p className="mt-1 text-xs text-destructive">{t.copyFailed}</p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-warning/40 bg-warning/5 p-3 sm:p-4">
          <div className="mb-1 flex items-center gap-2">
            <span className="inline-block h-3 w-5 rounded-[3px] border-2 border-dashed border-warning" />
            <h2 className="text-sm font-medium">{t.used}</h2>
          </div>
          {!paraphrase ? (
            <p className="text-xs text-muted-foreground">{t.noParaphrase}</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">{used ? t.usedExplain : t.usedNone}</p>
              {used ? (
                <>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {used.matched.slice(0, 12).map((m) => (
                      <span
                        key={m}
                        className="rounded-[5px] border bg-background px-1.5 py-0.5 text-[11px]"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                  <Button size="sm" variant="outline" className="mt-2" onClick={jumpToPassage}>
                    {t.jump}
                  </Button>
                </>
              ) : null}
              <div className="mt-3 border-t pt-2">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t.paraphrase}
                </div>
                <div className="mt-1 text-sm font-medium">{paraphrase.institution}</div>
                {paraphrase.title ? <div className="text-sm">{paraphrase.title}</div> : null}
                <p className="mt-1 text-sm leading-snug text-muted-foreground">{paraphrase.text}</p>
              </div>
            </>
          )}
        </section>

        {page && level === "engineer" ? (
          <p className="num px-1 font-mono text-[11px] text-muted-foreground">
            {t.stats(page.wordCount, page.blocks.length, lowCount)} · {t.dropped(page.dropped)} ·{" "}
            {page.width}×{page.height}px
          </p>
        ) : null}
      </aside>
    </div>
  );
}
