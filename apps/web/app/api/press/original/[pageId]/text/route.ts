import { loadPageText } from "@/components/press-original/ocr.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// OCR words of one press review page with boxes in image pixels (Tesseract TSV, confidence
// filtered), grouped as blocks > paragraphs > lines > words. Local files only, like the image.
export async function GET(_req: Request, ctx: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await ctx.params;
  if (!/^\d{1,9}$/.test(pageId)) return new Response("bad page id", { status: 400 });
  const page = await loadPageText(Number(pageId));
  if (!page) return new Response("not available locally", { status: 404 });
  return Response.json(page, {
    headers: {
      "Cache-Control": "private, max-age=3600",
      "X-Robots-Tag": "noindex",
    },
  });
}
