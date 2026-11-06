import { CoalitionCalculus } from "@sv/contracts";
import { describe, expect, it } from "vitest";
import {
  blockersFor,
  computeCalculus,
  isWinning,
  minimalWinningCoalitions,
  outcomeClassOf,
  quorumFor,
} from "../src/coalition.ts";

const AG = ["gm", "sv", "ak", "va", "ka", "pf", "bl", "pv", "fm"];
const VETO = ["sv", "ak", "fm"];

describe("quorumFor", () => {
  it("follows the decision rule", () => {
    expect(quorumFor("consensus", 9, null)).toBe(9);
    expect(quorumFor("veto_players", 9, null)).toBe(5);
    expect(quorumFor("qualified_majority", 9, null)).toBe(6);
    expect(quorumFor("qualified_majority", 9, { needed: 3, of: 4 })).toBe(7);
    expect(quorumFor("veto_players", 0, null)).toBe(0);
  });

  it("takes an explicit quorum under veto_players (government-majority backtest)", () => {
    expect(quorumFor("veto_players", 9, { needed: 1, of: 3 })).toBe(3);
    expect(isWinning(["gm", "fm", "nr"], "veto_players", 9, 3, ["gm", "fm", "nr"])).toBe(true);
    expect(isWinning(["gm", "fm", "sv"], "veto_players", 9, 3, ["gm", "fm", "nr"])).toBe(false);
  });
});

describe("isWinning", () => {
  it("needs every veto player under veto_players", () => {
    expect(isWinning(["gm", "sv", "ak", "fm", "pv"], "veto_players", 9, 5, VETO)).toBe(true);
    expect(isWinning(["gm", "sv", "ak", "pv", "bl", "ka"], "veto_players", 9, 5, VETO)).toBe(false);
    expect(isWinning(["gm", "sv", "ak", "fm"], "veto_players", 9, 5, VETO)).toBe(false);
  });
  it("ignores veto players under qualified majority", () => {
    expect(isWinning(["gm", "va", "ka", "pf", "bl", "pv"], "qualified_majority", 9, 6, VETO)).toBe(
      true,
    );
  });
});

describe("minimalWinningCoalitions", () => {
  it("returns sets of quorum size containing all veto players, supporters first", () => {
    const mwc = minimalWinningCoalitions(
      ["sv", "ak", "fm", "gm"],
      ["pv", "bl"],
      "veto_players",
      9,
      5,
      VETO,
    );
    expect(mwc.length).toBeGreaterThan(0);
    for (const c of mwc) {
      expect(c).toHaveLength(5);
      for (const v of VETO) expect(c).toContain(v);
      // removing any member must lose
      for (const m of c)
        expect(
          isWinning(
            c.filter((x) => x !== m),
            "veto_players",
            9,
            5,
            VETO,
          ),
        ).toBe(false);
    }
    // the first coalition needs only one conditional member (gm is a firm supporter)
    expect(mwc[0]).toContain("gm");
  });
  it("is empty when a veto player is not even conditional", () => {
    expect(
      minimalWinningCoalitions(["sv", "ak", "gm", "pv", "bl"], [], "veto_players", 9, 5, VETO),
    ).toEqual([]);
  });
  it("needs everyone under consensus", () => {
    expect(minimalWinningCoalitions(AG, [], "consensus", 9, 9, [])).toEqual([[...AG].sort()]);
    expect(minimalWinningCoalitions(AG.slice(1), [], "consensus", 9, 9, [])).toEqual([]);
  });
});

describe("blockersFor", () => {
  it("lists opposing or conditional veto players", () => {
    expect(blockersFor(["fm", "pv"], ["ak"], "veto_players", 9, 5, VETO).sort()).toEqual([
      "ak",
      "fm",
    ]);
  });
  it("adds a blocking minority", () => {
    expect(
      blockersFor(["gm", "va", "ka", "pf"], [], "qualified_majority", 9, 6, []).sort(),
    ).toEqual(["gm", "ka", "pf", "va"]);
    expect(blockersFor(["gm", "va", "ka"], [], "qualified_majority", 9, 6, [])).toEqual([]);
  });
  it("lets every opponent block under consensus", () => {
    expect(blockersFor(["pv"], [], "consensus", 9, 9, [])).toEqual(["pv"]);
  });
});

describe("computeCalculus", () => {
  const votes = (sup: string[], cond: string[], opp: string[]) =>
    Object.fromEntries([
      ...sup.map((a) => [a, "support"]),
      ...cond.map((a) => [a, "conditional"]),
      ...opp.map((a) => [a, "oppose"]),
    ]);
  const calc = computeCalculus({
    runId: "t",
    round: 2,
    agents: AG,
    decisionRule: "veto_players",
    qualifiedMajority: null,
    vetoPlayers: VETO,
    proposals: [
      {
        proposalId: "p-01",
        topicIds: ["t-a"],
        votes: votes(["pv", "gm"], ["pf"], ["ak", "va", "fm"]),
      },
      {
        proposalId: "p-02",
        topicIds: ["t-b"],
        votes: votes(["sv", "ak", "gm", "bl"], ["fm"], ["pv"]),
      },
      {
        proposalId: "p-03",
        topicIds: ["t-c"],
        votes: votes(["sv", "ak", "fm", "gm", "bl"], [], ["pv"]),
      },
      { proposalId: "p-04", topicIds: ["t-d"], votes: votes(["gm"], [], []), status: "withdrawn" },
    ],
    topicStances: { "t-a": { gm: 2, pv: 1.5, ak: -1.5, fm: -1 } },
  });

  it("is a valid contract entity", () => {
    expect(() => CoalitionCalculus.parse(calc)).not.toThrow();
  });
  it("drops withdrawn proposals", () => {
    expect(calc.proposals.map((p) => p.proposalId)).toEqual(["p-01", "p-02", "p-03"]);
  });
  it("computes support sets, veto coverage and passing", () => {
    const [p1, p2, p3] = calc.proposals;
    expect(p1?.passes).toBe(false);
    expect(p1?.missingVetoPlayers).toEqual(["sv", "ak", "fm"]);
    expect(p1?.blockers.sort()).toEqual(["ak", "fm"]);
    expect(p2?.passes).toBe(false);
    expect(p2?.missingVetoPlayers).toEqual(["fm"]);
    expect(p2?.blockers).toEqual(["fm"]);
    expect(p3?.passes).toBe(true);
    expect(p3?.containsAllVetoPlayers).toBe(true);
    expect(p3?.blockers).toEqual([]);
  });
  it("derives payoffs from votes when no incentives are given", () => {
    expect(calc.proposals[0]?.payoffs).toMatchObject({ pv: 1, ak: -1, pf: 0, sv: 0 });
  });
  it("tables the passing proposal first", () => {
    expect(calc.nextTabled?.proposalId).toBe("p-03");
  });
  it("records supporting, blocking and alignment coalitions", () => {
    const kinds = new Set(calc.coalitions.map((c) => c.kind));
    expect(kinds).toEqual(new Set(["supporting", "blocking", "alignment"]));
    expect(calc.coalitions.find((c) => c.kind === "blocking")?.members).toEqual(["ak", "fm", "va"]);
  });
  it("tables the proposal closest to a winning coalition when nothing passes", () => {
    const c = computeCalculus({
      runId: "t",
      round: 3,
      agents: AG,
      decisionRule: "veto_players",
      qualifiedMajority: null,
      vetoPlayers: VETO,
      proposals: [
        {
          proposalId: "p-01",
          topicIds: [],
          votes: votes(["pv", "gm"], ["pf"], ["ak", "va", "fm"]),
        },
        {
          proposalId: "p-02",
          topicIds: [],
          votes: votes(["sv", "ak", "gm", "bl"], ["fm"], ["pv"]),
        },
      ],
    });
    expect(c.nextTabled?.proposalId).toBe("p-02");
    expect(c.nextTabled?.reason.text).toContain("fm");
  });
});

describe("outcomeClassOf", () => {
  it("follows FR-O2", () => {
    expect(outcomeClassOf(8, 0, 9)).toBe("consensus");
    expect(outcomeClassOf(6, 2, 9)).toBe("majority");
    expect(outcomeClassOf(3, 4, 9)).toBe("minority");
    expect(outcomeClassOf(0, 9, 9)).toBe("no_result");
  });
});
