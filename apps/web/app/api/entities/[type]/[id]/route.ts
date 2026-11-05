import { getPreview } from "@/components/entity/resolve.server";
import { isEntityType } from "@/components/entity/types";
import { parseLocale } from "@/lib/prefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hover preview for any entity type (W-54). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const { type, id } = await params;
  if (!isEntityType(type)) return Response.json({ error: "Unknown type." }, { status: 400 });
  const lang = parseLocale(new URL(request.url).searchParams.get("lang") ?? undefined);
  const preview = await getPreview(type, decodeURIComponent(id), lang);
  if (!preview) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json(preview, { headers: { "Cache-Control": "private, max-age=30" } });
}
