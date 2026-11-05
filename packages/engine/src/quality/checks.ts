// Deterministic debate-quality checks (no model calls). Used twice: by the turn gate in
// the runner before an utterance is committed, and by the offline audit next to the
// cross-family judge. Every check is cheap, explainable and returns a short reason.
import type { GateCheck, Mandate } from "@sv/contracts";
import { findPersonNames } from "../guard.ts";

// ---------- text helpers ----------

const STOPWORDS_DE = new Set(
  "aber alle allem allen aller alles als also am an ander andere anderen auch auf aus bei beim bin bis bleibt da dabei damit dann darauf darum das dass dem den denn der des deshalb die dies diese diesem diesen dieser dieses doch dort durch ein eine einem einen einer eines er es etwa euch für gegen hat hatte hier ihr ihre ihrem ihren im in ist ja jede jedem jeden jeder jetzt kann kein keine können man mehr mit muss nach nicht noch nur ob oder ohne sehr sein seine sich sie sind so soll sollen sondern um und uns unser unsere unter viel vom von vor war was weil wenn wer werden wie wir wird wo zu zum zur über".split(
    " ",
  ),
);
const ENGLISH_MARKERS = new Set(
  "the and of to is are we that with for this will be our you not on as it by which would should their they from have has".split(
    " ",
  ),
);

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-zäöüß0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function contentWords(text: string): string[] {
  return tokens(text).filter((w) => w.length >= 4 && !STOPWORDS_DE.has(w));
}

export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function shingles(text: string, n = 3): Set<string> {
  const w = tokens(text);
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(" "));
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Share of the new text's word 3-grams already present in the earlier text. */
export function containment(newer: string, older: string): number {
  const a = shingles(newer);
  const b = shingles(older);
  if (a.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / a.size;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

// ---------- vocabulary ----------

/**
 * Domain vocabulary of Austrian health-policy negotiation. Stems are matched as
 * substrings, so compounds ("Facharztwartezeiten") and inflections hit.
 */
const DOMAIN_STEMS = [
  "gesundheit",
  "versorg",
  "patient",
  "facharzt",
  "fachärzt",
  "ärzt",
  "arzt",
  "wartezeit",
  "termin",
  "kasse",
  "kassen",
  "honor",
  "tarif",
  "finanz",
  "budget",
  "deckel",
  "ausgaben",
  "kosten",
  "beitrag",
  "mio",
  "millionen",
  "milliard",
  "ambulan",
  "spital",
  "krankenh",
  "pflege",
  "primärversorg",
  "pve",
  "telemed",
  "1450",
  "stellen",
  "vertrag",
  "gesamtvertrag",
  "zielsteuer",
  "15a",
  "länder",
  "bund",
  "sozialversicher",
  "evaluier",
  "monitoring",
  "umsetz",
  "vorschlag",
  "bedingung",
  "zustimm",
  "vetospiel",
  "rote linie",
  "kompromiss",
  "paket",
  "gesetz",
  "verordnung",
  "zuständig",
  "lenkung",
  "wochen",
  "prozent",
  " %",
];

/** Content stems of a text: lower-case prefixes of its longer words. */
export function stemsOf(text: string): string[] {
  const out = new Set<string>();
  for (const w of contentWords(text)) {
    if (w.length < 5) continue;
    out.add(w.slice(0, Math.min(w.length, 7)));
  }
  return [...out];
}

export interface Vocabulary {
  mandate: string[];
  topics: Record<string, string[]>;
}

/** Mandate stems (question, objective, constraints, topics) plus the domain list. */
export function vocabularyOf(mandate: Mandate): Vocabulary {
  const topics: Record<string, string[]> = {};
  for (const t of mandate.topics) topics[t.id] = stemsOf(`${t.label.text} ${t.measure.text}`);
  const mandateText = [
    mandate.question,
    mandate.objective.text,
    ...mandate.constraints.map((c) => c.text),
    ...mandate.topics.map((t) => `${t.label.text} ${t.measure.text}`),
  ].join(" ");
  return {
    mandate: [...new Set([...DOMAIN_STEMS, ...stemsOf(mandateText)])],
    topics,
  };
}

function hits(text: string, stems: string[]): number {
  const low = ` ${text.toLowerCase()} `;
  let n = 0;
  for (const s of stems) if (low.includes(s)) n++;
  return n;
}

// ---------- checks ----------

export interface TurnCheckInput {
  text: string;
  speaker: string;
  phase: number;
  vocab: Vocabulary;
  /** Topic of the exchange; null for the plenary or the tabled proposal. */
  topicId: string | null;
  /** Same speaker's earlier utterances in this run (German text). */
  ownPrior: string[];
  /** Exchange kind; caucus and interjection turns are exempt from the negotiation check. */
  exchangeKind?: "plenary" | "bilateral" | "caucus" | "interjection";
  /** Utterance kind for agents ("closing" is exempt from the negotiation check). */
  kind?: string;
}

const AGENT = (speaker: string) => speaker !== "moderator" && speaker !== "expert";

/** Relevance: the turn names mandate vocabulary, and the exchange topic when it has one. */
export function relevanceCheck(i: TurnCheckInput): GateCheck {
  if (!AGENT(i.speaker)) return { check: "relevance", passed: true, reason: null, value: null };
  const words = Math.max(1, tokens(i.text).length);
  const m = hits(i.text, i.vocab.mandate);
  const topicStems = i.topicId ? (i.vocab.topics[i.topicId] ?? []) : [];
  const t = topicStems.length ? hits(i.text, topicStems) : null;
  const density = m / words;
  if (m === 0)
    return {
      check: "relevance",
      passed: false,
      reason: "Kein Bezug zum Mandat erkennbar (kein Begriff aus Frage, Zielen oder Themen).",
      value: 0,
    };
  if (t === 0 && words >= 25 && m < 3)
    return {
      check: "relevance",
      passed: false,
      reason: "Thema des Gesprächs wird nicht angesprochen.",
      value: r2(density),
    };
  return { check: "relevance", passed: true, reason: null, value: r2(density) };
}

/** Repetition: near-duplicate of an earlier own turn, or a sentence loop inside the turn. */
export function repetitionCheck(i: TurnCheckInput): GateCheck {
  // Moderator and expert lines are templated on purpose (demands, check reports).
  if (!AGENT(i.speaker)) return { check: "repetition", passed: true, reason: null, value: null };
  let max = 0;
  for (const prev of i.ownPrior) max = Math.max(max, containment(i.text, prev));
  const ss = sentences(i.text).map((s) => tokens(s).join(" "));
  const loops = ss.filter((s, k) => s.split(" ").length >= 5 && ss.indexOf(s) !== k).length;
  const priorSentences = new Set(
    i.ownPrior.flatMap((p) => sentences(p).map((s) => tokens(s).join(" "))),
  );
  const recycled = ss.filter((s) => s.split(" ").length >= 6 && priorSentences.has(s)).length;
  if (loops > 0)
    return {
      check: "repetition",
      passed: false,
      reason: "Satzschleife: derselbe Satz kommt im Beitrag mehrfach vor.",
      value: r2(max),
    };
  if (max >= 0.5)
    return {
      check: "repetition",
      passed: false,
      reason: `Wiederholt einen eigenen früheren Beitrag weitgehend (${Math.round(max * 100)} % gleiche Wortfolgen); bring ein neues Argument, eine Bedingung oder ein Zugeständnis.`,
      value: r2(max),
    };
  if (recycled >= 2)
    return {
      check: "repetition",
      passed: false,
      reason: `${recycled} Sätze wörtlich aus eigenen früheren Beiträgen übernommen.`,
      value: r2(max),
    };
  return { check: "repetition", passed: true, reason: null, value: r2(max) };
}

const META_RE =
  /\b(als (eine )?KI|KI-Modell|Sprachmodell|language model|as an AI|I am an AI|ich bin (eine )?(KI|Maschine)|in dieser Simulation|simulierte[nr]? Verhandlung|JSON|respondsTo|Prompt)\b/i;
const ID_RE =
  /(?<![\w-])(u\d+-\d{2}|rl-[a-z]{2,4}-\d+|t-[a-z0-9]{2,12}|c-\d+-\d+-\d+|x\d+-\d{2})(?![\w-])/;

/** Register: German, institutional voice, no meta talk, no internal ids, no English drift. */
export function registerCheck(i: TurnCheckInput): GateCheck {
  const w = tokens(i.text);
  const en = w.filter((x) => ENGLISH_MARKERS.has(x)).length;
  const share = w.length ? en / w.length : 0;
  if (share >= 0.06 && en >= 3)
    return {
      check: "register",
      passed: false,
      reason: `Englische Passagen in einem deutschen Beitrag (${en} englische Funktionswörter).`,
      value: r2(share),
    };
  const meta = i.text.match(META_RE);
  if (meta)
    return {
      check: "register",
      passed: false,
      reason: `Meta-Rede über Modell oder Simulation ("${meta[0]}").`,
      value: null,
    };
  const id = i.text.match(ID_RE);
  if (id && AGENT(i.speaker))
    return {
      check: "register",
      passed: false,
      reason: `Interne Kennung im gesprochenen Text ("${id[0]}"); nenne Themen und Institutionen beim Namen.`,
      value: null,
    };
  if (AGENT(i.speaker) && /(^|[.!?]\s+)Ich\b|\bich (bin|habe|denke|glaube|finde)\b/.test(i.text))
    return {
      check: "register",
      passed: false,
      reason: 'Spricht als Person ("ich") statt als Institution ("wir").',
      value: null,
    };
  return { check: "register", passed: true, reason: null, value: r2(share) };
}

const PROPOSAL_RE =
  /(schlagen (wir )?vor|vorschlag|bieten (wir )?an|angebot|beantrag|ersetzen|mittragen|zustimm|stimmen .{0,40}zu|unterstützen|bereit|unter der bedingung|sofern|vorausgesetzt|\bwenn\b|im gegenzug|zugeständnis|alternativ|kompromiss|befristet|pilot|stufenweise|gestaffelt)/i;
const OBJECTION_RE =
  /(lehnen .{0,60}ab|ablehn|nicht zustimm|stimmen nicht|nicht mittragen|tragen .{0,60}nicht mit|nicht tragbar|nicht akzeptabel|können wir nicht|kommt nicht in frage|rote linie|widersprech|halten .{0,30}fest)/i;
const BECAUSE_RE =
  /(weil|\bda\b|denn|deshalb|daher|aufgrund|wegen|sonst|würde|gefährdet|verletzt|ohne|solange|in dieser (form|fassung))/i;
const CONCRETE_RE =
  /(\d|mio|millionen|prozent|wochen|jahr|stellen|honorar|tarif|finanzier|umschicht|pilot|region|evaluier|frist)/i;

/**
 * Negotiation phases (3 and 4): a turn must carry a concrete proposal (an offer with a
 * concrete element) or a justified objection. Caucus talk and closings are exempt.
 */
export function negotiationCheck(i: TurnCheckInput): GateCheck | null {
  if (!AGENT(i.speaker) || i.phase < 3 || i.phase > 4) return null;
  if (i.exchangeKind === "caucus" || i.exchangeKind === "interjection") return null;
  if (i.kind === "closing") return null;
  const proposal = PROPOSAL_RE.test(i.text) && CONCRETE_RE.test(i.text);
  const objection = OBJECTION_RE.test(i.text) && BECAUSE_RE.test(i.text);
  if (proposal || objection) return { check: "negotiation", passed: true, reason: null };
  return {
    check: "negotiation",
    passed: false,
    reason:
      "Verhandlungsphase: weder ein konkreter Vorschlag (mit Betrag, Frist, Umfang oder Bedingung) noch ein begründeter Einwand.",
  };
}

/** CON-1 / CON-2: no person names. */
export function conCheck(i: TurnCheckInput): GateCheck {
  const h = findPersonNames(i.text);
  return h.length
    ? {
        check: "con",
        passed: false,
        reason: `Personenbezug: ${h.map((x) => x.rule).join(", ")}`,
        value: h.length,
      }
    : { check: "con", passed: true, reason: null, value: 0 };
}

/** All gate checks for one draft; the negotiation check only where it applies. */
export function gateChecks(i: TurnCheckInput): GateCheck[] {
  const out = [relevanceCheck(i), repetitionCheck(i), registerCheck(i), conCheck(i)];
  const n = negotiationCheck(i);
  if (n) out.push(n);
  return out;
}

/** The gate regenerates on these failed checks (CON has its own guard in agent.ts). */
export const GATED: ReadonlyArray<GateCheck["check"]> = [
  "relevance",
  "repetition",
  "register",
  "negotiation",
];

export function failedGated(checks: GateCheck[]): GateCheck[] {
  return checks.filter((c) => !c.passed && GATED.includes(c.check));
}

/** Feedback for the regeneration prompt. */
export function gateFeedback(failed: GateCheck[]): string {
  return [
    "Die Moderation weist deinen Entwurf zurück. Gründe:",
    ...failed.map((c) => `- ${c.reason}`),
    "Formuliere den Beitrag neu: bleib beim Mandat und beim Thema dieses Gesprächs, bring ein neues Argument, eine konkrete Bedingung oder ein beziffertes Angebot statt einer Wiederholung, sprich Deutsch als Institution (wir), ohne interne Kennungen und ohne Meta-Rede.",
  ].join("\n");
}

// ---------- grounding (audit) ----------

const ASSUMPTION_RE =
  /(annahme|gehen davon aus|schätz|rund |etwa |ca\.|voraussichtlich|rechnen mit|erwarten|könnte|dürfte|geschätzt|vermutlich|ungefähr)/i;
const NUMBER_RE = /\d+(?:[.,]\d+)?/g;

export interface GroundingInput {
  text: string;
  /**
   * Numbers already on the record: the mandate (20 %, 5 %, five years, four weeks) and the
   * figures of tabled proposals; restating them needs no new source.
   */
  mandateNumbers: Set<string>;
  claims: Array<{
    state: string;
    citations: number;
    value: number | null;
    quote: string;
    atomic: string;
  }>;
  /** Expert notes that name this utterance. */
  expertNotes: string[];
}

/** Ids (u3-17, p-01, rl-ak-1, 15a) are not figures. */
const NOT_A_FIGURE_RE =
  /(?<![\w-])(u\d+-\d{2,}|p-\d+|rl-[a-z]{2,4}-\d+|c-\d+-\d+-\d+|x\d+-\d{2}|E\d{1,2}|15a)(?![\w-])/g;

export function numbersIn(text: string): string[] {
  return (text.replace(NOT_A_FIGURE_RE, " ").match(NUMBER_RE) ?? []).map((n) =>
    String(Number(n.replace(".", "").replace(",", "."))),
  );
}

/**
 * Grounding: every number outside the mandate is covered by a cited claim or sits in a
 * sentence marked as an assumption; contradicted claims and expert contradiction notes
 * are major. Returns a score 0..1 and reasons.
 */
export function groundingCheck(i: GroundingInput): {
  score: number;
  reasons: Array<{ severity: "minor" | "major"; reason: string }>;
} {
  const reasons: Array<{ severity: "minor" | "major"; reason: string }> = [];
  let penalty = 0;
  const cited = new Set(
    i.claims.filter((c) => c.citations > 0 && c.value !== null).map((c) => String(c.value)),
  );
  const known = (n: string) => i.mandateNumbers.has(n) || cited.has(n);
  const loose: string[] = [];
  for (const s of sentences(i.text)) {
    for (const n of numbersIn(s)) {
      if (known(n) || /^(19|20)\d\d$/.test(n)) continue;
      if (ASSUMPTION_RE.test(s)) continue;
      loose.push(n);
    }
  }
  if (loose.length) {
    penalty += Math.min(0.5, 0.2 * loose.length);
    reasons.push({
      severity: "minor",
      reason: `Zahl ohne Beleg und ohne Kennzeichnung als Annahme: ${[...new Set(loose)].join(", ")}`,
    });
  }
  const contradicted = i.claims.filter((c) => c.state === "contradicted");
  if (contradicted.length) {
    penalty += 0.4;
    reasons.push({
      severity: "major",
      reason: `Vom Experten als widersprüchlich markiert: ${contradicted.map((c) => c.atomic).join(" | ")}`,
    });
  }
  const unlabelled = i.claims.filter(
    (c) =>
      c.state === "assumption" &&
      c.value !== null &&
      !known(String(c.value)) &&
      !ASSUMPTION_RE.test(c.quote || c.atomic),
  );
  if (unlabelled.length) {
    penalty += 0.15;
    reasons.push({
      severity: "minor",
      reason: `Bezifferte Annahme ohne Beleg und ohne Kennzeichnung im Text: ${unlabelled.map((c) => c.atomic).join(" | ")}`,
    });
  }
  if (i.expertNotes.length && !contradicted.length) {
    penalty += 0.2;
    reasons.push({
      severity: "minor",
      reason: `Expertenhinweis: ${i.expertNotes[0]?.slice(0, 220) ?? ""}`,
    });
  }
  return { score: r2(Math.max(0, 1 - penalty)), reasons };
}

/** Numbers stated in the mandate (and spelled-out small numbers it uses). */
export function mandateNumbers(mandate: Mandate): Set<string> {
  const text = [
    mandate.question,
    mandate.objective.text,
    ...mandate.constraints.map((c) => c.text),
    ...mandate.successMetrics.map((m) => m.text),
    ...mandate.topics.map((t) => `${t.label.text} ${t.measure.text}`),
  ].join(" ");
  return new Set([...numbersIn(text), "4", "5", "20", "1450"]);
}

// ---------- exchange novelty (moderation gate) ----------

/**
 * Share of a turn's content stems that no earlier turn of the exchange used. Low novelty
 * on consecutive turns means the exchange has stopped producing new arguments.
 */
export function noveltyOf(text: string, earlier: string[]): number {
  const mine = stemsOf(text);
  if (mine.length === 0) return 0;
  const seen = new Set(earlier.flatMap(stemsOf));
  return r2(mine.filter((s) => !seen.has(s)).length / mine.length);
}
