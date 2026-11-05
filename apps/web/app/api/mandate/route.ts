import { Mandate, RoomConfig, Template } from "@sv/contracts";
import { z } from "zod";
import { runEngine } from "../_engine/spawn";

// POST /api/mandate: the moderator turns a question (plus optional setup-room
// settings) into a RoomConfig and a Mandate preview (FR-M1, FR-M2, FR-U9). The
// result can be edited and posted to /api/runs as { room, mandate }.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const Body = z.object({
  question: z.string().min(5).max(2000).optional(),
  template: Template.optional(),
  agents: z
    .array(z.string().regex(/^[a-z]{2,4}$/))
    .max(16)
    .optional(),
  roundLimit: z.number().int().min(1).max(8).optional(),
  asOf: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  climate: z.enum(["cooperative", "neutral", "confrontational"]).optional(),
  seed: z.number().int().optional(),
  /** Let the moderator choose the actors (default for template "custom"). */
  select: z.boolean().optional(),
});

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  const b = parsed.data;
  if (!b.question && (!b.template || b.template === "custom"))
    return Response.json({ error: "question or template required" }, { status: 400 });
  const args = ["room"];
  if (b.question) args.push("--question", b.question);
  if (b.template) args.push("--template", b.template);
  if (b.agents?.length) args.push("--agents", b.agents.join(","));
  if (b.roundLimit) args.push("--rounds", String(b.roundLimit));
  if (b.asOf) args.push("--as-of", b.asOf);
  if (b.climate) args.push("--climate", b.climate);
  if (b.seed !== undefined) args.push("--seed", String(b.seed));
  if (b.select) args.push("--select");
  try {
    const out = await runEngine(args);
    const json = JSON.parse(out.trim().split("\n").at(-1) ?? "{}");
    return Response.json({
      room: RoomConfig.parse(json.room),
      mandate: Mandate.parse(json.mandate),
    });
  } catch (error) {
    console.error("mandate_failed", error instanceof Error ? error.message : error);
    return Response.json({ error: "The moderator could not build a mandate." }, { status: 502 });
  }
}
