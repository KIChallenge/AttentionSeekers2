"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { laneT } from "@/components/entity/messages";
import { usePrefs } from "@/components/shell/providers";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

const DAY = 86_400_000;
const toDay = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY);
const fromDay = (d: number) => new Date(d * DAY).toISOString().slice(0, 10);

/** Query box plus the as-of slider (FR-H2). Both write to the URL; the page re-renders on the server. */
export function ArchiveControls({ min, max }: { min: string | null; max: string | null }) {
  const { lang } = usePrefs();
  const t = laneT(lang);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");
  const asOfParam = params.get("asOf");
  const lo = useMemo(() => toDay(min ?? "2000-01-01"), [min]);
  const hi = useMemo(
    () =>
      Math.max(
        toDay(max ?? fromDay(Date.now() / DAY)),
        toDay(new Date().toISOString().slice(0, 10)),
      ),
    [max],
  );
  const [day, setDay] = useState(asOfParam ? toDay(asOfParam) : hi);
  const active = asOfParam !== null;

  useEffect(() => setQ(params.get("q") ?? ""), [params]);
  useEffect(() => {
    if (asOfParam) setDay(toDay(asOfParam));
  }, [asOfParam]);

  const push = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    next.delete("page");
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  // debounce the slider
  // biome-ignore lint/correctness/useExhaustiveDependencies: push and asOfParam are read at fire time
  useEffect(() => {
    if (!active) return;
    const iso = fromDay(day);
    if (iso === asOfParam) return;
    const timer = setTimeout(() => push({ asOf: iso }), 180);
    return () => clearTimeout(timer);
  }, [day, active]);

  return (
    <div className="space-y-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          push({ q });
        }}
      >
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.archive.searchPlaceholder}
          className="h-10"
          aria-label={t.archive.search}
        />
        <Button type="submit" className="h-10">
          {pending ? <Spinner /> : null}
          {t.archive.search}
        </Button>
      </form>
      <div className="rounded-2xl border bg-card p-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Checkbox
              checked={active}
              aria-label={t.archive.asOf}
              onCheckedChange={(v) =>
                push({ asOf: v === true ? fromDay(day) : null, hideAfter: null })
              }
            />
            {t.archive.asOf}
          </span>
          <input
            type="range"
            min={lo}
            max={hi}
            value={day}
            disabled={!active}
            onChange={(e) => setDay(Number(e.target.value))}
            className="min-w-40 flex-1 accent-foreground disabled:opacity-40"
            aria-label={t.archive.asOf}
          />
          <span className="num font-mono text-sm whitespace-nowrap">
            {active ? fromDay(day) : t.archive.asOfOff}
          </span>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={params.get("hideAfter") === "1"}
              disabled={!active}
              aria-label={t.archive.hideAfter}
              onCheckedChange={(v) => push({ hideAfter: v === true ? "1" : null })}
            />
            {t.archive.hideAfter}
          </span>
        </div>
        <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
          <span>{fromDay(lo)}</span>
          <span className="hidden sm:inline">{t.archive.asOfHint}</span>
          <span>{fromDay(hi)}</span>
        </div>
      </div>
    </div>
  );
}
