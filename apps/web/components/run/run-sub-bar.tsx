"use client";

import { PlayIcon, StopIcon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PlaybackButton, PlaybackGroup, Segmented } from "@/components/playback/controls";
import { cn } from "@/lib/utils";
import { Chip } from "./bits";
import { useRun } from "./run-context";

/** Second bar on every run screen: question, screen links, status, live replay control. */
export function RunSubBar() {
  const { run, snap, runId, t, streaming, streamState, playLive, stop, speed, setSpeed } = useRun();
  const path = usePathname();
  const base = `/runs/${runId}`;
  const links = [
    { href: base, label: t.nav.negotiation, active: path === base },
    {
      href: `${base}/agents/${run.agents[0]?.id ?? "gm"}`,
      label: t.nav.agents,
      active: path.startsWith(`${base}/agents`),
    },
    {
      href: `${base}/analysis`,
      label: t.nav.analysis,
      active: path.startsWith(`${base}/analysis`),
    },
    { href: `${base}/outcome`, label: t.nav.outcome, active: path.startsWith(`${base}/outcome`) },
    { href: `${base}/result`, label: t.nav.result, active: path.startsWith(`${base}/result`) },
    { href: `${base}/stage`, label: t.nav.stage, active: path.startsWith(`${base}/stage`) },
    { href: `${base}/trace`, label: "Trace", active: path.startsWith(`${base}/trace`) },
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
    <div className="sticky top-[50px] z-10 flex h-11 items-center gap-2 border-b bg-surface/95 px-3 backdrop-blur sm:gap-3 sm:px-6 print:hidden">
      <Chip className="hidden shrink-0 bg-gray-alpha-100 xl:inline-flex">{t.live.question}</Chip>
      <span
        className="hidden min-w-0 flex-1 truncate text-sm md:block"
        title={run.mandate.question}
      >
        {run.mandate.question}
      </span>
      <Chip className={cn("hidden shrink-0 sm:inline-flex", status.cls)}>
        {snap.status === "running" ? (
          <span className="size-1.5 animate-pulse rounded-full bg-current" />
        ) : null}
        {snap.source === "replay" && streaming ? `${t.live.replay} · ` : ""}
        {status.label}
      </Chip>
      <nav
        className="-my-1 flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto py-1 md:flex-none md:shrink-0"
        aria-label={t.nav.runScreens}
      >
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={l.active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-control px-2.5 py-1 text-xs whitespace-nowrap text-muted-foreground hover:bg-gray-alpha-100 hover:text-foreground",
              l.active && "bg-gray-alpha-150 text-foreground",
            )}
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <span className="hidden h-5 w-px bg-border lg:block" />
      <PlaybackGroup label={t.live.replay} className="shrink-0 gap-2">
        <Segmented
          label={t.live.speed}
          className="hidden lg:inline-flex"
          value={speed}
          onChange={setSpeed}
          options={[1, 4, 16].map((s) => ({ value: s, label: `${s}x` }))}
        />
        {streaming && streamState === "streaming" ? (
          <PlaybackButton
            icon={StopIcon}
            filled
            label={t.live.stopHint}
            text={t.live.stop}
            onClick={stop}
          />
        ) : (
          <PlaybackButton
            icon={PlayIcon}
            filled
            variant="primary"
            label={t.live.playLiveHint}
            text={t.live.playLive}
            onClick={playLive}
          />
        )}
      </PlaybackGroup>
    </div>
  );
}
