import { catalogAgent, type Lang, type RunSummary, TEMPLATES } from "@sv/contracts";
import Link from "next/link";
import { AgentTile } from "@/components/run/agent-tile";
import { OutcomeBadge } from "@/components/run/outcome-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatDuration } from "@/lib/format";
import type { Messages } from "@/messages/de";

export function RunCard({ run, t, lang }: { run: RunSummary; t: Messages; lang: Lang }) {
  const template = TEMPLATES.find((x) => x.id === run.template);
  const moved = run.movedMost ? catalogAgent(run.movedMost.agentId) : null;
  const variantLabel = (t.variant as Record<string, string>)[run.variantKind] ?? run.variantKind;
  const share = run.agreementShare.of ? run.agreementShare.agreed / run.agreementShare.of : 0;
  return (
    <article
      className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-xs"
      data-run={run.id}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {run.isReference ? <Badge variant="secondary">{t.dashboard.reference}</Badge> : null}
        <Badge variant="outline" className="text-muted-foreground">
          {variantLabel}
        </Badge>
        {template ? (
          <Badge variant="outline" className="text-muted-foreground">
            {lang === "de" ? template.de : template.en}
          </Badge>
        ) : null}
        <span className="flex-1" />
        <OutcomeBadge value={run.outcomeBadge} t={t} />
      </div>
      <h2 className="text-base leading-snug">{run.question}</h2>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">{t.dashboard.agreement}</dt>
          <dd className="num mt-1 flex items-center gap-2">
            {run.agreementShare.agreed}/{run.agreementShare.of}
            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-alpha-150">
              <span className="block h-full bg-foreground" style={{ width: `${share * 100}%` }} />
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t.dashboard.movedMost}</dt>
          <dd className="num mt-1 flex items-center gap-1.5">
            {moved && run.movedMost ? (
              <>
                <AgentTile agentId={moved.id} />
                {lang === "de" ? moved.nameDe : moved.glossEn}
                <span className="text-muted-foreground">
                  Σ|Δ| {run.movedMost.pathLength.toFixed(1)}
                </span>
              </>
            ) : (
              "–"
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t.dashboard.proposals}</dt>
          <dd className="num mt-1">
            {run.acceptedProposals} {t.dashboard.accepted} · {run.rejectedProposals}{" "}
            {t.dashboard.rejected}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">
            {t.dashboard.rounds} · {t.dashboard.duration}
          </dt>
          <dd className="num mt-1">
            {run.roundsCompleted}/{run.roundLimit} · {formatDuration(run.durationMs)}
          </dd>
        </div>
      </dl>
      <div className="flex flex-wrap items-center gap-1">
        {run.agents.map((id) => (
          <AgentTile key={id} agentId={id} />
        ))}
        <span className="ml-2 font-mono text-xs text-muted-foreground">
          {run.id} · {formatDate(run.createdAt, lang)} · {run.models.length} models
        </span>
      </div>
      <div className="flex gap-2">
        <Button asChild size="sm">
          <Link href={`/runs/${run.id}`}>{t.dashboard.open}</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={`/replay/${run.id}`}>{t.dashboard.replay}</Link>
        </Button>
        <Button size="sm" variant="ghost" disabled title="W-35">
          {t.dashboard.fork}
        </Button>
      </div>
    </article>
  );
}
