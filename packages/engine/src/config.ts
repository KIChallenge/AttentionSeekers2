// Data-file configuration (NFR-3, FR-A7): agent profiles, red lines, template seeds.
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  type AgentConfig,
  type Axis,
  catalogAgent,
  type LocalizedText,
  modelFamily,
  type RedLine,
  type ScheduledEvent,
  type Topic,
  type VetoStatus,
} from "@sv/contracts";
import { personaOf } from "./persona/index.ts";

const here = path.dirname(new URL(import.meta.url).pathname);
export const ENGINE_ROOT = path.resolve(here, "..");
export const REPO_ROOT = path.resolve(ENGINE_ROOT, "../..");

type Bi = { de: string; en: string };
export interface Profile {
  unit: string;
  vetoStatus: VetoStatus;
  vetoBasis: Bi;
  goals: Bi[];
  interests: Bi[];
  restrictions: Bi[];
  budget: Bi[];
  priorities: Array<Bi & { weight: number }>;
  temperament: [number, number, number, number];
  register: string;
  keywords: string;
  redLineIds: string[];
  /** Fictional, unnamed functional roles (CON-1/CON-2); the first one leads. */
  delegates?: DelegateDef[];
}
export interface DelegateDef {
  id: string;
  role: Bi;
  /** Topic keys this delegate covers in focused exchanges; empty for the lead. */
  topicKeys: string[];
}
export interface RedLineDef {
  id: string;
  agentId: string;
  role: RedLine["role"];
  tier: RedLine["tier"];
  de: string;
  en: string;
  topicKeys: string[];
  basisSourceId: string | null;
}
interface TemplateSeed {
  decisionRule: "consensus" | "qualified_majority" | "veto_players";
  /** Quorum for qualified_majority, and for veto_players when set (default: simple majority). */
  qualifiedMajority?: { needed: number; of: number };
  /**
   * Per-template profile overrides (historical backtests): a 2018 seat must not carry the
   * 2026 profile. Merged over agents.json while the template is active; redLineIds here
   * also limits which red lines apply.
   */
  profiles?: Record<string, Partial<Profile>>;
  roundLimit: number;
  budgetCeilingPct: number;
  agents: string[];
  topics: Array<{ id: string; key: string; label: Bi; measure: Bi }>;
  axes: Array<{ id: "x" | "y"; label: Bi; poles: [Bi, Bi]; topicWeights: Record<string, number> }>;
  scheduledEvents: Array<{
    id: string;
    atRound: number;
    kind: ScheduledEvent["kind"];
    title: Bi;
    body: Bi;
    sourceId: string | null;
    sourceSegmentId: string | null;
  }>;
}

const read = <T>(file: string): T =>
  JSON.parse(readFileSync(path.join(ENGINE_ROOT, "config", file), "utf8")) as T;

const agentsFile = read<{ agents: Record<string, Profile>; redLines: RedLineDef[] }>("agents.json");
const templatesFile = read<Record<string, TemplateSeed>>("templates.json");

export const L = (de: string, en?: string): LocalizedText => ({
  lang: "de",
  text: de,
  translations: en ? { en } : {},
});
export const bi = (b: Bi): LocalizedText => L(b.de, b.en);

let activeTemplate: string | null = null;

/** Selects the template whose profile overrides apply (one run per process). */
export function setActiveTemplate(template: string | null): void {
  activeTemplate = template;
}

const overrideOf = (agentId: string): Partial<Profile> | undefined =>
  activeTemplate ? templatesFile[activeTemplate]?.profiles?.[agentId] : undefined;

export function profileOf(agentId: string): Profile {
  const base = baseProfileOf(agentId);
  const o = overrideOf(agentId);
  return o ? { ...base, ...o } : base;
}

function baseProfileOf(agentId: string): Profile {
  const p = agentsFile.agents[agentId];
  if (p) return p;
  const c = catalogAgent(agentId);
  return {
    unit: c?.nameDe ?? agentId,
    vetoStatus: "consultative",
    vetoBasis: { de: "Keine formale Entscheidungsmacht", en: "No formal decision power" },
    goals: [],
    interests: [],
    restrictions: [],
    budget: [],
    priorities: [],
    temperament: [0.5, 0.5, 0.5, 0.5],
    register: "sachlich",
    keywords: c?.nameDe ?? "",
    redLineIds: [],
  };
}

/** At most three delegates; an institution without config gets a lead only. */
export function delegatesOf(agentId: string): DelegateDef[] {
  const list = profileOf(agentId).delegates;
  if (list?.length) return list.slice(0, 3);
  return [
    {
      id: `${agentId}-lead`,
      role: { de: "Verhandlungsführung", en: "Lead negotiator" },
      topicKeys: [],
    },
  ];
}

export function redLinesOf(agentId: string): RedLineDef[] {
  const only = overrideOf(agentId)?.redLineIds;
  return agentsFile.redLines.filter((r) => r.agentId === agentId && (!only || only.includes(r.id)));
}

export function allRedLines(): RedLineDef[] {
  return agentsFile.redLines;
}

export function redLineEntity(r: RedLineDef, segmentOf?: (sourceId: string) => string): RedLine {
  return {
    id: r.id,
    role: r.role,
    text: L(r.de, r.en),
    basis: r.basisSourceId
      ? {
          sourceId: r.basisSourceId,
          segmentId: segmentOf?.(r.basisSourceId) ?? `${r.basisSourceId}-s1`,
          start: null,
          end: null,
          recencyWeight: 1,
        }
      : null,
    tier: r.tier,
    topicKeys: r.topicKeys,
  };
}

export function templateSeed(template: string): TemplateSeed | null {
  const seed = templatesFile[template];
  return seed && typeof seed === "object" ? seed : null;
}

export function seedTopics(seed: TemplateSeed): Topic[] {
  return seed.topics.map((t) => ({
    id: t.id,
    key: t.key,
    label: bi(t.label),
    measure: bi(t.measure),
  }));
}

export function seedAxes(seed: TemplateSeed): [Axis, Axis] {
  const [x, y] = seed.axes.map((a) => ({
    id: a.id,
    label: bi(a.label),
    poles: [bi(a.poles[0]), bi(a.poles[1])] as [LocalizedText, LocalizedText],
    topicWeights: a.topicWeights,
  }));
  if (!x || !y) throw new Error("template needs two axes");
  return [x, y];
}

export function seedEvents(seed: TemplateSeed): ScheduledEvent[] {
  return seed.scheduledEvents.map((e) => ({
    id: e.id,
    atRound: e.atRound,
    kind: e.kind,
    title: bi(e.title),
    body: bi(e.body),
    sourceRef:
      e.sourceId && e.sourceSegmentId
        ? {
            sourceId: e.sourceId,
            segmentId: e.sourceSegmentId,
            start: null,
            end: null,
            recencyWeight: 1,
          }
        : null,
  }));
}

/** AgentConfig snapshot for run.started (FR-A1, FR-C7). */
export function agentConfigOf(
  agentId: string,
  temperament?: {
    concession: number;
    assertiveness: number;
    coalitionAppetite: number;
    riskTolerance: number;
  },
): AgentConfig {
  const c = catalogAgent(agentId);
  const p = profileOf(agentId);
  const [concession, assertiveness, coalitionAppetite, riskTolerance] = p.temperament;
  return {
    id: agentId,
    role: c?.role ?? "other",
    institution: { nameDe: c?.nameDe ?? agentId, glossEn: c?.glossEn ?? agentId, unit: p.unit },
    mode: c?.mode ?? "prompted",
    goals: p.goals.map(bi),
    interests: p.interests.map(bi),
    restrictions: p.restrictions.map(bi),
    budgetConstraints: p.budget.map(bi),
    priorities: p.priorities.map((x) => ({ label: L(x.de, x.en), weight: x.weight })),
    redLineIds: p.redLineIds,
    temperament: {
      concession: temperament?.concession ?? concession,
      assertiveness: temperament?.assertiveness ?? assertiveness,
      coalitionAppetite: temperament?.coalitionAppetite ?? coalitionAppetite,
      riskTolerance: temperament?.riskTolerance ?? riskTolerance,
      modelBaselineConcession: null,
      correctedConcession: null,
      inertnessChecked: false,
    },
    color: c?.color ?? "var(--c-opt)",
    code: c?.code ?? agentId.toUpperCase().slice(0, 3),
    delegates: delegatesOf(agentId).map((d) => ({ id: d.id, role: bi(d.role) })),
    persona: personaOf(agentId),
  };
}

export function defaultTemperament(agentId: string) {
  const [concession, assertiveness, coalitionAppetite, riskTolerance] =
    profileOf(agentId).temperament;
  return { concession, assertiveness, coalitionAppetite, riskTolerance };
}

export const DEFAULT_MODEL = () => process.env.SV_DEFAULT_MODEL ?? "azure/gpt-6-sol";
export const EXPERT_MODEL = () => process.env.SV_EXPERT_MODEL ?? DEFAULT_MODEL();
const hasBedrock = () =>
  Boolean(process.env.BIFROST_SEED_BEDROCK_KEY && process.env.BIFROST_SEED_BEDROCK_REGION);

/**
 * Default seat plan (FR-X1): four families across the institutions, chosen from the model
 * smoke test (docs/model-smoke.md). The gateway default keeps the moderator, the Experte and
 * the seats named "gpt"; the others go to Bedrock open-weight families. Override with
 * SV_SEAT_MODELS="gm=gpt,sv=deepseek,..." (aliases or full ids). GLM-5, Qwen3 235B and
 * Devstral 2 passed the smoke test with the shortest latency tails; DeepSeek V3.2 and Kimi
 * K2.5 were as valid but had p95 latencies of 85 to 170 s, which stalls a parallel round.
 * Qwen3 235B holds the most seats: with the institution dossier in context it was the best
 * persona arm of the held-out eval (models/out/eval_dossier.md) on in-character, stance
 * direction and within-one-step, ahead of gpt-6-sol and DeepSeek, and it was 20/20 valid
 * in the smoke test. Nova stays available as an alias but is no default: the quality audit
 * found Nova seats weakest (reply relevance, self-repetition).
 */
export const DEFAULT_SEAT_PLAN: Record<string, string> = {
  gm: "gpt",
  fm: "gpt",
  sv: "qwen",
  ak: "qwen",
  ka: "qwen",
  pf: "qwen",
  va: "glm",
  bl: "glm",
  pv: "mistral",
};

/** Seat model per institution; without Bedrock every seat uses the default model. */
export function seatModelOf(agentId: string): string {
  const override = process.env.SV_SEAT_MODELS?.split(",")
    .map((x) => x.split("=").map((y) => y.trim()))
    .find(([a]) => a === agentId)?.[1];
  const alias = override ?? DEFAULT_SEAT_PLAN[agentId] ?? "gpt";
  const model = resolveModelAlias(alias);
  return isBedrockId(model) && !hasBedrock() ? DEFAULT_MODEL() : model;
}

const isBedrockId = (m: string) => m.startsWith("bedrock/");

/**
 * Second model family (FR-X1, FR-N7): the judge of the quality audit and the fallback
 * verifier. The first Bedrock family of the seat plan unless SV_SECOND_MODEL is set.
 */
export const SECOND_MODEL = (): string | null =>
  process.env.SV_SECOND_MODEL ??
  (hasBedrock() ? resolveModelAlias(VERIFIER_FAMILIES[0] ?? "nova") : null);

/**
 * Short family names for --models and the smoke test. Bedrock ids verified on demand in
 * eu-north-1 on 2026-11-06 (Converse API, German answers).
 */
export const MODEL_ALIASES: Record<string, string> = {
  nova: "bedrock/eu.amazon.nova-pro-v1:0",
  deepseek: "bedrock/deepseek.v3.2",
  kimi: "bedrock/moonshotai.kimi-k2.5",
  qwen: "bedrock/qwen.qwen3-235b-a22b-2507-v1:0",
  "qwen-32b": "bedrock/qwen.qwen3-32b-v1:0",
  glm: "bedrock/zai.glm-5",
  "glm-flash": "bedrock/zai.glm-4.7-flash",
  mistral: "bedrock/mistral.devstral-2-123b",
  "gpt-oss": "bedrock/openai.gpt-oss-120b-1:0",
  minimax: "bedrock/minimax.minimax-m2.5",
};

/** "gpt" is the gateway default; other aliases map to Bedrock ids; full ids pass through. */
export function resolveModelAlias(m: string): string {
  if (m === "gpt" || m === "primary") return DEFAULT_MODEL();
  if (m === "second") {
    const second = SECOND_MODEL();
    if (!second) throw new Error("second model family is not configured");
    return second;
  }
  return MODEL_ALIASES[m] ?? m;
}

/**
 * Pool of second verifiers (FR-N7), in order of preference; SV_VERIFIER_MODELS overrides
 * (comma-separated aliases or ids). SV_VERIFIER_MODEL pins a single verifier as before.
 */
const VERIFIER_FAMILIES = ["glm", "qwen", "mistral"];
export const VERIFIER_POOL = (): string[] => {
  const pinned = process.env.SV_VERIFIER_MODEL;
  if (pinned) return [pinned];
  const list = (process.env.SV_VERIFIER_MODELS?.split(",") ?? VERIFIER_FAMILIES)
    .map((x) => resolveModelAlias(x.trim()))
    .filter((m) => !isBedrockId(m) || hasBedrock());
  return [...list, DEFAULT_MODEL()];
};

/**
 * Second verifier for a claim (FR-N7): never the speaker's family, and preferably not the
 * Experte's either, so the two checks and the speaker span three families when possible.
 */
export function verifierFor(speakerModel: string, expertModel: string): string {
  const pool = VERIFIER_POOL();
  const fam = modelFamily;
  return (
    pool.find((m) => fam(m) !== fam(speakerModel) && fam(m) !== fam(expertModel)) ??
    pool.find((m) => fam(m) !== fam(speakerModel)) ??
    pool[0] ??
    expertModel
  );
}
