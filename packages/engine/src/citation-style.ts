// Citation style per institution: how often an institution historically argues with laws,
// figures, studies or reports. Measured once from the masked Stellungnahmen corpus and the
// press positions (citation-propensity-cli.ts), stored in config/citation-style.json and used
// only to phrase the prompt. It is a habit, never a gate: nothing forces a citation.
import { readFileSync } from "node:fs";
import path from "node:path";

const ENGINE_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

export type CitationTier = "high" | "medium" | "low";

export interface CitationStyle {
  propensity: number;
  tier: CitationTier;
  legal: number;
  figures: number;
  studies: number;
  nStellungnahme: number;
  nPress: number;
  measured: boolean;
}

/** Reference markers. A segment "refers" when at least one of the three families matches. */
export const MARKERS = {
  legal: /§\s*\d|Art\.\s*\d|Abs\.\s*\d|\b(ASVG|B-KUVG|GSBG|KAKuG|ÄrzteG|B-VG)\b/u,
  figures:
    /\d[\d.,]*\s*(%|Prozent|Mio|Millionen|Mrd|Milliarden|EUR|Euro|€|Personen|Betten|Stellen|Planstellen|Tage|Wochen|Monate)/iu,
  studies:
    /(studie|bericht|rechnungshof|(^|[^\p{L}])laut([^\p{L}]|$)|statistik|erhebung|evaluierung|(^|[^\p{L}])oecd([^\p{L}]|$)|(^|[^\p{L}])daten([^\p{L}]|$)|analyse|gutachten|prognose)/iu,
} as const;

/** Segments shorter than this are letterhead or boilerplate and are skipped. */
export const MIN_WORDS = 8;

export function markersOf(text: string): { legal: boolean; figures: boolean; studies: boolean } {
  return {
    legal: MARKERS.legal.test(text),
    figures: MARKERS.figures.test(text),
    studies: MARKERS.studies.test(text),
  };
}

export function isSubstantive(text: string): boolean {
  return text.trim().split(/\s+/).length >= MIN_WORDS;
}

/** Tertiles over the measured panel: top third high, bottom third low. */
export function tierOf(value: number, panel: number[]): CitationTier {
  const sorted = [...panel].sort((a, b) => a - b);
  if (sorted.length === 0) return "medium";
  const q = (f: number) => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))];
  if (value >= (q(2 / 3) ?? 1)) return "high";
  if (value < (q(1 / 3) ?? 0)) return "low";
  return "medium";
}

let cache: Record<string, CitationStyle> | null = null;
export function citationStyles(): Record<string, CitationStyle> {
  if (cache) return cache;
  try {
    const raw = JSON.parse(
      readFileSync(path.join(ENGINE_ROOT, "config/citation-style.json"), "utf8"),
    ) as { institutions: Record<string, CitationStyle> };
    cache = raw.institutions;
  } catch {
    cache = {};
  }
  return cache;
}

export function citationStyleOf(agentId: string): CitationStyle | null {
  return citationStyles()[agentId] ?? null;
}

/**
 * One prompt line: evidence with ids is available, use it where it supports the argument,
 * phrased after the institution's historical habit. No quota, no penalty.
 */
export function citationStyleLine(agentId: string): string {
  const base =
    "Die Belege oben tragen Kennungen (E1, E2, ...). Wo ein Beleg dein Argument stützt, nutze ihn: nenne den Inhalt im Text und trage die Kennung in evidence der Aussage ein. Belege sind ein Angebot, keine Pflicht.";
  const st = citationStyleOf(agentId);
  if (!st) return base;
  const habit =
    st.tier === "high"
      ? "Deine Institution argumentiert erfahrungsgemäß häufig mit Paragraphen, Zahlen, Studien und Berichten: tu das auch hier, wo die Belege es hergeben."
      : st.tier === "low"
        ? "Deine Institution argumentiert erfahrungsgemäß eher aus Interessen, Erfahrung und Positionen als mit Paragraphen oder Statistiken: zitiere einen Beleg nur, wenn er dein Kernargument trägt."
        : "Deine Institution stützt sich erfahrungsgemäß gelegentlich auf Zahlen, Rechtsgrundlagen oder Berichte: setze Belege gezielt bei deinen zentralen Sachaussagen ein.";
  return `${base} ${habit}`;
}
