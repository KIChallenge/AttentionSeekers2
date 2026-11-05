import { describe, expect, it } from "vitest";
import { converseBody, isBedrock, redact, toolSchema } from "../src/llm.ts";

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

  it("redacts the Bedrock key from error text", () => {
    const prev = process.env.BIFROST_SEED_BEDROCK_KEY;
    process.env.BIFROST_SEED_BEDROCK_KEY = "test-placeholder-key-123";
    expect(redact("denied for test-placeholder-key-123")).not.toContain("placeholder");
    if (prev === undefined) delete process.env.BIFROST_SEED_BEDROCK_KEY;
    else process.env.BIFROST_SEED_BEDROCK_KEY = prev;
  });
});
