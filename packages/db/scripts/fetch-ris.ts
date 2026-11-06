// pnpm --filter @sv/db legal:fetch   fetches the legal basis from the RIS OGD API (Bundesrecht
// konsolidiert) and writes data/derived/law_sources.jsonl + law_segments.jsonl for db:import.
// Polite: one request every 2 s (RIS OGD FAQ: at most 0.5 per second, no parallel requests),
// every response cached under data/cache/ris so reruns hit the network only for new documents.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  buildLawRows,
  type LawRows,
  type LawVersion,
  parseSearch,
  RIS_API,
  type RisHit,
} from "../src/legal/ris.ts";
import { LAW_TARGETS, type LawTarget } from "../src/legal/targets.ts";

const root = path.resolve(import.meta.dirname, "../../..");
const cacheDir = path.join(root, "data/cache/ris");
const outDir = path.join(root, "data/derived");
mkdirSync(cacheDir, { recursive: true });
const today = new Date().toISOString().slice(0, 10);
const asOf = process.env.SV_LAW_AS_OF ?? today;
const UA = "sv-ki-challenge hackathon prototype (RIS OGD, polite 0.5 rps)";

let last = 0;
async function cached(url: string, ext: string): Promise<string> {
  const file = path.join(cacheDir, `${createHash("sha1").update(url).digest("hex")}.${ext}`);
  if (existsSync(file)) return readFileSync(file, "utf8");
  const wait = last + 2000 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const body = await res.text();
  writeFileSync(file, body);
  return body;
}

async function search(target: LawTarget, from: number | null, to: number | null, current: boolean) {
  const hits: RisHit[] = [];
  for (let page = 1; page <= 10; page++) {
    const q = new URLSearchParams({
      Applikation: "BrKons",
      Gesetzesnummer: target.gesetzesnummer,
      DokumenteProSeite: "OneHundred",
      Seitennummer: String(page),
    });
    if (from !== null) {
      q.set("Abschnitt.Von", String(from));
      q.set("Abschnitt.Bis", String(to ?? from));
      q.set("Abschnitt.Typ", target.unit === "Artikel" ? "Artikel" : "Paragraph");
    }
    if (current) q.set("Fassung.FassungVom", asOf);
    const r = parseSearch(JSON.parse(await cached(`${RIS_API}?${q}`, "json")));
    hits.push(...r.hits);
    if (page * 100 >= r.total || !r.hits.length) break;
  }
  return hits;
}

/** Keeps real provisions: drops the "§ 0" title records and anything outside the target list. */
function wanted(target: LawTarget, h: RisHit): boolean {
  if (!h.provision || /^(§|Art\.?)\s*0$/.test(h.provision)) return false;
  if (target.exclude?.test(h.provision.replace(/\s+/g, " "))) return false;
  if (!target.only) return true;
  return target.only.includes(h.provision.replace(/\s+/g, " "));
}

const rows: LawRows[] = [];
for (const target of LAW_TARGETS) {
  const ranges = target.ranges ?? [[null, null] as [null, null]];
  const current: RisHit[] = [];
  const history: RisHit[] = [];
  for (const [from, to] of ranges) {
    current.push(...(await search(target, from, to, true)));
    history.push(...(await search(target, from, to, false)));
  }
  const byProvision = new Map<string, RisHit>();
  for (const h of current.filter((h) => wanted(target, h))) {
    const prev = byProvision.get(h.provision);
    if (!prev || h.validFrom > prev.validFrom) byProvision.set(h.provision, h);
  }
  let n = 0;
  for (const hit of byProvision.values()) {
    if (!hit.xmlUrl) continue;
    const versions: LawVersion[] = history
      .filter((v) => v.provision === hit.provision)
      .map((v) => ({
        risId: v.risId,
        validFrom: v.validFrom,
        validTo: v.validTo,
        amendedBy: v.amendedBy,
      }));
    if (!versions.some((v) => v.risId === hit.risId))
      versions.push({
        risId: hit.risId,
        validFrom: hit.validFrom,
        validTo: hit.validTo,
        amendedBy: hit.amendedBy,
      });
    const xml = await cached(hit.xmlUrl, "xml");
    const built = buildLawRows(target.key, hit, xml, versions, today, `ris-${asOf}`);
    if (built) {
      rows.push(built);
      n++;
    }
  }
  console.log(`${target.key}: ${n} provisions`);
}

rows.sort((a, b) => a.source.id.localeCompare(b.source.id, "de", { numeric: true }));
writeFileSync(
  path.join(outDir, "law_sources.jsonl"),
  `${rows.map((r) => JSON.stringify(r.source)).join("\n")}\n`,
);
writeFileSync(
  path.join(outDir, "law_segments.jsonl"),
  `${rows.flatMap((r) => r.segments.map((s) => JSON.stringify(s))).join("\n")}\n`,
);
console.log(
  `law: ${rows.length} provisions, ${rows.reduce((n, r) => n + r.segments.length, 0)} segments (as of ${asOf})`,
);
