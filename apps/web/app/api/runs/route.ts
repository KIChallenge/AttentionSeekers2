import { listRuns } from "@/lib/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** RunSummary[] for the dashboard (FR-U11). POST (start a run) lands with W-28. */
export async function GET() {
  return Response.json(await listRuns());
}
