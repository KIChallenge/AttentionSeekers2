"use client";

import { BubbleChatQuestionIcon, RefreshIcon, SentIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { type FormEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Chip, Tile } from "@/components/run/bits";
import { agentLook, claimStateClass } from "@/components/run/helpers";
import { useRun } from "@/components/run/run-context";
import { Level } from "@/components/shell/providers";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { type AnswerPart, parseAnswer, suggestedQuestions } from "./ask-logic";

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
  role: "user" | "assistant";
  content: string;
  sources?: AskSource[];
  model?: string;
  pending?: boolean;
  failed?: boolean;
}

const storeKey = (runId: string, agentId: string) => `sv-ask:${runId}:${agentId}`;

function readHistory(key: string): Turn[] {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Turn[]).filter((t) => !t.pending) : [];
  } catch {
    return [];
  }
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
    </p>
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
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement | null>(null);
  const suggestions = useMemo(
    () => suggestedQuestions(snap, agentId, evidence.redLines, lang),
    [snap, agentId, evidence.redLines, lang],
  );

  useEffect(() => {
    if (open) setTurns(readHistory(key));
    else abort.current?.abort();
  }, [open, key]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  });

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const history = turns.map(({ role, content }) => ({ role, content }));
    let current: Turn[] = [
      ...turns,
      { role: "user", content: q },
      { role: "assistant", content: "", pending: true },
    ];
    const update = (patch: Partial<Turn>) => {
      const last = current.at(-1);
      if (!last) return;
      current = [...current.slice(0, -1), { ...last, ...patch }];
      setTurns(current);
    };
    setTurns(current);
    setDraft("");
    setBusy(true);
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const res = await fetch(`/api/runs/${runId}/agents/${agentId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, lang, history }),
        signal: ctrl.signal,
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
            sources?: AskSource[];
          };
          if (ev.type === "meta") update({ model: ev.model, sources: ev.sources });
          else if (ev.type === "delta") {
            text += ev.text ?? "";
            update({ content: text });
          } else if (ev.type === "error") update({ failed: true });
        }
      }
      update({ pending: false });
    } catch {
      if (!ctrl.signal.aborted) update({ pending: false, failed: true });
    } finally {
      setBusy(false);
      writeHistory(
        key,
        current.filter((x) => !x.failed || x.content),
      );
    }
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
  const model = [...turns].reverse().find((x) => x.model)?.model ?? run.modelAssignment[agentId];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 p-0 data-[side=right]:sm:max-w-lg">
        <SheetHeader className="flex-row items-center gap-3 border-b px-5 py-4 pr-14">
          <Tile id={agentId} size="lg" />
          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate">{look.name}</SheetTitle>
            <SheetDescription className="sr-only">{t.ask.actionTitle(look.name)}</SheetDescription>
            <Level min="engineer">
              <div className="truncate font-mono text-[11px] text-muted-foreground">{model}</div>
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
                setTurns([]);
                writeHistory(key, []);
              }}
            >
              <HugeiconsIcon icon={RefreshIcon} size={16} strokeWidth={1.8} />
            </Button>
          ) : null}
        </SheetHeader>

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
            </div>
          ) : (
            turns.map((turn, i) =>
              turn.role === "user" ? (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: turns are append-only
                  key={i}
                  className="ml-auto w-fit max-w-[85%] rounded-2xl bg-gray-alpha-100 px-3 py-2 text-sm"
                >
                  {turn.content}
                </div>
              ) : (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: turns are append-only
                  key={i}
                  className="border-l-[3px] pl-3"
                  style={{ borderColor: look.color }}
                >
                  <Answer turn={turn} />
                </div>
              ),
            )
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
