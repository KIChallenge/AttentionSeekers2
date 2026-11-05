// Agent trace: turns every structured() call into a RunEvent "llm.call" attributed to the
// record it produced (utterance, assessment, lesson, expert check, ...). The runner wraps
// each model-calling step in tracer.run(parent, fn); llm.ts reports finished calls through
// an async-context sink, so parallel agents and parallel runs never mix.
//
// Utterance ids are assigned only when a turn is committed, after its call has finished.
// Such steps use a Slot: records wait in the slot until slot.resolve(utteranceId).
import {
  estimateCostUsd,
  type LlmCall,
  type LlmCallParentKind,
  type PromptBlock,
  providerOf,
} from "@sv/contracts";
import { type CallRecord, estimateTokens, observeCalls } from "./llm.ts";

export interface CallParent {
  kind: LlmCallParentKind;
  ref: string | null;
  round: number | null;
  /** Seat (agent id) or "moderator" / "expert". */
  speaker: string | null;
}

/** A parent whose ref is known only later (utterance id, exchange id). */
export class Slot {
  readonly parent: CallParent;
  private held: Array<{ rec: CallRecord; fallbackFrom: string | null }> = [];
  private resolved = false;
  private tracer: CallTracer;
  constructor(tracer: CallTracer, parent: Omit<CallParent, "ref">) {
    this.tracer = tracer;
    this.parent = { ...parent, ref: null };
  }
  accept(rec: CallRecord, fallbackFrom: string | null) {
    if (this.resolved) this.tracer.record(this.parent, rec, fallbackFrom);
    else this.held.push({ rec, fallbackFrom });
  }
  resolve(ref: string | null) {
    if (this.resolved) return;
    this.resolved = true;
    this.parent.ref = ref;
    for (const h of this.held) this.tracer.record(this.parent, h.rec, h.fallbackFrom);
    this.held = [];
  }
}

const PREVIEW_IN = 600;
const PREVIEW_OUT = 900;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)} [...]` : s);

/** Kinds whose own record keeps the full prompt (utterance.trace); no preview needed. */
const KEEPS_PROMPT = new Set<LlmCallParentKind>(["utterance"]);

export class CallTracer {
  private n = 0;
  private buffer: LlmCall[] = [];
  private sink: ((call: LlmCall) => void) | null = null;
  private slots = new Set<Slot>();
  private elapsed: () => number;

  /** elapsed(): ms since run start, the same clock as the RunEvent tMs. */
  constructor(elapsed: () => number = () => 0) {
    this.elapsed = elapsed;
  }

  /**
   * Connects the event writer and switches to its clock; calls recorded before (the
   * mandate) are re-based onto that clock (negative startedAtMs) and emitted now.
   */
  attach(sink: (call: LlmCall) => void, elapsed: () => number) {
    const shift = elapsed() - this.elapsed();
    this.elapsed = elapsed;
    this.sink = sink;
    for (const c of this.buffer) sink({ ...c, startedAtMs: c.startedAtMs + shift });
    this.buffer = [];
  }

  slot(parent: Omit<CallParent, "ref">): Slot {
    const s = new Slot(this, parent);
    this.slots.add(s);
    return s;
  }

  /** Runs fn so every model call inside it is attributed to parent. */
  run<T>(
    parent: CallParent | Slot,
    fn: () => Promise<T>,
    fallbackFrom: string | null = null,
  ): Promise<T> {
    return observeCalls((rec) => {
      if (parent instanceof Slot) parent.accept(rec, fallbackFrom);
      else this.record(parent, rec, fallbackFrom);
    }, fn);
  }

  /** Emits slots that never got a ref (failed turns) with ref null. */
  flush() {
    for (const s of this.slots) s.resolve(s.parent.ref);
    this.slots.clear();
  }

  record(parent: CallParent, rec: CallRecord, fallbackFrom: string | null) {
    // Inside the expert step, the second-family call is the verification.
    const kind: LlmCallParentKind =
      parent.kind === "expert_check" && rec.schemaName === "expert_verify"
        ? "verification"
        : parent.kind;
    const now = this.elapsed();
    const ago = Math.round(performance.now() - rec.startedAt);
    const status: LlmCall["status"] =
      rec.status === "failed" ? "failed" : fallbackFrom ? "fallback" : rec.status;
    const speaker = parent.speaker;
    const call: LlmCall = {
      callId: `c${String(++this.n).padStart(4, "0")}`,
      parent: { kind, ref: parent.ref },
      round: parent.round,
      agentId: speaker && /^[a-z]{2,4}$/.test(speaker) ? speaker : null,
      speaker: speaker && /^([a-z]{2,4}|moderator|expert)$/.test(speaker) ? speaker : null,
      provider: providerOf(rec.model),
      model: rec.model,
      startedAtMs: now - ago,
      durationMs: Math.max(0, rec.durationMs),
      tokensIn: rec.tokensIn,
      tokensCached: rec.tokensCached,
      tokensOut: rec.tokensOut,
      tokensReasoning: rec.tokensReasoning,
      costUsd: estimateCostUsd(rec.model, rec),
      attempts: Math.max(1, rec.attempts),
      status,
      fallbackFrom,
      schemaName: rec.schemaName,
      error: rec.error,
      gatewayRequestId: rec.gatewayRequestId,
      origin: "recorded",
      ...(KEEPS_PROMPT.has(kind) ? {} : previews(rec)),
    };
    if (this.sink) this.sink(call);
    else this.buffer.push(call);
  }
}

function previews(rec: CallRecord): Pick<LlmCall, "inputPreview" | "outputPreview"> {
  const inputPreview: PromptBlock[] = rec.messages.map((m, i) => ({
    role: m.role,
    title: m.role === "system" ? "System" : `Nachricht ${i}`,
    tokens: estimateTokens(m.content),
    text: clip(m.content, PREVIEW_IN),
  }));
  const out = rec.output === null ? "" : JSON.stringify(rec.output);
  return { inputPreview, ...(out ? { outputPreview: clip(out, PREVIEW_OUT) } : {}) };
}
