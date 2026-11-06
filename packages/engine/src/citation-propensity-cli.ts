// Measures each institution's historical citation habit and writes config/citation-style.json.
// Usage: pnpm --filter @sv/engine citation:measure   (needs DATABASE_URL, reads masked text only)
import { writeFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { type CitationStyle, isSubstantive, markersOf, tierOf } from "./citation-style.ts";
import { ENGINE_ROOT } from "./config.ts";

/** Corpus institution codes per agent (Stellungnahmen and press positions). */
export const CODES: Record<string, { sn: string[]; press: string[] }> = {
  gm: { sn: ["bmsgpk"], press: ["GM"] },
  sv: {
    sn: ["sv_dachverband", "sv_oegk_gkk", "sv_auva", "sv_bvaeb", "sv_pva", "sv_svs"],
    press: ["SV"],
  },
  ak: { sn: ["oeak", "aek_land"], press: ["ÄK"] },
  va: { sn: ["contract_physicians"], press: ["VÄ", "WA"] },
  ka: { sn: ["hospitals_land", "hospitals_other"], press: ["KA"] },
  pf: { sn: ["nursing_oegkv", "nursing_other", "nursing_union"], press: ["PF"] },
  bl: {
    sn: [
      "laender_vst",
      "land_bgld",
      "land_ktn",
      "land_noe",
      "land_ooe",
      "land_sbg",
      "land_stmk",
      "land_tirol",
      "land_vbg",
      "land_wien",
    ],
    press: ["BL"],
  },
  pv: { sn: ["patients_pa", "patients_selbsthilfe", "patients_vertretungsnetz"], press: ["PV"] },
  fm: { sn: ["bmf"], press: ["FM"] },
  nr: { sn: [], press: [] },
  ph: { sn: ["goeg"], press: [] },
  wk: { sn: ["wko"], press: ["WK"] },
  abk: { sn: ["ak"], press: ["AK"] },
  lk: { sn: [], press: [] },
  ind: { sn: ["iv", "pharma_industry"], press: ["IP"] },
};

const SN_WEIGHT = 0.75;

async function main() {
  const store = await import("@sv/db");
  const db = store.getDb();
  const res = await db.execute(sql`
    select s.kind, s.institution_code as code, g.text
    from sources s join segments g on g.source_id = s.id
    where s.kind in ('stellungnahme', 'press')`);
  const rows = res.rows as Array<{ kind: string; code: string; text: string }>;
  type Acc = { n: number; any: number; legal: number; figures: number; studies: number };
  const acc = new Map<string, Acc>();
  for (const r of rows) {
    if (!isSubstantive(r.text)) continue;
    const key = `${r.kind}:${r.code}`;
    const a = acc.get(key) ?? { n: 0, any: 0, legal: 0, figures: 0, studies: 0 };
    const m = markersOf(r.text);
    a.n += 1;
    a.legal += Number(m.legal);
    a.figures += Number(m.figures);
    a.studies += Number(m.studies);
    a.any += Number(m.legal || m.figures || m.studies);
    acc.set(key, a);
  }
  const sum = (kind: string, codes: string[]): Acc =>
    codes.reduce(
      (t, c) => {
        const a = acc.get(`${kind}:${c}`);
        if (!a) return t;
        return {
          n: t.n + a.n,
          any: t.any + a.any,
          legal: t.legal + a.legal,
          figures: t.figures + a.figures,
          studies: t.studies + a.studies,
        };
      },
      { n: 0, any: 0, legal: 0, figures: 0, studies: 0 },
    );
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  const raw: Record<string, Omit<CitationStyle, "tier">> = {};
  for (const [agent, codes] of Object.entries(CODES)) {
    const sn = sum("stellungnahme", codes.sn);
    const pr = sum("press", codes.press);
    const rate = (a: Acc, k: keyof Acc) => (a.n ? a[k] / a.n : null);
    const mix = (k: keyof Acc) => {
      const x = rate(sn, k);
      const y = rate(pr, k);
      if (x !== null && y !== null) return SN_WEIGHT * x + (1 - SN_WEIGHT) * y;
      return x ?? y;
    };
    const any = mix("any");
    raw[agent] = {
      propensity: any === null ? -1 : r3(any),
      legal: r3(mix("legal") ?? 0),
      figures: r3(mix("figures") ?? 0),
      studies: r3(mix("studies") ?? 0),
      nStellungnahme: sn.n,
      nPress: pr.n,
      measured: any !== null,
    };
  }
  const panel = Object.values(raw)
    .filter((x) => x.measured)
    .map((x) => x.propensity);
  const median = [...panel].sort((a, b) => a - b)[Math.floor(panel.length / 2)] ?? 0;
  const institutions: Record<string, CitationStyle> = {};
  for (const [agent, x] of Object.entries(raw)) {
    const p = x.measured ? x.propensity : median;
    institutions[agent] = { ...x, propensity: p, tier: x.measured ? tierOf(p, panel) : "medium" };
  }
  const out = {
    $comment:
      "Citation propensity per institution (prompt style only, never a gate). Method: every segment of the masked Stellungnahmen corpus (kind stellungnahme) and the press positions (kind press) in the DB with at least 8 words is checked for three reference families: legal (§ n, Art. n, Abs. n, ASVG, B-KUVG, GSBG, KAKuG, ÄrzteG, B-VG), figures (number with unit: %, Prozent, Mio, Mrd, EUR, Euro, Personen, Betten, Stellen, Tage, Wochen, Monate) and studies/reports (Studie, Bericht, Rechnungshof, laut, Statistik, Erhebung, Evaluierung, OECD, Daten, Analyse, Gutachten, Prognose). Rates are shares of segments with at least one marker; propensity = 0.75 x Stellungnahmen rate + 0.25 x press rate (press positions are journalist paraphrases, so they weigh less; either alone when only one exists). tier = tertile over the measured institutions (high, medium, low). nr and lk have no corpus texts: panel median, tier medium, measured false. Regenerate with pnpm --filter @sv/engine citation:measure.",
    method: {
      minWords: 8,
      stellungnahmeWeight: SN_WEIGHT,
      codes: CODES,
      generatedAt: new Date().toISOString().slice(0, 10),
    },
    institutions,
  };
  writeFileSync(
    path.join(ENGINE_ROOT, "config/citation-style.json"),
    `${JSON.stringify(out, null, 2)}\n`,
  );
  for (const [a, x] of Object.entries(institutions))
    console.log(
      `${a.padEnd(4)} ${x.propensity.toFixed(3)} ${x.tier.padEnd(6)} legal ${x.legal} fig ${x.figures} stud ${x.studies} n=${x.nStellungnahme}/${x.nPress}`,
    );
  await store.closeDb();
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
