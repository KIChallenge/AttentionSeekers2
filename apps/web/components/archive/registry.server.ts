// Historical episodes (W-48) from forecasting/data/registry.jsonl + episodes.jsonl, and the
// statistics catalogue (W-49) from data/STATS.md. Read-only, cached per process. Server-only.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { replayDir } from "@/lib/runs";

const repoRoot = path.resolve(/*turbopackIgnore: true*/ replayDir(), "..");

export interface RegistryLink {
  bill: string;
  doktyp: string;
  title: string;
  einlangen: string | null;
  third_reading: string | null;
  br_date: string | null;
  bgbl: string[];
  vote_text: string | null;
  changed_in_committee: boolean | null;
  changed_in_plenum: boolean | null;
  url: string | null;
}

export interface RegistryCase {
  case_id: string;
  episode_id: string;
  me_citation: string;
  gp: string;
  me_inr: number;
  title: string;
  first_draft_date: string;
  begutachtung_end: string | null;
  ressort: string;
  ressort_name: string;
  coalition: string;
  n_stellungnahmen: number;
  themen: string[];
  schlagworte: string[];
  measure_class: string;
  me_url: string;
  links: RegistryLink[];
  vfgh_repeals: Array<Record<string, unknown>>;
  decision_date: string | null;
  outcome: string;
  label_basis: string | null;
  text_similarity: number | null;
  knowable_date: string | null;
  censored: boolean;
  outcome_record: { source: string; identifier: string; url: string | null } | null;
}

export interface Episode {
  episode_id: string;
  members: string[];
  lead_case: string;
  title: string;
  first_draft_date: string;
  gp: string;
  ressort: string;
  coalition: string;
  n_stellungnahmen: number;
  measure_class: string;
  outcome: string;
  fr_j1a_label: string;
  censored: boolean;
  knowable_date: string | null;
  vote_text: string | null;
  text_similarity: number | null;
}

async function jsonl<T>(rel: string): Promise<T[]> {
  const file = path.join(/*turbopackIgnore: true*/ repoRoot, rel);
  if (!existsSync(file)) return [];
  return (await readFile(file, "utf8"))
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);
}

let reg: { cases: Map<string, RegistryCase>; episodes: Map<string, Episode> } | null = null;

export async function registry() {
  if (reg) return reg;
  const cases = await jsonl<RegistryCase>("forecasting/data/registry.jsonl");
  const episodes = await jsonl<Episode>("forecasting/data/episodes.jsonl");
  reg = {
    cases: new Map(cases.map((c) => [c.case_id, c])),
    episodes: new Map(episodes.map((e) => [e.episode_id, e])),
  };
  return reg;
}

export async function getEpisode(id: string) {
  const r = await registry();
  const ep = r.episodes.get(id);
  if (!ep) return null;
  const cases = ep.members.flatMap((m) => r.cases.get(m) ?? []);
  return { episode: ep, cases };
}

export async function caseForDraftLaw(caseId: string) {
  return (await registry()).cases.get(caseId) ?? null;
}

export async function listEpisodes() {
  return [...(await registry()).episodes.values()].sort((a, b) =>
    b.first_draft_date.localeCompare(a.first_draft_date),
  );
}

// ---------------- statistics catalogue ----------------

export interface StatSeries {
  id: string;
  dir: string;
  publisher: string;
  licence: string;
  contains: string;
  coverage: string;
  format: string;
  url: string | null;
}

let stats: { series: StatSeries[]; preamble: string[]; notes: string[] } | null = null;

function cell(s: string) {
  return s.replace(/\*\*/g, "").replace(/`/g, "").trim();
}

export function statId(dir: string): string {
  return dir
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export async function statsCatalogue() {
  if (stats) return stats;
  const file = path.join(/*turbopackIgnore: true*/ repoRoot, "data/STATS.md");
  const series: StatSeries[] = [];
  const preamble: string[] = [];
  const notes: string[] = [];
  if (existsSync(file)) {
    let section: "pre" | "table" | "notes" = "pre";
    for (const line of (await readFile(file, "utf8")).split("\n")) {
      if (line.startsWith("## ")) {
        section = "notes";
        continue;
      }
      if (line.startsWith("|")) {
        const cells = line.split("|").slice(1, -1);
        if (cells.length < 7 || /^\s*-+/.test(cells[0] ?? "") || /Source \(dir\)/.test(line))
          continue;
        const [dir, publisher, licence, contains, coverage, format, url] = cells.map(cell);
        series.push({
          id: statId(dir ?? ""),
          dir: dir ?? "",
          publisher: publisher ?? "",
          licence: licence ?? "",
          contains: contains ?? "",
          coverage: coverage ?? "",
          format: format ?? "",
          url: url?.startsWith("http") ? url : null,
        });
        section = "table";
        continue;
      }
      if (section === "pre" && line.trim() && !line.startsWith("#")) preamble.push(line.trim());
      if (section === "notes" && line.startsWith("- ")) notes.push(cell(line.slice(2)));
    }
  }
  stats = { series, preamble, notes };
  return stats;
}
