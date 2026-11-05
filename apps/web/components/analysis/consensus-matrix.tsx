"use client";

import { positionAt, topicStatus } from "@sv/contracts";
import { useState } from "react";
import { Chip, Seg, Tile, UttRef } from "@/components/run/bits";
import { fmtStance, L } from "@/components/run/helpers";
import { useRun } from "@/components/run/run-context";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const HATCH = "repeating-linear-gradient(135deg, var(--gray-alpha-400) 0 2px, transparent 2px 6px)";

/** Consensus matrix (FR-U4, FR-O2): sticky topic column, Stand/Delta toggle, hatch, red dots. */
export function ConsensusMatrix() {
  const { snap, run, t, lang, evidence } = useRun();
  const last = Math.max(1, snap.summaries.length, snap.currentRound);
  const [mode, setMode] = useState<"state" | "delta">("state");
  const agents = run.agents;
  const statusCls: Record<string, string> = {
    consensus: "border-success/30 bg-success/10 text-success",
    majority: "",
    minority: "border-warning/40 bg-warning/10 text-warning",
    no_result: "text-muted-foreground",
  };
  const redLineFor = (agentId: string, topicKey: string) => {
    const cfg = agents.find((a) => a.id === agentId);
    return (cfg?.redLineIds ?? [])
      .map((id) => evidence.redLines[id])
      .filter((r) => r?.topicKeys.includes(topicKey));
  };
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Seg
          label={lang === "de" ? "Matrixansicht" : "Matrix view"}
          value={mode}
          onChange={setMode}
          options={[
            { value: "state", label: t.analysis.matrixState(last) },
            { value: "delta", label: t.analysis.matrixDelta(last) },
          ]}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-1 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-[1] bg-card text-left text-xs font-normal text-muted-foreground">
                {t.analysis.measure}
              </th>
              {agents.map((a) => (
                <th key={a.id} className="w-[72px] text-center font-normal">
                  <Tile id={a.id} />
                </th>
              ))}
              <th className="text-left text-xs font-normal text-muted-foreground">
                {t.analysis.status}
              </th>
            </tr>
          </thead>
          <tbody>
            {run.mandate.topics.map((tp) => {
              const st = topicStatus(snap, tp.id, last);
              return (
                <tr key={tp.id}>
                  <td className="sticky left-0 z-[1] min-w-[150px] bg-card pr-2 align-top">
                    <div className="font-medium">{L(tp.label, lang)}</div>
                    <div className="text-xs text-muted-foreground">{L(tp.measure, lang)}</div>
                  </td>
                  {agents.map((a) => {
                    const p = positionAt(snap, a.id, tp.id, last);
                    const p1 = positionAt(snap, a.id, tp.id, 1);
                    if (!p) return <td key={a.id} className="rounded-lg bg-gray-alpha-50" />;
                    const v = p.stance;
                    const delta = p1 ? v - p1.stance : 0;
                    const rl = redLineFor(a.id, tp.key);
                    const alpha = v > 0 ? Math.min(1, v / 2) : 0;
                    const shownVal = mode === "state" ? v : delta;
                    const history = (snap.positions[a.id]?.[tp.id] ?? []).filter(
                      (x) => x.round <= last,
                    );
                    return (
                      <td key={a.id} className="p-0">
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className={cn(
                                "relative flex h-12 w-full flex-col items-center justify-center rounded-lg border border-transparent hover:border-foreground/40",
                                mode === "delta" &&
                                  Math.abs(delta) >= 0.5 &&
                                  "border-foreground/50",
                              )}
                              style={{
                                background:
                                  mode === "delta"
                                    ? `color-mix(in oklab, var(--foreground) ${Math.min(60, Math.abs(delta) * 30)}%, transparent)`
                                    : v <= -0.5
                                      ? HATCH
                                      : `color-mix(in oklab, var(--foreground) ${Math.round(alpha * 38)}%, transparent)`,
                              }}
                            >
                              <span
                                className={cn(
                                  "num rounded px-1 text-[13px] font-semibold",
                                  v <= -0.5 && mode === "state" && "bg-card",
                                )}
                              >
                                {mode === "delta" ? `Δ ${fmtStance(shownVal)}` : fmtStance(v)}
                              </span>
                              <span
                                data-matrix-secondary=""
                                className={cn(
                                  "num rounded px-0.5 text-[10px] text-muted-foreground",
                                  v <= -0.5 && mode === "state" && "bg-card",
                                )}
                              >
                                {mode === "state" && p1 ? `R1 ${fmtStance(p1.stance)}` : null}
                                {mode === "delta"
                                  ? `${fmtStance(p1?.stance ?? v)} → ${fmtStance(v)}`
                                  : null}
                              </span>
                              {rl.length ? (
                                <span className="absolute top-1 right-1 size-1.5 rounded-full bg-destructive" />
                              ) : null}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-80 gap-2 rounded-2xl text-sm">
                            <div className="flex items-center gap-2">
                              <Tile id={a.id} withName />
                              <span className="text-muted-foreground">· {L(tp.label, lang)}</span>
                            </div>
                            <ol className="space-y-1">
                              {history.map((h) => (
                                <li key={h.round} className="text-xs">
                                  <span className="num font-mono">
                                    R{h.round} {fmtStance(h.stance)}
                                  </span>
                                  {h.trigger ? (
                                    <>
                                      {" "}
                                      · {t.agent.trigger} <UttRef id={h.trigger.utteranceId} />
                                      {h.trigger.note ? ` · ${L(h.trigger.note, lang)}` : ""}
                                    </>
                                  ) : (
                                    <span className="text-muted-foreground">
                                      {" "}
                                      · {L(h.rationale, lang)}
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ol>
                            {rl.map((r) =>
                              r ? (
                                <div key={r.id} className="text-xs text-destructive">
                                  ● {L(r.text, lang)}
                                </div>
                              ) : null,
                            )}
                          </PopoverContent>
                        </Popover>
                      </td>
                    );
                  })}
                  <td className="min-w-[110px] align-middle">
                    <Chip className={statusCls[st.status]}>
                      {statusLabel(st.status, lang)} {st.support}/{st.of}
                    </Chip>
                  </td>
                </tr>
              );
            })}
            <tr>
              <td className="sticky left-0 bg-card pt-2 text-xs text-muted-foreground">
                {t.analysis.movement}
              </td>
              {agents.map((a) => {
                let sum = 0;
                for (const list of Object.values(snap.positions[a.id] ?? {})) {
                  const l = list.filter((p) => p.round <= last);
                  for (let i = 1; i < l.length; i++) {
                    const x = l[i];
                    const y = l[i - 1];
                    if (x && y) sum += Math.abs(x.stance - y.stance);
                  }
                }
                return (
                  <td key={a.id} className="num pt-2 text-center text-xs text-muted-foreground">
                    {sum.toFixed(1)}
                  </td>
                );
              })}
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          {[0.1, 0.2, 0.3, 0.38].map((x) => (
            <i
              key={x}
              className="inline-block size-3 rounded-sm"
              style={{
                background: `color-mix(in oklab, var(--foreground) ${x * 100}%, transparent)`,
              }}
            />
          ))}
          {t.analysis.legendFor}
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="inline-block size-3 rounded-sm" style={{ background: HATCH }} />
          {t.analysis.legendAgainst}
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="inline-block size-1.5 rounded-full bg-destructive" />
          {t.analysis.legendRedLine}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t.analysis.rule}</p>
    </div>
  );
}

export function statusLabel(s: string, lang: "de" | "en"): string {
  const de: Record<string, string> = {
    consensus: "Konsens",
    majority: "Mehrheit",
    minority: "Minderheit",
    no_result: "offen",
  };
  const en: Record<string, string> = {
    consensus: "Consensus",
    majority: "Majority",
    minority: "Minority",
    no_result: "open",
  };
  return (lang === "de" ? de : en)[s] ?? s;
}
