// Data-file configuration (NFR-3, FR-A7): agent profiles, red lines, template seeds.
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  type AgentConfig,
  type Axis,
  catalogAgent,
  type LocalizedText,
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

export function profileOf(agentId: string): Profile {
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
  return agentsFile.redLines.filter((r) => r.agentId === agentId);
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
  return templatesFile[template] ?? null;
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
const hasSecondFamily = () =>
  Boolean(process.env.BIFROST_SEED_BEDROCK_KEY && process.env.BIFROST_SEED_BEDROCK_REGION);
/**
 * Second model family (FR-X1, FR-N7) via Amazon Bedrock. Nova Pro by default: the only
 * Mistral model enabled on the account (Pixtral Large) is throttled to about one request
 * per minute, far below a run's needs; set SV_SECOND_MODEL to use it anyway.
 */
export const SECOND_MODEL = (): string | null =>
  process.env.SV_SECOND_MODEL ?? (hasSecondFamily() ? "bedrock/eu.amazon.nova-pro-v1:0" : null);
/** Institutions seated on the second family by default (two-family floor, FR-X1). */
export const SECOND_FAMILY_AGENTS = (): string[] =>
  (process.env.SV_SECOND_FAMILY_AGENTS ?? "ak,pf,bl,pv")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
/** Second verifier (FR-N7): the other family when available, so the check is cross-family. */
export const VERIFIER_MODEL = () =>
  process.env.SV_VERIFIER_MODEL ?? SECOND_MODEL() ?? EXPERT_MODEL();
