// Output gate for the ask-an-institution chat. Weaker models drift at the end of an answer:
// invented words, unknown acronyms, then a switch into another language. The gate checks every
// finished sentence and keeps the answer only up to the last clean one. Pure and synchronous,
// so the route can run it on a stream and the tests can run it on a fixed string.
import type { Lang } from "@sv/contracts";

const STOP: Record<string, string[]> = {
  de: "der die das und ist nicht wir ein eine einer einen dem den des mit von zu für auf im in ist sind wird werden auch als bei nur noch aber oder dass wenn wie uns unser unsere unseren kein keine sich es so nach aus über durch diese dieser dieses ohne muss müssen kann können soll sollen haben hat am zum zur".split(
    " ",
  ),
  en: "the and is are not we a an of to for on in with that this be will would our us it as by from or but if no can must should have has which there their they at".split(
    " ",
  ),
  fr: "le la les et est sont nous vous ne pas un une des du de au aux avec pour sur dans que qui ce cette avons sommes aucune aucun ici demain très mais ou être faire fait leur notre nos vingt heures il elle".split(
    " ",
  ),
  es: "el los las y es son nosotros no un una del con para por que esta este pero muy hay sus nuestro".split(
    " ",
  ),
  it: "il gli e sono noi non un una della delle con per che questo questa ma molto sono nostro".split(
    " ",
  ),
};
const STOP_SETS = Object.fromEntries(
  Object.entries(STOP).map(([k, v]) => [k, new Set(v)]),
) as Record<string, Set<string>>;

/** Acronyms that are plausible in an Austrian health-policy answer even if the context lacks them. */
const KNOWN_ACRONYMS = new Set(
  "EU EUR ÖGK SV ASVG B-VG BMF BMSGPK SVS BVAEB AK WKO ÄK ÖÄK LKF ELGA PVE PHC RSG ÖSG BZK FAG KV GKK BIP DE EN OK GP ICU IT AI".split(
    " ",
  ),
);
// Letters other than these signal another script or language in a German or English answer.
const FOREIGN_LETTERS = /[àâæçèéêëîïôœùûÿñ]/i;

const strip = (s: string) =>
  s
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const words = (s: string) => strip(s).match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];

// ---------- sentences ----------

const ABBREV =
  /(?:\b(?:z|B|a|ä|o|d|u|v|bzw|ca|vgl|Nr|Mio|Mrd|Abs|Art|lit|etc|inkl|exkl|bspw|S|Dr|Prof|e\.g|i\.e|vs|approx|No)|\d)\.$/;

/**
 * Splits text into sentences, each with its end offset. A sentence ends at . ! or ? (and any
 * markers like [E1] or closing quotes right after) followed by whitespace. The final part is
 * returned with complete=false unless it ends in such a terminator.
 */
export function splitSentences(
  text: string,
): Array<{ text: string; end: number; complete: boolean }> {
  const out: Array<{ text: string; end: number; complete: boolean }> = [];
  const re = /[.!?]+(?:["“”»')\]]*|\s*\[[^\]]*\])*(?=\s|$)/g;
  let start = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const end = m.index + m[0].length;
    const head = text.slice(start, m.index + 1);
    if (ABBREV.test(head.trimEnd()) && m[0] === ".") continue;
    if (text.slice(start, end).trim())
      out.push({ text: text.slice(start, end), end, complete: true });
    start = end;
  }
  const rest = text.slice(start);
  if (rest.trim())
    out.push({
      text: rest,
      end: text.length,
      complete:
        /[.!?]["“”»')\]]*\s*(?:\[[^\]]*\]\s*)*$/.test(rest.trimEnd()) || /\]\s*$/.test(rest),
    });
  return out;
}

// ---------- plausibility ----------

/** Character 4-grams (with word boundaries) of every word in the context the model was given. */
export interface GateContext {
  vocab: Set<string>;
  grams: Set<string>;
}

function gramsOf(w: string): string[] {
  const s = `^${w}$`;
  const g: string[] = [];
  for (let i = 0; i + 4 <= s.length; i++) g.push(s.slice(i, i + 4));
  return g;
}

export function gateContext(...texts: string[]): GateContext {
  const vocab = new Set<string>();
  const grams = new Set<string>();
  for (const t of texts)
    for (const raw of words(t)) {
      const w = raw.toLowerCase();
      vocab.add(w);
      for (const part of w.split(/[-']/)) {
        vocab.add(part);
        for (const g of gramsOf(part)) grams.add(g);
      }
    }
  return { vocab, grams };
}

/** Share of a word's 4-grams that occur in the context; German compounds of known parts score high. */
export function plausibility(word: string, ctx: GateContext): number {
  const g = gramsOf(word.toLowerCase());
  if (g.length === 0) return 1;
  return g.filter((x) => ctx.grams.has(x)).length / g.length;
}

// ---------- per-sentence check ----------

export interface SentenceCheck {
  ok: boolean;
  reasons: string[];
  flagged: string[];
}

function languageOf(ws: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const k of Object.keys(STOP_SETS)) counts[k] = 0;
  for (const w of ws) {
    const l = w.toLowerCase().replace(/^(?:d|l|qu|n|j)['’]/, "");
    for (const [k, set] of Object.entries(STOP_SETS))
      if (set.has(l) || (k === "fr" && /^(?:d|l|qu|n|j)['’]/i.test(w)))
        counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

export function checkSentence(sentence: string, lang: Lang, ctx: GateContext): SentenceCheck {
  const ws = words(sentence);
  const reasons: string[] = [];
  const flagged: string[] = [];
  if (ws.length === 0) return { ok: true, reasons, flagged };

  // language: stopwords of the session language against every other language
  const counts = languageOf(ws);
  const own = counts[lang] ?? 0;
  const [otherLang, other] = Object.entries(counts)
    .filter(([k]) => k !== lang)
    .sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
  if (other >= 2 && other > own) reasons.push(`language:${otherLang}`);
  if (lang === "de" || lang === "en") {
    const foreign = ws.filter((w) => FOREIGN_LETTERS.test(w));
    if (foreign.length >= 2) {
      reasons.push("language:letters");
      flagged.push(...foreign);
    }
  }

  // repetition and nonsense tokens
  const lower = ws.map((w) => w.toLowerCase());
  for (let i = 2; i < lower.length; i++)
    if (lower[i] === lower[i - 1] && lower[i] === lower[i - 2]) {
      reasons.push("repeat");
      flagged.push(ws[i] ?? "");
      break;
    }
  if (lower.length >= 12 && new Set(lower).size / lower.length < 0.45) reasons.push("repeat");
  for (const w of ws)
    if ((w.length >= 5 && !/[aeiouyäöü]/i.test(w) && !/^[A-ZÄÖÜ0-9-]+$/.test(w)) || w.length > 40) {
      reasons.push("nonsense");
      flagged.push(w);
    }

  // unknown words: acronyms and long words the context makes implausible
  for (const [i, w] of ws.entries()) {
    const l = w.toLowerCase();
    if (ctx.vocab.has(l)) continue;
    if (/^[A-ZÄÖÜ]{2,6}$/.test(w)) {
      if (!KNOWN_ACRONYMS.has(w)) {
        reasons.push("unknown-acronym");
        flagged.push(w);
      }
      continue;
    }
    if (lang !== "de") continue;
    // a capitalised head mid-sentence that shares almost no 4-gram with the context reads like
    // an invented name ("Salinas-kompatible"); long lowercase words get a looser bar, since
    // German builds new compounds from known parts all the time
    const capitalised = i > 0 && /^[A-ZÄÖÜ][a-zäöüß]{3,}/.test(w);
    const parts = l.split(/[-']/).filter((p) => !ctx.vocab.has(p));
    for (const [j, p] of parts.entries()) {
      const score = plausibility(p, ctx);
      const head = capitalised && j === 0 && p === l.split(/[-']/)[0];
      if (
        (head && (p.length >= 7 || w.includes("-")) && score < 0.3) ||
        (p.length >= 8 && score < 0.45)
      ) {
        reasons.push("implausible-word");
        flagged.push(w);
        break;
      }
    }
  }
  return {
    ok: reasons.length === 0,
    reasons: [...new Set(reasons)],
    flagged: [...new Set(flagged)],
  };
}

// ---------- whole answer ----------

export interface GateResult {
  /** The answer up to the last clean sentence. */
  text: string;
  /** True when something after `text` was dropped. */
  cut: boolean;
  /** Share of the raw answer's characters that survived. */
  kept: number;
  reasons: string[];
  flagged: string[];
}

/** Keeps the answer up to the last clean sentence; an unfinished last fragment is dropped. */
export function gateAnswer(raw: string, lang: Lang, ctx: GateContext): GateResult {
  const sentences = splitSentences(raw);
  let keptEnd = 0;
  let failed = false;
  const reasons: string[] = [];
  const flagged: string[] = [];
  for (const s of sentences) {
    const c = checkSentence(s.text, lang, ctx);
    if (!c.ok) {
      failed = true;
      reasons.push(...c.reasons);
      flagged.push(...c.flagged);
      continue;
    }
    if (failed) continue;
    if (!s.complete && keptEnd > 0) {
      reasons.push("unfinished");
      failed = true;
      continue;
    }
    keptEnd = s.end;
  }
  const text = raw.slice(0, keptEnd).trimEnd();
  const total = raw.trim().length || 1;
  return {
    text,
    cut: text.length < raw.trim().length,
    kept: text.length / total,
    reasons: [...new Set(reasons)],
    flagged: [...new Set(flagged)],
  };
}

/** Regenerate when less than this share of the answer survives the gate. */
export const MIN_KEPT = 0.6;
