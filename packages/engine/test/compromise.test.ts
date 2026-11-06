import {
  type CompromisePackage,
  emptySnapshot,
  FAST_PRESET,
  type Proposal,
  RoomConfig,
  type RunEvent,
  reduceRun,
  withPace,
} from "@sv/contracts";
import { describe, expect, it } from "vitest";
import { closeness, closestProposals, packageText, tallyCompromise } from "../src/compromise.ts";
import { defaultRoom } from "../src/room.ts";

const AG = ["gm", "sv", "ak", "va", "ka", "pf", "bl", "pv", "fm"];
const VETO = ["sv", "ak", "fm"];

const prop = (id: string, sup: string[], cond: string[], opp: string[], status = "open") =>
  ({
    id,
    originAgent: "gm",
    round: 1,
    topicIds: [],
    title: { lang: "de", text: id, translations: {} },
    cost: null,
    acceptance: 0.5,
    feasibility: 0.5,
    supporters: sup,
    opponents: opp,
    conditional: cond,
    status,
    rejectionReason: null,
    outcomeClass: null,
    alternativeTo: null,
  }) as Proposal;

describe("closest proposals", () => {
  it("weights conditional support half and skips withdrawn proposals", () => {
    const a = prop("p-a", ["gm", "sv"], ["ak", "va"], ["pf"]);
    const b = prop("p-b", ["gm", "sv", "ak"], [], ["pf", "bl"]);
    const c = prop("p-c", AG, [], [], "withdrawn");
    expect(closeness(a, 9)).toBeCloseTo(3 / 9);
    expect(closestProposals([a, b, c], 9).map((p) => p.id)).toEqual(["p-a", "p-b"]);
  });
});

describe("tallyCompromise", () => {
  const vote = (agentId: string, stance: "support" | "conditional" | "oppose") => ({
    agentId,
    stance,
  });
  const room = (decisionRule: RoomConfig["decisionRule"]) => ({
    decisionRule,
    qualifiedMajority: null,
  });

  it("counts conditional support as yes under veto players", () => {
    const votes = [
      ...["gm", "sv", "ak", "fm"].map((a) => vote(a, "support" as const)),
      vote("va", "conditional"),
      ...["ka", "pf", "bl", "pv"].map((a) => vote(a, "oppose" as const)),
    ];
    const r = tallyCompromise("k-5", votes, room("veto_players"), AG, VETO);
    expect(r.needed).toBe(5);
    expect(r.passes).toBe(true);
    expect(r.conditional).toEqual(["va"]);
    expect(r.note.text).toContain("tragfähig");
  });

  it("fails when a veto player opposes, and says why", () => {
    const votes = AG.map((a) => vote(a, a === "fm" ? "oppose" : "support"));
    const r = tallyCompromise("k-5", votes, room("veto_players"), AG, VETO);
    expect(r.passes).toBe(false);
    expect(r.missingVetoPlayers).toEqual(["fm"]);
    expect(r.note.text).toContain("gescheitert");
  });

  it("needs every vote under consensus; a missing answer is not a yes", () => {
    const all = AG.map((a) => vote(a, "conditional"));
    expect(tallyCompromise("k", all, room("consensus"), AG, VETO).passes).toBe(true);
    expect(tallyCompromise("k", all.slice(1), room("consensus"), AG, VETO).passes).toBe(false);
  });
});

describe("compromise events fold", () => {
  it("keeps the package, the votes and the result on the snapshot", () => {
    const pkg: CompromisePackage = {
      id: "k-5",
      round: 5,
      title: { lang: "de", text: "Paket", translations: { en: "Package" } },
      rationale: { lang: "de", text: "Weil.", translations: {} },
      components: [{ text: { lang: "de", text: "Baustein", translations: {} }, proposalIds: [] }],
      conditions: [
        { kind: "evaluation", text: { lang: "de", text: "nach 2 Jahren", translations: {} } },
      ],
      basedOn: ["p-01"],
      expected: { support: ["gm"], conditional: [], oppose: [] },
      redLinesTouched: [],
      utteranceId: "u5-20",
    };
    const env = { v: 1 as const, runId: "r", tMs: 0 };
    const events: RunEvent[] = [
      { ...env, seq: 0, type: "compromise.proposed", compromise: pkg },
      {
        ...env,
        seq: 1,
        type: "compromise.vote",
        vote: {
          packageId: "k-5",
          agentId: "gm",
          stance: "conditional",
          condition: { lang: "de", text: "Bundesmittel", translations: {} },
          reason: { lang: "de", text: "ok", translations: {} },
          redLinesTouched: [],
          utteranceId: "u5-21",
          model: "m",
        },
      },
      {
        ...env,
        seq: 2,
        type: "compromise.result",
        result: tallyCompromise(
          "k-5",
          [{ agentId: "gm", stance: "conditional" }],
          {
            decisionRule: "consensus",
            qualifiedMajority: null,
          },
          ["gm"],
          [],
        ),
      },
    ];
    let s = emptySnapshot();
    for (const e of events) s = reduceRun(s, e);
    expect(s.compromise?.id).toBe("k-5");
    expect(s.compromiseVotes?.gm?.stance).toBe("conditional");
    expect(s.compromiseResult?.passes).toBe(true);
    expect(packageText(pkg).de).toMatch(/^Kompromissvorschlag des Moderators: Paket\./);
  });
});

describe("fast preset", () => {
  it("sets two rounds, the fast seats and keeps the room valid", () => {
    const room = withPace(
      defaultRoom({ question: "Wie?", template: "wartezeiten", seed: 1 }),
      "fast",
    );
    expect(RoomConfig.safeParse(room).success).toBe(true);
    expect(room.roundLimit).toBe(FAST_PRESET.roundLimit);
    expect(room.pace).toBe("fast");
    expect(room.agents.find((a) => a.agentId === "va")?.model).toBe(FAST_PRESET.seats.va);
    expect(new Set(room.agents.map((a) => a.model.split("/")[1]?.split(/[.-]/)[0])).size).toBe(3);
  });
});
