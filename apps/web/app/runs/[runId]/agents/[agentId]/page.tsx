import { AgentCard } from "@/components/agent/agent-card";

// Agent position card (W-15, W-16, W-51).
export default async function AgentPage({
  params,
}: {
  params: Promise<{ runId: string; agentId: string }>;
}) {
  const { agentId } = await params;
  return <AgentCard agentId={agentId} />;
}
