// Which part of the page did our pipeline draw on? The press position in the archive is a
// paraphrase in the institution's voice, so there is no exact span on the page. We look for
// the OCR blocks whose vocabulary overlaps most with the institution name and the key terms
// of the paraphrase: a plain token overlap per block, no model, explainable in one sentence.
import { blockText, type PageText } from "./ocr";

const STOP = new Set(
  (
    "aber alle allem allen aller alles also auch auf aus bei bin bis bist das dass dem den der " +
    "des die dies diese diesem diesen dieser dieses doch dort durch ein eine einem einen einer " +
    "eines er es für gegen habe haben hat hatte her hier hin ich ihr ihre ihrem ihren ihrer " +
    "ihres ist jede jedem jeden jeder jedes kann können mehr mit nach nicht noch nur oder " +
    "ohne sehr sein seine seinem seinen seiner seines sich sie sind soll sollen sollte über " +
    "und uns unser unter vom von vor war waren werde werden wie wieder will wird wurde wurden " +
    "zum zur zwischen man muss müssen dann denn weil wenn sowie dabei dafür damit etwa " +
    "rund laut heute weniger seit bereits jedoch keine keinen keiner sagt sagte " +
    "the and for with from that this are was were have has not but"
  ).split(/\s+/),
);

/** Lower-cased alphabetic tokens, umlauts kept, crude German stem (trailing inflection). */
export function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-zäöüß]+/g) ?? [])
    .filter((t) => t.length >= 4 && !STOP.has(t))
    .map(stem);
}

function stem(t: string): string {
  if (t.length <= 5) return t;
  return t.replace(/(ungen|innen|ern|en|er|es|em|st|e|n|s)$/, "");
}

export interface PassageMatch {
  blockIds: string[];
  /** Key terms that occur in the matched blocks, in original casing. */
  matched: string[];
  /** Number of key terms derived from the paraphrase. */
  termCount: number;
  /** Overlap of the best block, 0..1. */
  score: number;
}

/**
 * Picks the OCR blocks with the best overlap. `institution` tokens count double; blocks with
 * fewer than eight words (headlines, captions) only join when they share enough terms.
 */
export function matchPassage(
  page: PageText,
  paraphrase: string,
  institution: string,
): PassageMatch | null {
  const instTerms = new Set(tokens(institution));
  const paraTerms = new Set(tokens(paraphrase));
  const terms = new Set([...instTerms, ...paraTerms]);
  if (terms.size < 3) return null;

  const scored = page.blocks.map((b) => {
    const have = new Set(tokens(blockText(b)));
    let hits = 0;
    let weight = 0;
    const matched: string[] = [];
    for (const t of terms) {
      if (!have.has(t)) continue;
      hits++;
      weight += instTerms.has(t) ? 2 : 1;
      matched.push(t);
    }
    const words = b.paragraphs.reduce(
      (n, p) => n + p.lines.reduce((m, l) => m + l.words.length, 0),
      0,
    );
    return { b, hits, weight, matched, words, score: weight / (terms.size + instTerms.size) };
  });
  const best = Math.max(...scored.map((s) => s.score), 0);
  if (best === 0) return null;
  const chosen = scored
    .filter((s) => s.score >= best * 0.6 && s.hits >= 3 && (s.words >= 8 || s.hits >= 2))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .sort((a, b) => a.b.num - b.b.num);
  if (!chosen.length) return null;
  const matchedStems = new Set(chosen.flatMap((c) => c.matched));
  // Report the original words of the paraphrase that produced the matched stems.
  const seen = new Set<string>();
  const matched: string[] = [];
  for (const raw of `${institution} ${paraphrase}`.match(/[A-Za-zÄÖÜäöüß]+/g) ?? []) {
    const [s] = tokens(raw);
    if (s && matchedStems.has(s) && !seen.has(s)) {
      seen.add(s);
      matched.push(raw);
    }
  }
  return { blockIds: chosen.map((c) => c.b.id), matched, termCount: terms.size, score: best };
}
