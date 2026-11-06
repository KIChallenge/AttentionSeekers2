"use server";

import type { UtteranceTrace } from "@sv/contracts";
import { loadRunEvents } from "@/lib/runs";

/**
 * Prompt blocks, retrieval and deliberation of one utterance, fetched when the trace detail
 * panel opens a call (traces are not kept in the client snapshot).
 */
export async function loadUtteranceTrace(
  runId: string,
  utteranceId: string,
): Promise<UtteranceTrace | null> {
  const events = await loadRunEvents(runId);
  if (!events) return null;
  for (const e of events)
    if (e.type === "utterance.trace" && e.trace.utteranceId === utteranceId) return e.trace;
  return null;
}
