import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  backoffMs,
  bedrockProfile,
  converseBody,
  extractJson,
  isBedrock,
  readConverse,
  redact,
  repairPrompt,
  repairToSchema,
  toolSchema,
} from "../src/llm.ts";

describe("Bedrock Converse adapter", () => {
  const schema = {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: { answer: { type: "string" } },
    required: ["answer"],
    additionalProperties: false,
  };

  it("routes only bedrock/ prefixed model ids", () => {
    expect(isBedrock("bedrock/eu.mistral.pixtral-large-2502-v1:0")).toBe(true);
    expect(isBedrock("azure/gpt-6-sol")).toBe(false);
  });

  it("drops the $schema marker from the tool input schema", () => {
    expect(toolSchema(schema)).not.toHaveProperty("$schema");
    expect(toolSchema(schema)).toHaveProperty("properties");
  });

  it("maps chat messages to system plus alternating turns and forces the tool", () => {
    const body = converseBody(
      [
        { role: "system", content: "Rolle" },
        { role: "user", content: "A" },
        { role: "user", content: "B" },
        { role: "assistant", content: "C" },
        { role: "user", content: "D" },
      ],
      "agent_turn",
      schema,
      4000,
    ) as {
      system: Array<{ text: string }>;
      messages: Array<{ role: string; content: Array<{ text: string }> }>;
      inferenceConfig: { maxTokens: number };
      toolConfig: {
        tools: Array<{ toolSpec: { name: string; inputSchema: { json: object } } }>;
        toolChoice: unknown;
      };
    };
    expect(body.system).toEqual([{ text: "Rolle" }]);
    expect(body.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(body.messages[0]?.content).toEqual([{ text: "A" }, { text: "B" }]);
    expect(body.inferenceConfig.maxTokens).toBe(4000);
    expect(body.toolConfig.tools[0]?.toolSpec.name).toBe("agent_turn");
    expect(body.toolConfig.tools[0]?.toolSpec.inputSchema.json).not.toHaveProperty("$schema");
    expect(body.toolConfig.toolChoice).toEqual({ tool: { name: "agent_turn" } });
    expect(converseBody([], "x", schema, 10, "any").toolConfig).toMatchObject({
      toolChoice: { any: {} },
    });
  });

  it("repairs omitted empty fields but never invents numbers or enum values", () => {
    const S = z.object({
      stances: z.array(
        z.object({
          topicId: z.string(),
          stance: z.number(),
          rationaleEn: z.string(),
          changedBecauseOf: z.string().nullable(),
        }),
      ),
      claims: z.array(z.object({ atomic: z.string() })),
      kind: z.enum(["position", "rebuttal"]),
    });
    const json = z.toJSONSchema(S, { target: "draft-7" }) as Parameters<typeof repairToSchema>[1];
    const omitted = { stances: [{ topicId: "t-tss", stance: "0.75" }], kind: "position" };
    const fixed = S.parse(repairToSchema(omitted, json));
    expect(fixed.stances[0]).toEqual({
      topicId: "t-tss",
      stance: 0.75,
      rationaleEn: "",
      changedBecauseOf: null,
    });
    expect(fixed.claims).toEqual([]);
    const listy = {
      stances: [{ topicId: "t-tss", stance: 1, rationaleEn: ["a", "b"] }],
      kind: "rebuttal",
    };
    expect(S.parse(repairToSchema(listy, json)).stances[0]?.rationaleEn).toBe("a; b");
    const noNumber = { stances: [{ topicId: "t-tss" }], claims: [], kind: "position" };
    expect(S.safeParse(repairToSchema(noNumber, json)).success).toBe(false);
    const noKind = { stances: [], claims: [] };
    expect(S.safeParse(repairToSchema(noKind, json)).success).toBe(false);
  });

  it("redacts the Bedrock key from error text", () => {
    const prev = process.env.BIFROST_SEED_BEDROCK_KEY;
    process.env.BIFROST_SEED_BEDROCK_KEY = "test-placeholder-key-123";
    expect(redact("denied for test-placeholder-key-123")).not.toContain("placeholder");
    if (prev === undefined) delete process.env.BIFROST_SEED_BEDROCK_KEY;
    else process.env.BIFROST_SEED_BEDROCK_KEY = prev;
  });
});

describe("Bedrock model families", () => {
  const schema = { type: "object", properties: { a: { type: "string" } }, required: ["a"] };

  it("JSON mode sends no tools and puts the schema into the system prompt", () => {
    const body = converseBody(
      [
        { role: "system", content: "Rolle" },
        { role: "user", content: "Frage" },
      ],
      "x",
      schema,
      100,
      "json",
    );
    expect(body).not.toHaveProperty("toolConfig");
    const system = body.system as Array<{ text: string }>;
    expect(system).toHaveLength(2);
    expect(system[1]?.text).toContain('"required":["a"]');
  });

  it("takes the final answer and keeps reasoning blocks apart", () => {
    const r = readConverse([
      { reasoningContent: { reasoningText: { text: "erst denken" } } },
      { text: 'Hier ist das Ergebnis:\n```json\n{"a": "ja"}\n```' },
    ]);
    expect(JSON.parse(r.content)).toEqual({ a: "ja" });
    expect(r.reasoning).toBe("erst denken");
  });

  it("prefers the tool input and strips inline think sections", () => {
    expect(
      readConverse([{ text: "Vorrede" }, { toolUse: { name: "x", input: { a: "b" } } }]).content,
    ).toBe('{"a":"b"}');
    const r = readConverse([{ text: '<think>abwaegen</think>{"a": "c"}' }]);
    expect(JSON.parse(r.content)).toEqual({ a: "c" });
    expect(r.reasoning).toBe("abwaegen");
  });

  it("leaves text without an object unchanged so the strict parse fails loudly", () => {
    expect(extractJson("  keine Daten ")).toBe("keine Daten");
    expect(() => JSON.parse(extractJson("keine Daten"))).toThrow();
  });

  it("maps model ids to family profiles", () => {
    expect(bedrockProfile("bedrock/deepseek.v3.2")).toMatchObject({
      family: "deepseek",
      toolChoice: "any",
    });
    expect(bedrockProfile("bedrock/moonshotai.kimi-k2.5").family).toBe("kimi");
    expect(bedrockProfile("bedrock/qwen.qwen3-235b-a22b-2507-v1:0").family).toBe("qwen");
    expect(bedrockProfile("bedrock/zai.glm-5").family).toBe("glm");
    expect(bedrockProfile("bedrock/mistral.devstral-2-123b").family).toBe("mistral");
    expect(bedrockProfile("bedrock/openai.gpt-oss-120b-1:0").family).toBe("gpt-oss");
    expect(bedrockProfile("bedrock/eu.amazon.nova-pro-v1:0").structured).toBe("tool");
  });

  it("backs off exponentially and honours Retry-After", () => {
    expect(backoffMs(0, null, 0.5)).toBe(1500);
    expect(backoffMs(2, null, 0.5)).toBe(6000);
    expect(backoffMs(9, null, 0.5)).toBe(20_000);
    expect(backoffMs(0, "3")).toBe(3000);
  });

  it("normalises enum spelling and drops list items with an unknown enum value", () => {
    const S = z.object({
      lean: z.enum(["cooperate", "block"]),
      incentives: z.array(
        z.object({ dimension: z.enum(["cost", "political_credit"]), note: z.string() }),
      ),
    });
    const json = z.toJSONSchema(S, { target: "draft-7" }) as Parameters<typeof repairToSchema>[1];
    const raw = {
      lean: "Cooperate",
      incentives: [
        { dimension: "Political credit", note: "a" },
        { dimension: "quality", note: "b" },
      ],
    };
    const fixed = S.parse(repairToSchema(raw, json));
    expect(fixed.lean).toBe("cooperate");
    expect(fixed.incentives).toEqual([{ dimension: "political_credit", note: "a" }]);
    expect(S.safeParse(repairToSchema({ ...raw, lean: "maybe" }, json)).success).toBe(false);
  });

  it("repair prompt names the failing fields", () => {
    const r = z.object({ a: z.string() }).safeParse({ a: 1 });
    expect(repairPrompt(r.error)).toContain("a:");
  });
});
