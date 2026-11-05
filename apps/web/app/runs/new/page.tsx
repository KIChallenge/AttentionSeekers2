import { CommandPalette } from "@/components/entity/command-palette";
import { type AgentDefaults, SetupRoom } from "@/components/setup/setup-room";
import { Page, PageHead } from "@/components/shell/page";
import { listRuns, loadRunSnapshot } from "@/lib/runs";
import { serverPrefs } from "@/lib/server-prefs";

export const dynamic = "force-dynamic";

const DEFAULT_MODELS = ["azure/gpt-5-mini", "mistral/mistral-medium-3"];

// Setup room (W-50, FR-U9, FR-U10, FR-M1). Defaults for reasons, temperament and models come
// from the reference run's recorded RoomConfig, so a fresh room starts where the demo did.
export default async function SetupRoomPage() {
  const { t } = await serverPrefs();
  const runs = await listRuns();
  const ref = runs.find((r) => r.isReference) ?? runs[0];
  const defaults: Record<string, AgentDefaults> = {};
  const models = new Set<string>(DEFAULT_MODELS);
  for (const r of runs) for (const m of r.models) models.add(m);
  if (ref) {
    const snap = await loadRunSnapshot(ref.id);
    for (const a of snap?.run?.room.agents ?? [])
      defaults[a.agentId] = { reason: a.reason, temperament: a.temperament, model: a.model };
  }
  return (
    <Page>
      <PageHead title={t.setup.title} sub={t.setup.sub} actions={<CommandPalette />} />
      <SetupRoom
        defaults={defaults}
        models={[...models].sort()}
        asOf={new Date().toISOString().slice(0, 10)}
      />
    </Page>
  );
}
