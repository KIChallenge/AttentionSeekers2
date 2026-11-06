// OCR text of one press review page: Tesseract TSV (levels page, block, paragraph, line,
// word) parsed into nested blocks with boxes in image pixels. Pure functions, shared by the
// API route, the server page and the client text layer.

/** [left, top, width, height] in image pixels. */
export type Box = [number, number, number, number];

export interface OcrWord {
  /** Stable id "b-p-l-w" from the TSV counters. */
  id: string;
  text: string;
  box: Box;
  /** Tesseract confidence 0..100, rounded to one decimal. */
  conf: number;
}

export interface OcrLine {
  id: string;
  box: Box;
  words: OcrWord[];
}

export interface OcrParagraph {
  id: string;
  box: Box;
  lines: OcrLine[];
}

export interface OcrBlock {
  id: string;
  /** 1-based block number from Tesseract. */
  num: number;
  box: Box;
  paragraphs: OcrParagraph[];
}

export interface PageText {
  pageId: number;
  width: number;
  height: number;
  blocks: OcrBlock[];
  /** Words dropped by the confidence filter. */
  dropped: number;
  wordCount: number;
}

/** Words below this confidence are noise (rulers, speckles) and are left out entirely. */
export const MIN_CONF = 30;
/** Words below this are kept but marked as low confidence in the highlighted mode. */
export const LOW_CONF = 70;

const COLS = [
  "level",
  "page_num",
  "block_num",
  "par_num",
  "line_num",
  "word_num",
  "left",
  "top",
  "width",
  "height",
  "conf",
  "text",
] as const;

function union(a: Box | null, b: Box): Box {
  if (!a) return [...b] as Box;
  const l = Math.min(a[0], b[0]);
  const t = Math.min(a[1], b[1]);
  const r = Math.max(a[0] + a[2], b[0] + b[2]);
  const bt = Math.max(a[1] + a[3], b[1] + b[3]);
  return [l, t, r - l, bt - t];
}

/**
 * Parses a Tesseract TSV export. Boxes of lines, paragraphs and blocks are recomputed from
 * the kept words so that a filtered-out speckle does not stretch its line.
 */
export function parseTsv(tsv: string, pageId: number, minConf = MIN_CONF): PageText {
  const lines = tsv.split(/\r?\n/);
  const header = lines[0]?.split("\t") ?? [];
  const col = Object.fromEntries(COLS.map((c) => [c, header.indexOf(c)])) as Record<
    (typeof COLS)[number],
    number
  >;
  if (col.level < 0 || col.text < 0) throw new Error("not a tesseract tsv");

  let width = 0;
  let height = 0;
  let dropped = 0;
  let wordCount = 0;
  const blocks = new Map<number, OcrBlock>();
  const paragraphs = new Map<string, OcrParagraph>();
  const lineMap = new Map<string, OcrLine>();

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    if (!row) continue;
    const f = row.split("\t");
    const level = f[col.level];
    if (level === "1") {
      width = Number(f[col.width]);
      height = Number(f[col.height]);
      continue;
    }
    if (level !== "5") continue;
    const text = (f[col.text] ?? "").trim();
    const conf = Number(f[col.conf]);
    if (!text || !Number.isFinite(conf)) continue;
    if (conf < minConf) {
      dropped++;
      continue;
    }
    const b = Number(f[col.block_num]);
    const p = Number(f[col.par_num]);
    const l = Number(f[col.line_num]);
    const w = Number(f[col.word_num]);
    const box: Box = [
      Number(f[col.left]),
      Number(f[col.top]),
      Number(f[col.width]),
      Number(f[col.height]),
    ];
    const word: OcrWord = {
      id: `${b}-${p}-${l}-${w}`,
      text,
      box,
      conf: Math.round(conf * 10) / 10,
    };
    wordCount++;

    let block = blocks.get(b);
    if (!block) {
      block = { id: `${b}`, num: b, box, paragraphs: [] };
      blocks.set(b, block);
    }
    const pk = `${b}-${p}`;
    let par = paragraphs.get(pk);
    if (!par) {
      par = { id: pk, box, lines: [] };
      paragraphs.set(pk, par);
      block.paragraphs.push(par);
    }
    const lk = `${b}-${p}-${l}`;
    let line = lineMap.get(lk);
    if (!line) {
      line = { id: lk, box, words: [] };
      lineMap.set(lk, line);
      par.lines.push(line);
    }
    line.words.push(word);
    line.box = union(line.box, box);
    par.box = union(par.box, box);
    block.box = union(block.box, box);
  }

  const out = [...blocks.values()].sort((a, b) => a.num - b.num);
  return { pageId, width, height, blocks: out, dropped, wordCount };
}

/** Plain text of a page: words joined by spaces, one line per OCR line, blank line per block. */
export function blockText(block: OcrBlock): string {
  return block.paragraphs
    .map((p) => p.lines.map((l) => l.words.map((w) => w.text).join(" ")).join("\n"))
    .join("\n");
}

export function pageToText(page: PageText, blockIds?: Set<string>): string {
  return page.blocks
    .filter((b) => !blockIds || blockIds.has(b.id))
    .map(blockText)
    .join("\n\n");
}
