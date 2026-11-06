import { searchArchive } from "@/components/archive/data.server";
import { parseArchiveQuery } from "@/components/archive/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Archive search (W-45): masked snippets, facets, as-of flags. No bulk export. */
export async function GET(request: Request) {
  const q = parseArchiveQuery(new URL(request.url).searchParams);
  try {
    return Response.json(await searchArchive(q));
  } catch (error) {
    console.error("archive_search_failed", error instanceof Error ? error.message : error);
    return Response.json({ error: "Search failed." }, { status: 500 });
  }
}
