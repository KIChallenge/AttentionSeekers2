import { deriveLlmCalls } from "@sv/contracts";
import { TraceView } from "@/components/trace/trace-view";
import { loadRunEvents } from "@/lib/runs";
import { loadUtteranceTrace } from "./actions";

export const dynamic = "force-dynamic";

// Agent trace: every model call of the run as a waterfall (round, exchange, turn, call).
// Recorded calls come from the shared snapshot (llm.call events, live while running);
// runs recorded before call logging get a derived trace computed here from their events.
export default async function TracePage({
  params,
  searchParams,
}: {
  params: Promise<{ runId: string }>;
  searchParams: Promise<{ u?: string; call?: string }>;
}) {
  const [{ runId }, sp] = await Promise.all([params, searchParams]);
  const events = await loadRunEvents(runId);
  const derived = events ? deriveLlmCalls(events) : [];
  return (
    <TraceView
      derived={derived}
      focus={{ utteranceId: sp.u ?? null, callId: sp.call ?? null }}
      loadTrace={loadUtteranceTrace}
    />
  );
}
