// Server-only: everything the model-bias view needs for one question. Runs come from the topic
// dashboard's selection, audits from runs/<id>.quality.json, red lines from the engine config,
// persona accuracy from models/out/persona_fidelity.json, the base rate from topic-forecasts.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { computeModelBias, type ModelBias, type RedLineDef } from "./model-bias";
import { loadQualityReport } from "./quality";
import { compareRuns, familyOf, type RunColumn } from "./topic-compare";
import { historicRates, selectTopicRuns } from "./topic-runs";

const cwd = process.cwd();
const repoRoot = path.resolve(
  /*turbopackIgnore: true*/ cwd,
  cwd.endsWith(path.join("apps", "web")) ? "../.." : ".",
);

export interface PersonaEval {
  /** Share of held-out real statements whose stance sign the model reproduced (dossier prompt). */
  stanceAgreement: number;
  n: number;
}

export interface ModelBiasData {
  question: string;
  bias: ModelBias;
  runs: RunColumn[];
  /** Persona evaluation per family; families without an eval are absent. */
  persona: Record<string, PersonaEval>;
  hist: { k: number; n: number };
}

async function readJson(rel: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path.join(/*turbopackIgnore: true*/ repoRoot, rel), "utf8"));
  } catch {
    return null;
  }
}

async function redLineDefs(): Promise<RedLineDef[]> {
  const cfg = (await readJson("packages/engine/config/agents.json")) as {
    redLines?: Array<{ id: string; topicKeys?: string[] }>;
  } | null;
  return (cfg?.redLines ?? []).map((r) => ({ id: r.id, topicKeys: r.topicKeys ?? [] }));
}

type Fidelity = {
  versions?: Record<
    string,
    { model?: string; prompt?: string; all?: { n?: number; stance_sign_adapter?: number } }
  >;
};

async function personaEval(): Promise<Record<string, PersonaEval>> {
  const dir = process.env.SV_MODELS_DIR ?? "models";
  const f = (await readJson(path.join(dir, "out/persona_fidelity.json"))) as Fidelity | null;
  const out: Record<string, PersonaEval> = {};
  for (const v of Object.values(f?.versions ?? {})) {
    if (v.prompt !== "dossier" || !v.model) continue;
    const acc = v.all?.stance_sign_adapter;
    if (typeof acc === "number")
      out[familyOf(v.model)] = { stanceAgreement: acc, n: v.all?.n ?? 0 };
  }
  return out;
}

export async function loadModelBias(key: string): Promise<ModelBiasData | null> {
  const sel = await selectTopicRuns(key);
  if (!sel) return null;
  const hist = historicRates().overall;
  const histK = hist?.k ?? 0;
  const histN = hist?.n ?? 0;
  const [redLines, persona, qualities] = await Promise.all([
    redLineDefs(),
    personaEval(),
    Promise.all(sel.items.map((x) => loadQualityReport(x.summary.id))),
  ]);
  const cmp = compareRuns(key, sel.items);
  const bias = computeModelBias(
    sel.items.map((x, i) => ({
      id: x.summary.id,
      snap: x.snap,
      quality: qualities[i]?.overall.overall ?? null,
    })),
    { histRate: histN ? histK / histN : 0, redLines },
  );
  return { question: cmp.question, bias, runs: cmp.runs, persona, hist: { k: histK, n: histN } };
}
