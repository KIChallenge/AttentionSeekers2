import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { loadEvidence } from "@/components/run/evidence-server";
import { RunProvider } from "@/components/run/run-context";
import { RunSubBar } from "@/components/run/run-sub-bar";
import { loadCompromiseSidecar, loadRunSnapshot } from "@/lib/runs";

export const dynamic = "force-dynamic";

// Every run screen shares one snapshot: folded on the server from the stored events, then
// continued in the browser from lastSeq + 1 while the run is still running.
export default async function RunLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const [snap, evidence, consistency] = await Promise.all([
    loadRunSnapshot(runId),
    loadEvidence(runId),
    loadCompromiseSidecar(runId),
  ]);
  if (!snap?.run) notFound();
  return (
    <RunProvider
      runId={runId}
      initial={{ ...snap, run: snap.run }}
      evidence={evidence}
      consistency={consistency}
    >
      <RunSubBar />
      {children}
    </RunProvider>
  );
}
