"use client";

import type { Claim, ClaimState, Utterance } from "@sv/contracts";
import type { ReactNode } from "react";
import { Level, usePrefs } from "@/components/shell/providers";
import { cn } from "@/lib/utils";
import { Chip, EntityRef, Tile } from "./bits";
import { agentLook, claimUnderline, L } from "./helpers";
import { ClaimStateBadge, SourceChip } from "./provenance";
import { useRun } from "./run-context";

/** Body text with claim spans underlined by state and citation chips after each span. */
function ClaimText({ u, claims }: { u: Utterance; claims: Claim[] }) {
  const { lang } = useRun();
  const original = u.text.lang === lang || !u.text.translations[lang];
  const text = L(u.text, lang);
  if (!original || claims.length === 0) {
    return (
      <>
        {text}
        {claims.flatMap((c) => c.citations).length ? " " : null}
        {claims.flatMap((c) =>
          c.citations.map((ref) => <SourceChip key={`${c.id}-${ref.segmentId}`} cite={ref} />),
        )}
      </>
    );
  }
  const sorted = [...claims]
    .filter((c) => c.span.end <= text.length && c.span.start < c.span.end)
    .sort((a, b) => a.span.start - b.span.start);
  const out: ReactNode[] = [];
  let pos = 0;
  for (const c of sorted) {
    if (c.span.start < pos) continue;
    out.push(text.slice(pos, c.span.start));
    out.push(
      <span
        key={c.id}
        title={c.atomicText}
        className={cn("underline decoration-1 underline-offset-[3px]", claimUnderline[c.state])}
      >
        {text.slice(c.span.start, c.span.end)}
      </span>,
    );
    for (const ref of c.citations)
      out.push(<SourceChip key={`${c.id}-${ref.segmentId}`} cite={ref} />);
    pos = c.span.end;
  }
  out.push(text.slice(pos));
  return <>{out}</>;
}

export function UtteranceCard({
  u,
  selected,
  onSelect,
}: {
  u: Utterance;
  selected?: boolean;
  onSelect?: (id: string) => void;
}) {
  const { snap, run, t, lang, runId } = useRun();
  const claims = u.claimIds.map((id) => snap.claims[id]).filter((c): c is Claim => !!c);
  const counts = claims.reduce<Partial<Record<ClaimState, number>>>((acc, c) => {
    acc[c.state] = (acc[c.state] ?? 0) + 1;
    return acc;
  }, {});
  const speaker = agentLook(run, u.speaker, lang);
  const replyTo = u.respondsTo ? snap.utterances[u.respondsTo] : null;
  const replyName = replyTo ? agentLook(run, replyTo.speaker, lang).name : null;
  const isMod = u.speaker === "moderator";
  const applied = snap.lessonApplications.filter((a) => a.utteranceId === u.id);
  return (
    // biome-ignore lint/a11y/useSemanticElements: card contains links and popover buttons
    <div
      id={u.id}
      role="button"
      tabIndex={0}
      data-utt-card=""
      aria-pressed={onSelect ? !!selected : undefined}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a,button")) return;
        onSelect?.(u.id);
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.(u.id);
        }
      }}
      data-selected={selected || undefined}
      className={cn(
        "scroll-mt-28 rounded-2xl border bg-card p-3.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        isMod && "bg-gray-alpha-50",
        selected && "border-foreground ring-1 ring-foreground",
        onSelect && "cursor-pointer hover:border-foreground/30",
      )}
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Tile id={u.speaker} size="md" />
        {isMod || u.speaker === "expert" ? (
          <span className="font-medium">{speaker.name}</span>
        ) : (
          <EntityRef
            href={`/runs/${runId}/agents/${u.speaker}`}
            className="font-medium no-underline hover:underline"
          >
            {speaker.name}
          </EntityRef>
        )}
        <span className="font-mono text-[11px] text-muted-foreground">{u.id}</span>
        {u.respondsTo ? (
          <a
            href={`#${u.respondsTo}`}
            className="inline-flex items-center gap-1 rounded-full border px-2 text-xs text-muted-foreground hover:text-foreground"
            title={`${t.live.respondsTo} ${u.respondsTo}`}
          >
            ↩ {t.live.respondsTo} <span className="font-mono">{u.respondsTo}</span>
            {replyName ? ` ${replyName}` : ""}
          </a>
        ) : null}
        <Chip className="bg-gray-alpha-100 font-medium">{t.kind[u.kind]}</Chip>
        {u.redLinesTouched.length ? (
          <Chip
            className="border-warning/40 bg-warning/10 text-warning"
            title={u.redLinesTouched.join(", ")}
          >
            {t.live.redLineTouched}
          </Chip>
        ) : null}
        {u.proposalIds.map((p) => (
          <Chip key={p} className="font-mono">
            {p}
          </Chip>
        ))}
        {u.degraded ? (
          <Chip className="border-destructive/40 text-destructive" title={u.degraded.reason}>
            {t.live.degraded}
          </Chip>
        ) : null}
        <Level min="engineer">
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">{u.model}</span>
        </Level>
      </header>
      <p className="mt-2 text-sm leading-relaxed">
        <ClaimText u={u} claims={claims} />
      </p>
      {(claims.length > 0 || applied.length > 0) && (
        <footer className="mt-2 flex flex-wrap items-center gap-1.5">
          {(["verified", "unverified", "contradicted", "assumption"] as const).map((s) =>
            counts[s] ? <ClaimStateBadge key={s} state={s} count={counts[s]} /> : null,
          )}
          {applied.map((a) => (
            <Chip key={`${a.agentId}-${a.lessonRound}`} className="border-info/30 text-info">
              {t.live.lessonsTitle(a.lessonRound).split(" (")[0]}: {L(a.note, lang)}
            </Chip>
          ))}
        </footer>
      )}
      <Level min="engineer">
        {u.telemetry ? (
          <div className="mt-2 font-mono text-[11px] text-muted-foreground">
            {u.telemetry.latencyMs} ms · {u.telemetry.tokensIn} in / {u.telemetry.tokensOut} out
            {u.telemetry.costEur != null ? ` · ${u.telemetry.costEur.toFixed(4)} €` : ""}
            {u.telemetry.retries ? ` · ${u.telemetry.retries} retries` : ""}
            {u.telemetry.fallbackFrom ? ` · fallback ${u.telemetry.fallbackFrom}` : ""}
          </div>
        ) : null}
        {u.deliberationSummary ? (
          <div className="mt-2 grid gap-2 rounded-xl bg-gray-alpha-50 p-2 text-xs sm:grid-cols-3">
            <div>
              <div className="text-muted-foreground">{t.live.read}</div>
              {u.deliberationSummary.read}
            </div>
            <div>
              <div className="text-muted-foreground">{t.live.weighed}</div>
              {u.deliberationSummary.weighed}
            </div>
            <div>
              <div className="text-muted-foreground">{t.live.wouldMove}</div>
              {u.deliberationSummary.wouldMoveIt}
            </div>
          </div>
        ) : null}
      </Level>
    </div>
  );
}

/** Fixed-size skeleton for a started utterance; layout does not move on completion. */
export function PendingCard({
  speaker,
  id,
  respondsTo,
  text,
}: {
  speaker: string;
  id: string;
  respondsTo: string | null;
  text: string;
}) {
  const { run, lang, t } = useRun();
  const { projector } = usePrefs();
  const a = agentLook(run, speaker, lang);
  return (
    <article className="rounded-2xl border border-foreground bg-card p-3.5">
      <header className="flex items-center gap-2">
        <Tile id={speaker} size="md" />
        <span className="font-medium">{a.name}</span>
        <span className="font-mono text-[11px] text-muted-foreground">{id}</span>
        {respondsTo ? (
          <span className="text-xs text-muted-foreground">
            ↩ {t.live.respondsTo} <span className="font-mono">{respondsTo}</span>
          </span>
        ) : null}
        <Chip className="border-success/30 bg-success/10 text-success">
          <span className="size-1.5 animate-pulse rounded-full bg-current" />
          {t.live.streaming}
        </Chip>
      </header>
      <div className="mt-2 min-h-[3.25rem] text-sm leading-relaxed">
        {text ? (
          <>
            {text}
            {projector ? null : (
              <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 bg-foreground" />
            )}
          </>
        ) : (
          <div className="space-y-2 pt-1">
            <div className="h-3 w-11/12 rounded bg-gray-alpha-150" />
            <div className="h-3 w-3/4 rounded bg-gray-alpha-150" />
          </div>
        )}
      </div>
      <div className="mt-2 h-5 w-40 rounded-full bg-gray-alpha-100" />
    </article>
  );
}
