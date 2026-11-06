import Link from "next/link";
import { notFound } from "next/navigation";
import { Page, PageHead } from "@/components/shell/page";
import { topicT } from "@/components/topics/messages";
import { modelBiasT } from "@/components/topics/model-bias-messages";
import { TopicView } from "@/components/topics/topic-view";
import { Button } from "@/components/ui/button";
import { serverPrefs } from "@/lib/server-prefs";
import { historicRates, loadTopicComparison } from "@/lib/topic-runs";

export const dynamic = "force-dynamic";

// Topic dashboard (FR-X3, FR-X4, FR-J4): every run of one question side by side, per topic.
export default async function TopicPage({ params }: { params: Promise<{ topicKey: string }> }) {
  const { topicKey } = await params;
  if (!/^[a-z0-9_-]{1,64}$/.test(topicKey)) notFound();
  const res = await loadTopicComparison(topicKey);
  if (!res) notFound();
  const { lang } = await serverPrefs();
  const t = topicT(lang);
  return (
    <Page>
      <PageHead
        title={t.title}
        sub={t.sub}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/topics/${topicKey}/models`}>{modelBiasT(lang).link}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/">{t.back}</Link>
            </Button>
          </>
        }
      />
      <TopicView cmp={res.cmp} hist={historicRates()} excluded={res.excluded} />
    </Page>
  );
}
