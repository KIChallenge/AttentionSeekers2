import type { CompromisePackage, CompromiseResult, CompromiseVote } from "@sv/contracts";
import { describe, expect, it } from "vitest";
import {
  consistencyMessages,
  consistencyNote,
  pairsOf,
  statedConditions,
  toConsistency,
} from "../src/compromise-consistency.ts";
import { L } from "../src/config.ts";

const pkg: CompromisePackage = {
  id: "k-5",
  round: 5,
  title: L("Paket"),
  rationale: L("Begründung"),
  components: [{ text: L("Terminservice"), proposalIds: ["p-01"] }],
  conditions: [],
  basedOn: ["p-01"],
  expected: { support: [], conditional: [], oppose: [] },
  redLinesTouched: [],
  utteranceId: null,
};
const vote = (
  agentId: string,
  stance: CompromiseVote["stance"],
  condition: string | null,
): CompromiseVote => ({
  packageId: "k-5",
  agentId,
  stance,
  condition: condition ? L(condition) : null,
  reason: L("Grund"),
  redLinesTouched: [],
  utteranceId: null,
  model: "m",
});
const votes = [
  vote("sv", "conditional", "Finanzierung durch Umschichtung aus den Arzthonoraren"),
  vote("ak", "conditional", "Keine Kürzung der Honorare"),
  vote("gm", "support", null),
  vote("fm", "oppose", "Budgetneutralität"),
];
const passes: CompromiseResult = {
  packageId: "k-5",
  support: ["gm"],
  conditional: ["sv", "ak"],
  oppose: ["fm"],
  passes: true,
  rule: "qualified_majority",
  needed: 3,
  missingVetoPlayers: [],
  note: L("trägt"),
};

describe("compromise consistency", () => {
  it("collects only conditions that carry the tally", () => {
    const c = statedConditions(votes);
    expect(c.map((x) => x.agentId)).toEqual(["sv", "ak"]);
    expect(pairsOf(c)).toEqual([[0, 1]]);
    expect(consistencyMessages(pkg, c)[1]?.content).toContain("B1-B2");
  });

  it("downgrades a carried package with contradicting conditions", () => {
    const c = statedConditions(votes);
    const out = toConsistency(
      "r",
      pkg,
      passes,
      c,
      {
        pairs: [
          {
            pair: "B1-B2",
            verdict: "contradiction",
            noteDe: "Umschichtung gegen Honorarschutz",
            noteEn: "x",
          },
        ],
      },
      "m",
    );
    expect(out.verdict).toBe("carries_if_reconciled");
    expect(out.label.text).toBe("trägt nur, wenn die Bedingungen vereinbar sind");
    expect(out.conflicts).toEqual([
      expect.objectContaining({ a: "sv", b: "ak", severity: "contradiction" }),
    ]);
    expect(consistencyNote(out).text).toContain("Sozialversicherung / Ärztekammer");
  });

  it("needs reconciliation for a tension too, carries when compatible", () => {
    const c = statedConditions(votes);
    const ok = toConsistency(
      "r",
      pkg,
      passes,
      c,
      {
        pairs: [{ pair: "B1-B2", verdict: "tension", noteDe: "Tausch nötig", noteEn: "" }],
      },
      "m",
    );
    expect(ok.verdict).toBe("carries_if_reconciled");
    expect(ok.conflicts).toHaveLength(1);
    const fine = toConsistency(
      "r",
      pkg,
      passes,
      c,
      { pairs: [{ pair: "B1-B2", verdict: "compatible", noteDe: "", noteEn: "" }] },
      "m",
    );
    expect(fine.verdict).toBe("carries");
    const failed = toConsistency("r", pkg, { ...passes, passes: false }, c, null, "m");
    expect(failed.verdict).toBe("fails");
  });
});
