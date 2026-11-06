// In-context persona (FR-C1..C4 without fine-tuning): the institution's dossier as part of the
// agent system prompt. SV_PERSONA_MODE=dossier|profile switches it; profile = the agents.json
// profile only (the behaviour before dossiers). Dossiers are built by
// models/scripts/build_dossiers.py from pre-2023 training-split data, person-free and guarded.
import { readFileSync } from "node:fs";
import path from "node:path";
import { catalogAgent } from "@sv/contracts";

export type PersonaMode = "dossier" | "profile";
export interface PersonaInfo {
  /** Mode actually used for this agent (dossier falls back to profile when no dossier exists). */
  mode: PersonaMode;
  version: string | null;
  sha256: string | null;
}

/**
 * Default when SV_PERSONA_MODE is unset: the arm that won the held-out eval overall
 * (models/out/eval_dossier.md).
 */
export const DEFAULT_PERSONA_MODE: PersonaMode = "dossier";

const here = path.dirname(new URL(import.meta.url).pathname);
export const DOSSIER_DIR = path.resolve(here, "../../config/dossiers");

interface DossierIndex {
  version: string;
  cutoff: string;
  dossiers: Record<string, { sha256: string; chars: number; tokens_est: number }>;
}

let indexCache: DossierIndex | null | undefined;
const textCache = new Map<string, string | null>();

function readIndex(): DossierIndex | null {
  if (indexCache !== undefined) return indexCache;
  try {
    indexCache = JSON.parse(readFileSync(path.join(DOSSIER_DIR, "index.json"), "utf8"));
  } catch {
    indexCache = null;
  }
  return indexCache ?? null;
}

export function personaMode(env: NodeJS.ProcessEnv = process.env): PersonaMode {
  const v = env.SV_PERSONA_MODE?.trim().toLowerCase();
  if (v === "dossier" || v === "profile") return v;
  if (v) console.warn(`SV_PERSONA_MODE=${v} unknown, using ${DEFAULT_PERSONA_MODE}`);
  return DEFAULT_PERSONA_MODE;
}

/** Contract role of an engine agent id (gm, sv, ak, ...), or the id itself. */
export function roleOf(agentId: string): string {
  return catalogAgent(agentId)?.role ?? agentId;
}

/** The dossier text for an agent, or null when its institution has none. */
export function dossierText(agentId: string): string | null {
  const role = roleOf(agentId);
  if (!/^[a-z_]+$/.test(role)) return null;
  if (!textCache.has(role)) {
    let t: string | null = null;
    try {
      t = readFileSync(path.join(DOSSIER_DIR, `${role}.md`), "utf8").trim();
    } catch {
      t = null;
    }
    textCache.set(role, t);
  }
  return textCache.get(role) ?? null;
}

export function personaOf(agentId: string, mode: PersonaMode = personaMode()): PersonaInfo {
  if (mode === "profile" || !dossierText(agentId))
    return { mode: "profile", version: null, sha256: null };
  const idx = readIndex();
  const entry = idx?.dossiers[roleOf(agentId)];
  return { mode: "dossier", version: idx?.version ?? null, sha256: entry?.sha256 ?? null };
}

/** Block appended to the agent system prompt; empty in profile mode or without a dossier. */
export function personaBlock(agentId: string, mode: PersonaMode = personaMode()): string {
  if (personaOf(agentId, mode).mode !== "dossier") return "";
  const text = dossierText(agentId) ?? "";
  return [
    "Persona-Dossier deiner Institution (Hintergrund aus Stellungnahmen und Pressepositionen bis Ende 2022; argumentiere in diesem Sinn, zitiere es nicht, nenne keine Quellenkennungen; das aktuelle Mandat und neue Belege haben Vorrang):",
    text.replace(/^# .*\n+/, ""),
  ].join("\n");
}
