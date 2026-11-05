import { Page } from "@/components/shell/page";
import { ReplayPlayer } from "./replay-player";

export default async function ReplayPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  return (
    <Page>
      <ReplayPlayer runId={runId} />
    </Page>
  );
}
