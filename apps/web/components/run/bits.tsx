"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { EntityLink } from "@/components/entity/entity-link";
import { scopedId } from "@/components/entity/types";
import { usePrefs } from "@/components/shell/providers";
import { cn } from "@/lib/utils";
import { agentLook } from "./helpers";
import { useRun } from "./run-context";

/** Card frame used by every run screen (mockup: 14px radius, hairline border). */
export function Panel({
  title,
  aside,
  sub,
  children,
  className,
  id,
}: {
  title?: ReactNode;
  aside?: ReactNode;
  sub?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("rounded-2xl border bg-card p-4 shadow-xs", className)}>
      {title ? (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">{title}</h2>
            {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
          </div>
          {aside ? <div className="flex flex-wrap items-center gap-2">{aside}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Chip({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-full border px-2 text-xs whitespace-nowrap",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Agent code tile in the run's colour; identity is colour plus code plus name. */
export function Tile({
  id,
  size = "sm",
  withName = false,
  className,
}: {
  id: string;
  size?: "sm" | "md" | "lg";
  withName?: boolean;
  className?: string;
}) {
  const { run, lang } = useRun();
  const { projector } = usePrefs();
  const a = agentLook(run, id, lang);
  // Projector mode (W-34) steps every tile up one size so codes read from the back row.
  const s = projector ? (size === "sm" ? "md" : "lg") : size;
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} title={a.name}>
      <span
        data-agent={id}
        className={cn(
          "inline-grid shrink-0 place-items-center rounded-[5px] font-semibold text-white",
          s === "sm" && "size-4 text-[8px]",
          s === "md" && "size-5 text-[9px]",
          s === "lg" && "size-7 rounded-md text-[11px]",
          size === "lg" && "size-9 rounded-lg text-sm",
          id === "fm" && "outline-1 outline-offset-1 outline-dashed outline-[var(--c-fm)]",
        )}
        style={{ background: a.color }}
      >
        {a.code}
      </span>
      {withName ? <span className="text-sm">{a.name}</span> : null}
    </span>
  );
}

/**
 * Link to another entity of this run.
 * TODO(W-54): swap for EntityLink from components/entity once it exists (hover preview,
 * backlinks). Until then a plain link with the same href scheme.
 */
export function EntityRef({
  href,
  children,
  className,
  title,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <Link
      href={href}
      title={title}
      className={cn(
        "underline decoration-gray-alpha-400 underline-offset-2 hover:decoration-foreground",
        className,
      )}
    >
      {children}
    </Link>
  );
}

/** Utterance id link to the deliberation inspector, mono. */
export function UttRef({ id, className }: { id: string; className?: string }) {
  const { runId } = useRun();
  return (
    <EntityLink
      type="utterance"
      id={scopedId(runId, id)}
      href={`/runs/${runId}/inspect/${id}`}
      className={cn("font-mono text-xs", className)}
    >
      {id}
    </EntityLink>
  );
}

/** Simple segmented control (buttons), used where ToggleGroup state would be overkill. */
export function Seg<T extends string | number>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: ReactNode; title?: string }>;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <fieldset
      aria-label={label}
      className={cn("inline-flex rounded-control border bg-gray-alpha-50 p-0.5", className)}
    >
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          title={o.title}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-7 rounded-[8px] px-2.5 text-xs text-muted-foreground hover:text-foreground",
            o.value === value && "bg-background text-foreground shadow-xs",
          )}
        >
          {o.label}
        </button>
      ))}
    </fieldset>
  );
}

/** Horizontal meter 0..1 with optional baseline tick. */
export function Meter({
  value,
  tick,
  className,
}: {
  value: number;
  tick?: number | null;
  className?: string;
}) {
  return (
    <span className={cn("relative block h-1.5 w-full rounded-full bg-gray-alpha-150", className)}>
      <span
        className="absolute inset-y-0 left-0 rounded-full bg-foreground"
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
      />
      {tick != null ? (
        <span
          className="absolute -top-1 h-3.5 w-0.5 bg-warning"
          style={{ left: `calc(${tick * 100}% - 1px)` }}
        />
      ) : null}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
      {children}
    </div>
  );
}
