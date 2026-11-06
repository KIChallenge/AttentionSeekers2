"use client";

import { useSearchParams } from "next/navigation";
import { type ReactNode, Suspense, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface TabSpec {
  value: string;
  label: string;
}

/** shadcn Tabs whose active tab lives in `?tab=`, so every tab has a link and the back button works. */
function SyncedTabs({
  tabs,
  panels,
  param = "tab",
}: {
  tabs: TabSpec[];
  panels: Record<string, ReactNode>;
  param?: string;
}) {
  const search = useSearchParams();
  const requested = search.get(param);
  const initial = tabs.some((t) => t.value === requested) ? requested : (tabs[0]?.value ?? "");
  // every panel is already rendered, so a tab switch is local; only the URL is updated, without
  // a server round trip (router.replace re-rendered the whole page and could stall the switch)
  const [value, setValue] = useState(initial ?? "");
  const onChange = (next: string) => {
    setValue(next);
    const url = new URL(window.location.href);
    url.searchParams.set(param, next);
    window.history.replaceState(window.history.state, "", url);
  };
  return (
    <Tabs value={value ?? ""} onValueChange={onChange} className="gap-8">
      <TabsList variant="line" className="h-auto w-full justify-start border-b p-0">
        {tabs.map((t) => (
          <TabsTrigger
            key={t.value}
            value={t.value}
            className="h-10 flex-none rounded-none px-3 text-sm after:bottom-[-1px] data-active:after:opacity-100"
          >
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((t) => (
        <TabsContent key={t.value} value={t.value} className="flex min-w-0 flex-col gap-8">
          {panels[t.value]}
        </TabsContent>
      ))}
    </Tabs>
  );
}

export function ScenarioTabs(props: {
  tabs: TabSpec[];
  panels: Record<string, ReactNode>;
  param?: string;
}) {
  return (
    <Suspense fallback={null}>
      <SyncedTabs {...props} />
    </Suspense>
  );
}
