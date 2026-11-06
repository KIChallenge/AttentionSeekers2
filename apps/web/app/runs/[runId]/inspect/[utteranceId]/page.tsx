import { foldRun } from "@sv/contracts";
import { InspectorView } from "@/components/inspector/inspector-view";
import { loadRunEvents } from "@/lib/runs";

export const dynamic = "force-dynamic";

// Deliberation inspector (W-13). Traces are not kept in the client snapshot, so this page
// folds the stored events once more with keepTraces and hands the one trace down.
export default async function InspectPage({
  params,
}: {
  params: Promise<{ runId: string; utteranceId: string }>;
}) {
  const { runId, utteranceId } = await params;
  const events = await loadRunEvents(runId);
  const trace = events ? (foldRun(events, { keepTraces: true }).traces[utteranceId] ?? null) : null;
  return <InspectorView utteranceId={utteranceId} trace={trace} />;
}
