// Picks the arms the /models table compares from persona_fidelity.json: the best fine-tuned
// adapter version, its prompted base (sv-base) and the best in-context arm. "Best" is the
// micro-average stance direction, then in-character; nothing is hardcoded but the field names.
import type { Fidelity } from "./data.server";

type Versions = NonNullable<Fidelity["versions"]>;
export type Arm = Versions[string];
export type Scores = Arm["institutions"][string];

export interface Micro {
  n: number;
  sign: number | null;
  char: number | null;
}

/** n-weighted mean over institutions of one side of an arm. */
export function micro(arm: Arm, side: "adapter" | "baseline"): Micro {
  let n = 0;
  let sign = 0;
  let char = 0;
  let charN = 0;
  for (const s of Object.values(arm.institutions)) {
    n += s.n;
    sign += s.n * (side === "adapter" ? s.stance_sign_adapter : s.stance_sign_baseline);
    const c = side === "adapter" ? s.adapter : s.baseline;
    if (c !== null) {
      char += s.n * c;
      charN += s.n;
    }
  }
  return { n, sign: n ? sign / n : null, char: charN ? char / charN : null };
}

const isContext = (a: Arm) => a.kind === "context_persona";

function best(arms: Array<[string, Arm]>): [string, Arm] | null {
  let top: [string, Arm] | null = null;
  let topM: Micro | null = null;
  for (const e of arms) {
    const m = micro(e[1], "adapter");
    if (
      !topM ||
      (m.sign ?? -1) > (topM.sign ?? -1) ||
      ((m.sign ?? -1) === (topM.sign ?? -1) && (m.char ?? -1) > (topM.char ?? -1))
    ) {
      top = e;
      topM = m;
    }
  }
  return top;
}

export interface ArmPick {
  adapter: [string, Arm];
  context: [string, Arm] | null;
  /** Earlier adapter versions, in file order (v1, v1-fix, v2). */
  rest: Array<[string, Arm]>;
}

export function pickArms(f: Fidelity | null): ArmPick | null {
  const all = Object.entries(f?.versions ?? {});
  const adapter = best(all.filter(([, a]) => !isContext(a)));
  if (!adapter) return null;
  const context = best(all.filter(([, a]) => isContext(a)));
  const rest = all.filter(([k, a]) => !isContext(a) && k !== adapter[0]);
  return { adapter, context, rest };
}

/** Short model name of an in-context arm key: "dossier-qwen3-235b" -> "qwen3-235b". */
export const armModel = (key: string) => key.replace(/^(dossier|card)-/, "");

/** Indexes of the maximum values (ties all win); empty when nothing is measured. */
export function winners(xs: Array<number | null | undefined>): Set<number> {
  const vals = xs.map((x) => (x === null || x === undefined ? Number.NEGATIVE_INFINITY : x));
  const top = Math.max(...vals);
  if (top === Number.NEGATIVE_INFINITY) return new Set();
  return new Set(vals.flatMap((v, i) => (v === top ? [i] : [])));
}
