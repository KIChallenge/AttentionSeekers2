import { describe, expect, it } from "vitest";
import { agentConfigOf, delegatesOf, profileOf } from "../src/config.ts";
import {
  type Conflict,
  conflictsFromStances,
  type Lane,
  lanes,
  MAX_EXCHANGE_TURNS,
  MeetingClock,
  type PlanInput,
  pickDelegate,
  pickInterjector,
  selectBilaterals,
  selectCaucuses,
  speakingMinutes,
  touchesInterests,
  turnOrder,
} from "../src/exchanges.ts";
import { findPersonNames } from "../src/guard.ts";

const AG = ["gm", "sv", "ak", "va", "ka", "pf", "bl", "pv", "fm"];
const OWNERS: Record<string, string> = {
  "rl-ak-1": "ak",
  "rl-ak-2": "ak",
  "rl-fm-1": "fm",
  "rl-va-1": "va",
  "rl-sv-1": "sv",
  "rl-bl-1": "bl",
};

function input(
  stances: Record<string, Record<string, [number, number]>>,
  conflicts: Conflict[],
  extra: Partial<PlanInput> = {},
): PlanInput {
  return {
    conflicts,
    stanceOf: (a, t) => {
      const x = stances[a]?.[t];
      return x ? { stance: x[0], strength: x[1] } : undefined;
    },
    vetoPlayers: ["sv", "ak", "fm"],
    eligible: () => true,
    redLineOwner: (id) => OWNERS[id],
    labelOf: (t) => ({ de: t, en: t }),
    nameOf: (a) => a.toUpperCase(),
    seated: AG,
    ...extra,
  };
}

const STANCES: Record<string, Record<string, [number, number]>> = {
  gm: { "t-stellen": [1.5, 0.8], "t-pflege": [1, 0.6] },
  sv: { "t-stellen": [1, 0.6], "t-pflege": [1.5, 0.9] },
  ka: { "t-stellen": [0.5, 0.4] },
  ak: { "t-stellen": [-2, 1], "t-pflege": [-1.5, 0.9] },
  va: { "t-stellen": [-1, 0.5] },
  pf: { "t-pflege": [2, 1] },
  fm: { "t-stellen": [-0.5, 0.7] },
};

describe("conflicts from stances", () => {
  it("needs someone at or above +0.5 and someone at or below -0.5", () => {
    const st = input(STANCES, []).stanceOf;
    const c = conflictsFromStances(["t-stellen", "t-pflege", "t-tele"], AG, st);
    expect(c.map((x) => x.topicId)).toEqual(["t-stellen", "t-pflege"]);
    expect(c[0]?.sides[1]).toEqual(["ak", "va", "fm"]);
  });
});

describe("exchange selection from conflicts", () => {
  const conflicts = conflictsFromStances(
    ["t-stellen", "t-pflege"],
    AG,
    input(STANCES, []).stanceOf,
  );

  it("pairs the strongest antagonists of the sharpest conflict, veto players first", () => {
    const plans = selectBilaterals(input(STANCES, conflicts), 2);
    expect(plans[0]?.kind).toBe("bilateral");
    expect(plans[0]?.participants).toContain("ak");
    for (const p of plans) {
      expect(p.participants.length).toBeGreaterThanOrEqual(2);
      expect(p.participants.length).toBeLessThanOrEqual(3);
    }
  });

  it("keeps participants disjoint and topics distinct across exchanges", () => {
    const plans = selectBilaterals(input(STANCES, conflicts), 2);
    expect(plans).toHaveLength(2);
    const all = plans.flatMap((p) => p.participants);
    expect(new Set(all).size).toBe(all.length);
    expect(new Set(plans.map((p) => p.topicId)).size).toBe(plans.length);
  });

  it("brings in the holder of a binding red line as third party", () => {
    const bound: Conflict[] = [
      { topicId: "t-stellen", sides: [["gm", "sv"], ["va"]], boundBy: ["rl-fm-1"] },
    ];
    const [plan] = selectBilaterals(input(STANCES, bound), 1);
    expect(plan?.participants).toHaveLength(3);
    expect(plan?.participants).toContain("fm");
    expect(plan?.turns).toHaveLength(5);
  });

  it("opens an exchange between the author of the tabled proposal and its blockers", () => {
    const [plan] = selectBilaterals(
      input(STANCES, conflicts, {
        tabled: {
          proposalId: "p-02",
          topicIds: ["t-tss"],
          origin: "gm",
          supporters: ["gm", "sv", "pv"],
          conditional: ["va"],
          opponents: [],
          blockers: ["fm"],
        },
      }),
      2,
    );
    expect(plan?.participants[0]).toBe("gm");
    expect(plan?.participants[1]).toBe("fm");
    expect(plan?.trigger.de).toContain("p-02");
  });

  it("skips agents that are not eligible (optional agents outside their interests)", () => {
    const plans = selectBilaterals(input(STANCES, conflicts, { eligible: (a) => a !== "ak" }), 2);
    expect(plans.flatMap((p) => p.participants)).not.toContain("ak");
  });

  it("returns nothing without conflicts or tabled proposal", () => {
    expect(selectBilaterals(input(STANCES, []), 2)).toEqual([]);
  });
});

describe("caucuses", () => {
  it("forms up to two disjoint coalitions on opposite sides with 1 to 3 turns", () => {
    const conflicts = conflictsFromStances(["t-stellen"], AG, input(STANCES, []).stanceOf);
    const plans = selectCaucuses(input(STANCES, conflicts), () => 0, 2);
    expect(plans).toHaveLength(2);
    const [a, b] = plans;
    expect(a?.kind).toBe("caucus");
    expect(a?.participants.some((x) => b?.participants.includes(x))).toBe(false);
    for (const p of plans) {
      expect(p.participants.length).toBeGreaterThanOrEqual(2);
      expect(p.turns.length).toBeGreaterThanOrEqual(1);
      expect(p.turns.length).toBeLessThanOrEqual(3);
    }
  });

  it("orders partners by affinity from the strategic assessments", () => {
    const conflicts: Conflict[] = [
      {
        topicId: "t-stellen",
        sides: [
          ["gm", "sv", "ka", "pv"],
          ["ak", "va"],
        ],
        boundBy: [],
      },
    ];
    const plans = selectCaucuses(input(STANCES, conflicts), (_a, b) => (b === "pv" ? 0.9 : 0.1), 1);
    expect(plans[0]?.participants[0]).toBe("sv");
    expect(plans[0]?.participants[1]).toBe("pv");
  });
});

describe("alternation", () => {
  it("never lets the same institution speak twice in a row", () => {
    for (const parts of [
      ["ak", "sv"],
      ["gm", "fm", "bl"],
    ]) {
      for (const n of [3, 4, 5, 6]) {
        const order = turnOrder(parts, n);
        expect(order).toHaveLength(n);
        for (let i = 1; i < order.length; i++) expect(order[i]).not.toBe(order[i - 1]);
        for (const p of parts) expect(order).toContain(p);
      }
    }
  });

  it("plans stay within 3 to 6 turns including one interjection", () => {
    const conflicts = conflictsFromStances(
      ["t-stellen", "t-pflege"],
      AG,
      input(STANCES, []).stanceOf,
    );
    for (const p of selectBilaterals(input(STANCES, conflicts), 2)) {
      expect(p.turns.length).toBeGreaterThanOrEqual(3);
      expect(p.turns.length + 1).toBeLessThanOrEqual(MAX_EXCHANGE_TURNS);
    }
  });
});

describe("interjection rule", () => {
  const base = {
    participants: ["gm", "sv"],
    seated: AG,
    redLineOwner: (id: string) => OWNERS[id],
  };
  it("lets the holder of a touched red line interject", () => {
    expect(pickInterjector({ ...base, touched: ["rl-ak-1"], alreadyInterjected: false })).toEqual({
      agentId: "ak",
      redLineId: "rl-ak-1",
    });
  });
  it("allows at most one interjection per exchange", () => {
    expect(pickInterjector({ ...base, touched: ["rl-ak-1"], alreadyInterjected: true })).toBeNull();
  });
  it("ignores red lines of participants and of institutions not in the room", () => {
    expect(
      pickInterjector({ ...base, touched: ["rl-sv-1"], alreadyInterjected: false }),
    ).toBeNull();
    expect(
      pickInterjector({
        ...base,
        seated: ["gm", "sv"],
        touched: ["rl-ak-1"],
        alreadyInterjected: false,
      }),
    ).toBeNull();
  });
  it("does nothing when no red line is touched", () => {
    expect(pickInterjector({ ...base, touched: [], alreadyInterjected: false })).toBeNull();
  });
});

describe("meeting time", () => {
  it("speaks at about 130 words per minute", () => {
    expect(speakingMinutes(Array(130).fill("Wort").join(" "))).toBe(1);
    expect(speakingMinutes("kurz")).toBe(0.1);
  });

  it("is monotonic for sequential exchanges and overlaps only for caucus branches", () => {
    const clock = new MeetingClock();
    const placed: Array<{ startMin: number; durationMin: number; caucus?: number }> = [];
    for (let i = 0; i < 4; i++) placed.push(clock.place(Array(60).fill("x").join(" ")));
    clock.gap();
    const branches = [clock.branch(), clock.branch()];
    const base = clock.now;
    for (const [k, b] of branches.entries())
      for (let i = 0; i < 2; i++)
        placed.push({
          ...b.place(
            Array(40 + k * 30)
              .fill("x")
              .join(" "),
          ),
          caucus: k,
        });
    clock.join(branches);
    placed.push(clock.place("Plenum"));

    // Sequential part strictly increasing and non-overlapping.
    for (let i = 1; i < 4; i++) {
      const a = placed[i - 1];
      const b = placed[i];
      expect(b?.startMin).toBeGreaterThanOrEqual((a?.startMin ?? 0) + (a?.durationMin ?? 0));
    }
    // Both caucuses start at the same minute (they overlap).
    const c0 = placed.filter((p) => p.caucus === 0);
    const c1 = placed.filter((p) => p.caucus === 1);
    expect(c0[0]?.startMin).toBe(base);
    expect(c1[0]?.startMin).toBe(base);
    // The plenary after the caucuses starts after the longer caucus has ended.
    const last = placed.at(-1);
    const caucusEnd = Math.max(...[...c0, ...c1].map((p) => p.startMin + p.durationMin));
    expect(last?.startMin).toBeGreaterThanOrEqual(caucusEnd);
  });
});

describe("ordered commit lanes", () => {
  it("commits later lanes only after earlier lanes ended", async () => {
    const log: string[] = [];
    const [a, b] = lanes(2) as [Lane, Lane];
    b.do(() => log.push("b1"));
    await Promise.resolve();
    a.do(() => log.push("a1"));
    b.do(() => log.push("b2"));
    b.end();
    a.do(() => log.push("a2"));
    a.end();
    await b.done;
    expect(log).toEqual(["a1", "a2", "b1", "b2"]);
  });
});

describe("delegates (CON-1/CON-2)", () => {
  it("gives every institution two or three unnamed functional roles", () => {
    for (const a of [...AG, "nr", "ph", "wk", "abk", "lk", "ind"]) {
      const d = delegatesOf(a);
      expect(d.length).toBeGreaterThanOrEqual(2);
      expect(d.length).toBeLessThanOrEqual(3);
      for (const x of d) {
        expect(findPersonNames(x.role.de)).toEqual([]);
        expect(findPersonNames(x.role.en)).toEqual([]);
      }
      expect(agentConfigOf(a).delegates?.length).toBe(d.length);
    }
  });

  it("picks the topic specialist in a bilateral and the lead in plenary and caucus", () => {
    const d = delegatesOf("ak");
    expect(pickDelegate(d, "contract_posts", "bilateral")).toBe("ak-recht");
    expect(pickDelegate(d, "nursing_first_contact", "bilateral")).toBe("ak-beruf");
    expect(pickDelegate(d, "contract_posts", "plenary")).toBe("ak-lead");
    expect(pickDelegate(d, "contract_posts", "caucus")).toBe("ak-lead");
    expect(pickDelegate(d, "unknown_key", "bilateral")).toBe("ak-lead");
  });
});

describe("optional agents join only where their interests are touched", () => {
  it("core agents always, optional ones by red line or keyword", () => {
    const base = { topicKey: "telemedicine", topicLabel: "Telemedizin", redLineTopicKeys: [] };
    expect(touchesInterests({ ...base, origin: "core", keywords: "" })).toBe(true);
    expect(touchesInterests({ ...base, origin: "optional", keywords: "Arzneimittel" })).toBe(false);
    expect(
      touchesInterests({ ...base, origin: "optional", keywords: "Digitalisierung Telemedizin" }),
    ).toBe(true);
    expect(
      touchesInterests({
        ...base,
        origin: "optional",
        keywords: "",
        redLineTopicKeys: ["telemedicine"],
      }),
    ).toBe(true);
    expect(profileOf("ind").keywords.length).toBeGreaterThan(0);
  });
});
