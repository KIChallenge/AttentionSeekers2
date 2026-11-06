// Loads the persona-model track's committed results for /models (FR-C1 to C6). Every
// number on the page comes from these files; a missing file renders as a visible gap,
// not a hardcoded fallback. Server-only.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { maskPersonNames } from "@sv/engine/guard";
import { z } from "zod";
import {
  type ClassifierReport,
  type EvalReport,
  type Infra,
  type InstitutionCard,
  parseClassifierReport,
  parseEvalReport,
  parseInfra,
  parseInstitutions,
} from "./parse";

const cwd = process.cwd();
const repoRoot = path.resolve(
  /*turbopackIgnore: true*/ cwd,
  cwd.endsWith(path.join("apps", "web")) ? "../.." : ".",
);

export function modelsDir(): string {
  const dir = process.env.SV_MODELS_DIR ?? "models";
  return path.isAbsolute(dir) ? dir : path.join(/*turbopackIgnore: true*/ repoRoot, dir);
}

export const FILES = {
  eval: "out/eval_sagemaker.md",
  fidelity: "out/persona_fidelity.json",
  examples: "out/eval_examples.json",
  classifier: "cards/classifier_report.md",
  readme: "README.md",
  institutions: "configs/institutions.yaml",
} as const;

async function readText(rel: string): Promise<string | null> {
  try {
    return await readFile(path.join(/*turbopackIgnore: true*/ modelsDir(), rel), "utf8");
  } catch {
    return null;
  }
}

const VersionScores = z.object({
  n: z.number(),
  adapter: z.number().nullable(),
  baseline: z.number().nullable(),
  stance_sign_adapter: z.number(),
  stance_sign_baseline: z.number(),
  within1_adapter: z.number(),
  within1_baseline: z.number(),
});

const Fidelity = z.object({
  metric: z.string(),
  split: z.string(),
  institutions: z.record(
    z.string(),
    z.object({
      n: z.number(),
      adapter: z.number(),
      baseline: z.number(),
      stance_sign_adapter: z.number().optional(),
      stance_sign_baseline: z.number().optional(),
    }),
  ),
  all: z.object({ n: z.number(), adapter: z.number(), baseline: z.number() }),
  version: z.string().optional(),
  // v1 / v1-fix / v2 side by side, written by models/aws/eval_v2_report.py
  versions: z
    .record(
      z.string(),
      z.object({
        version: z.string(),
        run: z.string(),
        /** Display name, e.g. "Kontext-Persona (Dossier), gpt-6-sol" (models/scripts/eval_dossier.py). */
        label: z.string().optional(),
        institutions: z.record(z.string(), VersionScores),
        all: VersionScores,
      }),
    )
    .optional(),
});
export type Fidelity = z.infer<typeof Fidelity>;

const Gen = z.object({
  text: z.string(),
  inCharacter: z.number().nullable(),
  stance: z.number().nullable(),
  loops: z.boolean(),
});
const Examples = z.object({
  run: z.string(),
  rows: z.number(),
  selection: z.string(),
  examples: z.array(
    z.object({
      role: z.string(),
      draft: z.string(),
      referenceStance: z.number().nullable(),
      adapter: Gen,
      base: Gen,
    }),
  ),
});
export type EvalExample = z.infer<typeof Examples>["examples"][number];

function parseJson<T>(raw: string | null, schema: z.ZodType<T>): T | null {
  if (!raw) return null;
  try {
    const r = schema.safeParse(JSON.parse(raw));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

export interface ModelsData {
  eval: EvalReport | null;
  fidelity: Fidelity | null;
  classifier: ClassifierReport | null;
  infra: Infra | null;
  institutions: InstitutionCard[];
  examples: EvalExample[];
  missing: string[];
}

export async function loadModelsData(): Promise<ModelsData> {
  const [evalMd, fidelity, examples, classifier, readme, inst] = await Promise.all([
    readText(FILES.eval),
    readText(FILES.fidelity),
    readText(FILES.examples),
    readText(FILES.classifier),
    readText(FILES.readme),
    readText(FILES.institutions),
  ]);
  const fid = parseJson(fidelity, Fidelity);
  const ex = parseJson(examples, Examples);
  const missing = Object.entries({
    [FILES.eval]: evalMd,
    [FILES.fidelity]: fid,
    [FILES.examples]: ex,
    [FILES.classifier]: classifier,
    [FILES.readme]: readme,
    [FILES.institutions]: inst,
  })
    .filter(([, v]) => !v)
    .map(([k]) => `models/${k}`);
  // Generations pass the engine's person-name guard before they reach the page (CON-1/CON-2).
  const guarded = (ex?.examples ?? []).map((e) => ({
    ...e,
    adapter: { ...e.adapter, text: maskPersonNames(e.adapter.text) },
    base: { ...e.base, text: maskPersonNames(e.base.text) },
  }));
  return {
    eval: evalMd ? parseEvalReport(evalMd) : null,
    fidelity: fid,
    classifier: classifier ? parseClassifierReport(classifier) : null,
    infra: readme ? parseInfra(readme) : null,
    institutions: inst ? parseInstitutions(inst) : [],
    examples: guarded,
    missing,
  };
}

/** Role cards for the roles that have an adapter (the eval report's institutions). */
export async function loadRoleCards(): Promise<Map<string, InstitutionCard>> {
  const inst = await readText(FILES.institutions);
  return new Map((inst ? parseInstitutions(inst) : []).map((c) => [c.role, c]));
}
