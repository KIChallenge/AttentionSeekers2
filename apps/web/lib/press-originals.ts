import { existsSync } from "node:fs";
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
