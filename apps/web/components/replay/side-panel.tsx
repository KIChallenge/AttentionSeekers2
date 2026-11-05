"use client";

import { type Lang, localize, positionAt, type RunSnapshot, topicStatus } from "@sv/contracts";
import { laneT } from "@/components/entity/messages";
import { AgentTile } from "@/components/run/agent-tile";
import { cn } from "@/lib/utils";

/** Support = neutral alpha ramp, opposition = hatch (mockup rule: texture for polarity). */
function cellStyle(stance: number): React.CSSProperties {
  if (stance >= 0.5) {
    const a = stance >= 1.5 ? 0.55 : stance >= 1 ? 0.38 : 0.22;
    return { background: `color-mix(in oklab, var(--foreground) ${a * 100}%, transparent)` };
  }
  if (stance <= -0.5) {
    const a = stance <= -1.5 ? 0.6 : 0.35;
    return {
      backgroundImage: `repeating-linear-gradient(135deg, color-mix(in oklab, var(--foreground) ${a * 100}%, transparent) 0 2px, transparent 2px 5px)`,
    };
  }
  return { background: "var(--gray-alpha-50)" };
}

export function PositionGrid({ s, lang }: { s: RunSnapshot; lang: Lang }) {
  const t = laneT(lang);
  const run = s.run;
  if (!run) return null;
  const topics = run.mandate.topics;
  const round = s.currentRound || 1;
  return (
    <section className="rounded-2xl border bg-card p-3">
      <div className="mb-2 flex items-baseline justify-between text-xs text-muted-foreground">
        <span>{t.replay.positions}</span>
        <span className="num">R{round}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0.5 text-[10px]">
          <thead>
            <tr>
              <th />
              {run.agents.map((a) => (
                <th key={a.id} className="font-normal">
                  <AgentTile agentId={a.id} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {topics.map((tp) => {
              const st = topicStatus(s, tp.id);
              return (
                <tr key={tp.id}>
                  <th
                    className="max-w-24 truncate pr-1 text-left font-normal text-muted-foreground"
                    title={localize(tp.label, lang)}
                  >
                    {localize(tp.label, lang)}
                    <span className="num ml-1 opacity-60">{st.support}</span>
                  </th>
                  {run.agents.map((a) => {
                    const p = positionAt(s, a.id, tp.id);
                    const moved = p?.trigger && p.round === round;
                    return (
                      <td
                        key={a.id}
                        className={cn(
                          "num h-6 min-w-6 rounded-[4px] text-center transition-colors",
                          moved && "outline-2 outline-offset-[-1px]",
                        )}
                        style={{
                          ...(p ? cellStyle(p.stance) : {}),
                          outlineColor: moved ? a.color : undefined,
                        }}
                        title={
                          p
                            ? `${a.code} · ${localize(tp.label, lang)}: ${p.stance.toFixed(1)}${p.trigger ? ` · ${t.replay.trigger} ${p.trigger.utteranceId}` : ""}`
                            : undefined
                        }
                      >
                        {p ? (p.stance > 0 ? "+" : "") + p.stance.toFixed(1) : ""}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const STATUS_CLS: Record<string, string> = {
  open: "text-muted-foreground",
  accepted: "border-success/40 bg-success/10 text-success",
  rejected: "border-destructive/40 bg-destructive/10 text-destructive",
  withdrawn: "text-muted-foreground line-through",
};

export function ProposalList({ s, lang }: { s: RunSnapshot; lang: Lang }) {
  const t = laneT(lang);
  const list = s.proposalOrder.map((id) => s.proposals[id]).filter((p) => p !== undefined);
  return (
    <section className="rounded-2xl border bg-card p-3">
      <div className="mb-2 text-xs text-muted-foreground">
        {t.replay.proposals} <span className="num">{list.length}</span>
      </div>
      {list.length === 0 ? (
        <p className="text-xs text-muted-foreground">–</p>
      ) : (
        <ul className="space-y-2">
          {list.map((p) => (
            <li key={p.id} className="text-xs">
              <div className="flex items-start gap-1.5">
                <AgentTile agentId={p.originAgent} className="mt-0.5" />
                <span className="flex-1 leading-snug">{localize(p.title, lang)}</span>
                <span className={cn("shrink-0 rounded-md border px-1.5", STATUS_CLS[p.status])}>
                  {t.replay.statusLabels[p.status]}
                </span>
              </div>
              <div className="mt-1 ml-5.5 flex items-center gap-2">
                <span className="h-1 w-20 overflow-hidden rounded-full bg-gray-alpha-150">
                  <span
                    className="block h-full bg-foreground"
                    style={{ width: `${p.acceptance * 100}%` }}
                  />
                </span>
                <span className="num text-muted-foreground">
                  {Math.round(p.acceptance * 100)} %
                </span>
                {p.cost ? (
                  <span className="num text-muted-foreground">
                    {p.cost.value} {p.cost.unit}
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
