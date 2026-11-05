// Cross-family judge for the quality audit: every utterance is scored by the model family
// that did NOT write it (Azure GPT turns by Bedrock Nova and vice versa), with a fixed
// rubric and deterministic settings (temperature 0, fixed seed, no reasoning). Calls are
// batched per exchange and judge family so the judge sees the whole exchange as context.
import { estimateCostUsd } from "@sv/contracts";
import { z } from "zod";
import { nameOf } from "../agent.ts";
import { DEFAULT_MODEL, profileOf, redLinesOf, SECOND_MODEL } from "../config.ts";
import { isBedrock, structured } from "../llm.ts";

export const RUBRIC_VERSION = "debate-quality-rubric-v1";
export const JUDGE_SEED = 20261106;

export const JUDGE_DIMENSIONS = [
  "relevanceMandate",
  "relevanceExchange",
  "responsiveness",
  "grounding",
  "consistency",
  "register",
] as const;
export type JudgeDimension = (typeof JUDGE_DIMENSIONS)[number];

const Score = z.number().int().min(0).max(3);
export const JudgeOut = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      relevanceMandate: Score,
      relevanceExchange: Score,
      responsiveness: Score,
      grounding: Score,
      consistency: Score,
      register: Score,
      issues: z.array(
        z.object({
          dimension: z.enum(JUDGE_DIMENSIONS),
          severity: z.enum(["minor", "major"]),
          reason: z.string(),
        }),
      ),
    }),
  ),
});
export type JudgeItem = z.infer<typeof JudgeOut>["items"][number];

export const RUBRIC = [
  `Bewertungsraster ${RUBRIC_VERSION}. Skala je Dimension 0 bis 3 (3 = einwandfrei, 2 = kleine Schwäche, 1 = deutliche Schwäche, 0 = verfehlt).`,
  "relevanceMandate: Der Beitrag dient der Verhandlungsfrage und ihren Themen. 0 = themenfremd oder beliebig, 1 = nur Floskeln.",
  "relevanceExchange: Der Beitrag behandelt das Thema bzw. den Anlass dieses Gesprächs (bei Plenum: die Tagesordnung). 0 = weicht auf anderes aus.",
  "responsiveness: Der Beitrag greift das konkrete Argument der Äußerung auf, auf die er antwortet (respondsTo), statt daran vorbeizureden. Ohne respondsTo: 3.",
  "grounding: Sachaussagen und Zahlen stützen sich auf Belege oder sind als Annahme gekennzeichnet; Zahlen passen zu den Expertenhinweisen; keine erfundenen Zahlen.",
  "consistency: Der Beitrag passt zu den Zielen, roten Linien und der bisherigen Haltung der Institution; eine Abweichung ist nur mit erkennbarem Anlass (Zugeständnis, Argument, Ereignis) in Ordnung. Aufgabe einer roten Linie = 0.",
  "register: Institutionelle Stimme (wir), sachlich, Deutsch; keine Meta-Rede über KI oder Simulation, keine englischen Passagen, keine internen Kennungen wie u2-03 oder rl-ak-1, keine Personennamen.",
  "Moderation und Experte: werte nach ihrer Rolle (neutrale Gesprächsführung, Prüfbericht); consistency = 3, wenn keine Partei ergriffen wird.",
  "issues: nur echte Mängel, je ein Satz auf Deutsch mit dem konkreten Grund (Zitat in Anführungszeichen, wenn hilfreich); major nur bei Score 0 oder 1. Keine Personennamen, kein Gedankenstrich-Zeichen.",
].join("\n");

export interface JudgeTarget {
  id: string;
  speaker: string;
  kind: string;
  phase: number;
  model: string;
  text: string;
  respondsTo: { id: string; speaker: string; text: string } | null;
  claims: Array<{ atomic: string; state: string; citations: number }>;
  expertNotes: string[];
  stance: { topicId: string; from: number | null; to: number; trigger: boolean } | null;
}

export interface JudgeBatch {
  judgeModel: string;
  exchange: {
    id: string | null;
    kind: string;
    topic: string | null;
    trigger: string;
    transcript: Array<{ id: string; speaker: string; text: string }>;
  };
  targets: JudgeTarget[];
}

/** The judge of the other family; same family only when the other is unavailable. */
export function judgeFor(model: string): string {
  const second = SECOND_MODEL();
  if (isBedrock(model)) return DEFAULT_MODEL();
  return second ?? DEFAULT_MODEL();
}

const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n)} ...` : t);

function profileLine(agentId: string): string {
  if (agentId === "moderator" || agentId === "expert") return "";
  const p = profileOf(agentId);
  const red = redLinesOf(agentId);
  return [
    `Profil ${nameOf(agentId)}: Ziele ${p.goals.map((g) => g.de).join("; ")}`,
    `Interessen ${p.interests.map((g) => g.de).join("; ")}`,
    red.length
      ? `rote Linien ${red.map((r) => `${r.id}: ${r.de}`).join("; ")}`
      : "keine roten Linien",
    `Register ${p.register}`,
  ].join(" | ");
}

export function judgeMessages(
  mandate: { question: string; topics: string[] },
  b: JudgeBatch,
): Array<{ role: "system" | "user"; content: string }> {
  const speakers = [...new Set(b.targets.map((t) => t.speaker))];
  const user = [
    `Verhandlungsfrage: ${mandate.question}`,
    `Themen des Mandats: ${mandate.topics.join("; ")}`,
    `Gespräch ${b.exchange.id ?? "-"} (${b.exchange.kind}), Thema: ${b.exchange.topic ?? "Tagesordnung bzw. Vorschlag auf dem Tisch"}. Anlass: ${b.exchange.trigger}`,
    "Verlauf des Gesprächs:",
    ...b.exchange.transcript.map((t) => `${t.id} ${nameOf(t.speaker)}: ${clip(t.text, 700)}`),
    "",
    ...speakers.map(profileLine).filter(Boolean),
    "",
    "Zu bewertende Beiträge:",
    ...b.targets.map((t) =>
      [
        `### ${t.id} | ${nameOf(t.speaker)} | ${t.kind} | Phase ${t.phase}`,
        t.respondsTo
          ? `antwortet auf ${t.respondsTo.id} (${nameOf(t.respondsTo.speaker)}): ${clip(t.respondsTo.text, 500)}`
          : "antwortet auf: nichts",
        `Text: ${t.text}`,
        t.claims.length
          ? `Aussagen: ${t.claims.map((c) => `"${c.atomic}" [${c.state}, ${c.citations} Belege]`).join("; ")}`
          : "Aussagen: keine extrahiert",
        t.expertNotes.length ? `Expertenhinweise: ${t.expertNotes.join(" | ")}` : "",
        t.stance
          ? `Haltung zu ${t.stance.topicId}: ${t.stance.from ?? "neu"} auf ${t.stance.to}${t.stance.trigger ? " (Anlass erfasst)" : " (kein Anlass erfasst)"}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    ),
    "",
    `Gib für jeden der ${b.targets.length} Beiträge genau ein Element in items zurück (id = Kennung oben).`,
  ].join("\n");
  return [
    {
      role: "system",
      content: `Du bist ein unabhängiger, strenger Gutachter für die Qualität simulierter Verhandlungen im österreichischen Gesundheitswesen. Du bewertest Redebeiträge nach einem festen Raster und erfindest nichts.\n${RUBRIC}`,
    },
    { role: "user", content: user },
  ];
}

export interface JudgeResult {
  items: Map<string, JudgeItem & { judgeModel: string }>;
  calls: number;
  failed: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

/** Bedrock quotas are low: a failed judge call waits and tries again (15 s, 30 s). */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      if (i < 2) await new Promise((r) => setTimeout(r, 15_000 * 2 ** i));
    }
  }
  throw last;
}

/** Runs all batches in parallel (the LLM client enforces per-provider concurrency). */
export async function runJudge(
  mandate: { question: string; topics: string[] },
  batches: JudgeBatch[],
): Promise<JudgeResult> {
  const out: JudgeResult = {
    items: new Map(),
    calls: 0,
    failed: 0,
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
  };
  await Promise.all(
    batches.map(async (b) => {
      out.calls++;
      try {
        const r = await withRetry(() =>
          structured(b.judgeModel, "quality_judge", JudgeOut, judgeMessages(mandate, b), {
            reasoningEffort: isBedrock(b.judgeModel) ? null : "none",
            temperature: 0,
            seed: isBedrock(b.judgeModel) ? null : JUDGE_SEED,
            maxOutputTokens: 4000,
            timeoutMs: 120_000,
          }),
        );
        out.tokensIn += r.meta.tokensIn;
        out.tokensOut += r.meta.tokensOut + r.meta.reasoningTokens;
        out.costUsd +=
          estimateCostUsd(b.judgeModel, {
            tokensIn: r.meta.tokensIn,
            tokensCached: r.meta.tokensCached,
            tokensOut: r.meta.tokensOut + r.meta.reasoningTokens,
          }) ?? 0;
        const ids = new Set(b.targets.map((t) => t.id));
        for (const it of r.data.items)
          if (ids.has(it.id)) out.items.set(it.id, { ...it, judgeModel: b.judgeModel });
      } catch (error) {
        out.failed++;
        console.warn(
          "quality_judge_failed",
          JSON.stringify({
            exchange: b.exchange.id,
            judge: b.judgeModel,
            message: error instanceof Error ? error.message.slice(0, 200) : String(error),
          }),
        );
      }
    }),
  );
  out.costUsd = Math.round(out.costUsd * 10_000) / 10_000;
  return out;
}

/** Rough pre-run cost estimate from prompt length (3.6 chars per token) and output size. */
export function estimateJudgeCost(
  mandate: { question: string; topics: string[] },
  batches: JudgeBatch[],
): { tokensIn: number; tokensOut: number; usd: number } {
  let tokensIn = 0;
  let tokensOut = 0;
  let usd = 0;
  for (const b of batches) {
    const tin = Math.ceil(
      judgeMessages(mandate, b).reduce((n, m) => n + m.content.length, 0) / 3.6,
    );
    const tout = 120 + 160 * b.targets.length;
    tokensIn += tin;
    tokensOut += tout;
    usd += estimateCostUsd(b.judgeModel, { tokensIn: tin, tokensCached: 0, tokensOut: tout }) ?? 0;
  }
  return { tokensIn, tokensOut, usd: Math.round(usd * 1000) / 1000 };
}
