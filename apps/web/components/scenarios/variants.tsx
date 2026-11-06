"use client";

// "Szenarien" tab: the same question under changed room settings, side by side.
import { localize } from "@sv/contracts";
import Link from "next/link";
import { compromiseTally } from "@/components/outcome/compromise-strings";
import { usePrefs } from "@/components/shell/providers";
import type { Range, VariantComparison } from "@/lib/scenario-variants";
import { variantHeadline } from "@/lib/scenario-variants";
import { cn } from "@/lib/utils";

type Lang = "de" | "en";

export const VARIANT_T = {
  de: {
    labels: {
      reference: "Referenz",
      budget_tight: "Budget knapp",
      budget_generous: "Budget großzügig",
      climate_cooperative: "Klima kooperativ",
      climate_confrontational: "Klima konfrontativ",
      rule_veto: "Mehrheit mit Vetospielern",
      rule_consensus: "Konsens",
    } as Record<string, string>,
    setting: "Einstellung",
    rule: {
      consensus: "Konsens",
      qualified_majority: "Qualifizierte Mehrheit",
      veto_players: "Mehrheit mit Veto",
    },
    climate: { cooperative: "kooperativ", neutral: "neutral", confrontational: "konfrontativ" },
    accepted: "Angenommene Maßnahmen",
    none: "keine",
    tabled: "verhandelt",
    compromise: "Kompromissvorschlag",
    wait: "Wartezeit (Paket)",
    cost: "Kosten pro Jahr",
    conflicts: "Offene Konflikte",
    topics: "Zustimmung je Thema",
    of: "von",
    to: "bis",
    notModelled: "nicht modelliert",
    empty: "Noch keine Szenario-Varianten für diese Frage.",
  },
  en: {
    labels: {
      reference: "Reference",
      budget_tight: "Tight budget",
      budget_generous: "Generous budget",
      climate_cooperative: "Cooperative climate",
      climate_confrontational: "Confrontational climate",
      rule_veto: "Majority with veto players",
      rule_consensus: "Consensus",
    } as Record<string, string>,
    setting: "Setting",
    rule: {
      consensus: "Consensus",
      qualified_majority: "Qualified majority",
      veto_players: "Majority with veto",
    },
    climate: { cooperative: "cooperative", neutral: "neutral", confrontational: "confrontational" },
    accepted: "Accepted measures",
    none: "none",
    tabled: "tabled",
    compromise: "Compromise proposal",
    wait: "Waiting time (package)",
    cost: "Cost per year",
    conflicts: "Open conflicts",
    topics: "Agreement per topic",
    of: "of",
    to: "to",
    notModelled: "not modelled",
    empty: "No scenario variants for this question yet.",
  },
} as const;

const num = (x: number, lang: Lang, digits = 1) =>
  x
    .toLocaleString(lang === "de" ? "de-AT" : "en-GB", { maximumFractionDigits: digits })
    .replace("-", "−");

function fmtRange(r: Range | null, unit: string, lang: Lang, digits: number) {
  const t = VARIANT_T[lang];
  if (!r) return <span className="text-xs text-muted-foreground">{t.notModelled}</span>;
  return (
    <>
      <span className="num">
        {num(r.value, lang, digits)} {unit}
      </span>
      {r.low !== null && r.high !== null ? (
        <div className="num text-[11px] text-muted-foreground">
          {num(r.low, lang, digits)} {t.to} {num(r.high, lang, digits)}
        </div>
      ) : null}
    </>
  );
}

export function ScenarioVariants({ cmp }: { cmp: VariantComparison | null }) {
  const { lang } = usePrefs();
  const t = VARIANT_T[lang];
  if (!cmp || cmp.columns.length === 0)
    return <p className="text-sm text-muted-foreground">{t.empty}</p>;
  const labelOf = (l: string) => t.labels[l] ?? l;
  const cols = cmp.columns;
  const row = "border-t align-top";
  const head = "py-2.5 pr-3 text-left text-xs font-medium text-muted-foreground";
  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-4xl text-base leading-relaxed">{variantHeadline(cmp, labelOf, lang)}</p>
      <section className="rounded-2xl border bg-card shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="text-left">
              <tr>
                <th className="w-44 px-4 py-2.5" />
                {cols.map((c) => (
                  <th key={c.id} className="px-2 py-2.5 font-medium">
                    <Link href={`/runs/${c.id}/outcome`} className="hover:underline">
                      {labelOf(c.label)}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className={row}>
                <th className={cn(head, "px-4")}>{t.setting}</th>
                {cols.map((c) => (
                  <td key={c.id} className="px-2 py-2.5 text-xs text-muted-foreground">
                    {t.rule[c.rule]} · +{c.budgetPct} % · {t.climate[c.climate]}
                  </td>
                ))}
              </tr>
              <tr className={row}>
                <th className={cn(head, "px-4")}>{t.compromise}</th>
                {cols.map((c) => (
                  <td key={c.id} className="px-2 py-2.5">
                    {c.compromise ? (
                      <div className="flex flex-col gap-1">
                        <span>{localize(c.compromise.title, lang)}</span>
                        {c.compromiseResult ? (
                          <span
                            className={cn(
                              "w-fit rounded-md border px-1.5 py-0.5 text-xs",
                              c.compromiseResult.passes
                                ? "border-success/30 bg-success/10 text-success"
                                : "border-warning/40 text-warning",
                            )}
                          >
                            {compromiseTally(c.compromiseResult, lang)}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t.none}</span>
                    )}
                  </td>
                ))}
              </tr>
              <tr className={row}>
                <th className={cn(head, "px-4")}>{t.accepted}</th>
                {cols.map((c) => (
                  <td key={c.id} className="px-2 py-2.5">
                    {c.accepted.length ? (
                      <ul className="space-y-0.5">
                        {c.accepted.map((p) => (
                          <li key={p.id}>{localize(p.title, lang)}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {t.none} ({c.tabled} {t.tabled})
                      </span>
                    )}
                  </td>
                ))}
              </tr>
              <tr className={row}>
                <th className={cn(head, "px-4")}>{t.wait}</th>
                {cols.map((c) => (
                  <td key={c.id} className="px-2 py-2.5">
                    {fmtRange(c.wait, "%", lang, 1)}
                  </td>
                ))}
              </tr>
              <tr className={row}>
                <th className={cn(head, "px-4")}>{t.cost}</th>
                {cols.map((c) => (
                  <td key={c.id} className="px-2 py-2.5">
                    {fmtRange(c.cost, "Mio. EUR", lang, 0)}
                  </td>
                ))}
              </tr>
              <tr className={row}>
                <th className={cn(head, "px-4")}>{t.conflicts}</th>
                {cols.map((c) => (
                  <td key={c.id} className="px-2 py-2.5 text-xs">
                    {c.conflicts.length
                      ? c.conflicts.map((x) => localize(x, lang)).join(", ")
                      : t.none}
                  </td>
                ))}
              </tr>
              <tr className={row}>
                <th className={cn(head, "px-4")} colSpan={cols.length + 1}>
                  {t.topics}
                </th>
              </tr>
              {cmp.topics.map((tp) => (
                <tr key={tp.id} className="border-t align-top">
                  <td className="px-4 py-2 text-sm">{localize(tp.label, lang)}</td>
                  {cols.map((c) => {
                    const a = c.agreement[tp.id];
                    if (!a) return <td key={c.id} className="px-2 py-2" />;
                    const agreed = a.oppose === 0 && a.support >= a.of - 1;
                    return (
                      <td key={c.id} className="px-2 py-2">
                        <span
                          className={cn(
                            "num rounded-md border px-1.5 py-0.5 text-xs",
                            agreed
                              ? "border-success/30 bg-success/10 text-success"
                              : "text-muted-foreground",
                          )}
                          title={`+${a.support} / −${a.oppose} / ${a.of}`}
                        >
                          {a.support} {t.of} {a.of}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
