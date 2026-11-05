import { getSource } from "@/components/archive/data.server";
import { usesOfSource } from "@/components/entity/usage.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One source with its masked segments and "used in" list (W-46). Never a raw document. */
export async function GET(_req: Request, { params }: { params: Promise<{ sourceId: string }> }) {
  const id = decodeURIComponent((await params).sourceId);
  const detail = await getSource(id);
  if (!detail) return Response.json({ error: "Source not found." }, { status: 404 });
  return Response.json({ ...detail, usedIn: await usesOfSource(id) });
}
