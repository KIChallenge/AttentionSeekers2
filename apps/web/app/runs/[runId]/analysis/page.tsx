import { AnalysisView } from "@/components/analysis/analysis-view";
import { QualitySection } from "@/components/quality/quality-section";
import { loadQualityReport } from "@/lib/quality";

export const dynamic = "force-dynamic";

// Analysis (W-17..W-19, W-52): trajectory, consensus matrix, who moved, open conflicts,
// coalition graph, incentive matrix, proposals with rejection reasons; below them the
// debate-quality audit and the gate decisions of the run.
export default async function AnalysisPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const report = await loadQualityReport(runId);
  return (
    <>
      <AnalysisView />
      <div className="mx-auto max-w-[1800px] px-4 pb-12 sm:px-6">
        <QualitySection report={report} />
      </div>
    </>
  );
}
