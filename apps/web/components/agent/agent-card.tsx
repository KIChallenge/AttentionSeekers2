"use client";

import { type CitationRef, type Claim, positionAt } from "@sv/contracts";
import Link from "next/link";
import { Chip, Empty, Meter, Panel, Tile, UttRef } from "@/components/run/bits";
import { agentLook, fmtStance, L } from "@/components/run/helpers";
import { SourceChip } from "@/components/run/provenance";
import { useRun } from "@/components/run/run-context";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { StrategicPanel } from "./strategic-panel";

const pct = (v: number) => ((v + 2) / 4) * 100;

function StanceBar({ start, now, color }: { start: number; now: number; color: string }) {
  const lo = Math.min(0, start);
  const hi = Math.max(0, start);
  return (
    <div className="relative h-2.5 w-full rounded-full bg-gray-alpha-100">
      <span className="absolute inset-y-[-3px] left-1/2 w-px bg-gray-alpha-400" />
      <span
        className="absolute inset-y-0 rounded-full"
        style={{ left: `${pct(lo)}%`, width: `${pct(hi) - pct(lo)}%`, background: color }}
      />
      <span
        className="absolute -top-1 h-[18px] w-[3px] rounded bg-foreground"
        style={{ left: `calc(${pct(now)}% - 1.5px)` }}
        title={fmtStance(now)}
      />
    </div>
  );
}

export function AgentCard({ agentId }: { agentId: string }) {
  const { snap, run, t, lang, runId, evidence } = useRun();
  const cfg = run.agents.find((a) => a.id === agentId);
  if (!cfg) return <Empty>{t.agent.notFound}</Empty>;
  const look = agentLook(run, agentId, lang);
  const topics = run.mandate.topics;
  const myUtts = snap.utteranceOrder
    .map((id) => snap.utterances[id])
    .filter((u) => u && u.speaker === agentId);
  const myClaims = myUtts
    .flatMap((u) => u?.claimIds ?? [])
    .map((id) => snap.claims[id])
    .filter((c): c is Claim => !!c);
  const startCites: CitationRef[] = topics.flatMap(
    (tp) => positionAt(snap, agentId, tp.id, 1)?.citations ?? [],
  );
  const sources = [
    ...new Map(
      [...startCites, ...myClaims.flatMap((c) => c.citations)].map((c) => [c.segmentId, c]),
    ).values(),
  ];
  const changes = topics
    .flatMap((tp) =>
      (snap.positions[agentId]?.[tp.id] ?? []).map((p, i, arr) => ({
        p,
        prev: arr[i - 1],
        topic: tp,
      })),
    )
    .filter((x) => x.prev && x.p.trigger && x.p.stance !== x.prev.stance)
    .sort((a, b) => a.p.round - b.p.round);
  const redLines = cfg.redLineIds.map((id) => ({ id, rl: evidence.redLines[id] }));
  const touched = (id: string) =>
    myUtts.filter((u) => u?.redLinesTouched.includes(id)).map((u) => u?.id ?? "");
  const temperKeys = ["concession", "assertiveness", "coalitionAppetite", "riskTolerance"] as const;
  const opening = myUtts[0];

  return (
    <main className="mx-auto max-w-[1800px] px-6 pt-5 pb-12">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Tile id={agentId} size="lg" />
          <div>
            <h1 className="text-2xl font-semibold">
              {look.name}{" "}
              <span className="text-base font-normal text-muted-foreground">
                · {cfg.institution.unit}
                {lang === "de" ? ` (${cfg.institution.glossEn})` : ` (${cfg.institution.nameDe})`}
              </span>
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t.agent.sub}</p>
          </div>
        </div>
        <nav aria-label={t.agent.switcher} className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-xs text-muted-foreground">{t.agent.switcher}</span>
          {run.agents.map((a) => (
            <Link
              key={a.id}
              href={`/runs/${runId}/agents/${a.id}`}
              aria-current={a.id === agentId ? "page" : undefined}
              className={cn(
                "rounded-control border px-2 py-1 text-xs",
                a.id === agentId
                  ? "border-foreground bg-gray-alpha-100"
                  : "hover:border-foreground/40",
              )}
            >
              {a.code}
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <Panel
            title={t.agent.stanceTitle}
            sub={t.agent.stanceSub}
            aside={<Chip>{t.agent.mode[cfg.mode]}</Chip>}
          >
            <div className="divide-y">
              {topics.map((tp) => {
                const s = positionAt(snap, agentId, tp.id, 1);
                const n = positionAt(snap, agentId, tp.id);
                if (!s || !n) return null;
                return (
                  <div
                    key={tp.id}
                    className="grid grid-cols-[170px_1fr_64px] items-center gap-4 py-2.5"
                  >
                    <div>
                      <div className="text-sm font-medium">{L(tp.label, lang)}</div>
                      <div className="text-xs text-muted-foreground">{L(tp.measure, lang)}</div>
                    </div>
                    <div>
                      <StanceBar start={s.stance} now={n.stance} color={look.color} />
                      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                        <span>−2</span>
                        <span className="num">
                          {t.agent.start} {fmtStance(s.stance)} · {t.agent.current}{" "}
                          {fmtStance(n.stance)}
                        </span>
                        <span>+2</span>
                      </div>
                      {s.citations.length ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {s.citations.map((c) => (
                            <SourceChip key={c.segmentId} cite={c} />
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="num text-right text-xs text-muted-foreground">
                      {t.agent.strength}
                      <div className="text-sm text-foreground">{s.strength.toFixed(2)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          <StrategicPanel agentId={agentId} />

          <Panel title={t.agent.changeLog} sub={t.agent.changeLogSub}>
            {changes.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.agent.noChange}</p>
            ) : (
              <ol className="relative space-y-2.5 border-l pl-4">
                {changes.map(({ p, prev, topic }) => (
                  <li key={`${topic.id}-${p.round}`} className="relative text-sm">
                    <span className="absolute -left-[21.5px] top-1.5 size-2.5 rounded-full border-2 border-background bg-foreground" />
                    <span className="font-mono text-xs text-muted-foreground">R{p.round}</span>{" "}
                    <span className="font-medium">{L(topic.label, lang)}</span>{" "}
                    <span className="num">
                      {fmtStance(prev?.stance ?? 0)} → {fmtStance(p.stance)}
                    </span>
                    {p.trigger ? (
                      <>
                        {" "}
                        · {t.agent.trigger} <UttRef id={p.trigger.utteranceId} />{" "}
                        {snap.utterances[p.trigger.utteranceId] ? (
                          <Tile id={snap.utterances[p.trigger.utteranceId]?.speaker ?? ""} />
                        ) : null}
                        <span className="text-muted-foreground"> {L(p.trigger.note, lang)}</span>
                      </>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel title={t.agent.redLines} sub={t.agent.redLinesSub}>
            <ul className="space-y-2">
              {redLines.map(({ id, rl }) => (
                <li key={id} className="border-l-[3px] border-destructive pl-3">
                  <div className="text-sm">{rl ? L(rl.text, lang) : id}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="font-mono">{id}</span>
                    {rl ? <Chip>{t.agent.tier[rl.tier]}</Chip> : null}
                    {rl?.basis ? <SourceChip cite={rl.basis} compact /> : null}
                    {touched(id).length ? (
                      <span>
                        {t.agent.touchedIn}{" "}
                        {touched(id).map((u) => (
                          <UttRef key={u} id={u} className="mr-1" />
                        ))}
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title={t.agent.arguments}>
            {opening ? (
              <p className="mb-3 text-sm">
                <UttRef id={opening.id} /> {L(opening.text, lang)}
              </p>
            ) : null}
            <ul className="space-y-1.5 text-sm">
              {myClaims.map((c) => (
                <li key={c.id} className="flex flex-wrap items-baseline gap-1">
                  <UttRef id={c.utteranceId} />
                  <span>„{c.atomicText}“</span>
                  <Chip className="text-muted-foreground">{t.claim[c.state]}</Chip>
                </li>
              ))}
            </ul>
            <h3 className="mt-4 mb-1 text-xs text-muted-foreground">
              {t.agent.sources} ({sources.length})
            </h3>
            <div className="space-y-1.5">
              {sources.map((c) => (
                <div key={c.segmentId} className="text-sm">
                  <SourceChip cite={c} />{" "}
                  <span className="text-muted-foreground">
                    {evidence.segments[c.segmentId]?.text ?? ""}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="min-w-0 space-y-4">
          <Panel title={t.agent.playedBy}>
            <dl className="grid grid-cols-[90px_1fr] gap-y-1 text-sm">
              <dt className="text-muted-foreground">{t.live.model}</dt>
              <dd className="font-mono text-xs">{run.modelAssignment[agentId] ?? "-"}</dd>
              <dt className="text-muted-foreground">Mode</dt>
              <dd>{t.agent.mode[cfg.mode]}</dd>
              <dt className="text-muted-foreground">{t.agent.utterances}</dt>
              <dd className="flex flex-wrap gap-1">
                {myUtts.map((u) => (u ? <UttRef key={u.id} id={u.id} /> : null))}
              </dd>
            </dl>
          </Panel>
          <Panel title={t.agent.goals}>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {cfg.goals.map((g) => (
                <li key={g.text}>{L(g, lang)}</li>
              ))}
            </ol>
            <h3 className="mt-3 mb-1.5 text-xs text-muted-foreground">{t.agent.priorities}</h3>
            <ul className="space-y-1.5 text-sm">
              {cfg.priorities.map((p) => (
                <li
                  key={p.label.text}
                  className="grid grid-cols-[110px_1fr_36px] items-center gap-2"
                >
                  <span>{L(p.label, lang)}</span>
                  <Meter value={p.weight} />
                  <span className="num text-right text-xs">{p.weight.toFixed(2)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-2 text-sm">
              {(
                [
                  [t.agent.interests, cfg.interests],
                  [t.agent.restrictions, cfg.restrictions],
                  [t.agent.budget, cfg.budgetConstraints],
                ] as const
              ).map(([label, items]) =>
                items.length ? (
                  <div key={label}>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd>{items.map((x) => L(x, lang)).join("; ")}</dd>
                  </div>
                ) : null,
              )}
            </dl>
          </Panel>
          <Panel title={t.agent.temperament}>
            {!cfg.temperament.inertnessChecked ? (
              <Alert className="mb-3">
                <AlertDescription className="text-xs">{t.agent.inertness}</AlertDescription>
              </Alert>
            ) : null}
            <ul className="space-y-2 text-sm">
              {temperKeys.map((k) => (
                <li key={k} className="grid grid-cols-[130px_1fr_36px] items-center gap-2">
                  <span>{t.agent.temperamentKeys[k]}</span>
                  <Meter
                    value={cfg.temperament[k]}
                    tick={k === "concession" ? cfg.temperament.modelBaselineConcession : null}
                  />
                  <span className="num text-right text-xs">{cfg.temperament[k].toFixed(2)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
      <p className="mt-6 border-t pt-3 text-xs text-muted-foreground">
        CON-1/CON-2 · {t.source.personFiltered} · FR-P4 w = recency weight
      </p>
    </main>
  );
}
