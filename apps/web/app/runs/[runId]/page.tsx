import { localize, PHASES, topicStatus } from "@sv/contracts";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AgentTile } from "@/components/run/agent-tile";
import { Page, PageHead, StubNote } from "@/components/shell/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { loadRunSnapshot } from "@/lib/runs";
import { serverPrefs } from "@/lib/server-prefs";

export const dynamic = "force-dynamic";

// Live view / finished run (W-09..W-13). Stub: server-renders the folded snapshot so the
// lane A components can start from real data.
export default async function RunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const { t, lang } = await serverPrefs();
  const snap = await loadRunSnapshot(runId);
  if (!snap?.run) notFound();
  const run = snap.run;
  return (
    <Page>
      <PageHead
        title={run.mandate.question}
        sub={`${run.id} · ${snap.utteranceOrder.length} ${t.run.utterances} · ${snap.status}`}
        actions={
          <Button asChild variant="outline">
            <Link href={`/replay/${run.id}`}>{t.dashboard.replay}</Link>
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <section className="space-y-4">
          {snap.rounds.map((r) => {
            const phase = PHASES[r.phase - 1];
            const summary = snap.summaries.find((s) => s.round === r.round);
            return (
              <div key={r.round} className="rounded-2xl border p-4">
                <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
                  {t.run.round} {r.round} · {lang === "de" ? phase?.de : phase?.en}
                </div>
                {summary ? <p className="mb-3">{localize(summary.text, lang)}</p> : null}
                <ul className="space-y-2 text-sm">
                  {r.utteranceIds.map((id) => {
                    const u = snap.utterances[id];
                    if (!u) return null;
                    return (
                      <li key={id} className="flex gap-2">
                        <AgentTile agentId={u.speaker} />
                        <span className="font-mono text-xs text-muted-foreground">{u.id}</span>
                        <span>{localize(u.text, lang)}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </section>
        <aside className="space-y-4">
          <div className="rounded-2xl border p-4">
            <h2 className="mb-2 text-base">{t.run.consensus}</h2>
            <ul className="space-y-1 text-sm">
              {run.mandate.topics.map((topic) => {
                const st = topicStatus(snap, topic.id);
                return (
                  <li key={topic.id} className="flex justify-between gap-2">
                    <span>
                      {localize(topic.label, lang)} · {localize(topic.measure, lang)}
                    </span>
                    <Badge variant="outline" className="num">
                      {t.outcome[st.status]} {st.support}/{st.of}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          </div>
          <StubNote>{t.stub.soon}</StubNote>
        </aside>
      </div>
    </Page>
  );
}
