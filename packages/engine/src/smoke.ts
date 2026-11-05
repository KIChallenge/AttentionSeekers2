// NFR-10 gateway smoke test: one strict structured call per model.
import { z } from "zod";
import { structured, usage } from "./llm.ts";

const models = (process.argv[2] ?? process.env.SV_MODELS ?? "gpt-6-sol").split(",");
const Schema = z.object({ answer: z.string(), n: z.number().nullable(), items: z.array(z.object({ k: z.string() })) });
for (const model of models) {
  for (const effort of ["low", "none"] as const) {
    const t = performance.now();
    try {
      const { data, meta } = await structured(model, "smoke", Schema, [
        { role: "system", content: "Antworte knapp auf Deutsch." },
        { role: "user", content: "Nenne die Hauptstadt Österreichs, n = Einwohner in Mio., items = zwei Bezirke." },
      ], { reasoningEffort: effort });
      console.log(model, effort, Math.round(performance.now() - t), "ms", JSON.stringify(data), meta.tokensIn, meta.tokensOut, meta.reasoningTokens);
    } catch (e) {
      console.log(model, effort, "FAILED", e instanceof Error ? e.message : e);
    }
  }
}
console.log(usage);
