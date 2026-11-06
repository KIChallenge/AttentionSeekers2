"use client";

import type { Lang, Run, RunSnapshot } from "@sv/contracts";
import { type FormEvent, useState } from "react";
import { agentLook } from "@/components/run/helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { fmtMin } from "./model";

// "Debatte fragen": one field in the timeline header. The answer sits on its own line below,
// with a chip per matched moment; the parent highlights the matches on the timeline and jumps
// the transcript to them.

const S = {
  de: {
    label: "Debatte fragen",
    placeholder: "Wann wurde ...?",
    ask: "Fragen",
    reset: "Zurücksetzen",
    failed: "Keine Antwort erhalten.",
    round: "R",
  },
  en: {
    label: "Ask the debate",
    placeholder: "When did ...?",
    ask: "Ask",
    reset: "Reset",
    failed: "No answer received.",
    round: "R",
  },
} as const;

interface Answer {
  answer: string;
  utteranceIds: string[];
  round: number | null;
}

export function AskDebate({
  runId,
  lang,
  run,
  snap,
  onHits,
  onJump,
}: {
  runId: string;
  lang: Lang;
  run: Run | null;
  snap: Pick<RunSnapshot, "utterances">;
  /** Matched utterance ids, or null to clear the highlight. */
  onHits: (ids: string[] | null) => void;
  onJump: (id: string) => void;
}) {
  const s = S[lang];
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Answer | null>(null);
  const [failed, setFailed] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const question = q.trim();
    if (!question || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const r = await fetch(`/api/runs/${encodeURIComponent(runId)}/locate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, lang }),
      });
      if (!r.ok) throw new Error(String(r.status));
      const a = (await r.json()) as Answer;
      setRes(a);
      onHits(a.utteranceIds.length ? a.utteranceIds : null);
      if (a.utteranceIds[0]) onJump(a.utteranceIds[0]);
    } catch {
      setRes(null);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setRes(null);
    setFailed(false);
    setQ("");
    onHits(null);
  };

  return (
    <>
      <form onSubmit={submit} className="flex items-center gap-1.5" aria-label={s.label}>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={s.placeholder}
          aria-label={s.label}
          maxLength={500}
          className="h-7 w-[min(18rem,60vw)] text-xs md:text-xs"
        />
        <Button type="submit" size="xs" variant="outline" disabled={busy || !q.trim()}>
          {busy ? <Spinner className="size-3" /> : null}
          {s.ask}
        </Button>
      </form>
      {res || failed ? (
        <div
          className="flex basis-full flex-wrap items-center gap-1.5 pt-1 text-xs"
          aria-live="polite"
        >
          <p className="min-w-0 basis-full text-sm leading-snug sm:basis-auto sm:flex-1">
            {failed ? s.failed : res?.answer}
          </p>
          {res?.utteranceIds.map((id) => {
            const u = snap.utterances[id];
            if (!u) return null;
            const a = agentLook(run, u.speaker, lang);
            return (
              <button
                key={id}
                type="button"
                onClick={() => onJump(id)}
                title={a.name}
                className="inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] hover:border-foreground/40"
              >
                <span
                  className="inline-grid h-3.5 min-w-5 place-items-center rounded-[4px] px-0.5 text-[8px] font-semibold text-white"
                  style={{ background: a.color }}
                >
                  {a.code}
                </span>
                {s.round}
                {u.round}
                {u.timing ? ` · ${fmtMin(u.timing.startMin)}` : ""}
              </button>
            );
          })}
          <Button type="button" size="xs" variant="ghost" onClick={reset}>
            {s.reset}
          </Button>
        </div>
      ) : null}
    </>
  );
}
