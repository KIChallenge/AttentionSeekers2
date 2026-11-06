import { NegotiationView } from "@/components/run/negotiation-view";

// Negotiation live view (W-09..W-12, W-53). ?view=full opens the full debate, ?u=<id>
// preselects an utterance in the side inspector.
export default async function RunPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; u?: string }>;
}) {
  const sp = await searchParams;
  return (
    <NegotiationView
      initialView={sp.view === "full" ? "full" : sp.view === "condensed" ? "condensed" : undefined}
      initialSelected={sp.u ?? null}
    />
  );
}
