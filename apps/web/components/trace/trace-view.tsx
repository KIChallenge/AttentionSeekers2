"use client";

import type { LlmCall, UtteranceTrace } from "@sv/contracts";
import { useEffect, useMemo, useState } from "react";
import { Chip, Empty } from "@/components/run/bits";
import { agentLook } from "@/components/run/helpers";
import { useRun } from "@/components/run/run-context";
import { CallDetail } from "./call-detail";
import { buildTrace, runningTotals, totals } from "./model";
import { traceStrings } from "./strings";
import { SummaryHeader } from "./summary-header";
import { Waterfall } from "./waterfall";

function Select({
  label,
  value,
  onChange,
  options,
  all,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  all: string;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 max-w-[220px] rounded-control border bg-background px-2 text-xs text-foreground"
      >
        <option value="">{all}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Agent trace (engineer view): summary header, filters, waterfall grouped by round,
 * exchange and turn, and a detail panel per model call.
 */
export function TraceView({
  derived,
  focus,
  loadTrace,
}: {
  derived: LlmCall[];
  focus: { utteranceId: string | null; callId: string | null };
  loadTrace: (runId: string, utteranceId: string) => Promise<UtteranceTrace | null>;
}) {
  const { snap, run, lang } = useRun();
  const t = traceStrings[lang];
  const recorded = snap.llmCalls ?? [];
  const isDerived = recorded.length === 0 && derived.length > 0;
  const calls = isDerived ? derived : recorded;

  const [agent, setAgent] = useState("");
  const [model, setModel] = useState("");
  const [status, setStatus] = useState("");
  const initial =
    (focus.callId && calls.find((c) => c.callId === focus.callId)?.callId) ||
    (focus.utteranceId &&
      calls.find((c) => c.parent.kind === "utterance" && c.parent.ref === focus.utteranceId)
        ?.callId) ||
    null;
  const [selected, setSelected] = useState<string | null>(initial);

  useEffect(() => {
    if (!initial) return;
    document.getElementById(`call-${initial}`)?.scrollIntoView({ block: "center" });
  }, [initial]);

  const filtered = useMemo(
    () =>
      calls.filter(
        (c) =>
          (!agent || (c.speaker ?? "moderator") === agent) &&
          (!model || c.model === model) &&
          (!status || c.status === status),
      ),
    [calls, agent, model, status],
  );
  const rounds = useMemo(() => buildTrace(filtered, snap), [filtered, snap]);
  const all = useMemo(() => totals(calls), [calls]);
  const running = useMemo(() => runningTotals(calls), [calls]);
  const sel = selected ? calls.find((c) => c.callId === selected) : undefined;
  const siblings = useMemo(() => {
    if (!sel) return [];
    const key = (c: LlmCall) =>
      `${c.parent.kind === "verification" ? "expert_check" : c.parent.kind}:${c.parent.ref ?? c.callId}`;
    return calls.filter((c) => key(c) === key(sel)).sort((a, b) => a.startedAtMs - b.startedAtMs);
  }, [calls, sel]);

  const speakers = [...new Set(calls.map((c) => c.speaker ?? "moderator"))];
  const models = [...new Set(calls.map((c) => c.model))];
  const statuses = [...new Set(calls.map((c) => c.status))];

  return (
    <main className="mx-auto max-w-[1800px] px-4 pt-5 pb-12 sm:px-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-semibold">
            {t.title}
            <Chip className={isDerived ? "ml-2 border-dashed align-middle" : "ml-2 align-middle"}>
              {isDerived ? t.derived : t.recorded}
            </Chip>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t.sub}</p>
        </div>
      </div>
      {isDerived ? (
        <p className="mb-4 rounded-xl border border-dashed bg-gray-alpha-50 p-3 text-sm text-muted-foreground">
          {t.derivedBanner}
        </p>
      ) : null}
      {calls.length === 0 ? (
        <Empty>{t.detail.empty}</Empty>
      ) : (
        <>
          <SummaryHeader totals={all} lang={lang} t={t} derived={isDerived} />
          <div className="my-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <Select
              label={t.filters.agent}
              value={agent}
              onChange={setAgent}
              all={t.filters.all}
              options={speakers.map((s) => ({ value: s, label: agentLook(run, s, lang).name }))}
            />
            <Select
              label={t.filters.model}
              value={model}
              onChange={setModel}
              all={t.filters.all}
              options={models.map((m) => ({ value: m, label: m }))}
            />
            <Select
              label={t.filters.status}
              value={status}
              onChange={setStatus}
              all={t.filters.all}
              options={statuses.map((s) => ({ value: s, label: t.status[s] }))}
            />
            {agent || model || status ? (
              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                onClick={() => {
                  setAgent("");
                  setModel("");
                  setStatus("");
                }}
              >
                {t.filters.reset}
              </button>
            ) : null}
            <span className="text-xs text-muted-foreground">
              {t.filters.showing(filtered.length, calls.length)}
            </span>
            <span className="ml-auto text-[11px] text-muted-foreground">{t.legend}</span>
          </div>
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
            <Waterfall
              rounds={rounds}
              run={run}
              lang={lang}
              t={t}
              selected={selected}
              onSelect={(c) => setSelected(c.callId)}
              running={running}
            />
            <aside className="lg:sticky lg:top-[104px] lg:max-h-[calc(100vh-120px)] lg:overflow-auto">
              {sel ? (
                <CallDetail
                  call={sel}
                  siblings={siblings}
                  t={t}
                  onClose={() => setSelected(null)}
                  loadTrace={loadTrace}
                />
              ) : (
                <Empty>{t.detail.empty}</Empty>
              )}
            </aside>
          </div>
        </>
      )}
    </main>
  );
}
