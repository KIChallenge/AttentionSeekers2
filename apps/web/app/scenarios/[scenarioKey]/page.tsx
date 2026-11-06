import type { LocalizedText } from "@sv/contracts";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RunsTable } from "@/components/dashboard/dashboard";
import { forkRouteAvailable } from "@/components/dashboard/fork-available.server";
import { RunProvider } from "@/components/run/run-context";
import { Coalitions } from "@/components/scenarios/coalitions";
import { runLabelOf, scenarioT, scenarioTitleOf } from "@/components/scenarios/messages";
import { Perspectives } from "@/components/scenarios/perspectives";
import { ImpactAcrossRuns, ModelsPlaceholder } from "@/components/scenarios/result-extras";
import { ScenarioTabs } from "@/components/scenarios/scenario-tabs";
import { EmptyState, Meta, Page, PageHead } from "@/components/shell/page";
import { topicT } from "@/components/topics/messages";
import { ModelBiasView } from "@/components/topics/model-bias-view";
import { TopicView } from "@/components/topics/topic-view";
import { Button } from "@/components/ui/button";
import { loadModelBias } from "@/lib/model-bias-data";
import { loadScenario } from "@/lib/scenario-runs";
import { serverPrefs } from "@/lib/server-prefs";

export const dynamic = "force-dynamic";

const TAB_VALUES = ["laeufe", "ergebnis", "perspektiven", "koalitionen", "modelle"] as const;

// Scenario page: the runs of one question with their comparison, perspectives and coalitions.
export default async function ScenarioPage({
  params,
}: {
  params: Promise<{ scenarioKey: string }>;
}) {
  const { scenarioKey } = await params;
  if (!/^[a-z0-9_-]{1,64}(\.(checks|demo))?$/.test(scenarioKey)) notFound();
  const data = await loadScenario(scenarioKey);
  if (!data) notFound();
  const { lang, t } = await serverPrefs();
  const s = scenarioT(lang);
  const { scenario, cmp, hist, perspectives, coalitions, reference } = data;
  const modelBias = scenario.kind === "main" ? await loadModelBias(scenario.baseKey) : null;
  const labels: Record<string, string> = {};
  for (const r of cmp?.runs ?? []) labels[r.id] = runLabelOf(r, lang);
  for (const r of scenario.runs)
    labels[r.id] ??= (t.variant as Record<string, string>)[r.variantKind] ?? r.id;
  const runIds = cmp?.runs.map((r) => r.id) ?? [];
  const fam = topicT(lang).fam;
  const refRun = reference?.snap.run;
  const redLineTexts: Record<string, LocalizedText> = {};
  for (const [id, rl] of Object.entries(reference?.evidence.redLines ?? {}))
    redLineTexts[id] = rl.text;

  const perspectivesPanel = (
    <Perspectives
      rows={perspectives}
      runIds={runIds}
      labels={labels}
      redLineTexts={redLineTexts}
      canAsk={Boolean(reference && refRun)}
    />
  );

  return (
    <Page width="wide">
      <PageHead
        eyebrow={scenario.kind === "main" ? s.title : s.kind[scenario.kind]}
        title={scenarioTitleOf(scenario, lang)}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/">{s.back}</Link>
            </Button>
            <Button asChild>
              <Link href="/runs/new">{t.dashboard.newQuestion}</Link>
            </Button>
          </>
        }
      />
      <div className="space-y-2">
        <p className="max-w-4xl text-base leading-relaxed">{scenario.question}</p>
        <Meta>
          {[
            s.runs(scenario.runs.length),
            scenario.families.map((f) => fam[f] ?? f).join(", "),
            `${s.reference}: ${labels[scenario.referenceRunId] ?? scenario.referenceRunId}`,
          ].join(" · ")}
        </Meta>
      </div>
      <ScenarioTabs
        tabs={TAB_VALUES.map((v) => ({ value: v, label: s.tabs[v] }))}
        panels={{
          laeufe: (
            <RunsTable
              runs={scenario.runs}
              labels={labels}
              forkAvailable={forkRouteAvailable()}
              title={null}
            />
          ),
          ergebnis: cmp ? (
            <>
              <TopicView cmp={cmp} hist={hist} excluded={[]} />
              <ImpactAcrossRuns runs={cmp.runs} />
            </>
          ) : (
            <EmptyState title={s.noRuns} />
          ),
          perspektiven:
            reference && refRun ? (
              <RunProvider
                runId={scenario.referenceRunId}
                initial={{ ...reference.snap, run: refRun }}
                evidence={reference.evidence}
              >
                {perspectivesPanel}
              </RunProvider>
            ) : (
              perspectivesPanel
            ),
          koalitionen: <Coalitions cp={coalitions} labels={labels} />,
          modelle: modelBias ? (
            <ModelBiasView data={modelBias} />
          ) : (
            <ModelsPlaceholder topicKey={scenario.baseKey} />
          ),
        }}
      />
    </Page>
  );
}
