import { loadEvidence } from "@/components/run/evidence-server";
import { buildRunBundle } from "@/lib/run-bundle";
import { loadRunEvents } from "@/lib/runs";
import { zip } from "@/lib/zip";

// Run bundle export (W-33, FR-T9): events as NDJSON, one trace per utterance, the sources
// used, the model assignment, both result exports and a manifest with sha256 per file.
//   default          application/zip
//   ?format=json     one JSON document with the same content (manifest + files)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const url = new URL(request.url);

  let events: Awaited<ReturnType<typeof loadRunEvents>>;
  try {
    events = await loadRunEvents(runId);
  } catch (error) {
    console.error("bundle_load_failed", runId, error instanceof Error ? error.message : error);
    return Response.json({ error: "The run could not be read." }, { status: 500 });
  }
  if (!events?.length) return Response.json({ error: "Run not found." }, { status: 404 });

  const bundle = buildRunBundle(runId, events, await loadEvidence(runId), { origin: url.origin });
  const base = `run-${runId}`.replace(/[^a-zA-Z0-9_.-]/g, "_");

  if (url.searchParams.get("format") === "json") {
    const files = Object.fromEntries(
      bundle.entries.map((e) => [e.name, typeof e.data === "string" ? e.data : ""]),
    );
    return new Response(JSON.stringify({ manifest: bundle.manifest, files }), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${base}.json"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const body = zip(bundle.entries);
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${base}.zip"`,
      "Content-Length": String(body.length),
      "Cache-Control": "no-store",
    },
  });
}
