import type { Lang } from "@sv/contracts";
import Link from "next/link";
import { CommandPalette } from "@/components/entity/command-palette";
import { laneT } from "@/components/entity/messages";
import { cn } from "@/lib/utils";

export function ArchiveNav({
  lang,
  active,
}: {
  lang: Lang;
  active: "search" | "law" | "episodes" | "stats" | null;
}) {
  const t = laneT(lang);
  const tabs = [
    { key: "search", href: "/archive", label: t.archive.tabs.search },
    // Legal basis (FR-P6): the archive filtered to kind "law", one source per provision.
    { key: "law", href: "/archive?kind=law", label: t.archive.kinds.law },
    { key: "episodes", href: "/archive/episodes", label: t.archive.tabs.episodes },
    { key: "stats", href: "/archive/stats", label: t.archive.tabs.stats },
  ] as const;
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <nav
        className="inline-flex rounded-control border p-0.5"
        aria-label={lang === "de" ? "Archivbereiche" : "Archive sections"}
      >
        {tabs.map((x) => (
          <Link
            key={x.key}
            href={x.href}
            aria-current={active === x.key ? "page" : undefined}
            className={cn(
              "rounded-[8px] px-3 py-1 text-sm",
              active === x.key
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {x.label}
          </Link>
        ))}
      </nav>
      <span className="flex-1" />
      <CommandPalette />
    </div>
  );
}
