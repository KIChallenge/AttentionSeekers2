// Picks the ElevenLabs voice per stage speaker and writes lib/stage-voices.json.
//
//   pnpm --filter @sv/web stage:voices [--write] [--add] [--designed-only] [--premade]
//                                      [--assume-paid]
//
// Free tier (or --premade): the eleven premade voices, which are the only ones the API lets a
// free account use (library voices answer 402 paid_plan_required). Paid plan: native German
// voices from the voice library, Austrian (de-AT) first where the speaker calls for it, one
// distinct voice per institution, falling back to the premade voice per speaker when nothing
// fits. Library voices are recordings of consenting speakers; the filter drops any voice whose
// name or description points at a real public figure, a celebrity, an impression or a parody,
// and any voice named with a full personal name. --designed-only keeps only voices designed by
// ElevenLabs' voice design (category "generated"), the strictest reading of "no clones".
// Listing endpoints only: this script never spends characters. --add adds the picked library
// voices to the account (some plans need that before the API accepts them). Without --write it
// only prints the table.

import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CAST, ELEVEN_PREMADE } from "../lib/stage-cast.ts";
import { EL_API, type ElevenVoice, loadEnv, type VoiceTable } from "../lib/tts-providers.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..");
const repoRoot = path.resolve(webRoot, "../..");
const out = path.join(webRoot, "lib", "stage-voices.json");

/** Premade voices from the cast (lib/stage-cast.ts), the one place seat genders are set. */
const PREMADE: Record<string, ElevenVoice> = Object.fromEntries(
  Object.entries(CAST).flatMap(([sp, c]) => {
    const v = c.eleven ? ELEVEN_PREMADE[c.eleven] : undefined;
    if (!c.eleven || !v) return [];
    return [
      [sp, { id: c.eleven, name: v.name, category: "premade", speed: c.speed, gender: c.gender }],
    ];
  }),
);

/** What each seat should sound like on a paid plan; the gender always comes from the cast. */
const AGES: Record<string, { ages: string[]; austrian: boolean }> = {
  moderator: { ages: ["middle_aged"], austrian: true },
  gm: { ages: ["middle_aged"], austrian: true },
  sv: { ages: ["middle_aged"], austrian: true },
  ak: { ages: ["old", "middle_aged"], austrian: true },
  va: { ages: ["middle_aged", "young"], austrian: false },
  ka: { ages: ["young", "middle_aged"], austrian: false },
  pf: { ages: ["middle_aged", "young"], austrian: false },
  bl: { ages: ["middle_aged", "old"], austrian: true },
  pv: { ages: ["middle_aged", "young"], austrian: false },
  fm: { ages: ["middle_aged", "old"], austrian: false },
  expert: { ages: ["middle_aged", "old"], austrian: false },
};
const WANT: Record<string, { gender: string; ages: string[]; austrian: boolean }> =
  Object.fromEntries(
    Object.entries(AGES).map(([sp, w]) => [sp, { ...w, gender: CAST[sp]?.gender ?? "male" }]),
  );
/** Registers that suit a negotiation table; entertainment and character voices do not. */
const USE_CASES = new Set(["informative_educational", "conversational", "narrative_story", ""]);

interface Shared {
  voice_id: string;
  public_owner_id: string;
  name: string;
  description?: string;
  category: string;
  gender: string;
  age: string;
  locale?: string;
  use_case?: string;
  usage_character_count_1y?: number;
  verified_languages?: Array<{ language: string; locale?: string; model_id?: string }>;
}

/** Real people, celebrities, impressions: never. Also full personal names ("Anna Muster"). */
const FORBIDDEN =
  /celebrit|famous|prominent|promi|impression|imitat|parod|politi|kanzler|minister|president|präsident|actor|schauspieler|sprecher von|stimme von|voice of|bekannt aus|like the|soundalike|clone of|synchronstimme/i;
function excluded(v: Shared): boolean {
  const title = v.name.split(/ [-\u2013] /)[0]?.trim() ?? v.name;
  const fullName = /^[A-ZÄÖÜ][a-zäöüß]+\.? [A-ZÄÖÜ][a-zäöüß]+$/.test(title);
  return fullName || FORBIDDEN.test(`${v.name} ${v.description ?? ""}`);
}

function args() {
  const a = process.argv.slice(2);
  return {
    write: a.includes("--write"),
    add: a.includes("--add"),
    designedOnly: a.includes("--designed-only"),
    premade: a.includes("--premade"),
    // preview the library pick from a free account (listing works there; rendering would not)
    assumePaid: a.includes("--assume-paid"),
  };
}

async function get<T>(key: string, url: string): Promise<T> {
  const r = await fetch(`${EL_API}${url}`, { headers: { "xi-api-key": key } });
  if (!r.ok) throw new Error(`GET ${url}: ${r.status}`);
  return (await r.json()) as T;
}

async function library(key: string, designedOnly: boolean): Promise<Shared[]> {
  const all: Shared[] = [];
  for (const locale of ["de-AT", "de-DE"]) {
    for (let page = 0; page < 3; page++) {
      const q = new URLSearchParams({
        language: "de",
        locale,
        page_size: "100",
        page: String(page),
        sort: "usage_character_count_1y",
      });
      if (designedOnly) q.set("category", "generated");
      const d = await get<{ voices: Shared[]; has_more: boolean }>(key, `/shared-voices?${q}`);
      all.push(...d.voices.filter((v) => (v.locale ?? locale).startsWith("de")));
      if (!d.has_more) break;
    }
  }
  return all.filter(
    (v) =>
      (designedOnly ? v.category === "generated" : v.category !== "famous") &&
      USE_CASES.has(v.use_case ?? "") &&
      !excluded(v),
  );
}

function pick(pool: Shared[]): Record<string, ElevenVoice> {
  const used = new Set<string>();
  const table: Record<string, ElevenVoice> = {};
  // Austrian seats first so they get the scarce de-AT voices
  const order = Object.keys(WANT).sort(
    (a, b) => Number(WANT[b]?.austrian) - Number(WANT[a]?.austrian),
  );
  for (const sp of order) {
    const w = WANT[sp];
    if (!w) continue;
    const fits = pool
      .filter((v) => !used.has(v.voice_id) && v.gender === w.gender && w.ages.includes(v.age))
      .sort((a, b) => {
        const at = (v: Shared) => (w.austrian && v.locale === "de-AT" ? 1 : 0);
        const verified = (v: Shared) =>
          v.verified_languages?.some((l) => l.language === "de") ? 1 : 0;
        return (
          at(b) - at(a) ||
          verified(b) - verified(a) ||
          (b.usage_character_count_1y ?? 0) - (a.usage_character_count_1y ?? 0)
        );
      });
    const v = fits[0];
    const fallback = PREMADE[sp];
    if (v) {
      used.add(v.voice_id);
      table[sp] = {
        id: v.voice_id,
        name: v.name.split(/ [-\u2013] /)[0]?.trim() ?? v.name,
        category: v.category,
        locale: v.locale ?? "de-DE",
        speed: fallback?.speed ?? 1,
        gender: w.gender,
      };
    } else if (fallback) {
      table[sp] = { ...fallback, locale: "de-DE" };
    }
  }
  // optional seats keep their premade voice
  for (const [sp, v] of Object.entries(PREMADE)) table[sp] ??= { ...v, locale: "de-DE" };
  return table;
}

async function main() {
  const opt = args();
  const env = loadEnv(repoRoot);
  const key = env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("no ELEVENLABS_API_KEY");
  const sub = await get<{ tier: string; voice_limit?: number }>(key, "/user/subscription");
  const free = sub.tier === "free" && !opt.assumePaid;
  let table: VoiceTable;
  if (free || opt.premade) {
    // confirm the premade ids exist on this account before writing them
    const mine = await get<{ voices: Array<{ voice_id: string }> }>(key, "/voices");
    const ids = new Set(mine.voices.map((v) => v.voice_id));
    const missing = Object.entries(PREMADE).filter(([, v]) => !ids.has(v.id));
    if (missing.length) console.warn(`premade voices missing: ${missing.map(([k]) => k)}`);
    table = {
      source: "premade",
      note: "Free tier: only premade voices work over the API. Regenerate with scripts/stage-voices.ts after an upgrade; see public/stage/VOICES.md.",
      model: "eleven_turbo_v2_5",
      voices: Object.fromEntries(
        Object.entries(PREMADE).map(([k, v]) => [k, { ...v, locale: "de-DE" }]),
      ),
    };
    console.log(`${sub.tier}: premade voices`);
  } else {
    const pool = await library(key, opt.designedOnly);
    console.log(`${sub.tier}: ${pool.length} German library voices pass the filters`);
    table = {
      source: "library",
      note: "Library voices picked by scripts/stage-voices.ts; see public/stage/VOICES.md.",
      model: "eleven_turbo_v2_5",
      voices: pick(pool),
    };
    if (opt.add) {
      const owners = new Map(pool.map((v) => [v.voice_id, v.public_owner_id]));
      for (const [sp, v] of Object.entries(table.voices)) {
        const owner = owners.get(v.id);
        if (!owner) continue;
        const r = await fetch(`${EL_API}/voices/add/${owner}/${v.id}`, {
          method: "POST",
          headers: { "xi-api-key": key, "Content-Type": "application/json" },
          body: JSON.stringify({ new_name: `SV stage ${sp}` }),
        });
        console.log(`add ${sp} ${v.id}: ${r.status}`);
      }
    }
  }
  for (const [sp, v] of Object.entries(table.voices)) {
    console.log(`  ${sp.padEnd(9)} ${v.id} ${v.name} (${v.category}, ${v.locale ?? ""})`);
  }
  if (opt.write) {
    writeFileSync(out, `${JSON.stringify(table, null, 2)}\n`);
    console.log(
      `wrote ${path.relative(repoRoot, out)}; record the change in public/stage/VOICES.md`,
    );
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
