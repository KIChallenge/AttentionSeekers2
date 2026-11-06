import { briefScenarioFigures, EVIDENCE } from "@sv/engine/impact";
import { type EvidenceInfo, OutcomeView } from "@/components/outcome/outcome-view";
import { loadImpactSidecar } from "@/lib/runs";

export const dynamic = "force-dynamic";

function evidenceInfo(): EvidenceInfo {
  const classes: EvidenceInfo["classes"] = {};
  for (const [id, c] of Object.entries(EVIDENCE.classes)) {
    classes[id] = {
      label: c.label,
      basis: c.basis,
      derivation: c.derivation,
      sources: c.sources.map((s) => {
        const src = EVIDENCE.sources[s];
        return src
          ? { title: src.title, publisher: src.publisher, year: src.year, url: src.url }
          : { title: s, publisher: "", year: 0, url: "" };
      }),
    };
  }
  return { version: EVIDENCE.version, classes, claimed: EVIDENCE.briefPackage.claimed };
}

// Outcome (W-21, W-22): effects with evidence ranges, reference-class forecast "k von n".
export default async function OutcomePage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const sidecar = await loadImpactSidecar(runId);
  return (
    <OutcomeView
      impact={sidecar?.figures ?? null}
      brief={briefScenarioFigures()}
      evidence={evidenceInfo()}
    />
  );
}
