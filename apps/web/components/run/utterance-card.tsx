"use client";

import type { Claim, ClaimState, Utterance } from "@sv/contracts";
import type { ReactNode } from "react";
import { Level, usePrefs } from "@/components/shell/providers";
import { cn } from "@/lib/utils";
import { Chip, EntityRef, Tile } from "./bits";
import { agentLook, claimUnderline, delegateRole, L, withKeys } from "./helpers";
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
          withKeys(c.citations, (ref) => `${c.id}-${ref.segmentId}`).map(([key, ref]) => (
            <SourceChip key={key} cite={ref} compact />
          )),
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
    for (const [key, ref] of withKeys(c.citations, (r) => `${c.id}-${r.segmentId}`))
      out.push(<SourceChip key={key} cite={ref} compact />);
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
  const role = delegateRole(run, u.speaker, u.delegateId, lang);
  const addressees = (u.addressedTo ?? []).filter((a) => a !== u.speaker);
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
        "scroll-mt-32 rounded-2xl border bg-card p-5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        isMod && "bg-gray-alpha-50",
        selected && "border-foreground ring-1 ring-foreground",
        onSelect && "cursor-pointer hover:border-foreground/30",
      )}
    >
      {/* Header: who speaks, to whom, in reply to whom; the kind as quiet text. Ids,
          proposal ids and the model are Engineer-level. */}
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
        {role ? <span className="text-xs text-muted-foreground">{role}</span> : null}
        {addressees.length ? (
          <span
            className="inline-flex items-center gap-0.5 text-xs text-muted-foreground"
            title={addressees.map((a) => agentLook(run, a, lang).name).join(", ")}
          >
            → {addressees.map((a) => agentLook(run, a, lang).code).join(", ")}
          </span>
        ) : null}
        {u.respondsTo ? (
          <a
            href={`#${u.respondsTo}`}
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            title={`${t.live.respondsTo} ${u.respondsTo}`}
          >
            ↩ {t.live.respondsTo} {replyName ?? u.respondsTo}
          </a>
        ) : null}
        <span className="text-xs text-muted-foreground">· {t.kind[u.kind]}</span>
        {u.redLinesTouched.length ? (
          <Chip
            className="border-warning/40 bg-warning/10 text-warning"
            title={u.redLinesTouched.join(", ")}
          >
            {t.live.redLineTouched}
          </Chip>
        ) : null}
        {u.degraded ? (
          <Chip className="border-destructive/40 text-destructive" title={u.degraded.reason}>
            {t.live.degraded}
          </Chip>
        ) : null}
        <Level min="engineer">
          <span className="ml-auto flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
            {u.proposalIds.map((p) => (
              <span key={p}>{p}</span>
            ))}
            <span>{u.id}</span>
            <span>{u.model}</span>
          </span>
        </Level>
      </header>
      <p className="mt-3 text-sm leading-relaxed">
        <ClaimText u={u} claims={claims} />
      </p>
      {(claims.length > 0 || applied.length > 0) && (
        <footer className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {/* Verified and contradicted carry colour; unverified and assumption are plain. */}
          {(["verified", "contradicted"] as const).map((s) =>
            counts[s] ? <ClaimStateBadge key={s} state={s} count={counts[s]} /> : null,
          )}
          {(["unverified", "assumption"] as const).map((s) =>
            counts[s] ? (
              <span key={s}>
                {counts[s]} {t.claim[s]}
              </span>
            ) : null,
          )}
          {applied.map((a) => (
            <span key={`${a.agentId}-${a.lessonRound}`}>
              <span className="text-info">{t.live.lessonsTitle(a.lessonRound)}:</span>{" "}
              {L(a.note, lang)}
            </span>
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
  const { run, snap, lang, t } = useRun();
  const { projector } = usePrefs();
  const a = agentLook(run, speaker, lang);
  const replyTo = respondsTo ? snap.utterances[respondsTo] : null;
  const replyName = replyTo ? agentLook(run, replyTo.speaker, lang).name : respondsTo;
  return (
    <article className="rounded-2xl border border-foreground bg-card p-5">
      <header className="flex items-center gap-2">
        <Tile id={speaker} size="md" />
        <span className="font-medium">{a.name}</span>
        <Level min="engineer">
          <span className="font-mono text-[11px] text-muted-foreground">{id}</span>
        </Level>
        {respondsTo ? (
          <span className="text-xs text-muted-foreground">
            ↩ {t.live.respondsTo} {replyName}
          </span>
        ) : null}
        <Chip className="border-success/30 bg-success/10 text-success">
          <span className="size-1.5 animate-pulse rounded-full bg-current" />
          {t.live.streaming}
        </Chip>
      </header>
      <div className="mt-3 min-h-[3.25rem] text-sm leading-relaxed">
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
