import { closeSync, existsSync, openSync, readSync } from "node:fs";
import path from "node:path";
import pages from "./press-pages.json";

// Press positions point at one page of a daily DVSV press review (SV-Box). The rendered page
// images live outside the repository (they are third-party clippings with real names) in
// PRESS_ORIGINALS_DIR, default <repo>/../presse/originals, and are only served locally.

export interface PressPage {
  pageId: number;
  pageNo: number;
  doc: string;
  outlet: string | null;
  date: string | null;
}

const index = pages as Record<string, PressPage>;

export function pressPageFor(sourceId: string): PressPage | null {
  return index[sourceId] ?? null;
}

function originalsDir(): string {
  const cwd = process.cwd();
  const repoRoot = path.resolve(
    /*turbopackIgnore: true*/ cwd,
    cwd.endsWith(path.join("apps", "web")) ? "../.." : ".",
  );
  const dir = process.env.PRESS_ORIGINALS_DIR ?? path.join(repoRoot, "..", "presse", "originals");
  return path.isAbsolute(dir) ? dir : path.join(/*turbopackIgnore: true*/ repoRoot, dir);
}

export function originalImagePath(pageId: number): string | null {
  if (!Number.isInteger(pageId) || pageId < 0) return null;
  const file = path.join(/*turbopackIgnore: true*/ originalsDir(), `${pageId}.jpg`);
  return existsSync(file) ? file : null;
}

const sizeCache = new Map<number, { width: number; height: number } | null>();

/**
 * Pixel size of a rendered page from its JPEG header (SOF marker), so the press browser can
 * reserve the exact height of every page before its image loads. Cached per process.
 */
export function originalImageSize(pageId: number): { width: number; height: number } | null {
  if (sizeCache.has(pageId)) return sizeCache.get(pageId) ?? null;
  const file = originalImagePath(pageId);
  let out: { width: number; height: number } | null = null;
  if (file) {
    const fd = openSync(file, "r");
    try {
      const buf = Buffer.alloc(65536);
      const n = readSync(fd, buf, 0, buf.length, 0);
      let i = 2;
      while (i + 9 < n) {
        if (buf[i] !== 0xff) {
          i++;
          continue;
        }
        const marker = buf[i + 1] ?? 0;
        const sof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
        if (sof) {
          out = { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
          break;
        }
        i += 2 + buf.readUInt16BE(i + 2);
      }
    } finally {
      closeSync(fd);
    }
  }
  sizeCache.set(pageId, out);
  return out;
}

/** Every distinct page the press positions point at, with the source ids found on it. */
export function allPressPages(): { page: PressPage; sourceIds: string[] }[] {
  const byPage = new Map<number, { page: PressPage; sourceIds: string[] }>();
  for (const [id, page] of Object.entries(index)) {
    const cur = byPage.get(page.pageId);
    if (cur) cur.sourceIds.push(id);
    else byPage.set(page.pageId, { page, sourceIds: [id] });
  }
  return [...byPage.values()];
}
