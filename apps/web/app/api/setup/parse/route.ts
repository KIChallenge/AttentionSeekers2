import { AGENT_CATALOG, Climate, DecisionRule, PressureLevel } from "@sv/contracts";
import { CHAT_MODEL } from "@sv/engine/chat";
import { hasGateway, structured } from "@sv/engine/llm";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Free text to setup: the chat model reads what the user wants (question, decision rule,
// rounds, budget ceiling, climate, pressures, seats, cutoff) and returns only what the text
// says; everything else stays as set. The client shows the result before a run starts.

const Body = z.object({ text: z.string().min(5).max(4000), lang: z.enum(["de", "en"]) });

const Parsed = z.object({
  question: z.string(),
  decisionRule: DecisionRule.nullable(),
  roundLimit: z.number().int().nullable(),
  budgetMaxIncreasePct: z.number().nullable(),
  climate: Climate.nullable(),
  pressureTime: PressureLevel.nullable(),
  pressureBudget: PressureLevel.nullable(),
  pressurePublic: PressureLevel.nullable(),
  include: z.array(z.string()),
  exclude: z.array(z.string()),
  asOf: z.string().nullable(),
  summary: z.string(),
});

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "bad request" }, { status: 400 });
  if (!hasGateway()) return Response.json({ error: "no model" }, { status: 503 });
  const { text, lang } = parsed.data;
  const seats = AGENT_CATALOG.map((a) => `${a.id} = ${a.nameDe}`).join("; ");
  const system = [
    "Du liest die Freitext-Beschreibung einer gewünschten Verhandlung im österreichischen Gesundheitswesen und füllst die Einstellungen aus. Nimm nur auf, was der Text sagt oder klar meint; sonst null bzw. leere Liste.",
    "question: die eigentliche Verhandlungsfrage als ein neutraler Satz (ohne die Regeln).",
    "decisionRule: consensus (alle müssen zustimmen), qualified_majority (qualifizierte Mehrheit, z. B. zwei Drittel), veto_players (Mehrheit, aber bestimmte Akteure haben ein Veto).",
    "roundLimit: Anzahl Verhandlungsrunden 1 bis 8. budgetMaxIncreasePct: maximaler Ausgabenanstieg in Prozent.",
    "climate: cooperative, neutral oder confrontational. pressureTime, pressureBudget, pressurePublic: none, low, medium, high (Zeitdruck, Budgetdruck, öffentlicher Druck).",
    `include / exclude: Kennungen der Institutionen, die ausdrücklich teilnehmen sollen bzw. nicht teilnehmen sollen. Verfügbar: ${seats}.`,
    "asOf: Stichtag der Quellen als JJJJ-MM-TT, nur wenn genannt (etwa: Stand Anfang 2023 = 2023-01-01).",
    `summary: ein kurzer Satz auf ${lang === "de" ? "Deutsch" : "Englisch"}, was erkannt wurde. Keine Gedankenstriche.`,
  ].join("\n");
  try {
    const { data } = await structured(
      CHAT_MODEL(),
      "setup_parse",
      Parsed,
      [
        { role: "system", content: system },
        { role: "user", content: text },
      ],
      { reasoningEffort: "low", maxOutputTokens: 3000, timeoutMs: 45_000 },
    );
    const ids = new Set(AGENT_CATALOG.map((a) => a.id));
    return Response.json({
      ...data,
      roundLimit:
        data.roundLimit === null ? null : Math.min(8, Math.max(1, Math.round(data.roundLimit))),
      include: data.include.filter((id) => ids.has(id)),
      exclude: data.exclude.filter((id) => ids.has(id)),
      asOf: data.asOf && /^\d{4}-\d{2}-\d{2}$/.test(data.asOf) ? data.asOf : null,
      summary: data.summary.replace(/[–—]/g, "-"),
    });
  } catch (error) {
    console.warn(
      "setup_parse_failed",
      error instanceof Error ? error.message.slice(0, 200) : error,
    );
    return Response.json({ error: "parse failed" }, { status: 502 });
  }
}
