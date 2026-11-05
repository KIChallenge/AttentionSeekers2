"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Chip, Seg } from "./bits";
import { useRun } from "./run-context";

/** Second bar on every run screen: question, screen links, status, live replay control. */
export function RunSubBar() {
  const { run, snap, runId, t, streaming, streamState, playLive, stop, speed, setSpeed } =
    useRun();
  const path = usePathname();
  const base = `/runs/${runId}`;
  const links = [
    { href: base, label: t.nav.negotiation, active: path === base },
    {
      href: `${base}/agents/${run.agents[0]?.id ?? "gm"}`,
      label: t.nav.agents,
      active: path.startsWith(`${base}/agents`),
    },
    { href: `${base}/analysis`, label: t.nav.analysis, active: path.startsWith(`${base}/analysis`) },
    { href: `${base}/outcome`, label: t.nav.outcome, active: path.startsWith(`${base}/outcome`) },
    { href: `${base}/result`, label: t.nav.result, active: path.startsWith(`${base}/result`) },
  ];
  const status =
    snap.status === "running"
      ? { cls: "border-success/30 bg-success/10 text-success", label: t.live.live }
      : snap.status === "completed"
        ? { cls: "text-muted-foreground", label: t.live.completed }
        : snap.status === "failed"
          ? { cls: "border-destructive/40 text-destructive", label: t.live.failed }
          : { cls: "text-muted-foreground", label: t.live.waiting };
  return (
    <div className="sticky top-[50px] z-10 flex h-11 items-center gap-3 border-b bg-surface/95 px-6 backdrop-blur print:hidden">
      <Chip className="shrink-0 bg-gray-alpha-100">{t.live.question}</Chip>
      <span className="min-w-0 flex-1 truncate text-sm" title={run.mandate.question}>
        {run.mandate.question}
      </span>
      <Chip className={cn("shrink-0", status.cls)}>
        {snap.status === "running" ? (
          <span className="size-1.5 animate-pulse rounded-full bg-current" />
        ) : null}
        {snap.source === "replay" && streaming ? `${t.live.replay} · ` : ""}
        {status.label}
      </Chip>
      <nav className="flex shrink-0 items-center gap-0.5" aria-label="Run">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={l.active ? "page" : undefined}
            className={cn(
              "rounded-control px-2.5 py-1 text-xs text-muted-foreground hover:bg-gray-alpha-100 hover:text-foreground",
              l.active && "bg-gray-alpha-150 text-foreground",
            )}
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <span className="h-5 w-px bg-border" />
      <Seg
        label={t.live.speed}
        value={speed}
        onChange={setSpeed}
        options={[1, 4, 16].map((s) => ({ value: s, label: `${s}x` }))}
      />
      {streaming && streamState === "streaming" ? (
        <button
          type="button"
          onClick={stop}
          className="h-7 shrink-0 rounded-control border px-2.5 text-xs hover:border-foreground/40"
        >
          {t.live.stop}
        </button>
      ) : (
        <button
          type="button"
          onClick={playLive}
          className="h-7 shrink-0 rounded-control bg-foreground px-2.5 text-xs text-background"
        >
          ▶ {t.live.playLive}
        </button>
      )}
    </div>
  );
}
