import { renderResultHtml } from "@/components/result/export-html";
import { loadEvidence } from "@/components/run/evidence-server";
import { loadRunSnapshot } from "@/lib/runs";

// Result document export (W-38, FR-O4, FR-L6): one self-contained HTML file per language,
// rendered from the same folded snapshot as /runs/[runId]/result.
//   ?lang=de|en      language of the document (default de)
//   ?download=1      attachment instead of inline

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const url = new URL(request.url);
  const lang = url.searchParams.get("lang") === "en" ? "en" : "de";

  let snap: Awaited<ReturnType<typeof loadRunSnapshot>>;
  try {
    snap = await loadRunSnapshot(runId);
  } catch (error) {
    console.error("export_load_failed", runId, error instanceof Error ? error.message : error);
    return Response.json({ error: "The run could not be read." }, { status: 500 });
  }
  if (!snap?.run) return Response.json({ error: "Run not found." }, { status: 404 });

  const evidence = await loadEvidence(runId);
  const html = renderResultHtml(snap, snap.run, evidence, lang, { origin: url.origin });
  const file = `ergebnis-${runId}-${lang}.html`.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const disposition = url.searchParams.get("download") === "1" ? "attachment" : "inline";
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `${disposition}; filename="${file}"`,
      "Cache-Control": "no-store",
      "Content-Language": lang,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
