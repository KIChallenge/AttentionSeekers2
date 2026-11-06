import { notFound, permanentRedirect } from "next/navigation";

export const dynamic = "force-dynamic";

// The topic comparison now lives on the scenario page (Ergebnis tab); old links keep working.
export default async function TopicPage({ params }: { params: Promise<{ topicKey: string }> }) {
  const { topicKey } = await params;
  if (!/^[a-z0-9_-]{1,64}$/.test(topicKey)) notFound();
  permanentRedirect(`/scenarios/${encodeURIComponent(topicKey)}?tab=ergebnis`);
}
