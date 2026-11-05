// The negotiation loop. Every step emits RunEvents through RunWriter (NDJSON file,
// database, live listeners). Per-agent calls within a wave run in parallel; a round
// has two waves so the second half of the speaking order can answer the first half.
import path from "node:path";
import {
  type CitationRef,
  type Claim,
  foldRun,
  lessonKey,
  type Mandate,
  type PayoffSign,
  type Position,
  type Proposal,
  type RoomConfig,
  type RoundLesson,
  type Run,
  type RunEvent,
  type RunSnapshot,
  type RunVariant,
  type StrategicAssessment,
  type Utterance,
  type UtteranceTrace,
} from "@sv/contracts";
import { nameOf, runLesson, runStrategy, runTurn, type TurnOut } from "./agent.ts";
import { computeCalculus, outcomeClassOf, type Vote } from "./coalition.ts";
import {
  agentConfigOf,
  allRedLines,
  L,
  profileOf,
  REPO_ROOT,
  redLinesOf,
  VERIFIER_MODEL,
} from "./config.ts";
import { runExpert } from "./expert.ts";
import { forecast } from "./forecast.ts";
import { DEFAULT_BASELINE_EUR_BN, packageFigures, proposalFigures } from "./impact.ts";
import { type CallMeta, usage } from "./llm.ts";
import { summarizeRound } from "./moderator.ts";
import { PHASE_NAMES, phaseFor, shuffle } from "./phases.ts";
import { type Passage, retrieve } from "./retrieval.ts";
import { buildMandate } from "./room.ts";
import type { RunState } from "./state.ts";
import { RunWriter } from "./writer.ts";

export interface RunOptions {
  room: RoomConfig;
  mandate?: Mandate;
  runId?: string;
  isReference?: boolean;
  variant?: RunVariant;
  outDir?: string;
  db?: boolean;
  /** Let the moderator choose the actors (custom questions). */
  selectActors?: boolean;
  onEvent?: (e: RunEvent) => void;
  fork?: {
    baseEvents: RunEvent[];
    fromRound: number;
    edit?: { agentId: string; remove: string[]; add: string[] };
  };
}

export interface RunResult {
  runId: string;
  file: string;
  events: RunEvent[];
  durationMs: number;
  usage: { calls: number; tokensIn: number; tokensOut: number; reasoningTokens: number };
  db: boolean;
}

const MAX_NEW_PROPOSALS_PER_ROUND = 4;
const MAX_OPEN_PROPOSALS = 8;
const SHIFT = 0.25;

const pad = (n: number) => String(n).padStart(2, "0");
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

export function newRunId(prefix = "run"): string {
  const d = new Date();
  const stamp = d.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  return `${prefix}-${stamp}-${Math.random().toString(36).slice(2, 6)}`;
}

function telemetry(meta: CallMeta, seed: number): NonNullable<Utterance["telemetry"]> {
  return {
    model: meta.model,
    latencyMs: meta.latencyMs,
    tokensIn: meta.tokensIn,
    tokensOut: meta.tokensOut,
    costEur: null,
    retries: meta.retries,
    fallbackFrom: null,
    cacheHit: false,
    gatewayRequestId: meta.gatewayRequestId,
    params: { temperature: null, maxOutputTokens: 16000, seed },
    reasoningTokens: meta.reasoningTokens,
  };
}

/** Rebuilds the mutable run state from a folded snapshot (fork from round N). */
function stateFromSnapshot(s: RunState, snap: RunSnapshot) {
  for (const id of snap.utteranceOrder) {
    const u = snap.utterances[id];
    if (u) s.utterances.push(u);
  }
  for (const c of Object.values(snap.claims)) s.claims.set(c.id, c);
  for (const [agentId, byTopic] of Object.entries(snap.positions)) {
    const m = new Map<string, Position>();
    for (const [topicId, list] of Object.entries(byTopic)) {
      const last = list.at(-1);
      if (last) m.set(topicId, { ...last, runId: s.run.id });
    }
    s.positions.set(agentId, m);
  }
  for (const id of snap.proposalOrder) {
    const p = snap.proposals[id];
    if (!p) continue;
    s.proposals.set(id, p);
    const votes = new Map<string, { vote: Vote; reason: string; round: number }>();
    for (const v of p.votes ?? [])
      votes.set(v.agentId, { vote: v.vote, reason: v.reason.text, round: v.round });
    s.votes.set(id, votes);
  }
  for (const l of snap.lessons) {
    const prev = s.lessons.get(l.agentId);
    if (!prev || prev.round <= l.round) s.lessons.set(l.agentId, { ...l, runId: s.run.id });
  }
  for (const [agentId, list] of Object.entries(snap.assessments)) {
    const last = list.at(-1);
    if (last) s.assessments.set(agentId, { ...last, runId: s.run.id });
  }
  s.calculus = snap.calculi.at(-1)
    ? { ...(snap.calculi.at(-1) as NonNullable<RunState["calculus"]>), runId: s.run.id }
    : null;
  s.summaries.push(...snap.summaries);
  s.proposalCounter = snap.proposalOrder.length;
}

export async function runNegotiation(opts: RunOptions): Promise<RunResult> {
  const started = performance.now();
  const usage0 = { ...usage };
  let room = opts.room;
  let mandate = opts.mandate;
  let mandateMeta: CallMeta | null = null;
  if (!mandate) {
    const built = await buildMandate(room, { selectActors: opts.selectActors });
    mandate = built.mandate;
    room = built.room;
    mandateMeta = built.meta;
  }
  const runId = opts.runId ?? newRunId();
  const seated = room.agents.filter((a) => a.enabled);
  const agentIds = seated.map((a) => a.agentId);
  const modelOf = (a: string) => seated.find((x) => x.agentId === a)?.model ?? room.moderatorModel;
  const verifierModel = VERIFIER_MODEL();
  const run: Run = {
    id: runId,
    createdAt: new Date().toISOString(),
    mandate,
    room,
    variant: opts.variant ?? { kind: "baseline" },
    agents: seated.map((a) => agentConfigOf(a.agentId, a.temperament)),
    modelAssignment: {
      moderator: room.moderatorModel,
      expert: room.expertModel,
      ...Object.fromEntries(seated.map((a) => [a.agentId, a.model])),
    },
    status: "running",
    endCondition: null,
    isReference: opts.isReference ?? false,
  };

  const w = new RunWriter(runId, opts.outDir ?? path.join(REPO_ROOT, "runs"), { db: opts.db });
  if (opts.onEvent) w.onEvent(opts.onEvent);
  w.emit({ type: "run.started", run, source: "live" });
  if (mandateMeta)
    console.warn(
      "mandate_built",
      JSON.stringify({ latencyMs: mandateMeta.latencyMs, tokensOut: mandateMeta.tokensOut }),
    );

  const s: RunState = {
    run,
    room,
    mandate,
    agents: run.agents,
    agentIds,
    utterances: [],
    claims: new Map(),
    positions: new Map(),
    proposals: new Map(),
    votes: new Map(),
    lessons: new Map(),
    assessments: new Map(),
    calculus: null,
    summaries: [],
    demands: new Map(),
    passages: new Map(),
    blockedRounds: new Map(),
    proposalCounter: 0,
    uttCounter: 0,
    retrievalEdit: opts.fork?.edit ? { ...opts.fork.edit } : null,
  };

  let startRound = 1;
  if (opts.fork) {
    const cut = opts.fork.baseEvents.findIndex(
      (e) => e.type === "round.started" && e.round >= (opts.fork?.fromRound ?? 1),
    );
    const prefix = opts.fork.baseEvents.slice(1, cut < 0 ? undefined : cut);
    for (const e of prefix) {
      if (e.type === "run.completed" || e.type === "run.error") continue;
      w.copy(retag(e, runId));
    }
    stateFromSnapshot(s, foldRun(w.events));
    startRound = opts.fork.fromRound;
  }

  const roundUtts = (round: number) => s.utterances.filter((u) => u.round === round);
  const nextUttId = (round: number) => `u${round}-${pad(roundUtts(round).length + 1)}`;
  const lastSummaryUtt = () => [...s.utterances].reverse().find((u) => u.kind === "round_summary");

  const pushUtterance = (u: Utterance, claims: Claim[]) => {
    s.utterances.push(u);
    for (const c of claims) s.claims.set(c.id, c);
    w.emit({ type: "utterance.completed", utterance: u, claims });
  };

  const moderatorSays = (
    round: number,
    phase: number,
    kind: Utterance["kind"],
    de: string,
    en: string,
    respondsTo: string | null,
    speaker: "moderator" | "expert" = "moderator",
    model = speaker === "moderator" ? room.moderatorModel : room.expertModel,
    meta: CallMeta | null = null,
  ) => {
    const id = nextUttId(round);
    w.emit({ type: "utterance.started", utteranceId: id, speaker, round, respondsTo, model });
    const u: Utterance = {
      id,
      round,
      seq: s.utterances.length + 1,
      phase,
      speaker,
      kind,
      respondsTo,
      text: L(de, en),
      claimIds: [],
      redLinesTouched: [],
      proposalIds: [],
      model,
      telemetry: meta ? telemetry(meta, room.seed) : null,
      deliberationSummary: null,
      degraded: null,
    };
    pushUtterance(u, []);
    return u;
  };

  let endId: "convergence" | "max_rounds" | "deadlock" | null = null;
  let finalNext = false;
  let stillRounds = 0;
  let lastRound = startRound;

  for (let round = startRound; round <= room.roundLimit; round++) {
    lastRound = round;
    const phase = finalNext ? 5 : phaseFor(round, room.roundLimit);
    const final = phase === 5;
    const order = shuffle(agentIds, room.seed + round * 7919);
    w.emit({ type: "round.started", round, phase, speakingOrder: order });
    const phaseName = PHASE_NAMES[phase - 1];

    // Scheduled events (FR-U10).
    const injected: string[] = [];
    for (const ev of room.scheduledEvents.filter((e) => e.atRound === round)) {
      w.emit({ type: "room.event_injected", round, event: ev });
      injected.push(`${ev.title.text}: ${ev.body.text}`);
      moderatorSays(
        round,
        phase,
        "event_injection",
        `Neue Information (${ev.kind}): ${ev.title.text}. ${ev.body.text}`,
        `New information (${ev.kind}): ${ev.title.translations.en ?? ev.title.text}. ${ev.body.translations.en ?? ev.body.text}`,
        lastSummaryUtt()?.id ?? null,
      );
    }

    // Opening (templated, so the moderator holds no position, FR-M9).
    const names = order.map(nameOf).join(", ");
    const lastSummary = s.summaries.at(-1);
    const tabled = s.calculus?.nextTabled
      ? s.proposals.get(s.calculus.nextTabled.proposalId)
      : undefined;
    const openIds = [...s.proposals.values()].filter((p) => p.status === "open").map((p) => p.id);
    let openDe: string;
    let openEn: string;
    if (round === 1) {
      openDe = `Runde 1, ${phaseName?.de}. Mandat: ${mandate.objective.text.replace(/\.$/, "")}. Regel: ${room.decisionRule}, höchstens ${room.roundLimit} Runden, Budgetdeckel +${room.budgetCeiling.maxIncreasePct} %. Ausgeloste Reihenfolge: ${names}. Bitte legen Sie Ihre Ausgangspositionen mit Belegen dar.`;
      openEn = `Round 1, ${phaseName?.en}. Mandate: ${(mandate.objective.translations.en ?? mandate.objective.text).replace(/\.$/, "")}. Rule: ${room.decisionRule}, at most ${room.roundLimit} rounds, budget ceiling +${room.budgetCeiling.maxIncreasePct} %. Drawn order: ${order.join(", ")}. Please state your starting positions with evidence.`;
    } else if (final) {
      openDe = `Letzte Runde, ${phaseName?.de}. Offene Vorschläge: ${openIds.join(", ") || "keine"}. Bitte geben Sie Ihre endgültige Stimme mit Begründung ab und benennen Sie, was offen bleibt. Reihenfolge: ${names}.`;
      openEn = `Final round, ${phaseName?.en}. Open proposals: ${openIds.join(", ") || "none"}. Please give your final vote with reasons and name what remains open. Order: ${order.join(", ")}.`;
    } else {
      const conflicts =
        lastSummary?.openConflicts.map(
          (c) => s.mandate.topics.find((t) => t.id === c.topicId)?.label.text ?? c.topicId,
        ) ?? [];
      openDe = `Runde ${round}, ${phaseName?.de}. Offene Konflikte: ${[...new Set(conflicts)].join(", ") || "keine benannt"}. ${tabled ? `Auf dem Tisch liegt ${tabled.id} (${tabled.title.text}): ${s.calculus?.nextTabled?.reason.text}` : "Noch kein tragfähiger Vorschlag auf dem Tisch."} Reihenfolge: ${names}.`;
      openEn = `Round ${round}, ${phaseName?.en}. Open conflicts: ${[...new Set(conflicts)].join(", ") || "none named"}. ${tabled ? `Tabled: ${tabled.id} (${tabled.title.translations.en ?? tabled.title.text}): ${s.calculus?.nextTabled?.reason.translations.en ?? ""}` : "No viable proposal tabled yet."} Order: ${order.join(", ")}.`;
    }
    moderatorSays(round, phase, "round_opening", openDe, openEn, lastSummaryUtt()?.id ?? null);

    // Retrieval per agent (FR-P1, FR-H2, FR-P4).
    const evidence = new Map<
      string,
      { passages: Passage[]; trace: UtteranceTrace["retrieval"][number] }
    >();
    await Promise.all(
      agentIds.map(async (a) => {
        const p = profileOf(a);
        const query = [
          p.keywords,
          ...s.mandate.topics.map((t) => `${t.label.text} ${t.measure.text}`),
          tabled?.title.text ?? "",
          ...injected,
        ].join(" ");
        const edit = s.retrievalEdit?.agentId === a ? s.retrievalEdit : null;
        const r = await retrieve({
          query,
          role: agentConfigOf(a).role,
          asOf: room.asOf,
          excludeSegmentIds: edit?.remove,
          includeSegmentIds: edit?.add,
        });
        r.passages.forEach((ps, i) => {
          ps.handle = `E${i + 1}`;
          s.passages.set(ps.segmentId, ps);
        });
        evidence.set(a, { passages: r.passages, trace: r.trace });
      }),
    );

    // Strategic assessments run alongside the first wave (FR-A10).
    const strategies = new Map(
      agentIds.map((a) => [
        a,
        runStrategy(s, a, round, evidence.get(a)?.passages ?? [], modelOf(a)).catch(
          (e: unknown) => e as Error,
        ),
      ]),
    );

    const half = Math.ceil(order.length / 2);
    const waves = [order.slice(0, half), order.slice(half)];
    const expertJobs: Array<Promise<Awaited<ReturnType<typeof runExpert>>>> = [];
    const prevStances = new Map(
      agentIds.map((a) => [
        a,
        new Map([...(s.positions.get(a)?.entries() ?? [])].map(([t, p]) => [t, p.stance])),
      ]),
    );
    let newProposals = 0;
    let maxShift = 0;

    for (const [wi, wave] of waves.entries()) {
      const respondable = s.utterances.map((u) => u.id);
      const jobs = new Map(
        wave.map((a) => [
          a,
          runTurn(
            s,
            {
              round,
              phase,
              agentId: a,
              passages: evidence.get(a)?.passages ?? [],
              respondable,
              injected,
            },
            modelOf(a),
          ).catch((e: unknown) => e as Error),
        ]),
      );
      const waveClaims: Claim[] = [];
      for (const a of wave) {
        const uttId = nextUttId(round);
        const res = await jobs.get(a);
        const ev = evidence.get(a);
        if (!res || res instanceof Error) {
          const reason = res instanceof Error ? res.message.slice(0, 200) : "no result";
          w.emit({
            type: "utterance.started",
            utteranceId: uttId,
            speaker: a,
            round,
            respondsTo: null,
            model: modelOf(a),
          });
          pushUtterance(
            {
              id: uttId,
              round,
              seq: s.utterances.length + 1,
              phase,
              speaker: a,
              kind: final ? "closing" : "position",
              respondsTo: null,
              text: L(
                "(Beitrag ausgefallen: Modellaufruf fehlgeschlagen)",
                "(Turn degraded: model call failed)",
              ),
              claimIds: [],
              redLinesTouched: [],
              proposalIds: [],
              model: modelOf(a),
              telemetry: null,
              deliberationSummary: null,
              degraded: { reason },
            },
            [],
          );
          w.emit({ type: "agent.degraded", agentId: a, utteranceId: uttId, reason });
          continue;
        }
        const { out, meta, blocks } = res;
        const handles = new Map((ev?.passages ?? []).map((p) => [p.handle, p]));
        const cite = (hs: string[]): CitationRef[] =>
          [...new Set(hs)]
            .map((h) => handles.get(h.trim()))
            .filter((p): p is Passage => Boolean(p))
            .map((p) => ({
              sourceId: p.sourceId,
              segmentId: p.segmentId,
              start: null,
              end: null,
              recencyWeight: p.recencyWeight,
            }));
        const known = new Set(s.utterances.map((u) => u.id));
        let respondsTo = out.respondsTo && known.has(out.respondsTo) ? out.respondsTo : null;
        if (!respondsTo && round > 1) {
          // FR-A4: agents after round 1 must reference a prior utterance.
          respondsTo =
            [...s.utterances]
              .reverse()
              .find((u) => u.speaker !== a && u.speaker !== "moderator" && u.speaker !== "expert")
              ?.id ??
            s.utterances.at(-1)?.id ??
            null;
        }
        w.emit({
          type: "utterance.started",
          utteranceId: uttId,
          speaker: a,
          round,
          respondsTo,
          model: meta.model,
        });

        // Claims (FR-T10, FR-P5): assumption iff no citation.
        const claims: Claim[] = out.claims.slice(0, 6).map((c, i) => {
          const citations = cite(c.evidence);
          let start = out.textDe.indexOf(c.quote);
          let len = c.quote.length;
          if (start < 0 || !c.quote) {
            start = 0;
            len = out.textDe.length;
          }
          return {
            id: `c-${round}-${uttId.slice(uttId.indexOf("-") + 1)}-${i + 1}`,
            utteranceId: uttId,
            span: { start, end: start + len },
            atomicText: c.atomic,
            kind: c.kind,
            numeric:
              c.value !== null
                ? { value: c.value, unit: c.unit ?? "", low: null, high: null }
                : null,
            citations,
            state: citations.length ? "unverified" : "assumption",
            verifyingModels: [],
            decompositionModel: meta.model,
            contradiction: null,
          };
        });
        waveClaims.push(...claims);

        // Votes; red lines are never conceded (FR-C3).
        const myRed = new Set(redLinesOf(a).map((r) => r.id));
        const touched = new Set(
          out.redLinesTouched.filter((id) => allRedLines().some((r) => r.id === id)),
        );
        for (const v of out.votes) {
          const p = s.proposals.get(v.proposalId);
          if (p?.status !== "open" || p.originAgent === a) continue;
          let vote: Vote = v.vote;
          let reason = v.reason;
          if (v.crossesOwnRedLine && myRed.size > 0) {
            // A red line is never conceded: unconditional support of a proposal that
            // crosses it becomes conditional (final round: opposition).
            if (vote === "support") {
              vote = final ? "oppose" : "conditional";
              reason = `Rote Linie: ${reason}`;
            }
            for (const id of myRed) touched.add(id);
          }
          const m = s.votes.get(p.id) ?? new Map();
          m.set(a, { vote, reason, round });
          s.votes.set(p.id, m);
        }

        // Proposals (FR-R3) and withdrawals.
        const proposalIds: string[] = [];
        const changed: Proposal[] = [];
        for (const id of out.withdraw) {
          const p = s.proposals.get(id);
          if (p && p.originAgent === a && p.status === "open") {
            const np: Proposal = {
              ...p,
              status: "withdrawn",
              rejectionReason: L(`Von ${nameOf(a)} zurückgezogen`, `Withdrawn by ${a}`),
            };
            s.proposals.set(id, np);
            changed.push(np);
          }
        }
        const openCount = [...s.proposals.values()].filter((p) => p.status === "open").length;
        if (
          out.proposal &&
          phase >= 2 &&
          phase <= 4 &&
          newProposals < MAX_NEW_PROPOSALS_PER_ROUND &&
          openCount < MAX_OPEN_PROPOSALS
        ) {
          newProposals++;
          const o = out.proposal;
          const id = `p-${pad(++s.proposalCounter)}`;
          const alt = o.alternativeTo && s.proposals.has(o.alternativeTo) ? o.alternativeTo : null;
          const lo = Math.min(o.costLow, o.costMioEurPa, o.costHigh);
          const hi = Math.max(o.costLow, o.costMioEurPa, o.costHigh);
          const cap =
            o.capacityEffectPct !== null && o.capacityEffectPct > 0
              ? {
                  value: r2(clamp(o.capacityEffectPct, 0, 60)),
                  low: r2(
                    clamp(
                      Math.min(o.capacityLow ?? o.capacityEffectPct, o.capacityEffectPct),
                      0,
                      60,
                    ),
                  ),
                  high: r2(
                    clamp(
                      Math.max(o.capacityHigh ?? o.capacityEffectPct, o.capacityEffectPct),
                      0,
                      60,
                    ),
                  ),
                  unit: "%",
                }
              : null;
          const np: Proposal = {
            id,
            originAgent: a,
            round,
            topicIds: o.topicIds.filter((t) => s.mandate.topics.some((x) => x.id === t)),
            title: L(o.titleDe, o.titleEn),
            cost: { value: r2(o.costMioEurPa), low: r2(lo), high: r2(hi), unit: "Mio. EUR p.a." },
            acceptance: 1 / agentIds.length,
            feasibility: clamp(o.feasibility, 0, 1),
            supporters: [a],
            opponents: [],
            conditional: [],
            status: "open",
            rejectionReason: null,
            outcomeClass: null,
            alternativeTo: alt,
            capacityEffect: cap,
            measureClass: o.measureClass,
            financing: o.financingDe.trim() ? L(o.financingDe) : undefined,
            components: o.components.length ? o.components.slice(0, 6).map((x) => L(x)) : undefined,
            votes: [
              {
                agentId: a,
                vote: "support",
                reason: L("Eigener Vorschlag", "Own proposal"),
                round,
              },
            ],
          };
          s.proposals.set(id, np);
          s.votes.set(id, new Map([[a, { vote: "support", reason: "Eigener Vorschlag", round }]]));
          proposalIds.push(id);
          changed.push(np);
          if (alt) {
            const old = s.proposals.get(alt);
            if (old && old.originAgent === a && old.status === "open") {
              const wd: Proposal = {
                ...old,
                status: "withdrawn",
                rejectionReason: L(`Ersetzt durch ${id}`, `Replaced by ${id}`),
              };
              s.proposals.set(alt, wd);
              changed.push(wd);
            }
          }
        }

        // Positions with triggers (FR-A5).
        const lesson = s.lessons.get(a);
        const mine = s.positions.get(a) ?? new Map<string, Position>();
        const positions: Position[] = [];
        let shifted = false;
        for (const t of s.mandate.topics) {
          const st = out.stances.find((x) => x.topicId === t.id);
          const prev = mine.get(t.id);
          if (!st && !prev) continue;
          const stance = st ? r2(clamp(st.stance, -2, 2)) : (prev?.stance ?? 0);
          const delta = prev ? Math.abs(stance - prev.stance) : 0;
          if (delta > maxShift) maxShift = delta;
          let trigger: Position["trigger"] = null;
          if (prev && delta >= SHIFT) {
            shifted = true;
            const by =
              st?.changedBecauseOf && known.has(st.changedBecauseOf)
                ? st.changedBecauseOf
                : (respondsTo ?? s.utterances.at(-1)?.id);
            if (by)
              trigger = {
                utteranceId: by,
                note: L(st?.changeNote ?? `Anpassung nach ${by}`),
              };
          }
          const pos: Position = {
            runId,
            agentId: a,
            topicId: t.id,
            round,
            stance,
            strength: st ? r2(clamp(st.strength, 0, 1)) : (prev?.strength ?? 0.5),
            arguments: (st?.arguments ?? []).slice(0, 3).map((x) => L(x)),
            citations: st ? cite(st.evidence) : (prev?.citations ?? []),
            rationale: st
              ? L(st.rationaleDe, st.rationaleEn || undefined)
              : (prev?.rationale ?? L("Unverändert")),
            trigger,
          };
          mine.set(t.id, pos);
          positions.push(pos);
        }
        s.positions.set(a, mine);

        let kind: Utterance["kind"] = out.kind;
        if (final) kind = "closing";
        else if (proposalIds.length) kind = "proposal";
        else if (kind === "proposal") kind = respondsTo ? "rebuttal" : "position";
        else if (kind === "closing") kind = "rebuttal";
        if (shifted && kind !== "proposal" && !final) kind = "position_shift";

        const d = out.deliberation;
        const usedHandles = new Set([
          ...out.claims.flatMap((c) => c.evidence),
          ...out.stances.flatMap((x) => x.evidence),
        ]);
        const utterance: Utterance = {
          id: uttId,
          round,
          seq: s.utterances.length + 1,
          phase,
          speaker: a,
          kind,
          respondsTo,
          text: L(out.textDe, out.textEn),
          claimIds: claims.map((c) => c.id),
          redLinesTouched: [...touched],
          proposalIds,
          model: meta.model,
          telemetry: telemetry(meta, room.seed),
          deliberationSummary: { read: d.read, weighed: d.weighed, wouldMoveIt: d.wouldMoveIt },
          degraded: null,
        };
        pushUtterance(utterance, claims);
        const own = [...s.utterances].reverse().find((u) => u.speaker === a && u.id !== uttId);
        const trace: UtteranceTrace = {
          utteranceId: uttId,
          prompt: blocks,
          retrieval: ev ? [ev.trace] : [],
          deliberation: {
            utteranceId: uttId,
            sourcesRead: (ev?.passages ?? []).map((p) => ({
              ref: {
                sourceId: p.sourceId,
                segmentId: p.segmentId,
                start: null,
                end: null,
                recencyWeight: p.recencyWeight,
              },
              use: usedHandles.has(p.handle) ? ("cited" as const) : ("read_not_cited" as const),
            })),
            priorUtterances: [
              ...(respondsTo ? [{ id: respondsTo, relation: "responds_to" as const }] : []),
              ...(own ? [{ id: own.id, relation: "own" as const }] : []),
              ...s.utterances
                .filter(
                  (u) =>
                    u.round >= round - 1 &&
                    u.id !== respondsTo &&
                    u.id !== own?.id &&
                    u.id !== uttId,
                )
                .slice(-8)
                .map((u) => ({ id: u.id, relation: "context" as const })),
            ],
            lessonsUsed: lesson ? [lessonKey(a, lesson.round)] : [],
            options: d.options.slice(0, 4).map((o, i) => ({
              key: `o${i + 1}`,
              label: L(o.label),
              pros: o.pros.slice(0, 3).map((x) => L(x)),
              cons: o.cons.slice(0, 3).map((x) => L(x)),
              status: o.chosen ? ("chosen" as const) : ("rejected" as const),
              rejectReason: o.chosen ? null : L(o.rejectReason ?? "Nicht gewählt"),
            })),
            decision: L(d.decision),
            wouldChangeMind: d.wouldChangeMind.slice(0, 3).map((x) => L(x)),
            providerTrace: {
              available: false,
              text: null,
              note: `Reasoning-Tokens (${meta.reasoningTokens}) werden über Chat Completions nicht im Klartext geliefert`,
            },
            schemaVersion: 2,
          },
        };
        w.emit({ type: "utterance.trace", trace });
        for (const p of changed) w.emit({ type: "proposal.updated", proposal: p });
        for (const p of positions) w.emit({ type: "position.updated", position: p });
        if (lesson && out.lessonApplied.applied && out.lessonApplied.note.trim()) {
          w.emit({
            type: "lesson.applied",
            application: {
              agentId: a,
              lessonRound: lesson.round,
              utteranceId: uttId,
              note: L(out.lessonApplied.note),
            },
          });
        }
        s.demands.delete(a);
      }

      if (wi === 0) {
        // Emit the assessments once the first wave has spoken.
        for (const a of agentIds) {
          const r = await strategies.get(a);
          if (!r || r instanceof Error) {
            w.emit({
              type: "agent.degraded",
              agentId: a,
              utteranceId: null,
              reason: `strategic assessment failed: ${r instanceof Error ? r.message.slice(0, 160) : "no result"}`,
            });
            continue;
          }
          s.assessments.set(a, r.assessment);
          w.emit({ type: "strategy.assessed", assessment: r.assessment });
        }
      }
      // Experte checks each wave's claims in the background (FR-N1, N2, N7).
      if (waveClaims.length)
        expertJobs.push(runExpert(s, waveClaims, room.expertModel, verifierModel));
    }

    // Proposal tallies, coalition calculus (FR-A11), rejections with reasons (FR-R4).
    const vetoPlayers = agentIds.filter((a) => profileOf(a).vetoStatus === "formal_veto");
    const tally = (p: Proposal): Proposal => {
      const votes = s.votes.get(p.id) ?? new Map();
      const list = (v: Vote) => agentIds.filter((a) => votes.get(a)?.vote === v);
      const supporters = list("support");
      const conditional = list("conditional");
      return {
        ...p,
        supporters,
        conditional,
        opponents: list("oppose"),
        acceptance: r2((supporters.length + 0.5 * conditional.length) / agentIds.length),
        votes: [...votes.entries()].map(([agentId, v]) => ({
          agentId,
          vote: v.vote,
          reason: L(v.reason),
          round: v.round,
        })),
      };
    };
    const payoffsFor = (proposalId: string): Record<string, PayoffSign> => {
      const out: Record<string, PayoffSign> = {};
      for (const a of agentIds) {
        const inc =
          s.assessments.get(a)?.incentives.filter((i) => i.proposalId === proposalId) ?? [];
        if (inc.length === 0) continue;
        const sum = inc.reduce((x, i) => x + i.sign, 0);
        out[a] = sum > 0 ? 1 : sum < 0 ? -1 : 0;
      }
      return out;
    };
    const topicStances: Record<string, Record<string, number>> = {};
    for (const t of s.mandate.topics) {
      topicStances[t.id] = Object.fromEntries(
        agentIds.map((a) => [a, s.positions.get(a)?.get(t.id)?.stance ?? 0]),
      );
    }
    const before = new Map([...s.proposals.entries()].map(([id, p]) => [id, JSON.stringify(p)]));
    for (const p of s.proposals.values()) if (p.status === "open") s.proposals.set(p.id, tally(p));
    const calcInput = () => ({
      runId,
      round,
      agents: agentIds,
      decisionRule: room.decisionRule,
      qualifiedMajority: room.qualifiedMajority,
      vetoPlayers,
      proposals: [...s.proposals.values()]
        .filter((p) => p.status === "open" || p.status === "accepted")
        .map((p) => ({
          proposalId: p.id,
          topicIds: p.topicIds,
          votes: Object.fromEntries(
            [...(s.votes.get(p.id) ?? new Map()).entries()].map(([a, v]) => [a, v.vote]),
          ),
          payoffs: payoffsFor(p.id),
          acceptance: p.acceptance,
          status: p.status,
        })),
      topicStances,
    });
    let calculus = computeCalculus(calcInput());
    const reasonOf = (pid: string, agents: string[]) =>
      agents
        .map(
          (a) =>
            `${nameOf(a)}: ${(s.votes.get(pid)?.get(a)?.reason ?? "keine Begründung").slice(0, 160)}`,
        )
        .join("; ");
    for (const row of calculus.proposals) {
      const p = s.proposals.get(row.proposalId);
      if (p?.status !== "open") continue;
      const blocked = row.blockers.length > 0 && !row.passes;
      const n = blocked ? (s.blockedRounds.get(p.id) ?? 0) + 1 : 0;
      s.blockedRounds.set(p.id, n);
      const oc = outcomeClassOf(row.supporters.length, row.opponents.length, agentIds.length);
      if (final) {
        if (row.passes)
          s.proposals.set(p.id, {
            ...p,
            status: "accepted",
            outcomeClass: oc,
            feasibility: r2(p.feasibility),
          });
        else {
          const who = row.blockers.length
            ? row.blockers
            : row.missingVetoPlayers.length
              ? row.missingVetoPlayers
              : row.opponents;
          s.proposals.set(p.id, {
            ...p,
            status: "rejected",
            outcomeClass: oc,
            rejectionReason: L(
              `Entscheidungsregel nicht erfüllt (${row.supporters.length} von ${agentIds.length}${row.missingVetoPlayers.length ? `, fehlende Vetospieler ${row.missingVetoPlayers.join(", ")}` : ""}). ${reasonOf(p.id, who)}`,
              `Decision rule not met (${row.supporters.length} of ${agentIds.length}${row.missingVetoPlayers.length ? `, missing veto players ${row.missingVetoPlayers.join(", ")}` : ""}).`,
            ),
          });
        }
      } else if (round >= 3 && n >= 2 && calculus.nextTabled?.proposalId !== p.id) {
        s.proposals.set(p.id, {
          ...p,
          status: "rejected",
          outcomeClass: oc,
          rejectionReason: L(
            `Zwei Runden in Folge blockiert durch ${row.blockers.join(", ")}. ${reasonOf(p.id, row.blockers)}`,
            `Blocked two rounds in a row by ${row.blockers.join(", ")}.`,
          ),
        });
      } else {
        const feas = r2(clamp(p.feasibility * (row.containsAllVetoPlayers ? 1 : 0.85), 0, 1));
        s.proposals.set(p.id, { ...p, feasibility: feas });
      }
    }
    if (final) calculus = computeCalculus(calcInput());
    for (const [id, p] of s.proposals) {
      if (before.get(id) !== JSON.stringify(p)) w.emit({ type: "proposal.updated", proposal: p });
    }
    s.calculus = calculus;
    w.emit({ type: "coalition.computed", calculus });

    // Moderator summary and lessons start now and run while the Experte finishes (FR-M6, FR-R8).
    const lessonBase = (a: string): Pick<RoundLesson, "passed" | "failed" | "blockedBy"> => ({
      passed: calculus.proposals.filter((r) => r.passes).map((r) => r.proposalId),
      failed: [...s.proposals.values()]
        .filter(
          (p) =>
            p.status === "rejected" ||
            (p.status === "open" &&
              calculus.proposals.find((r) => r.proposalId === p.id)?.blockers.length),
        )
        .map((p) => p.id),
      blockedBy: calculus.proposals.flatMap((r) =>
        r.blockers.filter((b) => b !== a).map((b) => ({ agentId: b, proposalId: r.proposalId })),
      ),
    });
    const lessonJobs = final
      ? []
      : agentIds.map((a) =>
          runLesson(s, a, round, lessonBase(a), modelOf(a)).catch((e: unknown) => e as Error),
        );
    const summaryJob = summarizeRound(s, round, final, room.moderatorModel);
    // Experte results.
    const expertResults = await Promise.all(expertJobs);
    const notes = expertResults.flatMap((r) => r.notes);
    const updatedClaims = expertResults.flatMap((r) => r.updated);
    for (const c of updatedClaims) {
      s.claims.set(c.id, c);
      w.emit({ type: "claim.updated", claim: c });
    }
    for (const n of notes) {
      w.emit({
        type: "expert.note",
        utteranceIds: n.utteranceIds,
        note: L(n.note, n.noteEn ?? undefined),
        resolution: "unresolved",
      });
    }
    const checked = expertResults.reduce((x, r) => x + r.checked, 0);
    if (checked > 0) {
      const cnt = (st: Claim["state"]) => updatedClaims.filter((c) => c.state === st).length;
      const target =
        notes.at(-1)?.utteranceIds.at(-1) ??
        updatedClaims.find((c) => c.state !== "verified")?.utteranceId ??
        null;
      const metas = expertResults.flatMap((r) => r.metas);
      moderatorSays(
        round,
        phase,
        "contradiction_note",
        `Prüfung Runde ${round}: ${checked} Aussagen geprüft, ${cnt("verified")} bestätigt, ${cnt("unverified")} nicht bestätigt, ${cnt("contradicted")} widersprüchlich, ${cnt("assumption")} als Annahme geführt.${notes.length ? ` Widerspruch: ${notes.map((n) => n.note).join(" | ")}` : ""}`,
        `Check round ${round}: ${checked} claims checked, ${cnt("verified")} verified, ${cnt("unverified")} unverified, ${cnt("contradicted")} contradicted, ${cnt("assumption")} kept as assumptions.`,
        target,
        "expert",
        room.expertModel,
        metas[0]
          ? {
              ...metas[0],
              tokensIn: metas.reduce((x, m) => x + m.tokensIn, 0),
              tokensOut: metas.reduce((x, m) => x + m.tokensOut, 0),
            }
          : null,
      );
    }

    // Justification demands (FR-M4), at most two per round.
    if (!final) {
      const asked = new Set<string>();
      for (const c of [...s.claims.values()].filter(
        (c) => c.state === "assumption" && (c.kind === "numeric" || c.kind === "factual"),
      )) {
        const u = s.utterances.find((x) => x.id === c.utteranceId);
        if (!u || u.round !== round || asked.has(u.speaker) || asked.size >= 2) continue;
        asked.add(u.speaker);
        s.demands.set(u.speaker, { utteranceId: u.id, claim: c.atomicText });
        moderatorSays(
          round,
          phase,
          "justification_demand",
          `Moderation an ${nameOf(u.speaker)}: Die Aussage "${c.atomicText}" ist ohne Beleg und wird als Annahme geführt. Bitte belegen Sie sie in der nächsten Runde oder kennzeichnen Sie sie als Annahme.`,
          `Moderator to ${u.speaker}: the statement "${c.atomicText}" has no source and is recorded as an assumption. Please support it next round or mark it as an assumption.`,
          u.id,
        );
      }
    }

    const { summary, meta: sumMeta } = await summaryJob;
    s.summaries.push(summary);
    moderatorSays(
      round,
      phase,
      "round_summary",
      summary.text.text,
      summary.text.translations.en ?? summary.text.text,
      null,
      "moderator",
      room.moderatorModel,
      sumMeta,
    );
    w.emit({ type: "round.summary", summary });
    const lessons = await Promise.all(lessonJobs);
    for (const [i, l] of lessons.entries()) {
      const a = agentIds[i] as string;
      if (l instanceof Error) {
        w.emit({
          type: "agent.degraded",
          agentId: a,
          utteranceId: null,
          reason: `lesson failed: ${l.message.slice(0, 160)}`,
        });
        continue;
      }
      s.lessons.set(a, l);
      w.emit({ type: "lesson.recorded", lesson: l });
    }

    // End conditions (FR-M8).
    if (final) {
      endId = endId ?? (round >= room.roundLimit ? "max_rounds" : "convergence");
      break;
    }
    // Early end only after the compromise phase has run, so all five phases appear.
    const passing = calculus.proposals.some((r) => r.passes);
    stillRounds = maxShift < SHIFT ? stillRounds + 1 : 0;
    if (phase >= 4 && round < room.roundLimit - 1) {
      if (passing && stillRounds >= 1) {
        endId = "convergence";
        finalNext = true;
      } else if (!passing && stillRounds >= 2) {
        endId = "deadlock";
        finalNext = true;
      }
    }
    void prevStances;
  }

  // Outcome: impact figures (FR-N3, FR-U6) and forecasts (FR-J).
  const accepted = [...s.proposals.values()].filter((p) => p.status === "accepted");
  const measures = accepted.length
    ? accepted
    : [...s.proposals.values()]
        .filter((p) => p.status !== "withdrawn")
        .sort((a, b) => b.acceptance - a.acceptance)
        .slice(0, 1);
  const baseline = room.budgetCeiling.baselineEurBn ?? DEFAULT_BASELINE_EUR_BN;
  const baselineIsAssumption = room.budgetCeiling.baselineEurBn === null;
  const figures = [
    ...measures.flatMap((p) => proposalFigures(p, baseline, baselineIsAssumption)),
    ...packageFigures(measures, baseline, baselineIsAssumption, room.budgetCeiling.maxIncreasePct),
  ];
  w.emit({ type: "impact.computed", figures });
  const fc = await forecast(runId, mandate.question, room.asOf, measures);
  w.emit({
    type: "forecast.computed",
    forecasts: fc.forecasts,
    extractorVersion: fc.extractorVersion,
  });

  const openConflicts = s.summaries.at(-1)?.openConflicts.length ?? 0;
  // The named condition must match the outcome: a deadlock cannot end with an accepted package.
  let id = endId ?? "max_rounds";
  if (id === "deadlock" && accepted.length > 0) id = "max_rounds";
  if (id === "convergence" && accepted.length === 0) id = "deadlock";
  const noteDe =
    id === "max_rounds"
      ? `Rundenlimit ${room.roundLimit} erreicht; ${accepted.length} Vorschläge angenommen, ${openConflicts} Konflikte offen`
      : id === "convergence"
        ? `Konvergenz nach Runde ${lastRound}; ${accepted.length} Vorschläge angenommen, ${openConflicts} Konflikte offen`
        : `Blockade: keine Bewegung und kein tragfähiger Vorschlag; ${openConflicts} Konflikte offen`;
  const noteEn =
    id === "max_rounds"
      ? `Round limit ${room.roundLimit} reached; ${accepted.length} proposals accepted, ${openConflicts} conflicts open`
      : id === "convergence"
        ? `Convergence after round ${lastRound}; ${accepted.length} proposals accepted, ${openConflicts} conflicts open`
        : `Deadlock: no movement and no viable proposal; ${openConflicts} conflicts open`;
  w.emit({ type: "run.completed", endCondition: { id, note: L(noteDe, noteEn) } });
  const { db } = await w.close();
  const u = {
    calls: usage.calls - usage0.calls,
    tokensIn: usage.tokensIn - usage0.tokensIn,
    tokensOut: usage.tokensOut - usage0.tokensOut,
    reasoningTokens: usage.reasoningTokens - usage0.reasoningTokens,
  };
  return {
    runId,
    file: w.file,
    events: w.events,
    durationMs: Math.round(performance.now() - started),
    usage: u,
    db,
  };
}

/** Rewrites runId fields inside copied fork events. */
function retag(e: RunEvent, runId: string): RunEvent {
  const json = JSON.parse(JSON.stringify(e)) as Record<string, unknown>;
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.runId === "string") o.runId = runId;
      for (const x of Object.values(o)) walk(x);
    }
  };
  walk(json);
  return json as unknown as RunEvent;
}

export type { StrategicAssessment, TurnOut };
