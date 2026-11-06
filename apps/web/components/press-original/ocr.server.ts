import { readFile, stat } from "node:fs/promises";
import { originalImagePath } from "@/lib/press-originals";
import { type PageText, parseTsv } from "./ocr";

// Server-only loader for the OCR text of a press page. The TSV sits next to the page image
// outside the repository (<pageId>.tsv beside <pageId>.jpg); parsed pages are cached per
// process keyed by file mtime so the viewer and the API share one parse.

const CACHE_MAX = 64;
const cache = new Map<number, { mtime: number; page: PageText }>();

export async function loadPageText(pageId: number): Promise<PageText | null> {
  const image = originalImagePath(pageId);
  if (!image) return null;
  const file = image.replace(/\.jpg$/i, ".tsv");
  let mtime: number;
  try {
    mtime = (await stat(file)).mtimeMs;
  } catch {
    return null;
  }
  const hit = cache.get(pageId);
  if (hit && hit.mtime === mtime) {
    // Refresh insertion order so the least recently used entry is evicted first.
    cache.delete(pageId);
    cache.set(pageId, hit);
    return hit.page;
  }
  const page = parseTsv(await readFile(file, "utf8"), pageId);
  cache.set(pageId, { mtime, page });
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return page;
}
