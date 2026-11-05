import { searchEntities } from "@/components/entity/resolve.server";
import { parseLocale } from "@/lib/prefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Command palette search over all entity types (W-54). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").slice(0, 120);
  const lang = parseLocale(url.searchParams.get("lang") ?? undefined);
  try {
    return Response.json(await searchEntities(q, lang));
  } catch (error) {
    console.error("entity_search_failed", error instanceof Error ? error.message : error);
    return Response.json([], { status: 500 });
  }
}
