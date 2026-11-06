import { pathLength, topicStatus } from "@sv/contracts";
import Link from "next/link";
import { Dashboard, type PinnedDetail } from "@/components/dashboard/dashboard";
import { forkRouteAvailable } from "@/components/dashboard/fork-available.server";
import { CommandPalette } from "@/components/entity/command-palette";
import { Page, PageHead } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { listRuns, loadRunSnapshot } from "@/lib/runs";
import { serverPrefs } from "@/lib/server-prefs";

export const dynamic = "force-dynamic";

// Dashboard (W-43, FR-U11, NFR-2): pinned reference run, run grid, filters, Replay and Fork.
export default async function DashboardPage() {
  const { t } = await serverPrefs();
  const runs = await listRuns();
  const ref = runs.find((r) => r.isReference) ?? runs[0];
  let pinned: PinnedDetail | null = null;
  if (ref) {
    const snap = await loadRunSnapshot(ref.id);
    const run = snap?.run;
    if (snap && run) {
      pinned = {
        summary: ref,
        topics: run.mandate.topics.map((tp) => ({
          id: tp.id,
          label: tp.label,
          ...topicStatus(snap, tp.id),
        })),
        movement: run.agents
          .map((a) => ({ agentId: a.id, len: pathLength(snap, a.id) }))
          .sort((a, b) => b.len - a.len),
        endNote: snap.endCondition?.note ?? null,
      };
    }
  }
  return (
    <Page width="wide">
      <PageHead
        title={t.dashboard.title}
        sub={t.dashboard.sub}
        actions={
          <>
            <CommandPalette />
            <Button asChild>
              <Link href="/runs/new">{t.dashboard.newQuestion}</Link>
            </Button>
          </>
        }
      />
      <Dashboard runs={runs} pinned={pinned} forkAvailable={forkRouteAvailable()} />
    </Page>
  );
}
