import { AGENT_CATALOG, TEMPLATES } from "@sv/contracts";
import Link from "next/link";
import { AgentTile } from "@/components/run/agent-tile";
import { Page, PageHead, StubNote } from "@/components/shell/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { serverPrefs } from "@/lib/server-prefs";

// Setup room (FR-U9, FR-U10, ticket W-50). Stub: lists templates and the roster from
// the catalog; the RoomConfig form and mandate streaming land with W-50 and W-28.
export default async function SetupRoomPage() {
  const { t, lang } = await serverPrefs();
  return (
    <Page>
      <PageHead
        title={t.setup.title}
        sub={t.setup.sub}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/replay/fixture-wartezeiten">{t.setup.replayReference}</Link>
            </Button>
            <Button disabled>{t.setup.start}</Button>
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border p-4">
          <h2 className="mb-3 text-base">{t.setup.templates}</h2>
          <ul className="space-y-2 text-sm">
            {TEMPLATES.map((x) => (
              <li key={x.id}>
                <b className="font-medium">{lang === "de" ? x.de : x.en}</b>
                <p className="text-muted-foreground">{x.question}</p>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-2xl border p-4">
          <h2 className="mb-3 text-base">{t.setup.parties}</h2>
          <ul className="space-y-1.5 text-sm">
            {AGENT_CATALOG.map((a) => (
              <li key={a.id} className="flex items-center gap-2">
                <AgentTile agentId={a.id} withName lang={lang} />
                <span className="flex-1" />
                <Badge variant="outline" className="text-muted-foreground">
                  {a.origin}
                </Badge>
                <Badge variant="outline" className="text-muted-foreground">
                  {a.mode}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-2xl border p-4">
          <h2 className="mb-3 text-base">{t.setup.rules}</h2>
          <StubNote>
            {t.stub.soon} RoomConfig: decisionRule, roundLimit, budgetCeiling, asOf, climate,
            pressures, scheduledEvents.
          </StubNote>
        </section>
      </div>
    </Page>
  );
}
