"use client";

import type { CitationRef, Claim, ClaimState } from "@sv/contracts";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Chip, EntityRef } from "./bits";
import { ageMonths, claimStateClass, L, sourceLabel } from "./helpers";
import { useRun } from "./run-context";

/**
 * Citation chip "institution · date · outlet" with recency weight and age (FR-P2, FR-P4).
 * Click opens the name-masked passage, German original first (FR-L3).
 */
export function SourceChip({ cite, compact = false }: { cite: CitationRef; compact?: boolean }) {
  const { evidence, run, t, lang } = useRun();
  const src = evidence.sources[cite.sourceId];
  const seg = evidence.segments[cite.segmentId];
  const age = src ? ageMonths(src.date, run.mandate.asOf) : null;
  const sozdok = src?.kind === "sozdok" || src?.kind === "ris";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="mx-0.5 inline-flex h-[18px] translate-y-[-1px] items-center gap-1 rounded-[5px] border bg-gray-alpha-50 px-1.5 align-middle font-mono text-[10.5px] text-muted-foreground hover:border-foreground/40 hover:text-foreground"
          title={src?.title ?? cite.sourceId}
        >
          <span
            className={cn("size-1.5 rounded-[2px]", sozdok ? "bg-foreground" : "bg-gray-alpha-400")}
          />
          {sourceLabel(src, cite)}
          {compact ? null : (
            <span className="text-text-tertiary">
              · w {cite.recencyWeight.toFixed(2)}
              {age !== null ? ` · ${t.source.ageMonths(age)}` : ""}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-96 gap-2 rounded-2xl" align="start">
        <div className="flex items-center justify-between gap-2 font-mono text-[11px] text-muted-foreground">
          <span>{sourceLabel(src, cite)}</span>
          <span>
            w {cite.recencyWeight.toFixed(2)}
            {age !== null ? ` · ${t.source.age} ${t.source.ageMonths(age)}` : ""}
          </span>
        </div>
        {src ? (
          <div className="text-sm font-medium">
            {src.title ?? src.institution.nameDe}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              {lang === "en" ? `(${src.institution.glossEn})` : null}
            </span>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">{t.source.unknown}</div>
        )}
        {seg ? (
          <>
            <div className="text-[11px] text-muted-foreground uppercase">{t.source.original}</div>
            <blockquote className="border-l-2 pl-2 text-sm">„{seg.text}“</blockquote>
            {lang === "en" && seg.textEn ? (
              <>
                <div className="text-[11px] text-muted-foreground uppercase">
                  {t.source.translation}
                </div>
                <blockquote className="border-l-2 pl-2 text-sm text-muted-foreground">
                  {seg.textEn}
                </blockquote>
              </>
            ) : null}
          </>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          {src?.personFiltered ? <Chip>{t.source.personFiltered}</Chip> : null}
          <span>
            {t.source.asOf} {run.mandate.asOf}
          </span>
          {src?.corpusRevision ? <span className="font-mono">{src.corpusRevision}</span> : null}
          <span className="flex-1" />
          <EntityRef href={`/archive/sources/${cite.sourceId}`}>{t.source.openArchive}</EntityRef>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ClaimStateBadge({ state, count }: { state: ClaimState; count?: number }) {
  const { t } = useRun();
  return (
    <Chip className={claimStateClass[state]}>
      {count !== undefined ? `${count} ` : null}
      {t.claim[state]}
    </Chip>
  );
}

/** Per-claim block: atomic text, state, citations, verifying models (FR-T10). */
export function ClaimRow({ claim, dense = false }: { claim: Claim; dense?: boolean }) {
  const { t, lang } = useRun();
  return (
    <div className="rounded-xl border p-2.5">
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[11px] text-muted-foreground">{claim.id}</span>
        <ClaimStateBadge state={claim.state} />
      </div>
      <p className="mt-1 text-sm">„{claim.atomicText}“</p>
      {claim.citations.length ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {claim.citations.map((c) => (
            <SourceChip key={c.segmentId} cite={c} />
          ))}
        </div>
      ) : null}
      {!dense && claim.verifyingModels.length ? (
        <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
          {claim.verifyingModels.map((v) => (
            <li key={v.model}>
              <span className="font-mono">{v.model}</span>:{" "}
              <span
                className={cn(
                  v.verdict === "supported" && "text-success",
                  v.verdict === "contradicted" && "text-warning",
                )}
              >
                {t.claim.verdict[v.verdict]}
              </span>
              {v.reason ? ` · ${v.reason}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {claim.contradiction ? (
        <p className="mt-1 text-xs text-warning">
          {t.claim.contradictionWith} {claim.contradiction.withClaimId}:{" "}
          {L(claim.contradiction.note, lang)} ({claim.contradiction.resolution})
        </p>
      ) : null}
    </div>
  );
}
