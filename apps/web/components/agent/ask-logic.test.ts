import { readFileSync } from "node:fs";
import path from "node:path";
import { foldRun, parseNdjson, RedLine } from "@sv/contracts";
import { describe, expect, it } from "vitest";
import { parseAnswer, suggestedQuestions } from "./ask-logic";

const runs = path.resolve(import.meta.dirname, "../../../../runs");
const snap = foldRun(
  parseNdjson(readFileSync(path.join(runs, "reference-wartezeiten-presse.ndjson"), "utf8")),
);
const redLines = Object.fromEntries(
  (
    JSON.parse(readFileSync(path.join(runs, "fixture-sources.json"), "utf8")) as {
      redLines: unknown[];
    }
  ).redLines.map((r) => {
    const p = RedLine.parse(r);
    return [p.id, p];
  }),
);

describe("suggested questions", () => {
  it("asks about the largest move, a red line and a rejected proposal", () => {
    const q = suggestedQuestions(snap, "ak", redLines, "de");
    expect(q).toHaveLength(3);
    expect(q[0]).toMatch(/^Warum haben Sie sich bei .+ von .+ auf .+ bewegt\?$/);
    expect(q[1]).toContain("Keine Stellenplanung außerhalb des Gesamtvertrags");
    expect(q[2]).toMatch(/^Warum haben Sie „.+“ abgelehnt\?$/);
    expect(suggestedQuestions(snap, "ak", redLines, "en")[1]).toContain("give up");
  });
});

describe("answer parsing", () => {
  it("splits citations, run references and markers; unknown handles become assumptions", () => {
    const parts = parseAnswer(
      "Wir lehnen ab [E1, E2]. Wie gesagt [u4-19]. Kosten steigen [A]. [P] Sonst [E9].",
      new Set(["E1", "E2"]),
      new Set(["u4-19"]),
    );
    expect(parts.map((p) => p.kind)).toEqual([
      "text",
      "cite",
      "cite",
      "text",
      "utt",
      "text",
      "assumption",
      "text",
      "profile",
      "text",
      "assumption",
      "text",
    ]);
  });
});
