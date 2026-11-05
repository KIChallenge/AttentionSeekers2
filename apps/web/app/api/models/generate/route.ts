import { maskDeep } from "@sv/engine/guard";
import { z } from "zod";
import { loadRoleCards } from "@/components/models/data.server";

// /api/models/generate: the /models playground. One prompt, two generations through the
// OpenAI-compatible SageMaker proxy (models/aws/proxy.py): the institution's LoRA adapter
// (model sv-<role>) and the prompted base (sv-base), both with the same role card as system
// prompt, as in the held-out eval. Optional in-character score from the persona scorer
// (models/scripts/persona_score.py --serve). Every output passes the person-name guard
// before it leaves the server (CON-1/CON-2).
//
// GET returns whether the proxy and the scorer are reachable, so the page can show
// "endpoint offline" with the precomputed eval examples instead.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const proxyUrl = () =>
  (process.env.MODEL_PROXY_URL ?? "http://127.0.0.1:8790/v1").replace(/\/$/, "");
const scorerUrl = () =>
  (process.env.PERSONA_SCORER_URL ?? "http://127.0.0.1:8765").replace(/\/$/, "");

const Body = z.object({
  role: z.string().regex(/^[a-z_]{2,40}$/),
  prompt: z.string().trim().min(5).max(2000),
});

const Completion = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
});

const Score = z.object({ probability: z.number().nullable(), known: z.boolean().optional() });

async function reachable(url: string, ms = 2500): Promise<boolean> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(ms), cache: "no-store" });
    return r.ok;
  } catch {
    return false;
  }
}

export async function GET() {
  const [proxy, scorer] = await Promise.all([
    reachable(`${proxyUrl()}/models`),
    reachable(`${scorerUrl()}/health`),
  ]);
  return Response.json({ proxy, scorer });
}

/** Same user-turn frame as the SFT rows (models/scripts/build_datasets.py user_prompt). */
function userTurn(prompt: string): string {
  return [
    "Ministerialentwurf (Auszug oder Frage aus der Modell-Demo):",
    prompt,
    "Formulieren Sie die Position und die Forderung Ihrer Institution zu diesem Punkt.",
  ].join("\n");
}

async function generate(model: string, system: string, prompt: string) {
  const t0 = Date.now();
  const r = await fetch(`${proxyUrl()}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer local" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userTurn(prompt) },
      ],
      // Eval settings (eval_stance.py), shorter so a demo answer stays readable.
      temperature: 0.3,
      max_tokens: 400,
    }),
    signal: AbortSignal.timeout(90_000),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`proxy ${r.status}`);
  const parsed = Completion.parse(await r.json());
  return { text: parsed.choices[0]?.message.content.trim() ?? "", ms: Date.now() - t0 };
}

async function score(text: string, institution: string): Promise<number | null> {
  try {
    const r = await fetch(`${scorerUrl()}/score`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, institution }),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!r.ok) return null;
    return Score.parse(await r.json()).probability;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "invalid input" }, { status: 400 });
  const { role, prompt } = parsed.data;
  const card = (await loadRoleCards()).get(role);
  if (!card?.roleCard) return Response.json({ error: "unknown institution" }, { status: 400 });

  let adapter: { text: string; ms: number };
  let base: { text: string; ms: number };
  try {
    [adapter, base] = await Promise.all([
      generate(`sv-${role}`, card.roleCard, prompt),
      generate("sv-base", card.roleCard, prompt),
    ]);
  } catch (error) {
    console.error("models_generate_failed", error instanceof Error ? error.message : error);
    return Response.json({ error: "offline" }, { status: 503 });
  }

  // Guard first, then score what is shown.
  const { value, masked } = maskDeep({ adapter: adapter.text, base: base.text });
  const [adapterScore, baseScore] = await Promise.all([
    score(value.adapter, role),
    score(value.base, role),
  ]);
  return Response.json({
    role,
    masked,
    adapter: {
      model: `sv-${role}`,
      text: value.adapter,
      ms: adapter.ms,
      inCharacter: adapterScore,
    },
    base: { model: "sv-base", text: value.base, ms: base.ms, inCharacter: baseScore },
  });
}
