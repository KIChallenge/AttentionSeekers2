import Link from "next/link";
import { CommandPalette } from "@/components/entity/command-palette";
import { OverviewSection } from "@/components/overview/overview";
import { scenarioT } from "@/components/scenarios/messages";
import { ScenarioGrid } from "@/components/scenarios/scenario-grid";
import { Page, PageHead } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { loadOverview } from "@/lib/overview-data";
import { loadScenarioCards } from "@/lib/scenario-runs";
import { serverPrefs } from "@/lib/server-prefs";
import { loadAll } from "@/lib/topic-runs";

export const dynamic = "force-dynamic";

// Home: one card per scenario (question setting); the runs live on the scenario page. Below
// the scenarios, the overview reads the data base, the persona models, the forecasting
// record and the run totals at request time.
export default async function HomePage() {
  const { t, lang } = await serverPrefs();
  const loaded = await loadAll();
  const cards = await loadScenarioCards(loaded);
  // The model ranking belongs to the main scenario with the most runs.
  const ranked = cards
    .filter((c) => c.kind === "main" && c.compared > 1)
    .sort((a, b) => b.compared - a.compared)[0];
  const overview = await loadOverview(loaded, ranked?.baseKey ?? null);
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
      <OverviewSection data={overview} lang={lang} />
    </Page>
  );
}
