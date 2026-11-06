import type { Segment, Source } from "@sv/contracts";

// RIS OGD (Bundesrecht konsolidiert) to Source and Segment rows of kind "law".
// Pure functions: the fetch script (scripts/fetch-ris.ts) does the network and the cache,
// this module turns RIS metadata and the document XML into one Source per provision and
// one Segment per Absatz. SOZDOK has no open interface; RIS is the authoritative public
// source for the same consolidated texts (docs/legal-sources.md).

export const RIS_API = "https://data.bka.gv.at/ris/api/v2.6/Bundesrecht";
export const RIS_LICENCE =
  "Gesetzestext (§ 7 UrhG, frei), RIS OGD CC BY 4.0, Quelle: RIS, Bundeskanzleramt";

/** One version of a provision as RIS lists it (Inkrafttreten, Ausserkrafttreten). */
export type LawVersion = {
  risId: string;
  validFrom: string;
  validTo: string | null;
  amendedBy: string | null;
};

/** Normalised view of one BrKons OgdDocumentReference. */
export type RisHit = {
  risId: string;
  gesetzesnummer: string;
  lawShort: string;
  lawTitle: string;
  provision: string;
  paragraphNumber: string;
  type: string;
  validFrom: string;
  validTo: string | null;
  amendedBy: string | null;
  promulgation: string;
  eli: string | null;
  xmlUrl: string | null;
  htmlUrl: string | null;
  changedAt: string | null;
};

const asArray = <T>(v: T | T[] | undefined | null): T[] =>
  v == null ? [] : Array.isArray(v) ? v : [v];

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
/** House rule: no en or em dash anywhere; RIS titles and texts use them, store a hyphen. */
export const plainDashes = (s: string): string => s.replace(/[\u2013\u2014]/g, "-");
const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? plainDashes(v.trim()) : null;

/** Hit count and normalised hits of one RIS search page. A single hit is an object, not a list. */
export function parseSearch(json: unknown): { total: number; hits: RisHit[] } {
  const results = obj(obj(obj(json).OgdSearchResult).OgdDocumentResults);
  const total = Number(obj(results.Hits)["#text"] ?? 0);
  const hits: RisHit[] = [];
  for (const ref of asArray(results.OgdDocumentReference as unknown)) {
    const meta = obj(obj(obj(ref).Data).Metadaten);
    const br = obj(meta.Bundesrecht);
    const k = obj(br.BrKons);
    const urls = asArray(
      obj(obj(obj(obj(ref).Data).Dokumentliste).ContentReference as unknown).Urls as unknown,
    ).flatMap((u) => asArray(obj(u).ContentUrl as unknown));
    const url = (t: string) => str(obj(urls.find((u) => obj(u).DataType === t)).Url);
    const novelle = str(k.NovellenBgblnummer);
    hits.push({
      risId: String(obj(meta.Technisch).ID),
      gesetzesnummer: String(k.Gesetzesnummer ?? ""),
      lawShort: str(k.Abkuerzung) ?? "",
      lawTitle: str(br.Kurztitel) ?? "",
      provision: str(k.ArtikelParagraphAnlage) ?? "",
      paragraphNumber: String(k.Paragraphnummer ?? ""),
      type: str(k.Typ) ?? "",
      validFrom: str(k.Inkrafttretensdatum) ?? "",
      validTo: str(k.Ausserkrafttretensdatum),
      amendedBy: novelle ? `${str(k.NovellenPublikationsorgan) ?? "BGBl. I Nr."} ${novelle}` : null,
      promulgation: (str(k.Kundmachungsorgan) ?? "").replace(/\s+/g, " "),
      eli: str(br.Eli),
      xmlUrl: url("Xml"),
      htmlUrl: url("Html"),
      changedAt: str(obj(meta.Allgemein).Geaendert),
    });
  }
  return { total, hits };
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decode(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (m, e: string) => {
    if (e.startsWith("#x")) return String.fromCodePoint(Number.parseInt(e.slice(2), 16));
    if (e.startsWith("#")) return String.fromCodePoint(Number.parseInt(e.slice(1), 10));
    return ENTITIES[e] ?? m;
  });
}

/** Block elements that become one line of normalised text. */
const BLOCKS = new Set(["absatz", "listelem", "ueberschrift", "td", "zelle", "schlussteil"]);

/**
 * The normative text of a RIS document XML as lines: everything after the "Text" heading up
 * to the next metadata heading. Hidden page furniture (headers, footers) is outside that span.
 * Returns the paragraph heading (ueberschrift typ="para") separately.
 */
export function extractLines(xml: string): { heading: string | null; lines: string[] } {
  const start = xml.search(/<ueberschrift typ="titel"[^>]*>Text<\/ueberschrift>/);
  if (start < 0) return { heading: null, lines: [] };
  let body = xml.slice(start).replace(/^<ueberschrift[^>]*>Text<\/ueberschrift>/, "");
  const end = body.search(/<ueberschrift typ="titel"/);
  if (end >= 0) body = body.slice(0, end);
  body = body
    .replace(/<gdash\s*\/>/g, "-")
    .replace(/<tab[^>]*\/>/g, " ")
    .replace(/<symbol[^>]*>([\s\S]*?)<\/symbol>/g, "$1 ");
  const lines: string[] = [];
  let heading: string | null = null;
  let depth = 0;
  let current = "";
  let currentHeading: string | null = null;
  const flush = () => {
    const text = plainDashes(decode(current)).replace(/\s+/g, " ").trim();
    // Headings are not body text: the paragraph heading (typ="para") becomes the provision
    // heading; structural ones ("ABSCHNITT II.", "2. Unterabschnitt") are dropped.
    if (text && currentHeading) {
      if (currentHeading === "para" && heading === null && lines.length === 0) heading = text;
    } else if (text) lines.push(text);
    current = "";
    currentHeading = null;
  };
  for (const m of body.matchAll(/<(\/?)([a-zA-Z0-9_]+)([^>]*?)(\/?)>|([^<]+)/g)) {
    const [, close, tag, attrs, selfClose, text] = m;
    if (text !== undefined) {
      if (depth > 0) current += text;
      continue;
    }
    const name = (tag ?? "").toLowerCase();
    if (!BLOCKS.has(name) || selfClose) continue;
    if (!close) {
      if (depth === 0) {
        flush();
        currentHeading =
          name === "ueberschrift" ? (/typ="([^"]*)"/.exec(attrs ?? "")?.[1] ?? "other") : null;
      } else current += " ";
      depth++;
    } else {
      depth = Math.max(0, depth - 1);
      if (depth === 0) flush();
    }
  }
  flush();
  return { heading, lines };
}

/** "(1)", "§ 342. (1)", "Artikel 5. (2)" style Absatz openers. */
const ABSATZ = /^(?:(?:§|Art\.?|Artikel)\s*\d+[a-z]*\.?\s*)?\((\d+[a-z]?)\)\s/;

export type Absatz = { label: string | null; text: string; start: number; end: number };

/**
 * Groups lines into Absätze. A line that opens with "(n)" starts a new Absatz; list items and
 * continuation lines join the open one. A provision without numbered Absätze is one segment.
 * Offsets index into the normalised text (lines joined with "\n"), so a citation can point
 * at the exact span (FR-P7).
 */
export function segmentAbsaetze(lines: string[]): { text: string; absaetze: Absatz[] } {
  const text = lines.join("\n");
  const absaetze: Absatz[] = [];
  let offset = 0;
  for (const line of lines) {
    const m = ABSATZ.exec(line);
    const last = absaetze.at(-1);
    if (m || !last) {
      absaetze.push({
        label: m?.[1] ?? null,
        text: line,
        start: offset,
        end: offset + line.length,
      });
    } else {
      last.text += `\n${line}`;
      last.end = offset + line.length;
    }
    offset += line.length + 1;
  }
  return { text, absaetze };
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Archive id of a provision: ("ÄrzteG", "§ 52b") -> "law-aerzteg-52b". */
export function lawSourceId(lawKey: string, provision: string): string {
  return `law-${slug(lawKey)}-${provisionSlug(provision)}`;
}

/** "§ 342" -> "342", "Art. 5" -> "art-5", for ids. */
export function provisionSlug(provision: string): string {
  const p = provision.replace(/\s+/g, " ").trim();
  const art = /^Art(?:ikel|\.)?\s*(.+)$/i.exec(p);
  const core = art ? `art-${art[1]}` : p.replace(/^§\s*/, "");
  return slug(core);
}

/**
 * As-of rule for law versions: the version in force on `asOf` is the one whose validFrom is on
 * or before it and whose validTo is absent or on or after it. Among several matches (RIS keeps
 * overlapping records after corrections) the latest validFrom wins. Null if none was in force.
 */
export function versionAsOf<V extends { validFrom: string; validTo: string | null }>(
  versions: V[],
  asOf: string,
): V | null {
  let best: V | null = null;
  for (const v of versions) {
    if (!v.validFrom || v.validFrom > asOf) continue;
    if (v.validTo && v.validTo < asOf) continue;
    if (!best || v.validFrom > best.validFrom) best = v;
  }
  return best;
}

export type LawExtras = {
  lawKey: string;
  lawTitle: string;
  provision: string;
  heading: string | null;
  risId: string;
  gesetzesnummer: string;
  validFrom: string;
  validTo: string | null;
  amendedBy: string | null;
  promulgation: string;
  versions: LawVersion[];
  retrievedAt: string;
};

export type LawRows = { source: Source & { law: LawExtras }; segments: Segment[] };

/** Builds the Source (kind "law") and its Absatz segments for one provision. */
export function buildLawRows(
  lawKey: string,
  hit: RisHit,
  xml: string,
  versions: LawVersion[],
  retrievedAt: string,
  corpusRevision: string,
): LawRows | null {
  const { heading, lines } = extractLines(xml);
  if (!lines.length) return null;
  const { absaetze } = segmentAbsaetze(lines);
  const provision = hit.provision.replace(/\s+/g, " ");
  const title = `${lawKey} ${provision}`;
  const id = lawSourceId(lawKey, provision);
  const legalRef = `${provision} ${lawKey}, ${hit.promulgation}`;
  const source = {
    id,
    kind: "law" as const,
    institution: {
      code: "ris",
      nameDe: "Bundesrecht (RIS)",
      glossEn: "Federal law, consolidated",
      role: "legislature" as const,
    },
    date: hit.validFrom,
    datePrecision: "day" as const,
    outlet: null,
    title,
    legalRef,
    url: hit.eli ? hit.eli.replace("https://ris.bka.gv.at/", "https://www.ris.bka.gv.at/") : null,
    licence: RIS_LICENCE,
    personFiltered: true as const,
    corpusRevision,
    law: {
      lawKey,
      lawTitle: hit.lawTitle,
      provision,
      heading,
      risId: hit.risId,
      gesetzesnummer: hit.gesetzesnummer,
      validFrom: hit.validFrom,
      validTo: hit.validTo,
      amendedBy: hit.amendedBy,
      promulgation: hit.promulgation,
      versions: [...versions].sort((a, b) => a.validFrom.localeCompare(b.validFrom)),
      retrievedAt,
    },
  };
  const used = new Set<string>();
  const segments: Segment[] = absaetze
    .map((a, i) => {
      // Absatz label as the id suffix ("#2" = Abs. 2), ordinal when missing or repeated.
      const key = a.label && !used.has(a.label) ? a.label : `s${i + 1}`;
      used.add(key);
      return { key, a, i };
    })
    .map(({ key, a, i }) => ({
      id: `${id}#${key}`,
      sourceId: id,
      ordinal: i + 1,
      start: a.start,
      end: a.end,
      text: a.text,
      textEn: null,
    }));
  return { source, segments };
}
