"use client";

// Debate quality on the analysis page: the audit report (runs/<runId>.quality.json, scored
// by a judge of the other model family plus deterministic checks) and the gate decisions
// the engine recorded during the run. Flagged utterances link to the inspector.
import type { Lang, QualityAggregate, QualityReport, UtteranceQuality } from "@sv/contracts";
import Link from "next/link";
import { Chip, Panel } from "@/components/run/bits";
import { agentLook, L, withKeys } from "@/components/run/helpers";
import { useRun } from "@/components/run/run-context";

const DIMS = [
  "relevanceMandate",
  "relevanceExchange",
  "responsiveness",
  "grounding",
  "repetition",
  "consistency",
  "register",
  "con",
] as const;

const S = {
  de: {
    title: "Debattenqualität",
    sub: "Jeder Beitrag geprüft von einem Modell der anderen Familie plus deterministischen Prüfungen. 100 = kein Mangel.",
    none: "Für diesen Lauf liegt noch kein Qualitätsbericht vor (pnpm --filter engine quality <runId>).",
    overall: "Gesamt",
    flagged: "markiert",
    byAgent: "Nach Institution",
    byRound: "Nach Runde",
    flaggedList: "Markierte Beiträge",
    gates: "Gate im Lauf",
    gateNone: "Dieser Lauf wurde vor dem Qualitäts-Gate erzeugt.",
    gateLine: (n: number, r: number, f: number) =>
      `${n} Beiträge geprüft, ${r} neu erzeugt, ${f} trotz Mangel übernommen und markiert.`,
    judge: "Prüfer",
    showAll: "alle anzeigen",
    dims: {
      relevanceMandate: "Mandat",
      relevanceExchange: "Thema",
      responsiveness: "Antwort",
      grounding: "Belege",
      repetition: "Wiederh.",
      consistency: "Konsistenz",
      register: "Register",
      con: "Personen",
    },
    kinds: {
      agenda_refused: "Tagesordnung abgelehnt",
      exchange_closed_early: "Gespräch früh geschlossen",
      concrete_demand: "Konkretes verlangt",
    },
  },
  en: {
    title: "Debate quality",
    sub: "Every turn scored by a model of the other family plus deterministic checks. 100 = no problem.",
    none: "No quality report for this run yet (pnpm --filter engine quality <runId>).",
    overall: "Overall",
    flagged: "flagged",
    byAgent: "By institution",
    byRound: "By round",
    flaggedList: "Flagged utterances",
    gates: "Gate during the run",
    gateNone: "This run predates the quality gate.",
    gateLine: (n: number, r: number, f: number) =>
      `${n} turns checked, ${r} regenerated, ${f} kept with a flag.`,
    judge: "Judge",
    showAll: "show all",
    dims: {
      relevanceMandate: "Mandate",
      relevanceExchange: "Topic",
      responsiveness: "Answers",
      grounding: "Grounding",
      repetition: "Repetition",
      consistency: "Consistency",
      register: "Register",
      con: "Persons",
    },
    kinds: {
      agenda_refused: "Agenda item refused",
      exchange_closed_early: "Talk closed early",
      concrete_demand: "Concrete move demanded",
    },
  },
} as const;

const pct = (v: number | null | undefined) =>
  v === null || v === undefined ? "-" : String(Math.round(v * 100));

function tone(v: number | null | undefined): string {
  if (v === null || v === undefined) return "text-muted-foreground";
  if (v >= 0.9) return "";
  if (v >= 0.75) return "text-warning";
  return "text-destructive font-semibold";
}

/** Same rule as the engine report: major issue, a dimension at or below 1/3, or overall < 0.8. */
export function isFlagged(x: UtteranceQuality): boolean {
  return (
    x.flags.some((f) => f.severity === "major") ||
    Object.values(x.scores).some((v) => v !== null && v !== undefined && v <= 0.34) ||
    x.overall < 0.8
  );
}

function ScoreTable({
  rows,
  label,
  lang,
}: {
  rows: Array<{ name: string; a: QualityAggregate }>;
  label: string;
  lang: Lang;
}) {
  const s = S[lang];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-xs">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-1 pr-2 font-normal">{label}</th>
            <th className="px-1 font-normal">{s.overall}</th>
            {DIMS.map((d) => (
              <th key={d} className="px-1 font-normal">
                {s.dims[d]}
              </th>
            ))}
            <th className="px-1 font-normal">{s.flagged}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ name, a }) => (
            <tr key={a.key} className="border-t">
              <td className="py-1 pr-2">{name}</td>
              <td className={`num px-1 ${tone(a.overall)}`}>{pct(a.overall)}</td>
              {DIMS.map((d) => (
                <td key={d} className={`num px-1 ${tone(a.scores[d])}`}>
                  {pct(a.scores[d])}
                </td>
              ))}
              <td className="num px-1">
                {a.flagged}/{a.n}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function QualitySection({ report }: { report: QualityReport | null }) {
  const { run, lang, runId, snap } = useRun();
  const s = S[lang];
  if (!report)
    return (
      <Panel title={s.title}>
        <p className="text-sm text-muted-foreground">{s.none}</p>
      </Panel>
    );
  const flagged = report.utterances
    .filter(isFlagged)
    .sort((a, b) => a.overall - b.overall || a.utteranceId.localeCompare(b.utteranceId));
  const g = report.gates;
  const moderation = snap.moderationGates?.length ? snap.moderationGates : g.moderation;
  return (
    <Panel
      id="quality"
      title={s.title}
      sub={s.sub}
      aside={
        <>
          <Chip>
            {s.overall} {pct(report.overall.overall)}
          </Chip>
          <Chip className="border-warning/40 text-warning">
            {flagged.length}/{report.utterances.length} {s.flagged}
          </Chip>
        </>
      }
    >
      <div className="space-y-4">
        <ScoreTable
          label={s.byAgent}
          lang={lang}
          rows={report.byAgent.map((a) => ({ name: agentLook(run, a.key, lang).name, a }))}
        />
        <ScoreTable
          label={s.byRound}
          lang={lang}
          rows={report.byRound.map((a) => ({ name: a.key, a }))}
        />
        <div>
          <h3 className="mb-1 text-sm font-semibold">{s.gates}</h3>
          {g.turns === 0 && moderation.length === 0 ? (
            <p className="text-xs text-muted-foreground">{s.gateNone}</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {s.gateLine(g.turns, g.regenerated, g.flagged)}
              </p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {withKeys(
                  moderation,
                  (m) => `${m.round}-${m.kind}-${m.exchangeId ?? ""}-${m.utteranceId ?? ""}`,
                ).map(([k, m]) => (
                  <li key={k}>
                    <Chip className="mr-1">R{m.round}</Chip>
                    <span className="font-medium">{s.kinds[m.kind]}</span>
                    {m.utteranceId ? (
                      <Link
                        className="ml-1 font-mono underline"
                        href={`/runs/${runId}/inspect/${m.utteranceId}`}
                      >
                        {m.utteranceId}
                      </Link>
                    ) : m.exchangeId ? (
                      <span className="ml-1 font-mono">{m.exchangeId}</span>
                    ) : null}
                    : {L(m.reason, lang)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <details className="group">
          <summary className="cursor-pointer text-sm font-semibold marker:content-none">
            <span className="mr-1.5 inline-block text-xs text-muted-foreground transition-transform group-open:rotate-90">
              ▸
            </span>
            {s.flaggedList} ({flagged.length})
          </summary>
          <ul className="mt-2 space-y-2 text-xs">
            {flagged.map((u) => (
              <li key={u.utteranceId} className="rounded-lg border p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    className="font-mono underline"
                    href={`/runs/${runId}/inspect/${u.utteranceId}`}
                  >
                    {u.utteranceId}
                  </Link>
                  <span className="font-medium">{agentLook(run, u.speaker, lang).name}</span>
                  <span className="text-muted-foreground">{u.model.split("/").pop()}</span>
                  <span className={`num ${tone(u.overall)}`}>{pct(u.overall)}</span>
                  {u.judgeModel ? (
                    <span className="text-muted-foreground">
                      {s.judge}: {u.judgeModel.split("/").pop()}
                    </span>
                  ) : null}
                </div>
                <ul className="mt-1 list-disc pl-4">
                  {withKeys(u.flags, (f) => `${f.dimension}-${f.source}-${f.reason}`).map(
                    ([k, f]) => (
                      <li key={k}>
                        <span className={f.severity === "major" ? "text-destructive" : ""}>
                          {s.dims[f.dimension]}
                        </span>{" "}
                        <span className="text-muted-foreground">({f.source})</span>: {f.reason}
                      </li>
                    ),
                  )}
                </ul>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </Panel>
  );
}
