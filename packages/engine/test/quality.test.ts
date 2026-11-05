import { readFileSync } from "node:fs";
import path from "node:path";
import { foldRun, parseNdjson, type RunEvent } from "@sv/contracts";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../src/config.ts";
import { isFlagged, prepare } from "../src/quality/audit.ts";
import {
  failedGated,
  gateChecks,
  groundingCheck,
  negotiationCheck,
  noveltyOf,
  registerCheck,
  relevanceCheck,
  repetitionCheck,
  type TurnCheckInput,
  vocabularyOf,
} from "../src/quality/checks.ts";
import { judgeFor } from "../src/quality/judge.ts";

const events = parseNdjson(
  readFileSync(path.join(REPO_ROOT, "runs", "reference-wartezeiten.ndjson"), "utf8"),
);
const first = events[0] as Extract<RunEvent, { type: "run.started" }>;
const vocab = vocabularyOf(first.run.mandate);

const base = (text: string, over: Partial<TurnCheckInput> = {}): TurnCheckInput => ({
  text,
  speaker: "sv",
  phase: 2,
  vocab,
  topicId: "t-4wo",
  ownPrior: [],
  exchangeKind: "bilateral",
  ...over,
});

const ON_TOPIC =
  "Wir tragen eine honorierte Terminzusage binnen vier Wochen mit, sofern die Finanzierung aus dem vertragsärztlichen Ausgabenpfad kommt und die Beitragssätze stabil bleiben.";

describe("deterministic quality checks", () => {
  it("passes an on-topic institutional turn", () => {
    expect(failedGated(gateChecks(base(ON_TOPIC)))).toEqual([]);
  });

  it("flags an off-topic turn", () => {
    const c = relevanceCheck(base("Das Wetter in den Alpen war heuer besonders schön und sonnig."));
    expect(c.passed).toBe(false);
  });

  it("flags a near-duplicate of the speaker's own earlier turn and sentence loops", () => {
    expect(repetitionCheck(base(ON_TOPIC, { ownPrior: [ON_TOPIC] })).passed).toBe(false);
    const loop = `${ON_TOPIC} ${ON_TOPIC}`;
    expect(repetitionCheck(base(loop)).reason).toMatch(/Satzschleife/);
    // Moderator lines are templated and exempt.
    expect(
      repetitionCheck(base(ON_TOPIC, { speaker: "moderator", ownPrior: [ON_TOPIC] })).passed,
    ).toBe(true);
  });

  it("flags English, meta talk, internal ids and first person singular", () => {
    expect(
      registerCheck(
        base("We support the proposal and we think that the funding is for the patients."),
      ).passed,
    ).toBe(false);
    expect(registerCheck(base("Als KI können wir dazu nichts sagen.")).passed).toBe(false);
    expect(registerCheck(base("Wir greifen das Angebot in u4-17 auf.")).passed).toBe(false);
    expect(registerCheck(base("Ich denke, die Terminzusage ist richtig.")).passed).toBe(false);
    expect(registerCheck(base("Wir tragen p-01 mit, sofern die Finanzierung steht.")).passed).toBe(
      true,
    );
  });

  it("requires a proposal or a justified objection in negotiation phases only", () => {
    const vague =
      "Wir fordern eine klare Stellenplanung innerhalb des Gesamtvertrags, keine Ausnahmen.";
    expect(negotiationCheck(base(vague, { phase: 3 }))?.passed).toBe(false);
    expect(negotiationCheck(base(vague, { phase: 2 }))).toBeNull();
    expect(negotiationCheck(base(vague, { phase: 3, exchangeKind: "caucus" }))).toBeNull();
    expect(negotiationCheck(base(ON_TOPIC, { phase: 4 }))?.passed).toBe(true);
    const objection =
      "Wir lehnen p-03 in dieser Fassung ab, weil die Umschichtungsquelle nicht beziffert ist.";
    expect(negotiationCheck(base(objection, { phase: 3 }))?.passed).toBe(true);
  });

  it("ignores ids and mandate figures in grounding, flags loose numbers", () => {
    const numbers = new Set(["20", "5", "4"]);
    const ok = groundingCheck({
      text: "Wir greifen u3-17 und p-01 auf: 20 % kürzere Wartezeiten bei 5 % Deckel.",
      mandateNumbers: numbers,
      claims: [],
      expertNotes: [],
    });
    expect(ok.reasons).toEqual([]);
    const loose = groundingCheck({
      text: "Die Maßnahme kostet 840 Mio. EUR pro Jahr.",
      mandateNumbers: numbers,
      claims: [],
      expertNotes: [],
    });
    expect(loose.reasons[0]?.reason).toMatch(/840/);
    const marked = groundingCheck({
      text: "Wir schätzen die Kosten auf rund 840 Mio. EUR pro Jahr.",
      mandateNumbers: numbers,
      claims: [],
      expertNotes: [],
    });
    expect(marked.reasons).toEqual([]);
  });

  it("measures novelty inside an exchange", () => {
    expect(noveltyOf(ON_TOPIC, [ON_TOPIC])).toBe(0);
    expect(noveltyOf(ON_TOPIC, ["Die Pflege braucht erweiterte Kompetenzen."])).toBeGreaterThan(
      0.6,
    );
  });
});

describe("quality audit preparation", () => {
  it("judges each utterance by the other model family", () => {
    process.env.SV_SECOND_MODEL ??= "bedrock/eu.amazon.nova-pro-v1:0";
    expect(judgeFor("azure/gpt-6-sol")).not.toMatch(/^azure\//);
    expect(judgeFor("bedrock/eu.amazon.nova-pro-v1:0")).toMatch(/^azure\//);
  });

  it("batches every non-degraded utterance of the reference run", () => {
    const p = prepare(events);
    const snap = foldRun(events);
    const live = snap.utteranceOrder.filter((id) => !snap.utterances[id]?.degraded);
    expect(p.prepared.length).toBe(live.length);
    const targets = p.batches.flatMap((b) => b.targets.map((t) => t.id));
    expect(new Set(targets).size).toBe(live.length);
    for (const b of p.batches) expect(b.targets.length).toBeLessThanOrEqual(6);
  });

  it("flags only major issues, low dimensions or a low overall score", () => {
    const scores = {
      relevanceMandate: 1,
      relevanceExchange: 1,
      responsiveness: 1,
      grounding: 0.8,
      repetition: 1,
      consistency: 1,
      register: 1,
      con: 1,
    };
    const q = {
      utteranceId: "u1-02",
      speaker: "sv",
      round: 1,
      exchangeId: null,
      model: "azure/gpt-6-sol",
      judgeModel: null,
      scores,
      overall: 0.97,
      flags: [
        {
          dimension: "grounding" as const,
          source: "deterministic" as const,
          severity: "minor" as const,
          reason: "x",
        },
      ],
    };
    expect(isFlagged(q)).toBe(false);
    expect(isFlagged({ ...q, scores: { ...scores, register: 1 / 3 } })).toBe(true);
    expect(
      isFlagged({
        ...q,
        flags: [{ ...q.flags[0], severity: "major" as const } as (typeof q.flags)[number]],
      }),
    ).toBe(true);
  });
});
