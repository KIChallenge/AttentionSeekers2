"use client";

import { BubbleChatQuestionIcon, RefreshIcon, SentIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { localize } from "@sv/contracts";
import Link from "next/link";
import { type FormEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Chip, Tile } from "@/components/run/bits";
import { agentLook, claimStateClass, fmtStance } from "@/components/run/helpers";
import { useRun } from "@/components/run/run-context";
import { Level } from "@/components/shell/providers";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  type AnswerPart,
  parseAnswer,
  stanceChanges,
  stateKeys,
  suggestedQuestions,
} from "./ask-logic";

interface AskSource {
  handle: string;
  sourceId: string;
  segmentId: string;
  label: string;
  title: string | null;
  text: string;
  recencyWeight: number;
}
interface Turn {
  id: string;
  role: "user" | "assistant";
  /** Answer: the negotiation state it was asked in ("before", "r3", "after"). */
  state?: string;
  /** Question: the states it was asked in (two for a comparison). */
  states?: string[];
  /** Answers of one comparison share a pair id and render side by side. */
  pair?: string;
  content: string;
  sources?: AskSource[];
  /** The model that wrote this answer; the seat's run model is `seatModel`. */
  model?: string;
  seatModel?: string;
  /** Output gate: the answer was cut at the last clean sentence or regenerated. */
  gate?: { cut: boolean; regenerated: boolean; flagged: string[] };
  pending?: boolean;
  failed?: boolean;
}

const storeKey = (runId: string, agentId: string) => `sv-ask:${runId}:${agentId}:v2`;
let seq = 0;
const newId = () => `t${Date.now().toString(36)}${(seq++).toString(36)}`;

function readHistory(key: string): Turn[] {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Turn[]).filter((t) => !t.pending && t.id) : [];
  } catch {
    return [];
  }
}

/** The short history the server gets for one state: only turns asked in that state. */
function historyFor(turns: Turn[], key: string) {
  return turns
    .filter((x) =>
      x.role === "user" ? (x.states ?? ["after"]).includes(key) : (x.state ?? "after") === key,
    )
    .filter((x) => !x.failed && x.content)
    .map(({ role, content }) => ({ role, content }));
}

interface StateInfo {
  key: string;
  stances: Record<string, number>;
}
function writeHistory(key: string, turns: Turn[]) {
  try {
    sessionStorage.setItem(key, JSON.stringify(turns.filter((t) => !t.pending).slice(-20)));
  } catch {
    // private window or storage blocked: history lives in memory only
  }
}

function CiteChip({ src }: { src: AskSource }) {
  const { t } = useRun();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={src.title ?? src.sourceId}
          className="mx-0.5 inline-flex h-[18px] max-w-56 translate-y-[-1px] items-center gap-1 overflow-hidden rounded-[5px] border bg-gray-alpha-50 px-1.5 align-middle font-mono text-[10.5px] whitespace-nowrap text-muted-foreground hover:border-foreground/40 hover:text-foreground"
        >
          <span className="size-1.5 rounded-[2px] bg-gray-alpha-400" />
          <span className="truncate">{src.label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-96 gap-2 rounded-2xl" align="start">
        <div className="font-mono text-[11px] text-muted-foreground">{src.label}</div>
        {src.title ? <div className="text-sm font-medium">{src.title}</div> : null}
        <blockquote className="border-l-2 pl-2 text-sm">„{src.text}“</blockquote>
        <Link
          href={`/archive/sources/${encodeURIComponent(src.sourceId)}`}
          className="self-end text-xs underline decoration-gray-alpha-400 underline-offset-2 hover:decoration-foreground"
        >
          {t.source.openArchive}
        </Link>
      </PopoverContent>
    </Popover>
  );
}

function Answer({ turn }: { turn: Turn }) {
  const { snap, runId, t } = useRun();
  const sources = turn.sources ?? [];
  const byHandle = new Map(sources.map((s) => [s.handle, s]));
  const utts = useMemo(() => new Set(snap.utteranceOrder), [snap.utteranceOrder]);
  const parts: AnswerPart[] = parseAnswer(turn.content, new Set(byHandle.keys()), utts);
  const fromProfile = parts.some((p) => p.kind === "profile");
  let n = 0;
  return (
    <p className="text-sm leading-relaxed">
      {fromProfile ? (
        <Chip className="mb-1.5 flex w-fit text-muted-foreground">{t.ask.profile}</Chip>
      ) : null}
      {parts.map((p) => {
        const key = `${p.kind}-${n++}`;
        if (p.kind === "text") return <span key={key}>{p.text}</span>;
        if (p.kind === "cite") {
          const s = byHandle.get(p.handle);
          return s ? <CiteChip key={key} src={s} /> : null;
        }
        if (p.kind === "utt") {
          const u = snap.utterances[p.id];
          return (
            <Link
              key={key}
              href={`/runs/${runId}/inspect/${p.id}`}
              title={u ? u.text.text.slice(0, 160) : p.id}
              className="mx-0.5 inline-flex h-[18px] translate-y-[-1px] items-center rounded-[5px] border px-1.5 align-middle text-[10.5px] text-muted-foreground hover:border-foreground/40 hover:text-foreground"
            >
              {u ? t.ask.round(u.round) : p.id}
            </Link>
          );
        }
        if (p.kind === "assumption")
          return (
            <Chip key={key} className={cn("mx-0.5 align-middle", claimStateClass.assumption)}>
              {t.ask.assumption}
            </Chip>
          );
        return null;
      })}
      {turn.pending && !turn.content ? (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Spinner className="size-3.5" /> {t.ask.thinking}
        </span>
      ) : null}
      {turn.failed ? <span className="block text-warning">{t.ask.failed}</span> : null}
      {turn.gate && (turn.gate.cut || turn.gate.regenerated) ? (
        <Level min="engineer">
          <span className="mt-1 block font-mono text-[11px] text-muted-foreground">
            {turn.gate.regenerated ? t.ask.regenerated : t.ask.cut}
            {turn.gate.flagged.length ? `: ${turn.gate.flagged.join(", ")}` : ""}
          </span>
        </Level>
      ) : null}
    </p>
  );
}

function Bubble({ turn, color, label }: { turn: Turn; color: string; label: string }) {
  return (
    <div className="min-w-0 border-l-[3px] pl-3" style={{ borderColor: color }}>
      <div className="mb-1 text-[11px] font-medium text-muted-foreground">{label}</div>
      <Answer turn={turn} />
    </div>
  );
}

/** Topic stances at a state, one compact line. */
function StanceLine({ stances }: { stances: Record<string, number> | undefined }) {
  const { run, lang } = useRun();
  const text = run.mandate.topics
    .filter((tp) => stances && tp.id in stances)
    .map((tp) => `${localize(tp.label, lang)} ${fmtStance(stances?.[tp.id] ?? 0)}`)
    .join(" · ");
  return (
    <div className="truncate text-[11px] text-muted-foreground" title={text}>
      {text || "\u00a0"}
    </div>
  );
}

/** Stance change between two states per topic; moved topics stand out. */
function ChangeLine({
  a,
  b,
}: {
  a: Record<string, number> | undefined;
  b: Record<string, number> | undefined;
}) {
  const { run, lang, t } = useRun();
  if (!a || !b) return null;
  const label = new Map(run.mandate.topics.map((tp) => [tp.id, localize(tp.label, lang)]));
  const moved = stanceChanges(
    run.mandate.topics.map((tp) => tp.id),
    a,
    b,
  ).filter((c) => c.changed);
  if (moved.length === 0)
    return <div className="text-[11px] text-muted-foreground">{t.ask.noMove}</div>;
  return (
    <div className="flex flex-wrap gap-1">
      {moved.map((c) => (
        <Chip key={c.topicId} className="border-foreground/30 font-medium text-foreground">
          {label.get(c.topicId)} {c.from === null ? "?" : fmtStance(c.from)} →{" "}
          {c.to === null ? "?" : fmtStance(c.to)}
        </Chip>
      ))}
    </div>
  );
}

function useStateLabel() {
  const { t } = useRun();
  return (key: string) =>
    key === "before"
      ? t.ask.stateBefore
      : key === "after"
        ? t.ask.stateAfter
        : t.ask.round(Number(key.slice(1)));
}

function StateSelect({
  value,
  onChange,
  keys,
  label,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  keys: string[];
  label: string;
  disabled?: boolean;
}) {
  const stateLabel = useStateLabel();
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger size="sm" className="min-w-0" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {keys.map((k) => (
          <SelectItem key={k} value={k}>
            {stateLabel(k)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Chat with one seat of the run about its stance (persona, red lines, positions, evidence). */
export function AskSheet({
  agentId,
  open,
  onOpenChange,
}: {
  agentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { runId, run, snap, evidence, lang, t } = useRun();
  const look = agentLook(run, agentId, lang);
  const key = storeKey(runId, agentId);
  const [turns, setTurns] = useState<Turn[]>([]);
  const turnsRef = useRef<Turn[]>([]);
  const commit = (next: Turn[]) => {
    turnsRef.current = next;
    setTurns(next);
  };
  const [state, setState] = useState("after");
  const [compare, setCompare] = useState<[string, string] | null>(null);
  const [states, setStates] = useState<StateInfo[] | null>(null);
  const stateLabel = useStateLabel();
  const keys = states?.map((s) => s.key) ?? stateKeys(snap.currentRound);
  const stancesOf = (k: string) => states?.find((s) => s.key === k)?.stances;
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement | null>(null);
  const suggestions = useMemo(
    () => suggestedQuestions(snap, agentId, evidence.redLines, lang),
    [snap, agentId, evidence.redLines, lang],
  );

  useEffect(() => {
    if (open) {
      const saved = readHistory(key);
      turnsRef.current = saved;
      setTurns(saved);
    } else abort.current?.abort();
  }, [open, key]);

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    fetch(`/api/runs/${runId}/agents/${agentId}/chat`, { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ states: StateInfo[] }>) : null))
      .then((j) => {
        if (j?.states?.length) setStates(j.states);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [open, runId, agentId]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  });

  const patch = (id: string, p: Partial<Turn>) =>
    commit(turnsRef.current.map((x) => (x.id === id ? { ...x, ...p } : x)));

  async function stream(
    q: string,
    stateKey: string,
    history: Array<{ role: Turn["role"]; content: string }>,
    id: string,
    signal: AbortSignal,
  ) {
    try {
      const res = await fetch(`/api/runs/${runId}/agents/${agentId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, lang, history, state: stateKey }),
        signal,
      });
      if (!res.ok || !res.body) throw new Error(String(res.status));
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let text = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as {
            type: string;
            text?: string;
            model?: string;
            seatModel?: string;
            sources?: AskSource[];
            answeredBy?: string;
            cut?: boolean;
            regenerated?: boolean;
            flagged?: string[];
          };
          if (ev.type === "meta")
            patch(id, { model: ev.model, seatModel: ev.seatModel, sources: ev.sources });
          else if (ev.type === "reset") {
            text = "";
            patch(id, { content: "" });
          } else if (ev.type === "gate")
            patch(id, {
              model: ev.answeredBy,
              gate: {
                cut: Boolean(ev.cut),
                regenerated: Boolean(ev.regenerated),
                flagged: ev.flagged ?? [],
              },
            });
          else if (ev.type === "delta") {
            text += ev.text ?? "";
            patch(id, { content: text });
          } else if (ev.type === "error") patch(id, { failed: true });
        }
      }
      patch(id, { pending: false });
    } catch {
      if (!signal.aborted) patch(id, { pending: false, failed: true });
    }
  }

  /** Asks in the selected state, or in both states of the comparison side by side. */
  async function ask(question: string, pairOverride?: [string, string]) {
    const q = question.trim();
    if (!q || busy) return;
    const asked = pairOverride ?? compare ?? [state];
    const pair = asked.length > 1 ? newId() : undefined;
    const before = turnsRef.current;
    const answers: Turn[] = asked.map((k) => ({
      id: newId(),
      role: "assistant",
      content: "",
      pending: true,
      state: k,
      pair,
    }));
    commit([...before, { id: newId(), role: "user", content: q, states: asked }, ...answers]);
    setDraft("");
    setBusy(true);
    const ctrl = new AbortController();
    abort.current = ctrl;
    await Promise.all(
      answers.map((a) =>
        stream(q, a.state ?? "after", historyFor(before, a.state ?? "after"), a.id, ctrl.signal),
      ),
    );
    setBusy(false);
    writeHistory(
      key,
      turnsRef.current.filter((x) => !x.failed || x.content),
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void ask(draft);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void ask(draft);
    }
  };
  const last = [...turns].reverse().find((x) => x.model);
  const seatModel = last?.seatModel ?? run.modelAssignment[agentId];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className={cn(
          "gap-0 p-0 data-[side=right]:sm:max-w-lg",
          (compare || turns.some((x) => x.pair)) && "data-[side=right]:sm:max-w-3xl",
        )}
      >
        <SheetHeader className="flex-row items-center gap-3 border-b px-5 py-4 pr-14">
          <Tile id={agentId} size="lg" />
          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate">{look.name}</SheetTitle>
            <SheetDescription className="sr-only">{t.ask.actionTitle(look.name)}</SheetDescription>
            <Level min="engineer">
              <div className="truncate font-mono text-[11px] text-muted-foreground">
                {t.ask.seatModel} {seatModel}
                {last?.model ? ` · ${t.ask.answerModel} ${last.model}` : ""}
              </div>
            </Level>
          </div>
          {turns.length ? (
            <Button
              variant="ghost"
              size="icon-sm"
              title={t.ask.reset}
              aria-label={t.ask.reset}
              disabled={busy}
              onClick={() => {
                commit([]);
                writeHistory(key, []);
              }}
            >
              <HugeiconsIcon icon={RefreshIcon} size={16} strokeWidth={1.8} />
            </Button>
          ) : null}
        </SheetHeader>

        <div className="flex flex-col gap-1.5 border-b px-5 py-2.5">
          <div className="flex items-center gap-2">
            {compare ? (
              <>
                <StateSelect
                  value={compare[0]}
                  onChange={(v) => setCompare([v, compare[1]])}
                  keys={keys}
                  label={t.ask.compareFrom}
                  disabled={busy}
                />
                <span className="text-muted-foreground">↔</span>
                <StateSelect
                  value={compare[1]}
                  onChange={(v) => setCompare([compare[0], v])}
                  keys={keys}
                  label={t.ask.compareTo}
                  disabled={busy}
                />
              </>
            ) : (
              <StateSelect
                value={state}
                onChange={setState}
                keys={keys}
                label={t.ask.state}
                disabled={busy}
              />
            )}
            <Button
              variant={compare ? "secondary" : "ghost"}
              size="sm"
              className="ml-auto"
              aria-pressed={Boolean(compare)}
              disabled={busy}
              onClick={() => setCompare(compare ? null : ["before", "after"])}
            >
              {t.ask.compare}
            </Button>
          </div>
          {compare ? (
            <ChangeLine a={stancesOf(compare[0])} b={stancesOf(compare[1])} />
          ) : (
            <StanceLine stances={stancesOf(state)} />
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4" aria-live="polite">
          {turns.length === 0 ? (
            <div className="flex flex-col gap-2">
              {suggestions.map((s) => (
                <Button
                  key={s}
                  variant="outline"
                  className="h-auto justify-start py-2 text-left whitespace-normal"
                  onClick={() => void ask(s)}
                >
                  {s}
                </Button>
              ))}
              <Button
                variant="outline"
                className="h-auto justify-start py-2 text-left whitespace-normal"
                onClick={() => {
                  const pair = compare ?? (["before", "after"] as [string, string]);
                  setCompare(pair);
                  void ask(t.ask.compareQuestion, pair);
                }}
              >
                {t.ask.compareQuestion}
              </Button>
            </div>
          ) : (
            turns.map((turn, i) => {
              if (turn.role === "user")
                return (
                  <div
                    key={turn.id}
                    className="ml-auto w-fit max-w-[85%] rounded-2xl bg-gray-alpha-100 px-3 py-2 text-sm"
                  >
                    {turn.content}
                  </div>
                );
              if (turn.pair && turns[i - 1]?.pair === turn.pair) return null;
              const next = turns[i + 1];
              const mate = turn.pair && next?.pair === turn.pair ? next : null;
              if (!mate)
                return (
                  <Bubble
                    key={turn.id}
                    turn={turn}
                    color={look.color}
                    label={stateLabel(turn.state ?? "after")}
                  />
                );
              return (
                <div key={turn.id} className="flex flex-col gap-2">
                  <ChangeLine
                    a={stancesOf(turn.state ?? "before")}
                    b={stancesOf(mate.state ?? "after")}
                  />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Bubble
                      turn={turn}
                      color={look.color}
                      label={stateLabel(turn.state ?? "before")}
                    />
                    <Bubble
                      turn={mate}
                      color={look.color}
                      label={stateLabel(mate.state ?? "after")}
                    />
                  </div>
                </div>
              );
            })
          )}
          <div ref={end} />
        </div>

        <form onSubmit={submit} className="flex items-end gap-2 border-t p-3">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            placeholder={t.ask.placeholder}
            aria-label={t.ask.placeholder}
            className="max-h-40 min-h-10 py-2"
            rows={1}
          />
          <Button
            type="submit"
            size="icon"
            disabled={busy || !draft.trim()}
            aria-label={t.ask.send}
          >
            {busy ? <Spinner /> : <HugeiconsIcon icon={SentIcon} size={16} strokeWidth={1.8} />}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/** "Fragen" action: a button that opens the ask sheet for one seat. */
export function AskButton({
  agentId,
  iconOnly = false,
  className,
}: {
  agentId: string;
  iconOnly?: boolean;
  className?: string;
}) {
  const { run, lang, t } = useRun();
  const [open, setOpen] = useState(false);
  const name = agentLook(run, agentId, lang).name;
  return (
    <>
      <Button
        variant={iconOnly ? "ghost" : "outline"}
        size={iconOnly ? "icon-xs" : "sm"}
        title={t.ask.actionTitle(name)}
        aria-label={t.ask.actionTitle(name)}
        onClick={() => setOpen(true)}
        className={className}
      >
        <HugeiconsIcon icon={BubbleChatQuestionIcon} size={iconOnly ? 14 : 16} strokeWidth={1.8} />
        {iconOnly ? null : t.ask.action}
      </Button>
      {open ? <AskSheet agentId={agentId} open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}
