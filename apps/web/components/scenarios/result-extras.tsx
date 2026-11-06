"use client";

import Link from "next/link";
import { Section, StubNote } from "@/components/shell/page";
import { usePrefs } from "@/components/shell/providers";
import { Button } from "@/components/ui/button";
import type { RunColumn } from "@/lib/topic-compare";
import { runLabelOf, scenarioT } from "./messages";

type Lang = "de" | "en";

const signed = (x: number, lang: Lang, digits = 1) =>
  `${x > 0 ? "+" : ""}${x.toLocaleString(lang === "de" ? "de-AT" : "en-GB", {
    maximumFractionDigits: digits,
  })}`.replace("-", "−");

/** Package figures per run, only when at least one run modelled an accepted measure. */
export function ImpactAcrossRuns({ runs }: { runs: RunColumn[] }) {
  const { lang } = usePrefs();
  const t = scenarioT(lang).impact;
  const withFigures = runs.filter((r) => r.waitChangePct !== null || r.costEurMio !== null);
  if (withFigures.length === 0) return null;
  return (
    <Section title={t.title} aria-label={t.title}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-1.5 pr-3 font-medium">{t.run}</th>
              <th className="px-3 py-1.5 font-medium">{t.wait}</th>
              <th className="px-3 py-1.5 font-medium">{t.cost}</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="py-2 pr-3">
                  <Link href={`/runs/${r.id}/outcome`} className="hover:underline">
                    {runLabelOf(r, lang)}
                  </Link>
                </td>
                <td className="num px-3 py-2">
                  {r.waitChangePct === null ? (
                    <span className="text-xs text-muted-foreground">{t.none}</span>
                  ) : (
                    `${signed(r.waitChangePct, lang)} %`
                  )}
                </td>
                <td className="num px-3 py-2">
                  {r.costEurMio === null ? (
                    <span className="text-xs text-muted-foreground">{t.none}</span>
                  ) : (
                    `${signed(r.costEurMio, lang, 0)} Mio. EUR`
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

/** Placeholder until the model-bias section lands in main. */
export function ModelsPlaceholder({ topicKey }: { topicKey: string }) {
  const { lang } = usePrefs();
  const t = scenarioT(lang).models;
  return (
    <StubNote>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <span>{t.placeholder}</span>
        <Button asChild variant="outline" size="sm">
          <Link href={`/topics/${encodeURIComponent(topicKey)}`}>{t.link}</Link>
        </Button>
      </div>
    </StubNote>
  );
}
