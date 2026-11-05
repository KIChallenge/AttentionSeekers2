"use client";

import type { Lang } from "@sv/contracts";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LEVELS, type Level } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { usePrefs } from "./providers";

function Seg<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      size="sm"
      variant="outline"
      spacing={0}
      aria-label={label}
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
    >
      {options.map((o) => (
        <ToggleGroupItem key={o.value} value={o.value} className="h-7 px-2.5 text-xs">
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export function TopBar() {
  const { t, lang, level, setLang, setLevel } = usePrefs();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const pathname = usePathname();
  const nav = [
    { href: "/", label: t.nav.dashboard },
    { href: "/runs/new", label: t.nav.newRun },
    { href: "/archive", label: t.nav.archive },
    { href: "/method", label: t.nav.method },
  ];
  return (
    <header className="sticky top-0 z-20 flex h-[50px] items-center gap-4 border-b bg-surface px-6">
      <Link href="/" className="flex items-center gap-2 text-base font-semibold whitespace-nowrap">
        <span className="inline-grid size-5 place-items-center rounded-md bg-foreground">
          <i className="block size-2 rounded-[2px] bg-background" />
        </span>
        {t.brand}
      </Link>
      <nav className="flex items-center gap-1" aria-label="Screens">
        {nav.map((n) => {
          const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-control px-2.5 py-1 text-sm text-muted-foreground hover:bg-gray-alpha-100 hover:text-foreground",
                active && "bg-gray-alpha-150 text-foreground",
              )}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>
      <span className="flex-1" />
      <Seg<Level>
        label={t.prefs.level}
        value={level}
        options={LEVELS.map((l) => ({ value: l, label: t.prefs.levels[l] }))}
        onChange={setLevel}
      />
      <Seg<Lang>
        label={t.prefs.language}
        value={lang}
        options={[
          { value: "de", label: "DE" },
          { value: "en", label: "EN" },
        ]}
        onChange={setLang}
      />
      <Seg<string>
        label={t.prefs.theme}
        value={mounted ? (theme ?? "system") : "system"}
        options={[
          { value: "system", label: t.prefs.themes.system },
          { value: "light", label: t.prefs.themes.light },
          { value: "dark", label: t.prefs.themes.dark },
        ]}
        onChange={setTheme}
      />
    </header>
  );
}
