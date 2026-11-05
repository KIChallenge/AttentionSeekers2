"use client";

import { useState } from "react";
import { Chip, Meter, Panel, Seg, Tile } from "@/components/run/bits";
import { fmtStance, L } from "@/components/run/helpers";
import { SourceChip } from "@/components/run/provenance";
import { useRun } from "@/components/run/run-context";
import { cn } from "@/lib/utils";

/** Strategic panel (W-51, FR-A10): leverage, veto and BATNA, coalitions, dependencies,
 * incentives per proposal, cooperation versus blockade. One assessment per round. */
export function StrategicPanel({ agentId }: { agentId: string }) {
  const { snap, t, lang } = useRun();
  const list = snap.assessments[agentId] ?? [];
  const [round, setRound] = useState<number | null>(null);
  const r = round ?? list.at(-1)?.round ?? null;
  const a = list.find((x) => x.round === r) ?? null;
  return (
    <Panel
      title={t.agent.strategic}
      sub={r ? t.agent.strategicSub(r) : undefined}
      aside={
        r !== null && list.length > 1 ? (
          <Seg
            label={t.common.round}
            value={r}
            onChange={setRound}
            options={list.map((x) => ({ value: x.round, label: `R${x.round}` }))}
          />
        ) : null
      }
    >
      {!a ? (
        <p className="text-sm text-muted-foreground">{t.agent.noAssessment}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-4">
            <div>
              <h3 className="mb-1 text-xs text-muted-foreground">{t.agent.leverage}</h3>
              <ul className="space-y-1 text-sm">
                {a.leverage.map((l) => (
                  <li key={l.text.text}>
                    {L(l.text, lang)}
                    {l.sourceRef ? (
                      <SourceChip cite={l.sourceRef} compact />
                    ) : (
                      <Chip className="ml-1 border-dashed">{t.agent.assumptionMark}</Chip>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border p-2.5">
                <div className="text-xs text-muted-foreground">{t.agent.veto}</div>
                <div
                  className={cn(
                    "mt-0.5 font-semibold",
                    a.vetoStatus === "formal_veto" && "text-destructive",
                  )}
                >
                  {t.agent.vetoStatus[a.vetoStatus]}
                </div>
                {a.vetoBasis ? (
                  <div className="mt-0.5 text-xs text-muted-foreground">{L(a.vetoBasis, lang)}</div>
                ) : null}
              </div>
              <div className="rounded-xl border p-2.5">
                <div className="text-xs text-muted-foreground">{t.agent.batna}</div>
                <div className="num mt-0.5 font-semibold">{fmtStance(a.batna.value)}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{L(a.batna.text, lang)}</div>
              </div>
            </div>
            <div className="rounded-xl border p-2.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{t.agent.coopVsBlock}</span>
                <Chip
                  className={cn(
                    a.cooperationVsBlockade.lean === "cooperate" &&
                      "border-success/30 bg-success/10 text-success",
                    a.cooperationVsBlockade.lean === "block" &&
                      "border-warning/40 bg-warning/10 text-warning",
                  )}
                >
                  {t.agent.lean[a.cooperationVsBlockade.lean]}
                </Chip>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className="w-24 text-muted-foreground">{t.agent.blockadeRisk}</span>
                <Meter value={a.cooperationVsBlockade.blockadeRisk} />
                <span className="num w-10 text-right">
                  {Math.round(a.cooperationVsBlockade.blockadeRisk * 100)} %
                </span>
              </div>
              <p className="mt-1.5 text-sm">{L(a.cooperationVsBlockade.reason, lang)}</p>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <h3 className="mb-1 text-xs text-muted-foreground">{t.agent.coalitionOptions}</h3>
              <ul className="space-y-1.5 text-sm">
                {a.coalitionOptions.map((c) => (
                  <li key={c.withAgents.join("-")} className="flex flex-wrap items-center gap-1">
                    {c.withAgents.map((w) => (
                      <Tile key={w} id={w} />
                    ))}
                    <span className="num text-xs text-muted-foreground">
                      {t.agent.overlap} {Math.round(c.overlap * 100)} %
                    </span>
                    <span className="w-full text-xs">{L(c.note, lang)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-1 text-xs text-muted-foreground">{t.agent.dependencies}</h3>
              <ul className="space-y-1 text-sm">
                {a.dependencies.map((d) => (
                  <li
                    key={`${d.agentId}-${d.kind}`}
                    className="flex flex-wrap items-center gap-1.5"
                  >
                    <span className="text-xs text-muted-foreground">
                      {t.agent.direction[d.direction]}
                    </span>
                    <Tile id={d.agentId} withName />
                    <Chip>{t.agent.depKind[d.kind]}</Chip>
                    <span className="text-xs text-muted-foreground">{L(d.note, lang)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-1 text-xs text-muted-foreground">{t.agent.incentives}</h3>
              {a.incentives.length === 0 ? (
                <p className="text-sm text-muted-foreground">·</p>
              ) : (
                <table className="w-full text-xs">
                  <tbody>
                    {a.incentives.map((i) => (
                      <tr key={`${i.proposalId}-${i.dimension}`} className="border-b last:border-0">
                        <td className="py-1 pr-2 font-mono whitespace-nowrap">{i.proposalId}</td>
                        <td className="pr-2">{t.agent.dimension[i.dimension]}</td>
                        <td
                          className={cn(
                            "num pr-2 font-semibold whitespace-nowrap",
                            i.sign === 1 && "text-success",
                            i.sign === -1 && "text-warning",
                          )}
                        >
                          {i.sign === 1 ? "+" : i.sign === -1 ? "−" : "0"}{" "}
                          {t.agent.magnitude[i.magnitude]}
                        </td>
                        <td className="py-1 text-muted-foreground">
                          {L(i.note, lang)}{" "}
                          {i.sourceRef ? (
                            <SourceChip cite={i.sourceRef} compact />
                          ) : (
                            <Chip className="border-dashed">{t.agent.assumptionMark}</Chip>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}
