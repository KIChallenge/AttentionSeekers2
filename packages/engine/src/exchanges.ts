// Exchange planning (pure, no model calls): which institutions meet in focused
// bilaterals and caucuses, in which order they speak, who may interject, which delegate
// speaks, and simulated meeting time for the timeline. The runner executes the plans.

export type ExchangeKind = "plenary" | "bilateral" | "caucus";
type Bi = { de: string; en: string };

export interface Conflict {
  topicId: string;
  sides: [string[], string[]];
  /** Red line ids that hold the conflict in place. */
  boundBy: string[];
}

export interface StanceOf {
  stance: number;
  strength: number;
}

export interface TabledInfo {
  proposalId: string;
  topicIds: string[];
  origin: string;
  supporters: string[];
  conditional: string[];
  opponents: string[];
  blockers: string[];
}

export interface ExchangePlan {
  kind: ExchangeKind;
  participants: string[];
  topicId: string | null;
  trigger: Bi;
  /** Speaking order of the planned turns (interjections come on top). */
  turns: string[];
}

export interface PlanInput {
  conflicts: Conflict[];
  stanceOf: (agentId: string, topicId: string) => StanceOf | undefined;
  vetoPlayers: string[];
  /** Core agents always; optional agents only where their interests are touched. */
  eligible: (agentId: string, topicId: string) => boolean;
  redLineOwner: (redLineId: string) => string | undefined;
  labelOf: (topicId: string) => Bi;
  nameOf: (agentId: string) => string;
  tabled?: TabledInfo | null;
  /** Agents in the room. */
  seated: string[];
}

export const BILATERAL_TURNS = 4;
export const TRILATERAL_TURNS = 5;
export const MAX_EXCHANGE_TURNS = 6;

/** Alternating order: nobody speaks twice in a row, everybody speaks at least once. */
export function turnOrder(participants: string[], n: number): string[] {
  if (participants.length === 0) return [];
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(participants[i % participants.length] as string);
  return out;
}

/** Conflicts read off the positions: someone at or above +0.5 and someone at or below -0.5. */
export function conflictsFromStances(
  topicIds: string[],
  agents: string[],
  stanceOf: PlanInput["stanceOf"],
): Conflict[] {
  const out: Conflict[] = [];
  for (const t of topicIds) {
    const pro = agents.filter((a) => (stanceOf(a, t)?.stance ?? 0) >= 0.5);
    const contra = agents.filter((a) => (stanceOf(a, t)?.stance ?? 0) <= -0.5);
    if (pro.length && contra.length) out.push({ topicId: t, sides: [pro, contra], boundBy: [] });
  }
  return out;
}

/** Summary conflicts first, then stance conflicts on topics the summary did not name. */
export function mergeConflicts(primary: Conflict[], secondary: Conflict[]): Conflict[] {
  const seen = new Set(primary.map((c) => c.topicId));
  return [...primary, ...secondary.filter((c) => !seen.has(c.topicId))];
}

function weight(p: PlanInput, a: string, topicId: string): number {
  const st = p.stanceOf(a, topicId);
  const base = st ? Math.abs(st.stance) * (0.5 + st.strength) : 0;
  return base + (p.vetoPlayers.includes(a) ? 1 : 0);
}

function gap(p: PlanInput, c: Conflict): number {
  const avg = (xs: string[]) =>
    xs.length ? xs.reduce((x, a) => x + (p.stanceOf(a, c.topicId)?.stance ?? 0), 0) / xs.length : 0;
  return Math.abs(avg(c.sides[0]) - avg(c.sides[1]));
}

/** Ranks conflicts: red lines binding them, veto players involved, distance between sides. */
export function rankConflicts(p: PlanInput, conflicts: Conflict[]): Conflict[] {
  const score = (c: Conflict) =>
    c.boundBy.length * 2 +
    [...c.sides[0], ...c.sides[1]].filter((a) => p.vetoPlayers.includes(a)).length * 0.75 +
    gap(p, c);
  return [...conflicts].sort((a, b) => score(b) - score(a) || a.topicId.localeCompare(b.topicId));
}

function strongest(p: PlanInput, side: string[], topicId: string, taken: Set<string>) {
  return side
    .filter((a) => p.seated.includes(a) && !taken.has(a) && p.eligible(a, topicId))
    .sort((a, b) => weight(p, b, topicId) - weight(p, a, topicId) || a.localeCompare(b))[0];
}

/**
 * Bilateral or trilateral exchanges from the tabled proposal and the open conflicts.
 * Participants are disjoint across the plans (one table per institution at a time) and
 * each topic gets at most one exchange.
 */
export function selectBilaterals(p: PlanInput, max = 2): ExchangePlan[] {
  const plans: ExchangePlan[] = [];
  const taken = new Set<string>();
  const topics = new Set<string>();
  const t = p.tabled;
  if (t && max > 0 && p.seated.includes(t.origin)) {
    const topicId = t.topicIds[0] ?? null;
    const against = [...t.blockers, ...t.opponents, ...t.conditional].filter(
      (a, i, xs) => xs.indexOf(a) === i && a !== t.origin && p.seated.includes(a),
    );
    const ranked = against.sort(
      (a, b) =>
        Number(t.blockers.includes(b)) - Number(t.blockers.includes(a)) ||
        (topicId ? weight(p, b, topicId) - weight(p, a, topicId) : 0) ||
        a.localeCompare(b),
    );
    const others = ranked.slice(0, 2);
    if (others.length) {
      const participants = [t.origin, ...others];
      for (const a of participants) taken.add(a);
      if (topicId) topics.add(topicId);
      const who = others.map(p.nameOf).join(", ");
      plans.push({
        kind: "bilateral",
        participants,
        topicId,
        trigger: {
          de: `Vorschlag ${t.proposalId} liegt auf dem Tisch; ${who} ${others.length > 1 ? "haben" : "hat"} Einwände oder blockiert.`,
          en: `Proposal ${t.proposalId} is tabled; ${others.join(", ")} object or block.`,
        },
        turns: turnOrder(
          participants,
          participants.length > 2 ? TRILATERAL_TURNS : BILATERAL_TURNS,
        ),
      });
    }
  }
  for (const c of rankConflicts(p, p.conflicts)) {
    if (plans.length >= max) break;
    if (topics.has(c.topicId)) continue;
    const a = strongest(p, c.sides[0], c.topicId, taken);
    const b = a ? strongest(p, c.sides[1], c.topicId, new Set([...taken, a])) : undefined;
    if (!a || !b) continue;
    const participants = [a, b];
    // A red-line holder not yet at the table joins as the third party.
    const holder = c.boundBy
      .map((id) => p.redLineOwner(id))
      .find(
        (x): x is string =>
          Boolean(x) &&
          !participants.includes(x as string) &&
          !taken.has(x as string) &&
          p.seated.includes(x as string) &&
          p.eligible(x as string, c.topicId),
      );
    if (holder) participants.push(holder);
    for (const x of participants) taken.add(x);
    topics.add(c.topicId);
    const label = p.labelOf(c.topicId);
    plans.push({
      kind: "bilateral",
      participants,
      topicId: c.topicId,
      trigger: {
        de: `Offener Konflikt ${label.de}: ${p.nameOf(a)} gegen ${p.nameOf(b)}${holder ? `, rote Linie von ${p.nameOf(holder)} berührt` : ""}.`,
        en: `Open conflict ${label.en}: ${a} versus ${b}${holder ? `, red line of ${holder} at stake` : ""}.`,
      },
      turns: turnOrder(participants, participants.length > 2 ? TRILATERAL_TURNS : BILATERAL_TURNS),
    });
  }
  return plans;
}

/**
 * Caucuses: coalition partners on the same side of the tabled proposal (or of the
 * sharpest conflict) agree a joint line before the plenary. Two opposing caucuses may run
 * at the same time. `affinity` (from the strategic assessments) orders partners.
 */
export function selectCaucuses(
  p: PlanInput,
  affinity: (a: string, b: string) => number = () => 0,
  max = 2,
): ExchangePlan[] {
  const t = p.tabled;
  let sides: Array<{ members: string[]; topicId: string | null; de: string; en: string }> = [];
  if (t) {
    const pro = [t.origin, ...t.supporters.filter((a) => a !== t.origin)];
    const contra = [...new Set([...t.blockers, ...t.opponents])];
    sides = [
      {
        members: pro,
        topicId: t.topicIds[0] ?? null,
        de: `Befürworter von ${t.proposalId} stimmen eine gemeinsame Linie ab.`,
        en: `Supporters of ${t.proposalId} agree a joint line.`,
      },
      {
        members: contra.length >= 2 ? contra : [...contra, ...t.conditional],
        topicId: t.topicIds[0] ?? null,
        de: `Kritiker von ${t.proposalId} stimmen ihre Bedingungen ab.`,
        en: `Critics of ${t.proposalId} align their conditions.`,
      },
    ];
  }
  const top = rankConflicts(p, p.conflicts)[0];
  if (top) {
    const label = p.labelOf(top.topicId);
    sides.push(
      {
        members: top.sides[0],
        topicId: top.topicId,
        de: `Befürworter bei ${label.de} stimmen sich ab.`,
        en: `Supporters on ${label.en} confer.`,
      },
      {
        members: top.sides[1],
        topicId: top.topicId,
        de: `Gegner bei ${label.de} stimmen sich ab.`,
        en: `Opponents on ${label.en} confer.`,
      },
    );
  }
  const plans: ExchangePlan[] = [];
  const taken = new Set<string>();
  for (const side of sides) {
    if (plans.length >= max) break;
    const topicId = side.topicId;
    const pool = side.members.filter(
      (a, i, xs) =>
        xs.indexOf(a) === i &&
        p.seated.includes(a) &&
        !taken.has(a) &&
        (topicId ? p.eligible(a, topicId) : true),
    );
    if (pool.length < 2) continue;
    const lead = [...pool].sort(
      (a, b) => (topicId ? weight(p, b, topicId) - weight(p, a, topicId) : 0) || a.localeCompare(b),
    )[0] as string;
    const partners = pool
      .filter((a) => a !== lead)
      .sort((a, b) => affinity(lead, b) - affinity(lead, a) || a.localeCompare(b))
      .slice(0, 2);
    const members = [lead, ...partners];
    for (const a of members) taken.add(a);
    plans.push({
      kind: "caucus",
      participants: members,
      topicId,
      trigger: { de: side.de, en: side.en },
      turns: turnOrder(members, Math.min(3, members.length)),
    });
  }
  return plans;
}

/**
 * Interjection rule: an institution outside the exchange may speak once, and only when a
 * turn touched one of its red lines. Returns the interjector or null.
 */
export function pickInterjector(opts: {
  touched: string[];
  participants: string[];
  seated: string[];
  redLineOwner: (id: string) => string | undefined;
  alreadyInterjected: boolean;
}): { agentId: string; redLineId: string } | null {
  if (opts.alreadyInterjected) return null;
  for (const id of opts.touched) {
    const owner = opts.redLineOwner(id);
    if (owner && opts.seated.includes(owner) && !opts.participants.includes(owner))
      return { agentId: owner, redLineId: id };
  }
  return null;
}

/** Delegate for a turn: the topic specialist in focused exchanges, the lead otherwise. */
export function pickDelegate(
  delegates: Array<{ id: string; topicKeys: string[] }>,
  topicKey: string | null,
  kind: ExchangeKind,
): string | undefined {
  const lead = delegates[0]?.id;
  if (kind !== "bilateral" || !topicKey) return lead;
  return delegates.find((d) => d.topicKeys.includes(topicKey))?.id ?? lead;
}

/** Optional institutions join an exchange only where a red line or keyword touches it. */
export function touchesInterests(opts: {
  origin: "core" | "optional";
  topicKey: string;
  topicLabel: string;
  redLineTopicKeys: string[];
  keywords: string;
}): boolean {
  if (opts.origin === "core") return true;
  if (opts.redLineTopicKeys.includes(opts.topicKey)) return true;
  const kw = opts.keywords.toLowerCase();
  return opts.topicLabel
    .toLowerCase()
    .split(/[^a-zäöüß]+/)
    .some((w) => w.length >= 5 && kw.includes(w));
}

// ---------- simulated meeting time ----------

export const WORDS_PER_MIN = 130;
export const PAUSE_MIN = 0.1;
export const EXCHANGE_GAP_MIN = 0.5;

const r2 = (v: number) => Math.round(v * 100) / 100;

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Speaking time at about 130 words per minute, never below six seconds. */
export function speakingMinutes(text: string): number {
  return Math.max(0.1, r2(wordCount(text) / WORDS_PER_MIN));
}

/** A meeting clock in minutes from the start of the run. Caucuses run on branches. */
export class MeetingClock {
  now: number;
  constructor(now = 0) {
    this.now = now;
  }

  place(text: string): { startMin: number; durationMin: number } {
    const durationMin = speakingMinutes(text);
    const startMin = r2(this.now);
    this.now = r2(this.now + durationMin + PAUSE_MIN);
    return { startMin, durationMin };
  }

  /** End of the last placed utterance (without the trailing pause). */
  get end(): number {
    return r2(Math.max(0, this.now - PAUSE_MIN));
  }

  gap(min = EXCHANGE_GAP_MIN) {
    this.now = r2(this.now + min);
  }

  branch(): MeetingClock {
    return new MeetingClock(this.now);
  }

  join(branches: MeetingClock[]) {
    this.now = r2(Math.max(this.now, ...branches.map((b) => b.now)));
  }
}

// ---------- ordered commit lanes ----------

/**
 * Exchanges that run in parallel on the wall clock still enter the record one after the
 * other. Each lane buffers its commits until the previous lane has ended.
 */
export class Lane {
  private live = false;
  private ended = false;
  private queue: Array<() => void> = [];
  private resolveDone: () => void = () => {};
  readonly done: Promise<void>;

  constructor(prev: Promise<void>) {
    this.done = new Promise<void>((r) => {
      this.resolveDone = r;
    });
    void prev.then(() => {
      this.live = true;
      const q = this.queue;
      this.queue = [];
      for (const f of q) f();
      if (this.ended) this.resolveDone();
    });
  }

  do(fn: () => void) {
    if (this.live) fn();
    else this.queue.push(fn);
  }

  end() {
    this.ended = true;
    if (this.live) this.resolveDone();
  }
}

export function lanes(n: number, after: Promise<void> = Promise.resolve()): Lane[] {
  const out: Lane[] = [];
  let prev = after;
  for (let i = 0; i < n; i++) {
    const l = new Lane(prev);
    out.push(l);
    prev = l.done;
  }
  return out;
}
