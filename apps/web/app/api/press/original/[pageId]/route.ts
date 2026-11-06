import { readFile } from "node:fs/promises";
import { originalImagePath } from "@/lib/press-originals";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Serves one rendered page of the press review for source checking; local files only.
export async function GET(_req: Request, ctx: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await ctx.params;
  if (!/^\d{1,9}$/.test(pageId)) return new Response("bad page id", { status: 400 });
  const file = originalImagePath(Number(pageId));
  if (!file) return new Response("not available locally", { status: 404 });
  const body = await readFile(file);
  return new Response(body, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=3600",
      "X-Robots-Tag": "noindex",
    },
  });
}
