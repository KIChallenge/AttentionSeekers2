import type { Exchange, Run, RunSnapshot, Utterance } from "@sv/contracts";

// Pure layout for the speaker timeline: rows, bars in simulated minutes, exchange bands and
// reply links. Kept free of React so it is testable and shared by every view.

export interface TimelineItem {
  id: string;
  seq: number;
  round: number;
  speaker: string;
  row: number;
  start: number;
  dur: number;
  exchangeId: string | null;
  respondsTo: string | null;
  addressedTo: string[];
  /** Still being spoken (pending skeleton on the live view). */
  pending: boolean;
  /** True when the minutes were derived from seq and word count, not recorded. */
  derived: boolean;
}

export interface TimelineBand {
  exchange: Exchange;
  start: number;
  end: number;
  rows: number[];
  /** Label lane above the rows; overlapping exchanges stack. */
  lane: number;
  open: boolean;
}

export interface TimelineLink {
  from: string;
  to: string;
}

export interface TimelineModel {
  rows: string[];
  items: TimelineItem[];
  byId: Map<string, TimelineItem>;
  bands: TimelineBand[];
  links: TimelineLink[];
  lanes: number;
  /** Full span in simulated minutes. */
  end: number;
  rounds: Array<{ round: number; start: number }>;
}

/** Same rule as the fixture: condensed statements, about 22 words a minute plus one minute. */
export function minutesForText(text: string): number {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return Math.round((1 + words / 22) * 2) / 2;
}

const GAP = 0.5;

/** Moderator first, then the institutions in run order, the expert last. */
export function timelineRows(run: Run | null, utterances: Utterance[]): string[] {
  const agents = run?.agents.map((a) => a.id) ?? [];
  const extra = utterances
    .map((u) => u.speaker)
    .filter((s) => s !== "moderator" && s !== "expert" && !agents.includes(s));
  return ["moderator", ...agents, ...new Set(extra), "expert"];
}

export function buildTimeline(
  snap: Pick<RunSnapshot, "utteranceOrder" | "utterances" | "exchanges" | "pending">,
  run: Run | null,
): TimelineModel {
  const utterances = snap.utteranceOrder
    .map((id) => snap.utterances[id])
    .filter((u): u is Utterance => !!u);
  const rows = timelineRows(run, utterances);
  const rowOf = (speaker: string) => {
    const i = rows.indexOf(speaker);
    return i >= 0 ? i : rows.length - 1;
  };

  const items: TimelineItem[] = [];
  // fallback clock for utterances without recorded timing: seq order, word count
  let cursor = 0;
  for (const u of utterances) {
    const text = u.text.text;
    let start: number;
    let dur: number;
    let derived = false;
    if (u.timing) {
      start = u.timing.startMin;
      dur = u.timing.durationMin;
    } else {
      start = cursor;
      dur = minutesForText(text);
      derived = true;
    }
    cursor = Math.max(cursor, start + dur + GAP);
    items.push({
      id: u.id,
      seq: u.seq,
      round: u.round,
      speaker: u.speaker,
      row: rowOf(u.speaker),
      start,
      dur,
      exchangeId: u.exchangeId ?? null,
      respondsTo: u.respondsTo,
      addressedTo: u.addressedTo ?? [],
      pending: false,
      derived,
    });
  }
  // streaming skeletons: placed after everything known, growing with the text
  for (const p of Object.values(snap.pending)) {
    if (items.some((i) => i.id === p.utteranceId)) continue;
    const dur = Math.max(0.5, minutesForText(p.text));
    items.push({
      id: p.utteranceId,
      seq: Number.MAX_SAFE_INTEGER,
      round: p.round,
      speaker: p.speaker,
      row: rowOf(p.speaker),
      start: cursor,
      dur,
      exchangeId: null,
      respondsTo: p.respondsTo,
      addressedTo: [],
      pending: true,
      derived: true,
    });
    cursor += dur + GAP;
  }

  const byId = new Map(items.map((i) => [i.id, i]));

  const bands: TimelineBand[] = [];
  for (const x of snap.exchanges) {
    const members = x.utteranceIds
      .map((id) => byId.get(id))
      .concat(items.filter((i) => i.exchangeId === x.id))
      .filter((i): i is TimelineItem => !!i);
    const first = members.length ? Math.min(...members.map((m) => m.start)) : undefined;
    const last = members.length ? Math.max(...members.map((m) => m.start + m.dur)) : undefined;
    const start = x.startMin ?? first ?? cursor;
    const end = x.endMin ?? Math.max(last ?? start, start + 0.5);
    const rowSet = new Set<number>(x.participants.map(rowOf));
    for (const m of members) rowSet.add(m.row);
    bands.push({
      exchange: x,
      start,
      end: Math.max(end, start + 0.5),
      rows: [...rowSet].sort((a, b) => a - b),
      lane: 0,
      open: x.outcome === null,
    });
  }
  // greedy lanes so parallel caucuses get their own label row
  const laneEnds: number[] = [];
  for (const b of [...bands].sort((a, z) => a.start - z.start)) {
    let lane = laneEnds.findIndex((e) => e <= b.start + 1e-6);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(b.end);
    } else laneEnds[lane] = b.end;
    b.lane = lane;
  }

  const links: TimelineLink[] = items
    .filter((i) => i.respondsTo && byId.has(i.respondsTo))
    .map((i) => ({ from: i.respondsTo as string, to: i.id }));

  const rounds: TimelineModel["rounds"] = [];
  for (const i of items) {
    const r = rounds.find((x) => x.round === i.round);
    if (!r) rounds.push({ round: i.round, start: i.start });
    else r.start = Math.min(r.start, i.start);
  }

  const end = Math.max(1, ...items.map((i) => i.start + i.dur), ...bands.map((b) => b.end));
  return { rows, items, byId, bands, links, lanes: Math.max(1, laneEnds.length), end, rounds };
}

/** Exchange that contains a time point, preferring the one of the given utterance. */
export function bandFor(model: TimelineModel, itemId: string | null): TimelineBand | null {
  if (!itemId) return null;
  const it = model.byId.get(itemId);
  if (!it) return null;
  return (
    model.bands.find((b) => b.exchange.id === it.exchangeId) ??
    model.bands.find((b) => b.exchange.utteranceIds.includes(it.id)) ??
    null
  );
}

/** Tick step in minutes for a visible span, aiming at roughly 6 to 14 ticks. */
export function tickStep(span: number): number {
  for (const s of [1, 2, 5, 10, 15, 30, 60]) if (span / s <= 14) return s;
  return 120;
}

export function fmtMin(min: number): string {
  const m = Math.max(0, Math.round(min));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

export interface SpeakerFocus {
  id: string;
  speaker: string;
  delegateId: string | null;
  /** Addressees; empty means the whole table. */
  addressedTo: string[];
  exchangeId: string | null;
  pending: boolean;
}

/**
 * Who speaks and to whom for a completed or still streaming utterance. A streaming skeleton has
 * no addressees yet, so the open exchange it belongs to stands in for them.
 */
export function focusOf(
  snap: Pick<RunSnapshot, "utterances" | "pending" | "exchanges">,
  id: string | null,
): SpeakerFocus | null {
  if (!id) return null;
  const u = snap.utterances[id];
  if (u)
    return {
      id,
      speaker: u.speaker,
      delegateId: u.delegateId ?? null,
      addressedTo: (u.addressedTo ?? []).filter((a) => a !== u.speaker),
      exchangeId: u.exchangeId ?? null,
      pending: false,
    };
  const p = snap.pending[id];
  if (!p) return null;
  const x = [...snap.exchanges]
    .reverse()
    .find((e) => e.outcome === null && e.participants.includes(p.speaker));
  return {
    id,
    speaker: p.speaker,
    delegateId: null,
    addressedTo: x && x.kind !== "plenary" ? x.participants.filter((s) => s !== p.speaker) : [],
    exchangeId: x?.id ?? null,
    pending: true,
  };
}

/** Utterance ids of one round grouped by exchange, in order of each group's first utterance. */
export function groupByExchange(
  ids: string[],
  utterances: Record<string, Utterance>,
): Array<{ exchangeId: string | null; ids: string[] }> {
  const groups: Array<{ exchangeId: string | null; ids: string[] }> = [];
  let loose: { exchangeId: null; ids: string[] } | null = null;
  for (const id of ids) {
    const xid = utterances[id]?.exchangeId ?? null;
    if (xid === null) {
      // utterances outside any exchange keep their place in the flow
      if (!loose) {
        loose = { exchangeId: null, ids: [] };
        groups.push(loose);
      }
      loose.ids.push(id);
      continue;
    }
    loose = null;
    const g = groups.find((x) => x.exchangeId === xid);
    if (g) g.ids.push(id);
    else groups.push({ exchangeId: xid, ids: [id] });
  }
  return groups;
}

/** Exchanges that overlap another one in simulated time (parallel caucuses). */
export function parallelExchanges(exchanges: Exchange[]): Set<string> {
  const out = new Set<string>();
  for (const a of exchanges)
    for (const b of exchanges) {
      if (a.id >= b.id || a.startMin === undefined || b.startMin === undefined) continue;
      const aEnd = a.endMin ?? Number.POSITIVE_INFINITY;
      const bEnd = b.endMin ?? Number.POSITIVE_INFINITY;
      if (a.startMin < bEnd && b.startMin < aEnd) {
        out.add(a.id);
        out.add(b.id);
      }
    }
  return out;
}

/** "Bilateral", "Trilateral" (three parties), "Caucus" or "Plenary" key for labels. */
export function exchangeKindKey(x: Exchange): "plenary" | "bilateral" | "trilateral" | "caucus" {
  if (x.kind === "bilateral" && x.participants.length >= 3) return "trilateral";
  return x.kind;
}
