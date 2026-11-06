import Link from "next/link";
import { notFound } from "next/navigation";
import { Page, PageHead } from "@/components/shell/page";
import { modelBiasT } from "@/components/topics/model-bias-messages";
import { ModelBiasView } from "@/components/topics/model-bias-view";
import { Button } from "@/components/ui/button";
import { loadModelBias } from "@/lib/model-bias-data";
import { serverPrefs } from "@/lib/server-prefs";

export const dynamic = "force-dynamic";

// Model comparison for one question: direction and deviation of each model family against the
// data-expected stances and the historical enactment rate.
export default async function TopicModelsPage({
  params,
}: {
  params: Promise<{ topicKey: string }>;
}) {
  const { topicKey } = await params;
  if (!/^[a-z0-9_-]{1,64}$/.test(topicKey)) notFound();
  const data = await loadModelBias(topicKey);
  if (!data) notFound();
  const { lang } = await serverPrefs();
  const t = modelBiasT(lang);
  return (
    <Page>
      <PageHead
        title={t.title}
        actions={
          <Button asChild variant="outline">
            <Link href={`/topics/${topicKey}`}>{t.back}</Link>
          </Button>
        }
      />
      <ModelBiasView data={data} />
    </Page>
  );
}
