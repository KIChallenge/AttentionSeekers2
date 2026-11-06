// Recall probe for the historical backtests (FR-H7, papers-addendum Part III T3): ask each
// seat family, without any context, what happened to the reform. A model that recalls the
// enacted law or later rulings turns a backtest hit into weak evidence.
//
//   recall [--episode svog|gtelg] [--models gpt,qwen,glm,mistral] [--n 3] [--out file.json]
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
  options: {
    episode: { type: "string" },
    models: { type: "string" },
    n: { type: "string" },
    out: { type: "string" },
  },
});

interface Episode {
  question: string;
  /** Outcome facts a model can only know from after the cutoff. */
  markers: Record<string, RegExp>;
  /** Marker keys that show knowledge of the enacted text or later events. */
  detail: string[];
  out: string;
}

export const EPISODES: Record<string, Episode> = {
  svog: {
    question:
      "Was ist mit dem 2018 in Österreich vorgelegten Sozialversicherungs-Organisationsgesetz geschehen? Antworte knapp mit dem, was du über Beschluss, Inhalt und spätere Entwicklungen weißt. Wenn du es nicht weißt, sag das.",
    markers: {
      adopted: /beschlossen|verabschiedet|angenommen|in Kraft/i,
      fiveCarriers: /\bfünf\b|\b5\b/i,
      oegk: /ÖGK|Österreichische[n]? Gesundheitskasse/i,
      parity: /Parität|paritätisch/i,
      court: /Verfassungsgerichtshof|VfGH/i,
      auditRepeal:
        /(Beitragsprüfung|Prüfung)[^.]*(aufgehoben|verfassungswidrig)|(aufgehoben|verfassungswidrig)[^.]*(Beitragsprüfung|Prüfung)/i,
    },
    // "Five carriers" was announced before the cutoff, so it alone is no outcome knowledge.
    detail: ["oegk", "court"],
    out: "backtest-svog-2018-recall.json",
  },
  gtelg: {
    question:
      "Was ist mit der im April 2023 in Österreich in Begutachtung geschickten Novelle des Gesundheitstelematikgesetzes zum elektronischen Impfpass geschehen? Antworte knapp mit dem, was du über Beschluss, Inhalt und spätere Änderungen weißt. Wenn du es nicht weißt, sag das.",
    markers: {
      adopted: /beschlossen|verabschiedet|angenommen|in Kraft/i,
      year2024: /\b2024\b/,
      hotline1450: /\b1450\b|Rettungsdienst/i,
      supportUnit: /Supporteinrichtung|Serviceline|Widerspruchsstelle/i,
      bgbl: /105\/2024|2530 d\.?\s?B/i,
      storageDuty: /Speicherpflicht|verpflichtend[^.]*(speicher|eintrag|erfass)/i,
    },
    // The storage duty and the service desk are in the draft itself; only additions made
    // after the cutoff (1450 and rescue services, the joint support unit, the BGBl) count.
    detail: ["hotline1450", "supportUnit", "bgbl"],
    out: "backtest-gtelg-2023-recall.json",
  },
};

export function gradeRecall(answer: string, episode: Episode = EPISODES.svog as Episode) {
  const hits = Object.entries(episode.markers)
    .filter(([, re]) => re.test(answer))
    .map(([k]) => k);
  const detail = episode.detail.some((k) => hits.includes(k));
  const level = detail ? "outcome_detail" : hits.includes("adopted") ? "adoption_only" : "none";
  return { hits, level };
}

const Answer = z.object({ answer: z.string() });

async function main() {
  const episode = EPISODES[values.episode ?? "svog"];
  if (!episode) throw new Error(`--episode ${Object.keys(EPISODES).join("|")}`);
  const models = (values.models ?? "gpt,qwen,glm,mistral").split(",").filter(Boolean);
  // Answers vary between samples, so each family is asked n times.
  const n = Number(values.n ?? 3);
  const jobs = models.flatMap((alias) => Array.from({ length: n }, (_, i) => ({ alias, i })));
  const results = await Promise.all(
    jobs.map(async ({ alias, i }) => {
      const model = resolveModelAlias(alias);
      try {
        const r = await structured(model, "recall_probe", Answer, [
          { role: "user", content: episode.question },
        ]);
        const cost = estimateCostUsd(model, r.meta) ?? 0;
        return {
          alias,
          sample: i + 1,
          model,
          answer: r.data.answer,
          ...gradeRecall(r.data.answer, episode),
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
  const out = values.out ?? path.join(REPO_ROOT, "runs", episode.out);
  const doc = { question: episode.question, date: new Date().toISOString().slice(0, 10), results };
  writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
  for (const r of results)
    process.stdout.write(`${r.alias}#${r.sample} ${"level" in r ? r.level : `error ${r.error}`}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) void main();
