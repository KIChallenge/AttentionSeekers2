import { Page, PageHead, StubNote } from "@/components/shell/page";
import { serverPrefs } from "@/lib/server-prefs";

// Evidence archive (W-45..W-49). Stub.
export default async function ArchivePage() {
  const { t } = await serverPrefs();
  return (
    <Page>
      <PageHead title={t.archive.title} sub={t.archive.sub} />
      <StubNote>{t.stub.soon}</StubNote>
    </Page>
  );
}
