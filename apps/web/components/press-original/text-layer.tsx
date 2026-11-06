"use client";

import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LOW_CONF, type OcrWord, type PageText } from "./ocr";
import "./text-layer.css";

export type LayerMode = "off" | "subtle" | "highlight";
export type ColorBy = "block" | "conf";

/** Font size as a share of the OCR line height; glyph boxes sit a little inside the line. */
const FONT_RATIO = 0.84;

interface Props {
  page: PageText;
  mode: LayerMode;
  colorBy: ColorBy;
  usedBlockIds: ReadonlySet<string>;
  usedLabel: string;
  /** Word ids that match the search, and the one the user stepped to. */
  hits: ReadonlySet<string>;
  activeHit: string | null;
  /** Engineer level: hover shows the word, its confidence and block. */
  showHover: boolean;
  hoverLabels: { conf: string; block: string; low: string };
  ariaLabel: string;
}

function pct(v: number, of: number): string {
  return `${(v / Math.max(1, of)) * 100}%`;
}

export function blockHue(num: number): number {
  return (num * 137.508) % 360;
}

export function confColor(conf: number): string {
  if (conf >= 90) return "oklch(0.78 0.16 150)";
  if (conf >= LOW_CONF) return "oklch(0.82 0.15 85)";
  return "oklch(0.68 0.2 25)";
}

/**
 * Transparent text spans over the page image. Boxes are percentages of their parent (block
 * inside page, line inside block, word inside line), so the layer follows the image at any
 * width. Font size and line height use container-query units of the surrounding `.ptl-frame`.
 * The horizontal fit (scaleX) needs the real glyph width, measured once per page on a canvas.
 */
export function TextLayer({
  page,
  mode,
  colorBy,
  usedBlockIds,
  usedLabel,
  hits,
  activeHit,
  showHover,
  hoverLabels,
  ariaLabel,
}: Props) {
  const rootRef = useRef<HTMLElement>(null);
  const [scales, setScales] = useState<Map<string, number> | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; word: OcrWord; block: string } | null>(
    null,
  );

  const words = useMemo(() => {
    const m = new Map<string, { word: OcrWord; block: string }>();
    for (const b of page.blocks)
      for (const p of b.paragraphs)
        for (const l of p.lines) for (const w of l.words) m.set(w.id, { word: w, block: b.id });
    return m;
  }, [page]);

  // Measure natural glyph widths with the layer's own font so scaleX fits each OCR box.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      const ctx = document.createElement("canvas").getContext("2d");
      if (!ctx) return;
      ctx.font = `100px ${getComputedStyle(root).fontFamily}`;
      const m = new Map<string, number>();
      for (const b of page.blocks)
        for (const p of b.paragraphs)
          for (const l of p.lines) {
            const fs = l.box[3] * FONT_RATIO;
            for (const w of l.words) {
              const natural = (ctx.measureText(w.text).width / 100) * fs;
              m.set(w.id, natural > 0 ? w.box[2] / natural : 1);
            }
          }
      setScales(m);
    };
    const fonts = document.fonts;
    if (fonts && fonts.status !== "loaded") fonts.ready.then(run);
    else run();
    return () => {
      cancelled = true;
    };
  }, [page]);

  // Copy: the browser would join absolutely positioned spans unpredictably; give it the
  // selected words in reading order with one line per OCR line and a blank line per block.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onCopy = (e: ClipboardEvent) => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (!range.intersectsNode(root)) return;
      const out: string[] = [];
      for (const blockEl of root.querySelectorAll<HTMLElement>("[data-block]")) {
        if (!range.intersectsNode(blockEl)) continue;
        const lines: string[] = [];
        for (const lineEl of blockEl.querySelectorAll<HTMLElement>("[data-line]")) {
          if (!range.intersectsNode(lineEl)) continue;
          const ws: string[] = [];
          for (const wordEl of lineEl.querySelectorAll<HTMLElement>("[data-word]"))
            if (range.intersectsNode(wordEl)) ws.push(wordEl.textContent ?? "");
          if (ws.length) lines.push(ws.join(" "));
        }
        if (lines.length) out.push(lines.join("\n"));
      }
      if (!out.length) return;
      e.preventDefault();
      e.clipboardData?.setData("text/plain", out.join("\n\n"));
    };
    document.addEventListener("copy", onCopy);
    return () => document.removeEventListener("copy", onCopy);
  }, []);

  useEffect(() => {
    if (!activeHit || !rootRef.current) return;
    rootRef.current
      .querySelector(`[data-word="${CSS.escape(activeHit)}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeHit]);

  const { width: W, height: H } = page;
  let usedLabelled = false;

  return (
    <>
      <section
        ref={rootRef}
        className="ptl"
        data-mode={mode}
        data-color={colorBy}
        aria-label={ariaLabel}
        onMouseMove={
          showHover
            ? (e) => {
                const el = (e.target as HTMLElement).closest?.("[data-word]");
                const id = el?.getAttribute("data-word");
                const hit = id ? words.get(id) : undefined;
                setTip(hit ? { x: e.clientX, y: e.clientY, ...hit } : null);
              }
            : undefined
        }
        onMouseLeave={showHover ? () => setTip(null) : undefined}
      >
        {page.blocks.map((b) => {
          const used = usedBlockIds.has(b.id);
          const label = used && !usedLabelled ? usedLabel : undefined;
          if (label) usedLabelled = true;
          const blockStyle = {
            left: pct(b.box[0], W),
            top: pct(b.box[1], H),
            width: pct(b.box[2], W),
            height: pct(b.box[3], H),
            "--blk": `oklch(0.72 0.14 ${blockHue(b.num).toFixed(1)})`,
          } as CSSProperties;
          return (
            <div
              key={b.id}
              data-block={b.id}
              data-used={used ? "" : undefined}
              data-used-label={label}
              data-side={b.box[0] + b.box[2] / 2 > W / 2 ? "right" : undefined}
              style={blockStyle}
            >
              {b.paragraphs.map((p) =>
                p.lines.map((l) => {
                  const lineStyle: CSSProperties = {
                    left: pct(l.box[0] - b.box[0], b.box[2]),
                    top: pct(l.box[1] - b.box[1], b.box[3]),
                    width: pct(l.box[2], b.box[2]),
                    height: pct(l.box[3], b.box[3]),
                    fontSize: `${((l.box[3] * FONT_RATIO) / W) * 100}cqw`,
                    lineHeight: `${(l.box[3] / W) * 100}cqw`,
                  };
                  return (
                    <div key={l.id} data-line={l.id} data-par={p.id} style={lineStyle}>
                      {l.words.map((w, i) => {
                        const sx = scales?.get(w.id) ?? 1;
                        const style = {
                          left: pct(w.box[0] - l.box[0], l.box[2]),
                          transform: sx === 1 ? undefined : `scaleX(${sx.toFixed(4)})`,
                          "--cc": confColor(w.conf),
                        } as CSSProperties;
                        const hit = hits.has(w.id)
                          ? w.id === activeHit
                            ? "active"
                            : ""
                          : undefined;
                        return (
                          <span key={w.id}>
                            {i > 0 ? " " : null}
                            <span
                              data-word={w.id}
                              data-low={w.conf < LOW_CONF ? "" : undefined}
                              data-hit={hit}
                              style={style}
                            >
                              {w.text}
                            </span>
                          </span>
                        );
                      })}
                    </div>
                  );
                }),
              )}
            </div>
          );
        })}
      </section>
      {tip
        ? createPortal(
            <div
              className="ptl-tip"
              role="status"
              style={{
                left: Math.min(tip.x + 14, window.innerWidth - 330),
                top: tip.y + 18,
              }}
            >
              <div className="font-medium">{tip.word.text}</div>
              <div className="num font-mono text-[11px] text-muted-foreground">
                {hoverLabels.conf} {tip.word.conf.toFixed(1)} %
                {tip.word.conf < LOW_CONF ? ` (${hoverLabels.low})` : ""} · {hoverLabels.block}{" "}
                {tip.block} · {tip.word.box.join(",")}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
