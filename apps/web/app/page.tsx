import Link from "next/link";
import { CommandPalette } from "@/components/entity/command-palette";
import { scenarioT } from "@/components/scenarios/messages";
import { ScenarioGrid } from "@/components/scenarios/scenario-grid";
import { Page, PageHead } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { loadScenarioCards } from "@/lib/scenario-runs";
import { serverPrefs } from "@/lib/server-prefs";

export const dynamic = "force-dynamic";

// Home: one card per scenario (question setting); the runs live on the scenario page.
export default async function HomePage() {
  const { t, lang } = await serverPrefs();
  const cards = await loadScenarioCards();
  return (
    <Page width="wide">
      <PageHead
        title={scenarioT(lang).title}
        actions={
          <>
            <CommandPalette />
            <Button asChild>
              <Link href="/runs/new">{t.dashboard.newQuestion}</Link>
            </Button>
          </>
        }
      />
      <ScenarioGrid cards={cards} />
    </Page>
  );
}
