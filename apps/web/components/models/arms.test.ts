import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { armModel, micro, pickArms, winners } from "./arms";
import type { Fidelity } from "./data.server";
import { parseVersionLoops } from "./data.server";

const models = path.resolve(import.meta.dirname, "../../../../models");
const fidelity = JSON.parse(
  readFileSync(path.join(models, "out/persona_fidelity.json"), "utf8"),
) as Fidelity;

describe("pickArms on persona_fidelity.json", () => {
  const pick = pickArms(fidelity);

  it("compares the best adapter version with the best in-context arm", () => {
    expect(pick?.adapter[0]).toBe("v2.1");
    expect(pick?.context?.[0]).toBe("dossier-qwen3-235b");
    expect(armModel(pick?.context?.[0] ?? "")).toBe("qwen3-235b");
    expect(pick?.rest.map(([k]) => k)).toEqual(["v1", "v1-fix", "v2"]);
  });

  it("micro-averages match the file's own n-weighted totals", () => {
    const ad = pick?.adapter[1];
    if (!ad) throw new Error("no adapter arm");
    const m = micro(ad, "adapter");
    expect(m.n).toBe(ad.all.n);
    expect(m.sign).toBeCloseTo(ad.all.stance_sign_adapter, 3);
    expect(m.char).toBeCloseTo(ad.all.adapter ?? 0, 3);
  });

  it("v2.1 beats the prompted base on stance direction for five institutions", () => {
    const ad = pick?.adapter[1];
    const wins = Object.values(ad?.institutions ?? {}).filter(
      (s) => s.stance_sign_adapter > s.stance_sign_baseline,
    );
    expect(wins).toHaveLength(5);
  });
});

describe("winners", () => {
  it("marks every tied maximum and ignores gaps", () => {
    expect([...winners([0.5, null, 0.5])]).toEqual([0, 2]);
    expect(winners([null, undefined]).size).toBe(0);
  });
});

describe("parseVersionLoops", () => {
  it("reads the Loops list of eval_v2.md", () => {
    const md =
      "- `v1` (no fix): 82 of 244 adapter outputs loop\n- `v2.1` (fixed proxy): 0 of 244 raw";
    expect(parseVersionLoops(md)).toEqual({ v1: { n: 82, of: 244 }, "v2.1": { n: 0, of: 244 } });
  });
});
