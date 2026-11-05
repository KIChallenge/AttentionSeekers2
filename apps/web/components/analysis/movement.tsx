"use client";

import { pathLength, positionAt } from "@sv/contracts";
import { Chip, Tile, UttRef } from "@/components/run/bits";
import { L } from "@/components/run/helpers";
import { useRun } from "@/components/run/run-context";

/** Who moved (FR-U4): ranked path length, round of the largest step, trigger link. */
export function WhoMoved() {
  const { snap, run } = useRun();
  const rows = run.agents
    .map((a) => {
      let best: { round: number; d: number; trigger: string | null } | null = null;
      for (const list of Object.values(snap.positions[a.id] ?? {})) {
        for (let i = 1; i < list.length; i++) {
          const p = list[i];
          const q = list[i - 1];
          if (!p || !q) continue;
          const d = Math.abs(p.stance - q.stance);
          if (d > 0 && (!best || d > best.d))
            best = { round: p.round, d, trigger: p.trigger?.utteranceId ?? null };
        }
      }
      return { id: a.id, len: pathLength(snap, a.id), best };
    })
    .sort((a, b) => b.len - a.len);
  const max = Math.max(0.01, ...rows.map((r) => r.len));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.id} className="grid grid-cols-[20px_1fr_auto] items-center gap-2 text-sm">
          <Tile id={r.id} />
          <span className="relative block h-1.5 rounded-full bg-gray-alpha-150">
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-foreground"
              style={{ width: `${(r.len / max) * 100}%` }}
            />
          </span>
          <span className="num min-w-[110px] text-right text-xs">
            {r.len.toFixed(2)}
            {r.best ? (
              <span className="text-muted-foreground">
                {" "}
                · R{r.best.round}
                {r.best.trigger ? (
                  <>
                    {" "}
                    · <UttRef id={r.best.trigger} />
                  </>
                ) : null}
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Open conflicts (FR-R2, AC 6): two sides, stance distance, binding red lines. */
export function OpenConflicts() {
  const { snap, run, t, lang, evidence } = useRun();
  const last = snap.summaries[snap.summaries.length - 1];
  if (!last) return <p className="text-sm text-muted-foreground">{t.analysis.noData}</p>;
  const mean = (ids: string[], topicId: string) => {
    const v = ids
      .map((id) => positionAt(snap, id, topicId)?.stance)
      .filter((x): x is number => x !== undefined);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  };
  return (
    <div className="space-y-3">
      {last.openConflicts.map((c) => {
        const tp = run.mandate.topics.find((x) => x.id === c.topicId);
        const dist = Math.abs(mean(c.sides[0], c.topicId) - mean(c.sides[1], c.topicId));
        const failed = snap.proposalOrder
          .map((id) => snap.proposals[id])
          .filter((p) => p && p.status === "rejected" && p.topicIds.includes(c.topicId));
        return (
          <div key={c.topicId} className="rounded-xl border p-3">
            <div className="font-medium">
              {tp ? L(tp.label, lang) : c.topicId}
              <span className="font-normal text-muted-foreground">: {L(c.note, lang)}</span>
            </div>
            <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <div className="flex flex-wrap gap-1">
                {c.sides[0].map((a) => (
                  <Tile key={a} id={a} />
                ))}
              </div>
              <div className="text-center">
                <div className="num text-xl font-semibold">{dist.toFixed(1)}</div>
                <div className="text-[10px] text-muted-foreground">{t.analysis.distance}</div>
              </div>
              <div className="flex flex-wrap justify-end gap-1">
                {c.sides[1].map((a) => (
                  <Tile key={a} id={a} />
                ))}
              </div>
            </div>
            <dl className="mt-2 grid grid-cols-[84px_1fr] gap-x-2 gap-y-1 text-xs">
              <dt className="text-muted-foreground">{t.analysis.binding}</dt>
              <dd className="space-y-0.5">
                {c.boundBy.length
                  ? c.boundBy.map((id) => {
                      const rl = evidence.redLines[id];
                      return (
                        <div key={id} className="border-l-2 border-warning pl-2" title={id}>
                          {rl ? L(rl.text, lang) : id}
                        </div>
                      );
                    })
                  : t.analysis.noBinding}
              </dd>
              {failed.length ? (
                <>
                  <dt className="text-muted-foreground">{t.live.failedProposals}</dt>
                  <dd className="space-y-0.5">
                    {failed.map((p) =>
                      p ? (
                        <div key={p.id}>
                          <span className="font-mono">{p.id}</span> {L(p.title, lang)}
                          {p.rejectionReason ? (
                            <span className="text-muted-foreground">
                              {" "}
                              · {L(p.rejectionReason, lang)}
                            </span>
                          ) : null}
                        </div>
                      ) : null,
                    )}
                  </dd>
                </>
              ) : null}
            </dl>
          </div>
        );
      })}
      <p className="rounded-xl border bg-gray-alpha-50 p-3 text-xs text-muted-foreground">
        {t.analysis.neverForced}
      </p>
    </div>
  );
}

/** Proposal list with cost, acceptance, feasibility and rejection reasons (FR-R3, FR-R4). */
export function ProposalList() {
  const { snap, t, lang } = useRun();
  const list = snap.proposalOrder.map((id) => snap.proposals[id]).filter((p) => !!p);
  const cls: Record<string, string> = {
    accepted: "border-success/30 bg-success/10 text-success",
    rejected: "border-warning/40 bg-warning/10 text-warning",
    withdrawn: "text-muted-foreground",
    open: "",
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr className="border-b">
            <th className="py-2 pr-2 font-normal">{t.analysis.proposal}</th>
            <th className="px-2 font-normal">{t.analysis.status}</th>
            <th className="px-2 text-right font-normal">{t.analysis.cost}</th>
            <th className="px-2 text-right font-normal">{t.analysis.acceptance}</th>
            <th className="px-2 text-right font-normal">{t.analysis.feasibility}</th>
            <th className="px-2 font-normal">
              {t.analysis.supporters} / {t.analysis.conditional} / {t.analysis.opponents}
            </th>
          </tr>
        </thead>
        <tbody>
          {list.map((p) =>
            p ? (
              <tr key={p.id} className="border-b align-top last:border-0">
                <td className="max-w-[340px] py-2 pr-2">
                  <div className="flex items-start gap-2">
                    <Tile id={p.originAgent} />
                    <div>
                      <span className="font-mono text-xs text-muted-foreground">
                        {p.id} · R{p.round}
                      </span>{" "}
                      {L(p.title, lang)}
                      {p.rejectionReason ? (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {L(p.rejectionReason, lang)}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className="px-2 py-2">
                  <Chip className={cls[p.status]}>{t.analysis.pStatus[p.status]}</Chip>
                </td>
                <td className="num px-2 py-2 text-right whitespace-nowrap">
                  {p.cost ? (
                    <>
                      {p.cost.value} {p.cost.unit}
                      <div className="text-[11px] text-muted-foreground">
                        {p.cost.low} {lang === "de" ? "bis" : "to"} {p.cost.high}
                      </div>
                    </>
                  ) : (
                    "·"
                  )}
                </td>
                <td className="num px-2 py-2 text-right">{Math.round(p.acceptance * 100)} %</td>
                <td className="num px-2 py-2 text-right">{Math.round(p.feasibility * 100)} %</td>
                <td className="px-2 py-2">
                  <div className="flex flex-wrap items-center gap-0.5">
                    {p.supporters.map((a) => (
                      <Tile key={a} id={a} />
                    ))}
                    {p.conditional.length ? (
                      <span className="px-1 text-muted-foreground">/</span>
                    ) : null}
                    {p.conditional.map((a) => (
                      <Tile key={a} id={a} className="opacity-70" />
                    ))}
                    {p.opponents.length ? (
                      <span className="px-1 text-muted-foreground">/</span>
                    ) : null}
                    {p.opponents.map((a) => (
                      <Tile key={a} id={a} className="opacity-50 grayscale" />
                    ))}
                  </div>
                </td>
              </tr>
            ) : null,
          )}
        </tbody>
      </table>
    </div>
  );
}
