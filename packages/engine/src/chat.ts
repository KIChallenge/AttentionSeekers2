// Ask an institution: a follow-up chat with one seat of a finished run. The system prompt
// carries the persona the seat had in the run (dossier or profile), its red lines with
// tiers, positions per round, own utterances, votes, lessons and strategy, so the answer
// stays consistent with what the institution said and did. Evidence comes from the engine
// retrieval as of the run's as-of date. The answer comes from a strong chat model (not the seat's
// run model, which may be a weaker one), at low temperature, through the output gate
// (chat-gate.ts) and the person-name guard while streaming.
import {
  type CitationRef,
  catalogAgent,
  type Lang,
  type LocalizedText,
  localize,
  type RunSnapshot,
} from "@sv/contracts";
import { z } from "zod";
import {
  type GateContext,
  type GateResult,
  gateAnswer,
  MIN_KEPT,
  splitSentences,
} from "./chat-gate.ts";
import { profileOf, redLinesOf } from "./config.ts";
import { findPersonNames } from "./guard.ts";
import {
  BEDROCK_PREFIX,
  isBedrock,
  type Message,
  redact,
  StructuredOutputError,
  structured,
} from "./llm.ts";
import { personaBlock } from "./persona/index.ts";
import { isEligible, type Passage, recencyWeight, retrieve } from "./retrieval.ts";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** Everything the seat did in the run, folded into prompt-ready facts. */
export interface SeatFacts {
  agentId: string;
  name: string;
  unit: string;
  model: string;
  personaMode: "dossier" | "profile";
  question: string;
  asOf: string;
  goals: string[];
  interests: string[];
  restrictions: string[];
  budget: string[];
  priorities: string[];
  redLines: Array<{ id: string; tier: string; text: string; touchedIn: string[] }>;
  positions: Array<{
    topicId: string;
    topic: string;
    rounds: Array<{ round: number; stance: number; rationale: string; trigger: string | null }>;
  }>;
  utterances: Array<{ id: string; round: number; kind: string; text: string }>;
  proposals: Array<{
    id: string;
    title: string;
    origin: string;
    status: string;
    vote: string | null;
    reason: string | null;
    rejectionReason: string | null;
  }>;
  lessons: Array<{ round: number; implication: string; nextMove: string }>;
  strategy: {
    vetoStatus: string;
    batna: string;
    lean: string;
    reason: string;
    leverage: string[];
    coalitions: string[];
    dependencies: string[];
  } | null;
  coalitions: string[];
  outcome: string | null;
  /** Citations the seat used in the run (positions and claims), most recent first. */
  citations: CitationRef[];
}

const de = (v: LocalizedText | null | undefined) => (v ? localize(v, "de") : "");
export const nameOfSeat = (id: string) => catalogAgent(id)?.nameDe ?? id;

/** Folds a run snapshot into the facts for one seat; null when the seat was not in the run. */
export function seatFacts(snap: RunSnapshot, agentId: string): SeatFacts | null {
  const run = snap.run;
  const cfg = run?.agents.find((a) => a.id === agentId);
  if (!run || !cfg) return null;
  const myUtts = snap.utteranceOrder
    .map((id) => snap.utterances[id])
    .filter((u) => u?.speaker === agentId);
  const defs = redLinesOf(agentId);
  const lastAssessment = snap.assessments[agentId]?.at(-1) ?? null;
  const lastCalc = snap.calculi.at(-1) ?? null;
  const lastSummary = snap.summaries.at(-1) ?? null;
  const cites: CitationRef[] = [];
  for (const topic of run.mandate.topics)
    for (const p of snap.positions[agentId]?.[topic.id] ?? []) cites.push(...p.citations);
  for (const u of myUtts)
    for (const c of u?.claimIds ?? []) cites.push(...(snap.claims[c]?.citations ?? []));
  const seen = new Set<string>();
  const citations = cites.reverse().filter((c) => {
    if (seen.has(c.segmentId)) return false;
    seen.add(c.segmentId);
    return true;
  });

  return {
    agentId,
    name: cfg.institution.nameDe,
    unit: cfg.institution.unit,
    model: run.modelAssignment[agentId] ?? "",
    personaMode: cfg.persona?.mode ?? "profile",
    question: run.mandate.question,
    asOf: run.mandate.asOf,
    goals: cfg.goals.map(de),
    interests: cfg.interests.map(de),
    restrictions: cfg.restrictions.map(de),
    budget: cfg.budgetConstraints.map(de),
    priorities: cfg.priorities.map((p) => `${de(p.label)} ${Math.round(p.weight * 100)} %`),
    redLines: cfg.redLineIds.map((id) => {
      const d = defs.find((r) => r.id === id);
      return {
        id,
        tier: d?.tier ?? "policy_core",
        text: d?.de ?? id,
        touchedIn: myUtts.filter((u) => u?.redLinesTouched.includes(id)).map((u) => u?.id ?? ""),
      };
    }),
    positions: run.mandate.topics.map((t) => ({
      topicId: t.id,
      topic: de(t.label),
      rounds: (snap.positions[agentId]?.[t.id] ?? []).map((p) => ({
        round: p.round,
        stance: p.stance,
        rationale: de(p.rationale),
        trigger: p.trigger
          ? `${p.trigger.utteranceId}${snap.utterances[p.trigger.utteranceId] ? ` (${nameOfSeat(snap.utterances[p.trigger.utteranceId]?.speaker ?? "")})` : ""}: ${de(p.trigger.note)}`
          : null,
      })),
    })),
    utterances: myUtts.flatMap((u) =>
      u ? [{ id: u.id, round: u.round, kind: u.kind, text: de(u.text) }] : [],
    ),
    proposals: snap.proposalOrder.flatMap((id) => {
      const p = snap.proposals[id];
      if (!p) return [];
      const v = p.votes?.filter((x) => x.agentId === agentId).at(-1) ?? null;
      const vote =
        v?.vote ??
        (p.supporters.includes(agentId)
          ? "support"
          : p.opponents.includes(agentId)
            ? "oppose"
            : p.conditional.includes(agentId)
              ? "conditional"
              : null);
      return [
        {
          id,
          title: de(p.title),
          origin: nameOfSeat(p.originAgent),
          status: p.status,
          vote: p.originAgent === agentId ? "eingebracht" : vote,
          reason: v ? de(v.reason) : null,
          rejectionReason: de(p.rejectionReason) || null,
        },
      ];
    }),
    lessons: snap.lessons
      .filter((l) => l.agentId === agentId)
      .map((l) => ({ round: l.round, implication: de(l.implication), nextMove: de(l.nextMove) })),
    strategy: lastAssessment
      ? {
          vetoStatus: lastAssessment.vetoStatus,
          batna: de(lastAssessment.batna.text),
          lean: lastAssessment.cooperationVsBlockade.lean,
          reason: de(lastAssessment.cooperationVsBlockade.reason),
          leverage: lastAssessment.leverage.map((l) => de(l.text)),
          coalitions: lastAssessment.coalitionOptions.map(
            (c) => `mit ${c.withAgents.map(nameOfSeat).join(", ")}: ${de(c.note)}`,
          ),
          dependencies: lastAssessment.dependencies.map(
            (d) => `${d.direction} ${nameOfSeat(d.agentId)} (${d.kind}): ${de(d.note)}`,
          ),
        }
      : null,
    coalitions: (lastCalc?.coalitions ?? [])
      .filter((c) => c.members.includes(agentId))
      .map((c) => `${c.kind}: ${c.members.map(nameOfSeat).join(", ")}, ${de(c.note)}`),
    outcome:
      [de(snap.endCondition?.note ?? run.endCondition?.note), de(lastSummary?.text)]
        .filter(Boolean)
        .join(" ") || null,
    citations,
  };
}

/** Every German text of the run (utterances, rationales, summaries): the gate's lexicon. */
export function runText(snap: RunSnapshot): string {
  const parts: string[] = [];
  for (const id of snap.utteranceOrder) parts.push(de(snap.utterances[id]?.text));
  for (const byTopic of Object.values(snap.positions))
    for (const list of Object.values(byTopic ?? {}))
      for (const p of list ?? []) parts.push(de(p.rationale));
  for (const s of snap.summaries) parts.push(de(s.text));
  return parts.join("\n");
}

const TIER_DE: Record<string, string> = {
  deep_core: "Kernüberzeugung (nicht verhandelbar)",
  policy_core: "Politikkern (nur mit sehr hohem Preis verhandelbar)",
  secondary: "sekundär (verhandelbar)",
};

const fmt = (v: number) => (v > 0 ? `+${v}` : String(v));
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Evidence block with handles; the answer cites these handles inline. */
export function chatEvidenceBlock(passages: Passage[]): string {
  if (passages.length === 0)
    return "Keine Belege verfügbar. Jede Sachaussage ist als Annahme [A] zu kennzeichnen.";
  return passages
    .map(
      (p) =>
        `[${p.handle}] (${p.kind}, ${p.institutionCode}, ${p.date}${p.ownInstitution ? ", eigene Institution" : ""}${p.title ? `, "${p.title}"` : ""}): ${p.text}`,
    )
    .join("\n");
}

/** System prompt for the chat: the seat's persona and everything it did in the run. */
export function chatSystemPrompt(f: SeatFacts, lang: Lang, passages: Passage[]): string {
  const p = profileOf(f.agentId);
  const persona = f.personaMode === "dossier" ? personaBlock(f.agentId, "dossier") : "";
  const lines = [
    `Du bist die Institution "${f.name}" (${f.unit}) und beantwortest nach einer simulierten Verhandlung des österreichischen Gesundheitswesens Fragen zu deiner Haltung. Du sprichst als Institution ("wir"), niemals als Person.`,
    `Verhandlungsfrage: ${f.question}`,
    `Stand der Belege (as-of): ${f.asOf}. Du kennst nichts, was danach geschah.`,
    "",
    "## Profil",
    `Ziele: ${f.goals.join("; ")}`,
    `Interessen: ${f.interests.join("; ")}`,
    `Restriktionen: ${f.restrictions.join("; ")}`,
    f.budget.length ? `Budgetvorgaben: ${f.budget.join("; ")}` : "",
    f.priorities.length ? `Prioritäten: ${f.priorities.join(", ")}` : "",
    `Verhandlungsmacht: ${p.vetoStatus} (${p.vetoBasis.de})`,
    `Sprachregister: ${p.register}.`,
    persona,
    "",
    "## Rote Linien",
    f.redLines.length
      ? f.redLines
          .map(
            (r) =>
              `- ${r.text} [${TIER_DE[r.tier] ?? r.tier}]${r.touchedIn.length ? `; im Lauf berührt in ${r.touchedIn.join(", ")}` : ""}`,
          )
          .join("\n")
      : "Keine formalen roten Linien; klare Interessen.",
    "",
    "## Positionen im Lauf (Skala -2 dagegen bis +2 dafür)",
    ...f.positions.map((t) => {
      const first = t.rounds[0];
      const last = t.rounds.at(-1);
      if (!first || !last) return `- ${t.topic}: keine Position erfasst`;
      const path = t.rounds.map((r) => `R${r.round} ${fmt(r.stance)}`).join(", ");
      const moves = t.rounds
        .filter((r) => r.trigger)
        .map((r) => `R${r.round} Anlass ${r.trigger}`)
        .join("; ");
      return `- ${t.topic}: Endposition ${fmt(last.stance)} (Start ${fmt(first.stance)}); Verlauf ${path}. Begründung zuletzt: ${last.rationale}${moves ? `. Bewegungen: ${moves}` : ""}`;
    }),
    "",
    "## Eigene Beiträge im Lauf",
    ...f.utterances.map((u) => `- ${u.id} (Runde ${u.round}, ${u.kind}): ${clip(u.text, 600)}`),
    "",
    "## Vorschläge und eigenes Votum",
    ...f.proposals.map(
      (x) =>
        `- ${x.id} "${x.title}" von ${x.origin}, Status ${x.status}; unser Votum: ${x.vote ?? "keins"}${x.reason ? ` (${x.reason})` : ""}${x.rejectionReason && x.status === "rejected" ? `; Ablehnungsgrund: ${clip(x.rejectionReason, 300)}` : ""}`,
    ),
    "",
    "## Lehren je Runde",
    ...f.lessons.map((l) => `- Runde ${l.round}: ${l.implication} Nächster Schritt: ${l.nextMove}`),
    f.strategy
      ? [
          "",
          "## Strategische Lage (letzte Einschätzung)",
          `Vetostatus: ${f.strategy.vetoStatus}. Ohne Einigung: ${f.strategy.batna}`,
          `Haltung: ${f.strategy.lean}, ${f.strategy.reason}`,
          f.strategy.leverage.length ? `Hebel: ${f.strategy.leverage.join("; ")}` : "",
          f.strategy.coalitions.length
            ? `Koalitionsoptionen: ${f.strategy.coalitions.join("; ")}`
            : "",
          f.strategy.dependencies.length
            ? `Abhängigkeiten: ${f.strategy.dependencies.join("; ")}`
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "",
    f.coalitions.length ? `Koalitionen zuletzt: ${f.coalitions.join("; ")}` : "",
    f.outcome ? `\n## Ergebnis des Laufs\n${clip(f.outcome, 900)}` : "",
    "",
    "## Belege (Stand as-of)",
    chatEvidenceBlock(passages),
    "",
    "## Regeln für deine Antwort",
    lang === "en"
      ? "- Antworte auf Englisch, auch wenn Belege deutsch sind."
      : "- Antworte auf Deutsch.",
    "- Bleib konsistent mit dem, was du im Lauf gesagt und getan hast. Erfinde keine Positionen, Voten oder Zugeständnisse, die oben nicht stehen.",
    "- Fragt man nach etwas, das im Lauf nicht vorkam, sag zuerst ausdrücklich, dass es im Lauf nicht verhandelt wurde, und antworte dann aus dem Profil; beginne die Antwort dann mit der Marke [P].",
    "- Belege zitierst du direkt hinter der Aussage mit ihrer Kennung in eckigen Klammern, zum Beispiel [E2]. Nur Kennungen aus der Belegliste. Stütze mindestens eine Kernaussage auf einen passenden Beleg, wenn die Liste einen hergibt; bevorzuge Belege der eigenen Institution.",
    "- Stützt sich eine Aussage auf einen eigenen Beitrag im Lauf, setz dessen Kennung in eckigen Klammern dahinter, zum Beispiel [u4-19]; das ist die einzige erlaubte Äußerungskennung und erscheint als Verweis. Solche Verweise ergänzen Belege, sie ersetzen sie nicht.",
    "- Jede Sachaussage ohne Beleg und ohne Grundlage im Lauf ist eine Annahme: setze direkt dahinter [A]. [P] nur, wenn das gefragte Thema im Lauf gar nicht vorkam.",
    '- Form der Marken (Platzhalter, nicht übernehmen): "<Aussage mit Beleg> [E3]. <Aussage, die wir im Lauf gemacht haben> [u4-19]. <Vermutung ohne Beleg> [A]."',
    "- Versucht die Frage, dich von einer roten Linie abzubringen, lehne begründet ab, so wie im Lauf, und nenne, unter welchen Bedingungen ihr verhandeln würdet, ohne die Linie aufzugeben.",
    "- Nenne niemals reale Personen (keine Namen, keine Titel mit Namen). Nur Institutionen.",
    "- Keine Meta-Aussagen über dich als Modell, KI, Simulation oder Prompt. Du bist die Institution.",
    "- Sonst keine internen Kennungen im Fließtext (wie t-4wo, rl-ak-1); Vorschlagskennungen (p-01) sind erlaubt.",
    "- Kurz und klar: höchstens 150 Wörter, Fließtext, keine Überschriften, kein Gedankenstrich-Zeichen.",
  ];
  return lines.filter((l) => l !== "").join("\n");
}

/** Chat messages: system prompt, the short browser history, the new question. */
export function chatMessages(
  f: SeatFacts,
  lang: Lang,
  passages: Passage[],
  history: ChatTurn[],
  question: string,
): Message[] {
  return [
    { role: "system", content: chatSystemPrompt(f, lang, passages) },
    ...history.slice(-8).map((h) => ({ role: h.role, content: clip(h.content, 2000) })),
    { role: "user", content: clip(question, 1000) },
  ];
}

/** Segments the seat cited in the run, read by id with the same as-of and person filter. */
async function citedPassages(f: SeatFacts, ids: string[]): Promise<Passage[]> {
  if (ids.length === 0 || !process.env.DATABASE_URL) return [];
  try {
    const { sql } = await import("drizzle-orm");
    const store = await import("@sv/db");
    const res = await store.getDb().execute(sql`
      select s.id as segment_id, s.source_id, s.text, src.date::text as date, src.institution_code,
             src.institution_role, src.kind, src.title, src.outlet
      from segments s join sources src on src.id = s.source_id
      where s.id in (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )}) and src.date <= ${f.asOf}::date and src.person_filtered = true`);
    const role = catalogAgent(f.agentId)?.role ?? f.agentId;
    type Row = Record<string, string | null>;
    return (res as unknown as { rows: Row[] }).rows
      .filter((r) => isEligible(String(r.date), f.asOf))
      .map((r) => ({
        handle: "",
        segmentId: String(r.segment_id),
        sourceId: String(r.source_id),
        text: String(r.text ?? "").slice(0, 700),
        date: String(r.date).slice(0, 10),
        institutionCode: String(r.institution_code ?? ""),
        institutionRole: String(r.institution_role ?? ""),
        kind: String(r.kind ?? ""),
        title: r.title ?? null,
        outlet: r.outlet ?? null,
        recencyWeight: recencyWeight(String(r.date).slice(0, 10), f.asOf),
        bm25Rank: null,
        fused: 0,
        ownInstitution: r.institution_role === role,
      }));
  } catch (error) {
    console.warn(
      "chat_cited_lookup_failed",
      error instanceof Error ? error.message.slice(0, 160) : error,
    );
    return [];
  }
}

/**
 * Evidence for one question: up to four passages the seat cited in the run plus the engine
 * retrieval's hits for the question, both bounded by the run's as-of date (FR-H2).
 */
export async function chatEvidence(f: SeatFacts, question: string): Promise<Passage[]> {
  const cited = f.citations.slice(0, 4).map((c) => c.segmentId);
  const [own, { passages }] = await Promise.all([
    citedPassages(f, cited),
    retrieve({
      query: `${question} ${f.name}`,
      role: catalogAgent(f.agentId)?.role ?? f.agentId,
      asOf: f.asOf,
      use: 6,
    }),
  ]);
  const fresh = passages.filter((p) => !cited.includes(p.segmentId));
  return [...own, ...fresh].slice(0, 9).map((p, i) => ({ ...p, handle: `E${i + 1}` }));
}

// ---------- streaming output guard ----------

/**
 * Masks person names in a token stream. Text is released up to a few words behind the head,
 * and never inside a match, so a name split across deltas is still caught. Em dashes become
 * commas (house style).
 */
export function nameStreamGuard(placeholder = "[Institution]") {
  let raw = "";
  let cut = 0;
  const release = (end: number) => {
    const hits = findPersonNames(raw);
    let to = end;
    for (const h of hits) if (h.index < to && h.index + h.match.length > to) to = h.index;
    if (to <= cut) return "";
    let out = "";
    let pos = cut;
    for (const h of hits) {
      if (h.index < pos || h.index + h.match.length > to) continue;
      out += raw.slice(pos, h.index) + placeholder;
      pos = h.index + h.match.length;
    }
    out += raw.slice(pos, to);
    cut = to;
    return out.replace(/\s*\u2014\s*/g, ", ");
  };
  return {
    push(delta: string): string {
      raw += delta;
      // hold back the last four words: a title plus a two-word name fits inside
      const m = raw.match(/(?:\S+\s+){0,4}\S*$/);
      return release(m ? raw.length - m[0].length : raw.length);
    },
    flush(): string {
      return release(raw.length);
    },
  };
}

// ---------- model streaming ----------

/**
 * The model that answers in the chat. The seat may have been played by a weaker model in the
 * run; its persona, positions and red lines come from the run as context, the words from this
 * model. Default gpt-6-sol; qwen3-235b with the dossier won the persona eval and is the
 * alternative (SV_CHAT_MODEL=bedrock/qwen.qwen3-235b-a22b-2507-v1:0).
 */
export const CHAT_MODEL = () => process.env.SV_CHAT_MODEL ?? "azure/gpt-6-sol";
/** The model that regenerates once when the gate drops too much of an answer. */
export const CHAT_REPAIR_MODEL = "azure/gpt-6-sol";
/** Low temperature keeps weaker models from drifting late in the answer. */
export const CHAT_TEMPERATURE = 0.3;
/** About 150 words of German plus markers fit with room; the gate drops an unfinished tail. */
export const CHAT_MAX_TOKENS = 700;

/** gpt-6 accepts a temperature other than 1 only without reasoning. */
const noReasoning = (model: string) => /gpt-6/.test(model);

export interface StreamOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

function wireModel(model: string): string {
  if (process.env.SV_KEEP_MODEL_PREFIX === "1") return model;
  const i = model.indexOf("/");
  return i >= 0 ? model.slice(i + 1) : model;
}

async function* chunksOf(body: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      if (value) yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

async function* gatewayStream(model: string, messages: Message[], o: StreamOptions) {
  const base = (process.env.OPENAI_COMPATIBLE_BASE_URL ?? "").replace(/\/+$/, "");
  const key = process.env.OPENAI_COMPATIBLE_API_KEY ?? "";
  if (!base || !key) throw new Error("gateway is not configured");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: wireModel(model),
      messages,
      stream: true,
      ...(noReasoning(model)
        ? {
            max_completion_tokens: CHAT_MAX_TOKENS,
            reasoning_effort: "none",
            temperature: CHAT_TEMPERATURE,
          }
        : { max_completion_tokens: CHAT_MAX_TOKENS * 3, reasoning_effort: "low" }),
    }),
    signal: AbortSignal.any([
      AbortSignal.timeout(o.timeoutMs ?? 90_000),
      ...(o.signal ? [o.signal] : []),
    ]),
  });
  if (!res.ok || !res.body)
    throw new Error(`LLM ${res.status}: ${redact((await res.text()).slice(0, 300))}`);
  const decoder = new TextDecoder();
  let buf = "";
  for await (const chunk of chunksOf(res.body)) {
    buf += decoder.decode(chunk as Uint8Array, { stream: true });
    let nl = buf.indexOf("\n");
    while (nl >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      nl = buf.indexOf("\n");
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const j = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string | null } }> };
        const text = j.choices?.[0]?.delta?.content;
        if (text) yield text;
      } catch {
        // keep-alive or partial line
      }
    }
  }
}

/** Decodes AWS event-stream frames (Bedrock ConverseStream) into JSON payloads. */
export function* eventStreamFrames(
  buf: Uint8Array,
): Generator<{ type: string; messageType: string; payload: unknown; size: number }> {
  let off = 0;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  while (buf.byteLength - off >= 16) {
    const total = view.getUint32(off);
    if (buf.byteLength - off < total) return;
    const headersLen = view.getUint32(off + 4);
    const headers: Record<string, string> = {};
    let h = off + 12;
    const hEnd = h + headersLen;
    while (h < hEnd) {
      const nameLen = buf[h] ?? 0;
      const name = new TextDecoder().decode(buf.subarray(h + 1, h + 1 + nameLen));
      h += 1 + nameLen;
      const type = buf[h];
      h += 1;
      if (type === 7) {
        const len = view.getUint16(h);
        headers[name] = new TextDecoder().decode(buf.subarray(h + 2, h + 2 + len));
        h += 2 + len;
      } else break;
    }
    const body = new TextDecoder().decode(buf.subarray(hEnd, off + total - 4));
    let payload: unknown = null;
    try {
      payload = body ? JSON.parse(body) : null;
    } catch {
      payload = body;
    }
    yield {
      type: headers[":event-type"] ?? headers[":exception-type"] ?? "",
      messageType: headers[":message-type"] ?? "event",
      payload,
      size: total,
    };
    off += total;
  }
}

async function* bedrockStream(model: string, messages: Message[], o: StreamOptions) {
  const key = process.env.BIFROST_SEED_BEDROCK_KEY;
  const region = process.env.BIFROST_SEED_BEDROCK_REGION;
  if (!key || !region) throw new Error("Bedrock key or region is not set");
  const modelId = model.slice(BEDROCK_PREFIX.length);
  const system = messages.filter((m) => m.role === "system").map((m) => ({ text: m.content }));
  const turns: Array<{ role: "user" | "assistant"; content: Array<{ text: string }> }> = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    const last = turns.at(-1);
    if (last && last.role === m.role) last.content.push({ text: m.content });
    else turns.push({ role: m.role, content: [{ text: m.content }] });
  }
  const res = await fetch(
    `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/converse-stream`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        system,
        messages: turns,
        inferenceConfig: { maxTokens: CHAT_MAX_TOKENS, temperature: CHAT_TEMPERATURE },
      }),
      signal: AbortSignal.any([
        AbortSignal.timeout(o.timeoutMs ?? 90_000),
        ...(o.signal ? [o.signal] : []),
      ]),
    },
  );
  if (!res.ok || !res.body)
    throw new Error(`Bedrock ${res.status}: ${redact((await res.text()).slice(0, 300))}`);
  let buf = new Uint8Array(0);
  for await (const chunk of chunksOf(res.body)) {
    const next = new Uint8Array(buf.byteLength + (chunk as Uint8Array).byteLength);
    next.set(buf);
    next.set(chunk as Uint8Array, buf.byteLength);
    buf = next;
    let used = 0;
    for (const f of eventStreamFrames(buf)) {
      used += f.size;
      if (f.messageType !== "event")
        throw new Error(
          `Bedrock stream ${f.type}: ${redact(JSON.stringify(f.payload)).slice(0, 200)}`,
        );
      const text = (f.payload as { delta?: { text?: string } } | null)?.delta?.text;
      if (f.type === "contentBlockDelta" && text) yield text;
    }
    buf = buf.slice(used);
  }
}

const AnswerOut = z.object({ answer: z.string() });

/**
 * Streams the answer as text deltas from the seat's model: Chat Completions SSE for gateway
 * models, ConverseStream for Bedrock. If the stream fails before the first token, one
 * non-streaming structured() call answers instead.
 */
export async function* streamAnswer(
  model: string,
  messages: Message[],
  o: StreamOptions = {},
): AsyncGenerator<string> {
  let started = false;
  try {
    const it = isBedrock(model)
      ? bedrockStream(model, messages, o)
      : gatewayStream(model, messages, o);
    for await (const d of it) {
      started = true;
      yield d;
    }
  } catch (error) {
    if (started || o.signal?.aborted) throw error;
    console.warn(
      "chat_stream_fallback",
      JSON.stringify({
        model,
        message: redact(error instanceof Error ? error.message : String(error)),
      }),
    );
    const r = await structured(
      model,
      "institution_answer",
      AnswerOut,
      messages,
      noReasoning(model)
        ? { reasoningEffort: "none", temperature: CHAT_TEMPERATURE, maxOutputTokens: 1500 }
        : { reasoningEffort: "low", maxOutputTokens: 4000 },
    );
    if (!r.data.answer.trim()) throw new StructuredOutputError("empty answer");
    yield r.data.answer;
  }
}

// ---------- gated answer ----------

export type GateEvent =
  | { type: "delta"; text: string }
  /** Drop what was sent so far: a regenerated answer follows. */
  | { type: "reset" }
  | {
      type: "gate";
      answeredBy: string;
      cut: boolean;
      regenerated: boolean;
      reasons: string[];
      flagged: string[];
    };

type Stream = (model: string, messages: Message[], o: StreamOptions) => AsyncIterable<string>;

/**
 * One pass: streams sentences as soon as they are finished and clean, keeps reading after the
 * first bad one (to know how much was lost), and returns the gate result for the whole answer.
 */
async function* gatedPass(
  stream: Stream,
  model: string,
  messages: Message[],
  lang: Lang,
  ctx: GateContext,
  o: StreamOptions,
): AsyncGenerator<GateEvent, GateResult> {
  let raw = "";
  let sent = "";
  let clean = true;
  let checked = 0;
  for await (const d of stream(model, messages, o)) {
    raw += d;
    if (!clean) continue;
    const parts = splitSentences(raw);
    // the last part may still grow; everything before it is final
    for (let i = checked; i < parts.length - 1; i++) {
      const g = gateAnswer(raw.slice(0, parts[i]?.end ?? 0), lang, ctx);
      if (g.cut || !g.text.startsWith(sent)) {
        clean = false;
        break;
      }
      if (g.text.length > sent.length) yield { type: "delta", text: g.text.slice(sent.length) };
      sent = g.text;
      checked = i + 1;
    }
  }
  const g = gateAnswer(raw, lang, ctx);
  if (g.text.startsWith(sent) && g.text.length > sent.length)
    yield { type: "delta", text: g.text.slice(sent.length) };
  return g;
}

/**
 * The chat answer through the output gate: answer with `model`; when less than MIN_KEPT of it
 * survives, regenerate once with the repair model and keep whichever clean answer is longer.
 */
export async function* gatedAnswer(
  model: string,
  messages: Message[],
  lang: Lang,
  ctx: GateContext,
  o: StreamOptions & { repairModel?: string; stream?: Stream } = {},
): AsyncGenerator<GateEvent> {
  const stream = o.stream ?? streamAnswer;
  const repair = o.repairModel ?? CHAT_REPAIR_MODEL;
  const first = yield* gatedPass(stream, model, messages, lang, ctx, o);
  if (first.kept >= MIN_KEPT || o.signal?.aborted) {
    yield {
      type: "gate",
      answeredBy: model,
      cut: first.cut,
      regenerated: false,
      reasons: first.reasons,
      flagged: first.flagged,
    };
    return;
  }
  console.warn(
    "chat_gate_regenerate",
    JSON.stringify({ model, reasons: first.reasons, kept: first.kept }),
  );
  yield { type: "reset" };
  let second: GateResult | null = null;
  try {
    second = yield* gatedPass(stream, repair, messages, lang, ctx, o);
  } catch (error) {
    if (o.signal?.aborted) throw error;
    console.warn(
      "chat_gate_repair_failed",
      error instanceof Error ? error.message.slice(0, 160) : error,
    );
  }
  const reasons = [...new Set([...first.reasons, ...(second?.reasons ?? [])])];
  const flagged = [...new Set([...first.flagged, ...(second?.flagged ?? [])])];
  if (second && second.text.length >= first.text.length) {
    yield {
      type: "gate",
      answeredBy: repair,
      cut: second.cut,
      regenerated: true,
      reasons,
      flagged,
    };
    return;
  }
  // the repair did worse or failed: fall back to the clean part of the first answer
  yield { type: "reset" };
  if (first.text) yield { type: "delta", text: first.text };
  yield { type: "gate", answeredBy: model, cut: true, regenerated: true, reasons, flagged };
}
