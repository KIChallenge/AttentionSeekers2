import { describe, expect, it } from "vitest";
import { findPersonNames, hasPersonName, maskDeep, maskPersonNames } from "../src/guard.ts";

// All names below are invented placeholders, not real persons.
describe("person-name guard (CON-1/CON-2)", () => {
  it.each([
    "Laut Dr. Mustermann ist die Lage ernst.",
    "Ministerin Beispielhuber kündigte an, dass ...",
    "Das sagte Herr Huber gestern.",
    "Wie Frau Musterfrau-Beispiel betonte",
    "Gesundheitsminister Probst will das Gesetz ändern.",
    "Präsidentin Exempla erklärte",
    "Anna Beispiel von der Kammer",
    "Mag.a Testerin fordert mehr Stellen",
  ])("flags %s", (text) => {
    expect(hasPersonName(text)).toBe(true);
  });

  it.each([
    "Das Gesundheitsministerium fordert eine Terminservicestelle.",
    "Die Ärztekammer lehnt eine Terminpflicht ohne Honorierung ab.",
    "Der Präsident der Ärztekammer ist eine Funktion, kein Name.",
    "Die Sozialversicherung und die Bundesländer verhandeln über die 15a-Vereinbarung.",
    "Patient:innen warten in der Augenheilkunde sechs Wochen.",
    "Frau und Mann sind gleich betroffen.",
    "Der Finanzminister Gesundheit zuordnen ist unsinnig.",
    "Die Pflegevertretung (Community Nursing) bietet an, Routinekontrollen zu übernehmen.",
  ])("does not flag %s", (text) => {
    expect(findPersonNames(text)).toEqual([]);
  });

  it("masks hits with an institutional placeholder", () => {
    expect(maskPersonNames("Laut Dr. Mustermann steigt die Zahl.")).toBe(
      "Laut [Institution] steigt die Zahl.",
    );
  });

  it("masks deep inside an event and counts the strings", () => {
    const { value, masked } = maskDeep({
      a: "Herr Huber meint",
      b: ["ok", { c: "Ministerin Beispielhuber sagt" }],
      n: 3,
    });
    expect(masked).toBe(2);
    expect(value.a).toBe("[Institution] meint");
    expect(JSON.stringify(value)).not.toMatch(/Huber|Beispielhuber/);
    expect(value.n).toBe(3);
  });
});
