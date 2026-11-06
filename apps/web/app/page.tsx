import Link from "next/link";
import { CommandPalette } from "@/components/entity/command-palette";
import { overviewT } from "@/components/overview/messages";
import { OverviewSection } from "@/components/overview/overview";
import { scenarioT } from "@/components/scenarios/messages";
import { ScenarioGrid } from "@/components/scenarios/scenario-grid";
import { Page, PageHead, Section } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { loadOverview } from "@/lib/overview-data";
import { loadScenarioCards } from "@/lib/scenario-runs";
import { serverPrefs } from "@/lib/server-prefs";
import { loadAll } from "@/lib/topic-runs";

export const dynamic = "force-dynamic";

// Home: the overview first (data base, persona models, forecasting record and run totals,
// read at request time), then one card per scenario; the runs live on the scenario page.
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
        title={overviewT(lang).title}
        actions={
          <>
            <CommandPalette />
            <Button asChild>
              <Link href="/runs/new">{t.dashboard.newQuestion}</Link>
            </Button>
          </>
        }
      />
      <OverviewSection data={overview} lang={lang} showTitle={false} />
      <Section variant="plain" title={scenarioT(lang).title}>
        <ScenarioGrid cards={cards} />
      </Section>
    </Page>
  );
}
