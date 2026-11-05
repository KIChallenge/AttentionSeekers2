"use client";

import { Menu01Icon, Projector01Icon, Settings01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Lang } from "@sv/contracts";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

const iconBtn =
  "inline-grid size-8 shrink-0 place-items-center rounded-control border text-muted-foreground hover:border-foreground/40 hover:text-foreground aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background";

/**
 * Global top bar. Language and disclosure stay visible from md up because the demo uses
 * both on stage (ui-plan 7.8); theme and projector mode live in the settings menu, with a
 * one-click projector toggle beside it. Below lg the screen links fold into a menu, below md
 * the level and language switches join them, so nothing overflows at 390px.
 */
export function TopBar() {
  const { t, lang, level, setLang, setLevel, projector, setProjector } = usePrefs();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const pathname = usePathname();
  const nav = [
    { href: "/", label: t.nav.dashboard },
    { href: "/runs/new", label: t.nav.newRun },
    { href: "/archive", label: t.nav.archive },
  ];
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const themeValue = mounted ? (theme ?? "system") : "system";
  const themes = [
    { value: "system", label: t.prefs.themes.system },
    { value: "light", label: t.prefs.themes.light },
    { value: "dark", label: t.prefs.themes.dark },
  ];
  return (
    <header className="sticky top-0 z-20 flex h-[50px] items-center gap-2 border-b bg-surface px-3 sm:gap-4 sm:px-6 print:hidden">
      <Link
        href="/"
        className="flex min-w-0 items-center gap-2 rounded-control text-base font-semibold whitespace-nowrap"
      >
        <span className="inline-grid size-5 shrink-0 place-items-center rounded-md bg-foreground">
          <i className="block size-2 rounded-[2px] bg-background" />
        </span>
        <span className="truncate">{t.brand}</span>
      </Link>
      <nav className="hidden items-center gap-1 lg:flex" aria-label={t.nav.screens}>
        {nav.map((n) => {
          const active = isActive(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-control px-2.5 py-1 text-sm whitespace-nowrap text-muted-foreground hover:bg-gray-alpha-100 hover:text-foreground",
                active && "bg-gray-alpha-150 text-foreground",
              )}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>
      <span className="flex-1" />
      <div className="hidden items-center gap-2 md:flex">
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
      </div>
      <button
        type="button"
        aria-pressed={projector}
        aria-label={t.prefs.projector}
        title={`${t.prefs.projector}: ${t.prefs.projectorHint}`}
        onClick={() => setProjector(!projector)}
        className={iconBtn}
      >
        <HugeiconsIcon icon={Projector01Icon} size={16} strokeWidth={1.8} />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={iconBtn}
          aria-label={`${t.nav.menu} / ${t.prefs.settings}`}
          title={t.prefs.settings}
        >
          <HugeiconsIcon
            icon={Settings01Icon}
            size={16}
            strokeWidth={1.8}
            className="hidden lg:block"
          />
          <HugeiconsIcon icon={Menu01Icon} size={16} strokeWidth={1.8} className="lg:hidden" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <div className="lg:hidden">
            <DropdownMenuLabel>{t.nav.screens}</DropdownMenuLabel>
            {nav.map((n) => (
              <DropdownMenuItem key={n.href} asChild>
                <Link href={n.href} aria-current={isActive(n.href) ? "page" : undefined}>
                  {n.label}
                </Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </div>
          <div className="md:hidden">
            <DropdownMenuLabel>{t.prefs.level}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={level} onValueChange={(v) => setLevel(v as Level)}>
              {LEVELS.map((l) => (
                <DropdownMenuRadioItem key={l} value={l}>
                  {t.prefs.levels[l]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t.prefs.language}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={lang} onValueChange={(v) => setLang(v as Lang)}>
              <DropdownMenuRadioItem value="de">Deutsch</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
          </div>
          <DropdownMenuLabel>{t.prefs.theme}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={themeValue} onValueChange={setTheme}>
            {themes.map((o) => (
              <DropdownMenuRadioItem key={o.value} value={o.value}>
                {o.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem checked={projector} onCheckedChange={(v) => setProjector(!!v)}>
            <span>
              {t.prefs.projector}
              <span className="block text-xs font-normal text-muted-foreground">
                {t.prefs.projectorHint}
              </span>
            </span>
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
