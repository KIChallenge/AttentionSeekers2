import Link from "next/link";
import { RunCard } from "@/components/dashboard/run-card";
import { Page, PageHead, StubNote } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { listRuns } from "@/lib/runs";
import { serverPrefs } from "@/lib/server-prefs";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { t, lang } = await serverPrefs();
  const runs = await listRuns();
  return (
    <Page>
      <PageHead
        title={t.dashboard.title}
        sub={t.dashboard.sub}
        actions={
          <Button asChild>
            <Link href="/runs/new">{t.dashboard.newQuestion}</Link>
          </Button>
        }
      />
      {runs.length === 0 ? (
        <StubNote>{t.dashboard.empty}</StubNote>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {runs.map((r) => (
            <RunCard key={r.id} run={r} t={t} lang={lang} />
          ))}
        </div>
      )}
    </Page>
  );
}
