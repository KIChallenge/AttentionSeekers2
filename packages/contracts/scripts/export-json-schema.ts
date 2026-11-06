// Writes JSON Schema for the entities the Python tracks produce or read.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import * as c from "../src/index.ts";

const out = path.resolve(import.meta.dirname, "../schema");
mkdirSync(out, { recursive: true });
const entities: Record<string, z.ZodType> = {
  Source: c.Source,
  Segment: c.Segment,
  StanceProfile: c.StanceProfile,
  RedLine: c.RedLine,
  AgentConfig: c.AgentConfig,
  MethodNote: c.MethodNote,
  StrategicAssessment: c.StrategicAssessment,
  CoalitionCalculus: c.CoalitionCalculus,
  RoundLesson: c.RoundLesson,
  RoomConfig: c.RoomConfig,
  RunEvent: c.RunEvent,
};
for (const [name, schema] of Object.entries(entities)) {
  const json = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" });
  writeFileSync(path.join(out, `${name}.schema.json`), `${JSON.stringify(json, null, 2)}\n`);
  console.log("wrote", name);
}
