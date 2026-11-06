"use client";

import Link from "next/link";
import { type ReactNode, useState } from "react";
import { AgentTile } from "@/components/run/agent-tile";
import { usePrefs } from "@/components/shell/providers";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { laneT } from "./messages";
import { type EntityPreview, type EntityType, entityHref } from "./types";

const cache = new Map<string, Promise<EntityPreview | null>>();

function fetchPreview(type: EntityType, id: string, lang: string) {
  const key = `${lang}:${type}:${id}`;
  let p = cache.get(key);
  if (!p) {
    p = fetch(`/api/entities/${type}/${encodeURIComponent(id)}?lang=${lang}`)
      .then((r) => (r.ok ? (r.json() as Promise<EntityPreview>) : null))
      .catch(() => null);
    cache.set(key, p);
  }
  return p;
}

/** Small type marker so every link says what it points to. */
export function EntityTypeMark({ type, className }: { type: EntityType; className?: string }) {
  const { lang } = usePrefs();
  return (
    <span
      className={cn(
        "rounded-[4px] border px-1 font-mono text-[10px] leading-4 text-muted-foreground uppercase",
        className,
      )}
    >
      {laneT(lang).entity.types[type]}
    </span>
  );
}

export function PreviewCard({ p }: { p: EntityPreview }) {
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        {p.agentId ? <AgentTile agentId={p.agentId} /> : null}
        <div className="min-w-0 flex-1">
          <div className="text-sm leading-snug font-medium">{p.title}</div>
          {p.subtitle ? (
            <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{p.subtitle}</div>
          ) : null}
        </div>
        <EntityTypeMark type={p.type} />
      </div>
      {p.snippet ? (
        <p className="border-l-2 pl-2 text-xs leading-relaxed text-muted-foreground">{p.snippet}</p>
      ) : null}
      {p.meta.length ? (
        <div className="flex flex-wrap gap-1">
          {p.meta.map((m) => (
            <span key={m} className="rounded-md bg-gray-alpha-100 px-1.5 py-0.5 text-[11px]">
              {m}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * One link component for every entity type (W-54, FR-T12). Hovering shows a lazily
 * fetched preview; clicking navigates to the entity page.
 */
export function EntityLink({
  type,
  id,
  href,
  children,
  className,
  mark = false,
  prefetched,
}: {
  type: EntityType;
  id: string;
  href?: string;
  children: ReactNode;
  className?: string;
  /** Show the small type marker after the label. */
  mark?: boolean;
  prefetched?: EntityPreview;
}) {
  const { lang } = usePrefs();
  const t = laneT(lang);
  const [state, setState] = useState<{ p: EntityPreview | null; done: boolean }>(
    prefetched ? { p: prefetched, done: true } : { p: null, done: false },
  );
  const onOpen = (open: boolean) => {
    if (!open || state.done) return;
    void fetchPreview(type, id, lang).then((p) => setState({ p, done: true }));
  };
  return (
    <HoverCard openDelay={250} closeDelay={80} onOpenChange={onOpen}>
      <HoverCardTrigger asChild>
        <Link
          href={href ?? state.p?.href ?? entityHref(type, id)}
          className={cn(
            "inline-flex items-baseline gap-1 underline decoration-gray-alpha-400 decoration-dotted underline-offset-3 hover:decoration-foreground",
            className,
          )}
          data-entity={type}
        >
          {children}
          {mark ? <EntityTypeMark type={type} className="no-underline" /> : null}
        </Link>
      </HoverCardTrigger>
      <HoverCardContent className="w-80" align="start">
        {!state.done ? (
          <div className="space-y-2" role="status" aria-label={t.entity.loading}>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : state.p ? (
          <PreviewCard p={state.p} />
        ) : (
          <p className="text-sm text-muted-foreground">{t.entity.notFound}</p>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
