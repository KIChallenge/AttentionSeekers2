import { readFileSync } from "node:fs";
import path from "node:path";
import { foldRun, parseNdjson } from "@sv/contracts";
import { describe, expect, it } from "vitest";
import { chatSystemPrompt, runText, seatFacts } from "../src/chat.ts";
import {
  checkSentence,
  gateAnswer,
  gateContext,
  MIN_KEPT,
  splitSentences,
} from "../src/chat-gate.ts";

const runFile = path.resolve(
  import.meta.dirname,
  "../../../runs/reference-wartezeiten-presse.ndjson",
);
const snap = foldRun(parseNdjson(readFileSync(runFile, "utf8")));
const facts = seatFacts(snap, "pv");
if (!facts) throw new Error("pv missing from the reference run");
const question =
  "Wie stehen Sie zur verbindlichen Terminzusage und was muss im Gesetz verankert werden?";
const ctx = gateContext(chatSystemPrompt(facts, "de", []), runText(snap), question);

// The drifting tail is the one seen in the Patientenvertretung chat of this run: invented words
// ("Salinas-kompatible", "verursacht" for "verankert", "GAO"), then French gibberish.
const clean =
  "Wir unterstützen eine verbindliche Terminzusage innerhalb von vier Wochen, wenn die Finanzierung gesichert ist [u4-19]. Die Terminservicestelle muss gestärkt werden, damit Patientinnen und Patienten rasch einen Termin bekommen [A].";
const drift =
  " Im Gesetz muss die Zusage verursacht werden, mit Salinas-kompatible Wartezeitenberichten und einer Prüfung durch die GAO [A].";
const french =
  " Wir avons aucune problématique emballage environnemental d'ici demain vingt heures lt.";
const bad = clean + drift + french;

describe("chat output gate", () => {
  it("cuts the real bad answer before the drift and the French tail", () => {
    const r = gateAnswer(bad, "de", ctx);
    expect(r.cut).toBe(true);
    expect(r.text).toBe(clean);
    expect(r.text).not.toContain("avons");
    expect(r.text).not.toContain("Salinas");
    expect(r.text).not.toContain("verursacht");
    expect(r.flagged).toEqual(expect.arrayContaining(["Salinas-kompatible", "GAO"]));
    expect(r.reasons).toEqual(expect.arrayContaining(["language:fr", "unknown-acronym"]));
  });

  it("flags the French sentence as language drift on its own", () => {
    const c = checkSentence(french, "de", ctx);
    expect(c.ok).toBe(false);
    expect(c.reasons).toContain("language:fr");
  });

  it("asks for a regeneration when too much is lost", () => {
    const r = gateAnswer(`Wir unterstützen das [A].${drift}${french}`, "de", ctx);
    expect(r.kept).toBeLessThan(MIN_KEPT);
  });

  it("keeps a clean German answer whole", () => {
    const ok =
      "Eine pauschale Vierwochenzusage lehnen wir ohne gesicherte Finanzierung ab [u4-19]. Im Gesetz müsste verankert werden, dass die Ausgaben um nicht mehr als 5 % steigen dürfen [A]. Die Stärkung der Terminservicestelle bleibt unser Hauptvorschlag, z. B. mit Telemedizin.";
    const r = gateAnswer(ok, "de", ctx);
    expect(r.reasons).toEqual([]);
    expect(r.cut).toBe(false);
    expect(r.text).toBe(ok);
  });

  it("does not flag short everyday nouns the context lacks", () => {
    const ok =
      "Wir verlangen eine klare Frist für die Terminvergabe und eine Beschwerdestelle, die rasch reagiert [A]. Grundsätzlich halten wir Versorgungssicherheit für chronisch kranke Menschen in ländlichen Regionen für unverzichtbar [A].";
    expect(gateAnswer(ok, "de", ctx).reasons).toEqual([]);
  });

  it("drops English in a German session and German in an English one", () => {
    expect(checkSentence("We will not accept this and we oppose the plan.", "de", ctx).ok).toBe(
      false,
    );
    expect(
      checkSentence("Wir lehnen das ab, weil die Finanzierung nicht gesichert ist.", "en", ctx).ok,
    ).toBe(false);
    expect(checkSentence("We reject a binding guarantee without funding [A].", "en", ctx).ok).toBe(
      true,
    );
  });

  it("flags repeated tokens", () => {
    expect(checkSentence("Wir fordern fordern fordern eine Zusage.", "de", ctx).reasons).toContain(
      "repeat",
    );
  });

  it("drops an unfinished last fragment but keeps markers after the period", () => {
    const s = splitSentences("Erster Satz [E1]. Zweiter Satz, z. B. mit Nr. 5 [A]. Dritter ohne");
    expect(s.map((x) => x.complete)).toEqual([true, true, false]);
    expect(gateAnswer("Erster Satz [E1]. Dritter ohne", "de", ctx).text).toBe("Erster Satz [E1].");
  });
});
