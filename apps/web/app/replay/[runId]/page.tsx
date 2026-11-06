import Link from "next/link";
import { CommandPalette } from "@/components/entity/command-palette";
import { laneT } from "@/components/entity/messages";
import { ReplayPlayer } from "@/components/replay/replay-player";
import { Page, StubNote } from "@/components/shell/page";
import { loadRunEvents } from "@/lib/runs";
import { serverPrefs } from "@/lib/server-prefs";

export const dynamic = "force-dynamic";

// Replay player (W-44). Events come from the run store or runs/*.ndjson, same as the stream route.
export default async function ReplayPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const { lang } = await serverPrefs();
  const t = laneT(lang);
  const events = await loadRunEvents(decodeURIComponent(runId)).catch(() => null);
  return (
    <Page>
      <div className="hidden">
        <CommandPalette showTrigger={false} />
      </div>
      {events?.length ? (
        <ReplayPlayer runId={runId} events={events} />
      ) : (
        <StubNote>
          {t.replay.notFound}{" "}
          <Link href="/" className="underline">
            {t.replay.back}
          </Link>
        </StubNote>
      )}
    </Page>
  );
}
