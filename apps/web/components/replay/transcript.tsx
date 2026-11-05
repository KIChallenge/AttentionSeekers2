"use client";

import {
  type Claim,
  catalogAgent,
  type Lang,
  localize,
  PHASES,
  type RunSnapshot,
  type Utterance,
} from "@sv/contracts";
import { EntityLink } from "@/components/entity/entity-link";
import { laneT } from "@/components/entity/messages";
import { scopedId } from "@/components/entity/types";
import { AgentTile } from "@/components/run/agent-tile";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const CLAIM_CLS: Record<Claim["state"], string> = {
  verified: "border-success/40 text-success",
  unverified: "text-muted-foreground",
  contradicted: "border-warning/40 bg-warning/10 text-warning",
  assumption: "border-dashed italic text-muted-foreground",
};

function speakerName(id: string, lang: Lang) {
  if (id === "moderator") return "Moderator";
  if (id === "expert") return lang === "de" ? "Experte" : "Expert";
  const a = catalogAgent(id);
  return a ? (lang === "de" ? a.nameDe : a.glossEn) : id;
}

function UtteranceCard({
  u,
  s,
  lang,
  current,
  onSelect,
}: {
  u: Utterance;
  s: RunSnapshot;
  lang: Lang;
  current: boolean;
  onSelect: (id: string) => void;
}) {
  const t = laneT(lang);
  const runId = s.runId ?? "";
  const claims = u.claimIds.map((id) => s.claims[id]).filter((c): c is Claim => !!c);
  const moderator = u.speaker === "moderator" || u.speaker === "expert";
  return (
    <article
      id={`utt-${u.id}`}
      data-utterance={u.id}
      className={cn(
        "rounded-2xl border bg-card p-3.5 transition-shadow sm:p-4",
        moderator && "bg-gray-alpha-50",
        current && "ring-2 ring-foreground/70",
      )}
    >
      <header className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <AgentTile agentId={u.speaker} />
        <span className="text-sm font-medium">{speakerName(u.speaker, lang)}</span>
        <button
          type="button"
          onClick={() => onSelect(u.id)}
          className="font-mono text-[11px] text-muted-foreground hover:text-foreground"
          title={t.replay.jumpUtterance}
        >
          {u.id}
        </button>
        {u.respondsTo ? (
          <span className="text-xs text-muted-foreground">
            ↩ {t.replay.respondsTo}{" "}
            <EntityLink
              type="utterance"
              id={scopedId(runId, u.respondsTo)}
              className="font-mono text-[11px]"
            >
              {u.respondsTo}
            </EntityLink>
          </span>
        ) : null}
        <Badge variant="outline" className="h-5 text-[11px] text-muted-foreground">
          {t.replay.kinds[u.kind as keyof typeof t.replay.kinds] ?? u.kind}
        </Badge>
        {u.redLinesTouched.length ? (
          <Badge
            variant="outline"
            className="h-5 border-warning/40 bg-warning/10 text-[11px] text-warning"
          >
            {t.replay.redLine}
          </Badge>
        ) : null}
        {u.degraded ? (
          <Badge variant="outline" className="h-5 text-[11px]">
            degraded
          </Badge>
        ) : null}
      </header>
      <p className="text-[15px] leading-relaxed">{localize(u.text, lang)}</p>
      {claims.length ? (
        <ul className="mt-2 space-y-1">
          {claims.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className={cn("rounded-md border px-1.5 py-0.5", CLAIM_CLS[c.state])}>
                {c.state}
              </span>
              <EntityLink type="claim" id={scopedId(runId, c.id)} className="text-muted-foreground">
                {c.atomicText}
              </EntityLink>
              {c.citations.map((ref) => (
                <EntityLink
                  key={ref.segmentId}
                  type="source"
                  id={ref.sourceId}
                  className="rounded-[5px] border bg-background px-1.5 font-mono text-[10px] no-underline"
                >
                  {ref.sourceId} · w {ref.recencyWeight.toFixed(2)}
                </EntityLink>
              ))}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

export function Transcript({
  s,
  lang,
  currentUtterance,
  onSelect,
}: {
  s: RunSnapshot;
  lang: Lang;
  currentUtterance: string | null;
  onSelect: (utteranceId: string) => void;
}) {
  const t = laneT(lang);
  return (
    <div className="space-y-4">
      {s.rounds.map((r) => {
        const phase = PHASES[r.phase - 1];
        const summary = s.summaries.find((x) => x.round === r.round);
        const pending = Object.values(s.pending).filter((p) => p.round === r.round);
        const notes = s.expertNotes.filter((n) =>
          n.utteranceIds.some((id) => r.utteranceIds.includes(id)),
        );
        return (
          <section key={r.round} id={`round-${r.round}`} className="space-y-2.5">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              <span>
                {laneT(lang).replay.roundMarker} {r.round} ·{" "}
                {phase ? (lang === "de" ? phase.de : phase.en) : ""}
              </span>
              <span className="flex gap-0.5">
                {r.speakingOrder.map((a) => (
                  <AgentTile key={a} agentId={a} />
                ))}
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
            {r.injectedEvents.map((ev) => (
              <div
                key={ev.id}
                className="rounded-2xl border border-warning/40 bg-warning/5 p-3.5 text-sm"
              >
                <div className="mb-1 text-xs text-warning">◆ {t.replay.injected}</div>
                <div className="font-medium">{localize(ev.title, lang)}</div>
                <p className="text-muted-foreground">{localize(ev.body, lang)}</p>
                {ev.sourceRef ? (
                  <EntityLink
                    type="source"
                    id={ev.sourceRef.sourceId}
                    className="mt-1 font-mono text-[11px]"
                  >
                    {ev.sourceRef.sourceId}
                  </EntityLink>
                ) : null}
              </div>
            ))}
            {r.utteranceIds.map((id) => {
              const u = s.utterances[id];
              return u ? (
                <UtteranceCard
                  key={id}
                  u={u}
                  s={s}
                  lang={lang}
                  current={id === currentUtterance}
                  onSelect={onSelect}
                />
              ) : null;
            })}
            {notes.map((n) => (
              <div key={n.seq} className="rounded-2xl border border-dashed p-3 text-sm">
                <span className="mr-2 text-xs text-muted-foreground">
                  <AgentTile agentId="expert" /> {t.replay.expert} · {n.utteranceIds.join(", ")}
                </span>
                {localize(n.note, lang)}
                <Badge variant="outline" className="ml-2 h-5 text-[11px]">
                  {n.resolution}
                </Badge>
              </div>
            ))}
            {pending.map((p) => (
              <div key={p.utteranceId} className="rounded-2xl border bg-card p-4" aria-busy>
                <div className="mb-2 flex items-center gap-2">
                  <AgentTile agentId={p.speaker} />
                  <span className="text-sm font-medium">{speakerName(p.speaker, lang)}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {p.utteranceId}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/10 px-2 text-[11px] text-success">
                    <span className="size-1.5 animate-pulse rounded-full bg-current motion-reduce:animate-none" />
                    {t.replay.speaking}
                  </span>
                </div>
                {p.text ? (
                  <p className="text-[15px] leading-relaxed">{p.text}</p>
                ) : (
                  <div className="space-y-2">
                    <Skeleton className="h-3.5 w-full animate-none" />
                    <Skeleton className="h-3.5 w-11/12 animate-none" />
                    <Skeleton className="h-3.5 w-2/3 animate-none" />
                  </div>
                )}
              </div>
            ))}
            {summary ? (
              <div className="rounded-2xl border bg-gray-alpha-50 p-4 text-sm">
                <div className="mb-2 flex items-center gap-2 font-medium">
                  <AgentTile agentId="moderator" />
                  {t.replay.summary} · {r.round}
                </div>
                <p className="mb-3 text-muted-foreground">{localize(summary.text, lang)}</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <div className="mb-1 text-xs text-muted-foreground">{t.replay.conflicts}</div>
                    <ul className="space-y-1">
                      {summary.openConflicts.map((c) => (
                        <li key={c.topicId}>
                          {localize(c.note, lang)}
                          {c.boundBy.length ? (
                            <span className="ml-1 text-xs text-warning">
                              ● {c.boundBy.join(", ")}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-muted-foreground">{t.replay.agreement}</div>
                    <ul className="space-y-1">
                      {summary.consensus.map((c) => (
                        <li key={c.topicId}>
                          {localize(c.note, lang)}{" "}
                          <span className="num text-xs text-muted-foreground">
                            {c.share[0]}/{c.share[1]}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {summary.failedProposals.length ? (
                    <div>
                      <div className="mb-1 text-xs text-muted-foreground">{t.replay.failed}</div>
                      <ul className="space-y-1">
                        {summary.failedProposals.map((f) => (
                          <li key={f.proposalId}>
                            <span className="font-mono text-[11px]">{f.proposalId}</span>{" "}
                            {localize(f.reason, lang)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {summary.newOptions.length ? (
                    <div>
                      <div className="mb-1 text-xs text-muted-foreground">
                        {t.replay.newOptions}
                      </div>
                      <ul className="space-y-1">
                        {summary.newOptions.map((o) => (
                          <li key={o.text}>{localize(o, lang)}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>
        );
      })}
      {s.status === "completed" && s.endCondition ? (
        <div className="rounded-2xl border border-foreground/30 p-4 text-sm">
          <div className="text-xs text-muted-foreground">{t.replay.finished}</div>
          {localize(s.endCondition.note, lang)}
        </div>
      ) : null}
    </div>
  );
}
