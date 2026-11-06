import type { CompromiseResult, RunSnapshot, RunSummary } from "@sv/contracts";
import { describe, expect, it } from "vitest";
import {
  compareVariants,
  type VariantColumn,
  type VariantComparison,
  variantHeadline,
} from "./scenario-variants";

const result = (passes: boolean): CompromiseResult => ({
  packageId: "k-5",
  support: [],
  conditional: [],
  oppose: [],
  passes,
  rule: "veto_players",
  needed: 5,
  missingVetoPlayers: [],
  note: { lang: "de", text: "", translations: {} },
});

const col = (label: string, passes: boolean | null): VariantColumn => ({
  id: label,
  label,
  isReference: label === "reference",
  rule: "veto_players",
  budgetPct: 5,
  climate: "neutral",
  accepted: [],
  tabled: 0,
  compromise: null,
  compromiseResult: passes === null ? null : result(passes),
  consistency: null,
  wait: null,
  cost: null,
  conflicts: [],
  agreement: {},
});

describe("variantHeadline", () => {
  const labelOf = (l: string) => l.toUpperCase();
  it("names the settings where the compromise fails", () => {
    const cmp: VariantComparison = {
      topics: [],
      columns: [col("reference", true), col("budget_tight", false), col("rule_consensus", false)],
    };
    expect(variantHeadline(cmp, labelOf, "de")).toBe(
      "Der Kompromissvorschlag des Moderators trägt in 1 von 3 Einstellungen und scheitert bei BUDGET_TIGHT, RULE_CONSENSUS.",
    );
  });
  it("covers all-or-nothing and no compromise at all", () => {
    expect(
      variantHeadline({ topics: [], columns: [col("a", true), col("b", true)] }, labelOf, "en"),
    ).toBe("The moderator's compromise carries in all 2 settings.");
    expect(variantHeadline({ topics: [], columns: [col("a", null)] }, labelOf, "de")).toMatch(
      /^Keine Einstellung/,
    );
  });
});

describe("variantHeadline with the consistency check", () => {
  it("says where the compromise carries only if the conditions can be reconciled", () => {
    const k = (verdict: "carries" | "carries_if_reconciled") => ({
      runId: "x",
      packageId: "k-5",
      verdict,
      label: { lang: "de" as const, text: "", translations: {} },
      conditions: [],
      pairsChecked: 1,
      conflicts: [],
      model: "m",
      checkedAt: "",
    });
    const cols = [
      { ...col("a", true), consistency: k("carries_if_reconciled") },
      { ...col("b", true), consistency: k("carries") },
    ];
    expect(variantHeadline({ topics: [], columns: cols }, labelOf2, "de")).toBe(
      "Der Kompromissvorschlag des Moderators trägt in allen 2 Einstellungen. Der Experte findet in 1 davon widersprüchliche Bedingungen: er trägt dort nur, wenn die Bedingungen vereinbar sind.",
    );
  });
});
const labelOf2 = (l: string) => l;

describe("compareVariants", () => {
  it("returns null when the scenario has no variant runs", () => {
    const snap = { run: { variant: { kind: "baseline" } } } as unknown as RunSnapshot;
    const summary = { id: "x", status: "completed" } as RunSummary;
    expect(compareVariants([{ summary, snap }], "x")).toBeNull();
  });
});
