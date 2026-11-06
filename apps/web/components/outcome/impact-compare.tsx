"use client";

import type { ImpactFigure } from "@sv/contracts";
import { fmtNum } from "@/components/run/helpers";
import { useRun } from "@/components/run/run-context";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Bi = { de: string; en: string };
export interface EvidenceInfo {
  version: string;
  classes: Record<
    string,
    {
      label: Bi;
      basis: "derived" | "assumption";
      derivation: Bi;
      sources: Array<{ title: string; publisher: string; year: number; url: string }>;
    }
  >;
  claimed: { waitChangePct: number; budgetChangePct: number };
}

const num = (x: number, lang: "de" | "en") =>
  fmtNum(x, lang, Math.abs(x) < 10 && x % 1 ? 1 : 0).replace("-", "−");
const signed = (x: number, lang: "de" | "en") => `${x > 0 ? "+" : ""}${num(x, lang)}`;

function Cell({ f, unit }: { f?: ImpactFigure; unit: string }) {
  const { lang, t } = useRun();
  if (!f || f.value === null)
    return <span className="text-muted-foreground">{t.common.notAvailable}</span>;
  return (
    <>
      <span className="font-medium">
        {f.metric === "cost_eur_pa" ? num(f.value, lang) : signed(f.value, lang)} {unit}
      </span>
      {f.low !== null && f.high !== null ? (
        <div className="text-[11px] text-muted-foreground">
          {num(f.low, lang)} {lang === "de" ? "bis" : "to"} {num(f.high, lang)}
        </div>
      ) : null}
    </>
  );
}

function ClassChip({ id, info }: { id: string; info: EvidenceInfo }) {
  const { lang, t } = useRun();
  const c = info.classes[id];
  if (!c) return null;
  const n = c.sources.length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "rounded-control border px-2 py-0.5 text-xs whitespace-nowrap hover:border-foreground/40",
            c.basis === "assumption" && "border-dashed text-muted-foreground",
          )}
        >
          {c.label[lang]} · {n ? t.outcome.ev.sources(n) : t.outcome.ev.noEvidence}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-96 gap-3 text-xs" align="start">
        <div className="font-medium">{c.label[lang]}</div>
        <p className="text-muted-foreground">{c.derivation[lang]}</p>
        {n ? (
          <ul className="space-y-2">
            {c.sources.map((s) => (
              <li key={s.url || s.title}>
                <a href={s.url} target="_blank" rel="noreferrer" className="underline">
                  {s.title}
                </a>
                <div className="text-muted-foreground">
                  {s.publisher}, {s.year}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/** Accepted package, proposers' estimate and the brief's example package side by side. */
export function ImpactCompare({
  figures,
  brief,
  evidence,
  fallback,
}: {
  figures: ImpactFigure[];
  brief: ImpactFigure[];
  evidence: EvidenceInfo;
  fallback: boolean;
}) {
  const { t, lang } = useRun();
  const ev = t.outcome.ev;
  const get = (fs: ImpactFigure[], id: string, m: string) =>
    fs.find((f) => f.measureId === id && f.metric === m);
  const legacy = !figures.some((f) => f.basis === "evidence");
  const rows = [
    {
      key: "pkg",
      label: legacy ? ev.proposer : fallback ? ev.fallback : ev.accepted,
      fs: figures,
      id: "package",
      muted: false,
    },
    ...(legacy
      ? []
      : [{ key: "prop", label: ev.proposer, fs: figures, id: "proposer:package", muted: true }]),
    { key: "brief", label: ev.brief, fs: brief, id: "scenario:brief", muted: false },
  ];
  const bw = get(brief, "scenario:brief", "wait_change_pct");
  const bs = get(brief, "scenario:brief", "sv_spend_pp");
  const claimed = evidence.claimed;
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="py-2 pr-2 font-normal" />
              <th className="px-2 text-right font-normal">{ev.wait}</th>
              <th className="px-2 text-right font-normal">{ev.cost}</th>
              <th className="px-2 text-right font-normal">{ev.spend}</th>
              <th className="px-2 font-normal">{ev.classes}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const w = get(r.fs, r.id, "wait_change_pct");
              return (
                <tr
                  key={r.key}
                  className={cn("border-b align-top", r.muted && "text-muted-foreground")}
                >
                  <td className="py-2.5 pr-2">
                    {r.label}
                    {r.key === "brief" ? (
                      <div className="text-[11px] text-muted-foreground">
                        {ev.claimed(
                          signed(claimed.waitChangePct, lang),
                          num(claimed.budgetChangePct, lang),
                        )}
                      </div>
                    ) : null}
                  </td>
                  <td className="num px-2 py-2.5 text-right whitespace-nowrap">
                    <Cell f={w} unit="%" />
                  </td>
                  <td className="num px-2 py-2.5 text-right whitespace-nowrap">
                    <Cell f={get(r.fs, r.id, "cost_eur_pa")} unit="Mio. €" />
                  </td>
                  <td className="num px-2 py-2.5 text-right whitespace-nowrap">
                    <Cell f={get(r.fs, r.id, "sv_spend_pp")} unit="%" />
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {(w?.evidenceClasses ?? []).map((c) => (
                        <ClassChip key={c} id={c} info={evidence} />
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {bw?.value != null && bw.low != null && bw.high != null && bs?.value != null ? (
        <p className="text-sm">
          {ev.briefNote(
            num(bw.value, lang),
            num(bw.low, lang),
            num(bw.high, lang),
            num(bs.value, lang),
            bw.low <= claimed.waitChangePct,
          )}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">{legacy ? ev.legacy : ev.method}</p>
    </div>
  );
}
