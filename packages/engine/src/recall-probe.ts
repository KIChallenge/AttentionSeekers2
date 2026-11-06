// Recall probe for the SV-OG 2018 backtest (FR-H7, papers-addendum Part III T3): ask each
// seat family, without any context, what happened to the 2018 reform. A model that recalls
// the enacted law or the 2019 court ruling turns a backtest hit into weak evidence.
//
//   recall [--models gpt,qwen,glm,mistral] [--n 3] [--out runs/backtest-svog-2018-recall.json]
//
// The grading is deterministic: keyword markers over the free answer, no judge model.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { estimateCostUsd } from "@sv/contracts";
import { z } from "zod";
import { REPO_ROOT, resolveModelAlias } from "./config.ts";
import { structured } from "./llm.ts";

const { values } = parseArgs({
  options: { models: { type: "string" }, n: { type: "string" }, out: { type: "string" } },
});

export const RECALL_QUESTION =
  "Was ist mit dem 2018 in Österreich vorgelegten Sozialversicherungs-Organisationsgesetz geschehen? Antworte knapp mit dem, was du über Beschluss, Inhalt und spätere Entwicklungen weißt. Wenn du es nicht weißt, sag das.";

/** Outcome facts a model can only know from after the 2018-09-13 cutoff. */
export const RECALL_MARKERS: Record<string, RegExp> = {
  adopted: /beschlossen|verabschiedet|angenommen|in Kraft/i,
  fiveCarriers: /\bfünf\b|\b5\b/i,
  oegk: /ÖGK|Österreichische[n]? Gesundheitskasse/i,
  parity: /Parität|paritätisch/i,
  court: /Verfassungsgerichtshof|VfGH/i,
  auditRepeal:
    /(Beitragsprüfung|Prüfung)[^.]*(aufgehoben|verfassungswidrig)|(aufgehoben|verfassungswidrig)[^.]*(Beitragsprüfung|Prüfung)/i,
};

export function gradeRecall(answer: string) {
  const hits = Object.entries(RECALL_MARKERS)
    .filter(([, re]) => re.test(answer))
    .map(([k]) => k);
  // "Five carriers" was announced before the cutoff, so it alone is no outcome knowledge.
  // detail = knows the enacted structure (ÖGK) or the 2019 court ruling: contaminated.
  const detail = hits.includes("oegk") || hits.includes("court");
  const level = detail ? "outcome_detail" : hits.includes("adopted") ? "adoption_only" : "none";
  return { hits, level };
}

const Answer = z.object({ answer: z.string() });

async function main() {
  const models = (values.models ?? "gpt,qwen,glm,mistral").split(",").filter(Boolean);
  // Answers vary between samples, so each family is asked n times.
  const n = Number(values.n ?? 3);
  const jobs = models.flatMap((alias) => Array.from({ length: n }, (_, i) => ({ alias, i })));
  const results = await Promise.all(
    jobs.map(async ({ alias, i }) => {
      const model = resolveModelAlias(alias);
      try {
        const r = await structured(model, "recall_probe", Answer, [
          { role: "user", content: RECALL_QUESTION },
        ]);
        const cost = estimateCostUsd(model, r.meta) ?? 0;
        return {
          alias,
          sample: i + 1,
          model,
          answer: r.data.answer,
          ...gradeRecall(r.data.answer),
          cost,
        };
      } catch (error) {
        return {
          alias,
          sample: i + 1,
          model,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );
  const out = values.out ?? path.join(REPO_ROOT, "runs", "backtest-svog-2018-recall.json");
  const doc = { question: RECALL_QUESTION, date: new Date().toISOString().slice(0, 10), results };
  writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
  for (const r of results)
    process.stdout.write(`${r.alias}#${r.sample} ${"level" in r ? r.level : `error ${r.error}`}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) void main();
