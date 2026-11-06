import { foldRun, type Lang, localize, plainDashes, type Run, type RunEvent } from "@sv/contracts";
import { z } from "zod";
import { buildTimeline, fmtMin } from "@/components/timeline/model";

// "Ask the debate": find WHEN something happened in a run. The route hands a compact index of
// the run to the chat model, which answers in a few sentences and names utterance ids; the ids
// are checked against the run. Without a model the keyword ranking below answers instead, so
// the feature never dead-ends. Pure: no I/O, testable.

export interface IndexedUtterance {
  id: string;
  seq: number;
  round: number;
  phase: number;
  exchange: string;
  speaker: string;
  /** Simulated minute the utterance starts at (timeline layout). */
  min: number;
  text: string;
}

export interface IndexedProposal {
  id: string;
  title: string;
  origin: string;
  tabledRound: number;
  status: string;
  /** Round in which the status last changed (accepted, rejected, withdrawn). */
  statusRound: number | null;
  /** Final stances by institution name. */
  supporters: string[];
  conditional: string[];
  opponents: string[];
  utteranceIds: string[];
}

export interface LocateIndex {
  utterances: IndexedUtterance[];
  proposals: IndexedProposal[];
}

export const LocateAnswer = z.object({
  answer: z.string(),
  utteranceIds: z.array(z.string()),
  round: z.number().int().nullable(),
});
export type LocateAnswer = z.infer<typeof LocateAnswer>;

export interface LocateResult extends LocateAnswer {
  source: "model" | "fallback";
}

const TEXT_CHARS = 200;
export const MAX_IDS = 6;

function seatName(run: Run | null, id: string, lang: Lang): string {
  if (id === "moderator") return "Moderator";
  if (id === "expert") return lang === "de" ? "Experte" : "Expert";
  const cfg = run?.agents.find((a) => a.id === id);
  if (!cfg) return id;
  return lang === "de" ? cfg.institution.nameDe : cfg.institution.glossEn;
}

const clip = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, n - 3).trimEnd()}...` : s.replace(/\s+/g, " ");

export function buildLocateIndex(events: readonly RunEvent[], lang: Lang): LocateIndex {
  const snap = foldRun([...events]);
  const run = snap.run;
  const timeline = buildTimeline(snap, run);
  const exchanges = new Map(snap.exchanges.map((x) => [x.id, x]));
  const topic = (id: string | null) => {
    const t = run?.mandate.topics.find((tp) => tp.id === id);
    return t ? localize(t.label, lang) : null;
  };
  const utterances: IndexedUtterance[] = snap.utteranceOrder.flatMap((id) => {
    const u = snap.utterances[id];
    if (!u) return [];
    const x = u.exchangeId ? exchanges.get(u.exchangeId) : undefined;
    const exchange = x ? [x.kind, topic(x.topicId)].filter(Boolean).join(" ") : "";
    return [
      {
        id,
        seq: u.seq,
        round: u.round,
        phase: u.phase,
        exchange,
        speaker: seatName(run, u.speaker, lang),
        min: Math.round((timeline.byId.get(id)?.start ?? 0) * 10) / 10,
        text: clip(plainDashes(localize(u.text, lang)), TEXT_CHARS),
      },
    ];
  });

  // status changes carry no round of their own: take the round open at that event
  const statusRound = new Map<string, { status: string; round: number }>();
  let round = 0;
  for (const e of events) {
    if (e.type === "round.started") round = e.round;
    else if (e.type === "proposal.updated") {
      const prev = statusRound.get(e.proposal.id);
      if (!prev || prev.status !== e.proposal.status)
        statusRound.set(e.proposal.id, { status: e.proposal.status, round });
    }
  }
  const proposals: IndexedProposal[] = snap.proposalOrder.flatMap((id) => {
    const p = snap.proposals[id];
    if (!p) return [];
    return [
      {
        id,
        title: clip(plainDashes(localize(p.title, lang)), 140),
        origin: seatName(run, p.originAgent, lang),
        tabledRound: p.round,
        status: p.status,
        statusRound: p.status === "open" ? null : (statusRound.get(id)?.round ?? null),
        supporters: p.supporters.map((a) => seatName(run, a, lang)),
        conditional: p.conditional.map((a) => seatName(run, a, lang)),
        opponents: p.opponents.map((a) => seatName(run, a, lang)),
        utteranceIds: utterances
          .filter((u) => snap.utterances[u.id]?.proposalIds.includes(id))
          .map((u) => u.id),
      },
    ];
  });
  return { utterances, proposals };
}

/** One line per utterance and proposal: what the model reads. */
export function indexText(index: LocateIndex): string {
  const u = index.utterances.map(
    (x) =>
      `${x.id} | R${x.round} P${x.phase} | ${fmtMin(x.min)} | ${x.exchange || "-"} | ${x.speaker} | ${x.text}`,
  );
  const p = index.proposals.map(
    (x) =>
      `${x.id} | ${x.title} | by ${x.origin} | tabled R${x.tabledRound} | ${x.status}${
        x.statusRound ? ` R${x.statusRound}` : ""
      } | for ${x.supporters.join(", ") || "-"} | conditional ${x.conditional.join(", ") || "-"} | against ${x.opponents.join(", ") || "-"} | utterances ${x.utteranceIds.join(",") || "-"}`,
  );
  return `UTTERANCES (id | round phase | minute since start h:mm | exchange | speaker | text)\n${u.join("\n")}\n\nPROPOSALS (id | title | origin | tabled | status | for | conditional | against | utterances)\n${p.join("\n")}`;
}

export function locateMessages(index: LocateIndex, question: string, lang: Lang) {
  const system =
    lang === "de"
      ? `Du findest Stellen in einer simulierten Verhandlung. Antworte auf Deutsch in 1 bis 3 kurzen Sätzen, wann und wo es passiert ist (Runde, Institution, worum es ging). Nenne in utteranceIds die 1 bis ${MAX_IDS} Wortmeldungen, die die Frage am besten belegen, in zeitlicher Reihenfolge, nur ids aus dem Index. Fragt die Frage nach einer Institution, nimm vor allem deren eigene Wortmeldungen. Behaupte nur, was die genannten Wortmeldungen sagen. Zeiten nennst du als Runde, nicht als Uhrzeit. round ist die Runde des wichtigsten Treffers oder null. Gibt es keine passende Stelle, sag das und gib eine leere Liste zurück. Keine ids im Antworttext, keine Personennamen, keine Gedankenstriche.`
      : `You locate moments in a simulated negotiation. Answer in English in 1 to 3 short sentences: when and where it happened (round, institution, what it was about). In utteranceIds list the 1 to ${MAX_IDS} utterances that best support the answer, in time order, only ids from the index. If the question names an institution, prefer that institution's own utterances. Claim only what the cited utterances say. Give times as rounds, not clock times. round is the round of the main match or null. If nothing matches, say so and return an empty list. No ids in the answer text, no personal names, no dashes as punctuation.`;
  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: `${indexText(index)}\n\nQUESTION: ${question}` },
  ];
}

/** Keeps ids that exist in the run, once each, in time order, at most MAX_IDS. */
export function validIds(ids: readonly string[], index: LocateIndex): string[] {
  const seq = new Map(index.utterances.map((u) => [u.id, u.seq]));
  return [...new Set(ids.map((s) => s.trim()))]
    .filter((id) => seq.has(id))
    .sort((a, b) => (seq.get(a) ?? 0) - (seq.get(b) ?? 0))
    .slice(0, MAX_IDS);
}

/** Speakers named in the question, matched on folded words of their name ("Ärztekammer"). */
export function namedSpeakers(question: string, index: LocateIndex): Set<string> {
  const q = new Set(tokens(question));
  const named = new Set<string>();
  for (const u of index.utterances) {
    const name = tokens(u.speaker);
    if (name.length && name.every((w) => q.has(w))) named.add(u.speaker);
  }
  return named;
}

/**
 * When the question names an institution, only that institution's utterances count; the model
 * otherwise tends to cite whoever answered it. Falls back to `others` (the keyword ranking),
 * then to the unfiltered ids, so a named question never loses all its matches.
 */
export function preferNamed(
  ids: readonly string[],
  index: LocateIndex,
  question: string,
  others: readonly string[] = [],
): string[] {
  const named = namedSpeakers(question, index);
  if (named.size === 0) return [...ids];
  const by = new Map(index.utterances.map((u) => [u.id, u.speaker]));
  const own = (list: readonly string[]) => list.filter((id) => named.has(by.get(id) ?? ""));
  const a = own(ids);
  if (a.length) return a;
  const b = own(others);
  return b.length ? b : [...ids];
}

const STOP = new Set(
  (
    "der die das den dem des ein eine einer eines einem und oder aber wann wo wie was wer hat " +
    "haben wurde wurden ist sind war waren es sich mit von zu zum zur im in an am auf für fur " +
    "über uber um bei nach vor ging gab geht dass als auch nicht noch ihr sein seine wir " +
    "the a an and or of to in on at for with when where how what who did does was were is are " +
    "it its by about from that this has have had be"
  ).split(" "),
);

/** Lower case, umlauts folded, stop words and short tokens dropped. */
export function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));
}

// German compounds: "Finanzierungsstreit" should hit "Finanzierung"; a shared stem of five
// letters counts as a match.
const STEM = 5;
const hit = (q: string, w: string) =>
  q === w ||
  (q.length >= STEM && w.length >= STEM && (w.includes(q.slice(0, STEM + 1)) || q.includes(w)));

/** Keyword overlap over the index; the offline answer when no model is reachable. */
export function fallbackLocate(index: LocateIndex, question: string, lang: Lang): LocateResult {
  const q = [...new Set(tokens(question))];
  const scored = index.utterances
    .map((u) => {
      const words = tokens(`${u.speaker} ${u.exchange} ${u.text}`);
      const score = q.reduce((s, t) => s + (words.some((w) => hit(t, w)) ? 1 : 0), 0);
      return { u, score };
    })
    .filter((s) => s.score > 0);
  // a matching proposal lends its score to the utterances that table or vote on it
  for (const p of index.proposals) {
    const words = tokens(p.title);
    const score = q.reduce((s, t) => s + (words.some((w) => hit(t, w)) ? 1 : 0), 0);
    if (!score) continue;
    for (const id of p.utteranceIds) {
      const s = scored.find((x) => x.u.id === id);
      if (s) s.score += score;
      else {
        const u = index.utterances.find((x) => x.id === id);
        if (u) scored.push({ u, score });
      }
    }
  }
  const top = scored
    .sort((a, b) => b.score - a.score || a.u.seq - b.u.seq)
    .slice(0, 3)
    .map((s) => s.u)
    .sort((a, b) => a.seq - b.seq);
  if (top.length === 0)
    return {
      answer:
        lang === "de"
          ? "Dazu habe ich keine passende Stelle gefunden."
          : "I found no matching moment for that.",
      utteranceIds: [],
      round: null,
      source: "fallback",
    };
  const where = top
    .map((u) => `${lang === "de" ? "Runde" : "round"} ${u.round}, ${u.speaker} (${fmtMin(u.min)})`)
    .join("; ");
  return {
    answer: lang === "de" ? `Passende Stellen: ${where}.` : `Matching moments: ${where}.`,
    utteranceIds: top.map((u) => u.id),
    round: top[0]?.round ?? null,
    source: "fallback",
  };
}
