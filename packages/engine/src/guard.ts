// CON-1 / CON-2 guard: no real person may be named or quoted. Two detectors:
//   1. an honorific, academic or office title followed by a capitalised name
//      ("Dr. Muster", "Ministerin Beispiel", "Herr Huber")
//   2. a common given name from a small gazetteer followed by a capitalised surname
//      ("Anna Beispiel")
// The gazetteer holds given names only, never a real person. Institutions such as
// "Gesundheitsministerium" never match because the title must stand alone as a word.

const TITLES = [
  "Dr\\.",
  "Dr\\.in",
  "Mag\\.",
  "Mag\\.a",
  "Prof\\.",
  "DI",
  "Dipl\\.-Ing\\.",
  "Ing\\.",
  "MMag\\.",
  "Univ\\.-Prof\\.",
  "Herr",
  "Herrn",
  "Frau",
  "Minister",
  "Ministerin",
  "Bundesminister",
  "Bundesministerin",
  "Gesundheitsminister",
  "Gesundheitsministerin",
  "Finanzminister",
  "Finanzministerin",
  "Staatssekretär",
  "Staatssekretärin",
  "Präsident",
  "Präsidentin",
  "Vizepräsident",
  "Vizepräsidentin",
  "Obmann",
  "Obfrau",
  "Bundeskanzler",
  "Bundeskanzlerin",
  "Landeshauptmann",
  "Landeshauptfrau",
  "Landesrat",
  "Landesrätin",
  "Stadtrat",
  "Stadträtin",
  "Abgeordnete",
  "Abgeordneter",
  "Generaldirektor",
  "Generaldirektorin",
  "Primar",
  "Primaria",
  "Sprecher",
  "Sprecherin",
  "Mr\\.",
  "Mrs\\.",
  "Ms\\.",
  "Minister",
];

/** Common given names (DE/AT), used only to detect "Given Surname" pairs. */
export const GIVEN_NAMES = [
  "Alexander",
  "Andrea",
  "Andreas",
  "Anna",
  "Barbara",
  "Bernhard",
  "Birgit",
  "Brigitte",
  "Christian",
  "Christine",
  "Christoph",
  "Claudia",
  "Daniel",
  "Daniela",
  "David",
  "Elisabeth",
  "Eva",
  "Florian",
  "Franz",
  "Gabriele",
  "Georg",
  "Gerald",
  "Gerhard",
  "Gernot",
  "Günter",
  "Hannes",
  "Hans",
  "Harald",
  "Heinz",
  "Helmut",
  "Herbert",
  "Ingrid",
  "Johann",
  "Johannes",
  "Josef",
  "Julia",
  "Karin",
  "Karl",
  "Katharina",
  "Klaus",
  "Leonore",
  "Manfred",
  "Margit",
  "Maria",
  "Markus",
  "Martin",
  "Martina",
  "Matthias",
  "Michael",
  "Monika",
  "Norbert",
  "Peter",
  "Petra",
  "Philipp",
  "Reinhard",
  "Renate",
  "Robert",
  "Rudolf",
  "Sabine",
  "Sebastian",
  "Stefan",
  "Stephan",
  "Susanne",
  "Thomas",
  "Ulrike",
  "Ursula",
  "Walter",
  "Werner",
  "Wolfgang",
];

const CAP = "[A-ZÄÖÜ][a-zäöüß]+(?:-[A-ZÄÖÜ][a-zäöüß]+)?";
// Words that legitimately follow a title-like token in institutional prose.
const STOP = new Set([
  "Gesundheit",
  "Finanzen",
  "Soziales",
  "Ministerium",
  "Kammer",
  "Patienten",
  "Patientin",
  "Patientinnen",
  "Bund",
  "Länder",
  "Österreich",
  "Sozialversicherung",
  "Der",
  "Die",
  "Das",
  "Den",
  "Dem",
  "Des",
  "Ein",
  "Eine",
  "Und",
  "Oder",
  "Für",
  "Mit",
  "Von",
  "Zu",
  "Im",
  "In",
  "Am",
  "An",
]);

const TITLE_RE = new RegExp(
  `(?<![\\p{L}])(?:${[...new Set(TITLES)].join("|")})\\s+(${CAP}(?:\\s+${CAP})?)`,
  "gu",
);
const GIVEN_RE = new RegExp(`(?<![\\p{L}])(?:${GIVEN_NAMES.join("|")})\\s+(${CAP})`, "gu");

export interface NameHit {
  match: string;
  index: number;
  rule: "title" | "given_name";
}

/** Returns every person-name pattern found in the text. */
export function findPersonNames(text: string): NameHit[] {
  const hits: NameHit[] = [];
  for (const m of text.matchAll(TITLE_RE)) {
    const name = m[1] ?? "";
    const first = name.split(/\s+/)[0] ?? "";
    if (STOP.has(first)) continue;
    hits.push({ match: m[0], index: m.index ?? 0, rule: "title" });
  }
  for (const m of text.matchAll(GIVEN_RE)) {
    const surname = m[1] ?? "";
    if (STOP.has(surname)) continue;
    if (hits.some((h) => h.index === m.index)) continue;
    hits.push({ match: m[0], index: m.index ?? 0, rule: "given_name" });
  }
  return hits.sort((a, b) => a.index - b.index);
}

export const hasPersonName = (text: string) => findPersonNames(text).length > 0;

/** Replaces every hit with an institutional placeholder. */
export function maskPersonNames(text: string, placeholder = "[Institution]"): string {
  const hits = findPersonNames(text);
  if (hits.length === 0) return text;
  let out = "";
  let last = 0;
  for (const h of hits) {
    if (h.index < last) continue;
    out += text.slice(last, h.index) + placeholder;
    last = h.index + h.match.length;
  }
  return out + text.slice(last);
}

/** Walks any JSON value and masks names in every string; returns the count of masked strings. */
export function maskDeep<T>(value: T): { value: T; masked: number } {
  let masked = 0;
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") {
      if (!hasPersonName(v)) return v;
      masked++;
      return maskPersonNames(v);
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) out[k] = walk(x);
      return out;
    }
    return v;
  };
  const out = walk(value) as T;
  return { value: out, masked };
}
