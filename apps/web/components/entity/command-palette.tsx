"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AgentTile } from "@/components/run/agent-tile";
import { usePrefs } from "@/components/shell/providers";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { laneT } from "./messages";
import { ENTITY_TYPES, type EntityPreview } from "./types";

const PAGES = [
  { href: "/", key: "dashboard" },
  { href: "/runs/new", key: "newRun" },
  { href: "/archive", key: "archive" },
  { href: "/archive/episodes", key: "episodes" },
  { href: "/archive/stats", key: "stats" },
  { href: "/replay/fixture-wartezeiten", key: "replay" },
] as const;

/**
 * Global command palette (W-54): Cmd/Ctrl+K searches every entity type through
 * /api/entities/search. Mount once per page tree; a second mount is a no-op.
 */
export function CommandPalette({ showTrigger = true }: { showTrigger?: boolean }) {
  const { lang, t: base } = usePrefs();
  const t = laneT(lang);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<EntityPreview[]>([]);
  const [loading, setLoading] = useState(false);
  const owner = useRef(false);

  useEffect(() => {
    const w = window as unknown as { __svPalette?: boolean };
    if (w.__svPalette) return;
    w.__svPalette = true;
    owner.current = true;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("sv:palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("sv:palette", onOpen);
      w.__svPalette = false;
    };
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) {
      setItems([]);
      return;
    }
    const ctl = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/entities/search?q=${encodeURIComponent(q)}&lang=${lang}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : []))
        .then((x: EntityPreview[]) => setItems(x))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 160);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [q, lang]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };
  const pageLabel: Record<(typeof PAGES)[number]["key"], string> = {
    dashboard: base.nav.dashboard,
    newRun: base.nav.newRun,
    archive: base.nav.archive,
    episodes: t.archive.episode.list,
    stats: t.archive.stats.title,
    replay: `${base.replay.title}: ${base.dashboard.reference}`,
  };

  return (
    <>
      {showTrigger ? (
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("sv:palette"))}
          className="hidden h-8 items-center gap-2 sm:inline-flex rounded-control border bg-background px-2.5 text-xs text-muted-foreground hover:text-foreground"
        >
          {t.entity.palette.hint}
          <Kbd>Ctrl K</Kbd>
        </button>
      ) : null}
      {owner.current || open ? (
        <CommandDialog
          open={open}
          onOpenChange={setOpen}
          title={t.entity.palette.hint}
          description={t.entity.palette.placeholder}
          className="sm:max-w-2xl"
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={t.entity.palette.placeholder}
              value={q}
              onValueChange={setQ}
            />
            <CommandList className="max-h-[60vh]">
              <CommandEmpty>{loading ? t.entity.loading : t.entity.palette.empty}</CommandEmpty>
              {q.trim().length < 2 ? (
                <CommandGroup heading={t.entity.palette.pages}>
                  {PAGES.map((p) => (
                    <CommandItem
                      key={p.href}
                      value={`page ${pageLabel[p.key]}`}
                      onSelect={() => go(p.href)}
                    >
                      {pageLabel[p.key]}
                      <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                        {p.href}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              {ENTITY_TYPES.map((type) => {
                const list = items.filter((i) => i.type === type);
                if (!list.length) return null;
                return (
                  <CommandGroup key={type} heading={t.entity.types[type]}>
                    {list.map((i) => (
                      <CommandItem
                        key={`${i.type}:${i.id}`}
                        value={`${i.type}:${i.id} ${i.title} ${q}`}
                        onSelect={() => go(i.href)}
                        className="items-start"
                      >
                        {i.agentId ? <AgentTile agentId={i.agentId} className="mt-0.5" /> : null}
                        <div className="min-w-0 flex-1">
                          <div className="truncate">{i.title}</div>
                          {i.subtitle || i.snippet ? (
                            <div className="truncate text-xs text-muted-foreground">
                              {i.snippet ?? i.subtitle}
                            </div>
                          ) : null}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                );
              })}
            </CommandList>
          </Command>
        </CommandDialog>
      ) : null}
    </>
  );
}
