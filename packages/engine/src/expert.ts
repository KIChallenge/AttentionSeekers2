// Experte agent (FR-N1, N2, N7, FR-T10): checks numeric and factual claims against the
// cited passages and against each other. Two independent verifier calls; disagreement
// leaves a claim unverified, any contradiction marks it contradicted.
import type { Claim, ModelVerdict } from "@sv/contracts";
import { z } from "zod";
import { L } from "./config.ts";
import { type CallMeta, structured } from "./llm.ts";
import type { RunState } from "./state.ts";

const CheckOut = z.object({
  checks: z.array(
    z.object({
      claimId: z.string(),
      verdict: z.enum(["supported", "partial", "unsupported", "contradicted"]),
      reason: z.string(),
      contradictsClaimId: z.string().nullable(),
      contradictionNote: z.string().nullable(),
    }),
  ),
});
type Check = z.infer<typeof CheckOut>["checks"][number];

export interface ExpertResult {
  updated: Claim[];
  notes: Array<{ utteranceIds: string[]; note: string; noteEn: string | null }>;
  metas: CallMeta[];
  checked: number;
}

function claimLine(s: RunState, c: Claim): string {
  const sources = c.citations
    .map((ref) => {
      const p = s.passages.get(ref.segmentId);
      return p ? `[${p.institutionCode} ${p.date}] ${p.text}` : `[${ref.segmentId}]`;
    })
    .join(" | ");
  return `${c.id} (${c.utteranceId}, ${c.kind}${c.numeric ? `, Wert ${c.numeric.value} ${c.numeric.unit}` : ""}): "${c.atomicText}"\n   Belege: ${sources || "keine (Annahme)"}`;
}

async function check(
  s: RunState,
  model: string,
  name: string,
  stance: string,
  fresh: Claim[],
  earlier: Claim[],
): Promise<{ checks: Check[]; meta: CallMeta } | null> {
  const user = [
    "Prüfe jede neue Aussage gegen ihre Belege und gegen frühere Aussagen anderer Akteure.",
    "verdict: supported = Beleg trägt die Aussage; partial = teilweise; unsupported = Beleg fehlt oder trägt sie nicht; contradicted = widerspricht einer früheren Aussage oder dem Beleg.",
    "Wenn zwei Aussagen numerisch oder sachlich unvereinbar sind, setze contradictsClaimId und erkläre kurz, ob unterschiedliche Stichtage oder Abgrenzungen das erklären.",
    "Nenne niemals reale Personen. Kein Gedankenstrich-Zeichen.",
    "",
    `Neue Aussagen:\n${fresh.map((c) => claimLine(s, c)).join("\n")}`,
    "",
    `Frühere Aussagen:\n${
      earlier
        .slice(-30)
        .map((c) => `${c.id} (${c.utteranceId}): "${c.atomicText}"`)
        .join("\n") || "keine"
    }`,
  ].join("\n");
  try {
    const r = await structured(model, name, CheckOut, [
      {
        role: "system",
        content: `Du bist der Experte für Zahlen und Fakten im österreichischen Gesundheitswesen. ${stance}`,
      },
      { role: "user", content: user },
    ]);
    return { checks: r.data.checks, meta: r.meta };
  } catch (error) {
    console.warn("expert_failed", name, error instanceof Error ? error.message : error);
    return null;
  }
}

export async function runExpert(
  s: RunState,
  fresh: Claim[],
  expertModel: string,
  verifierModel: string,
): Promise<ExpertResult> {
  const checkable = fresh.filter((c) => c.kind !== "normative");
  const result: ExpertResult = { updated: [], notes: [], metas: [], checked: checkable.length };
  if (checkable.length === 0) return result;
  const freshIds = new Set(checkable.map((c) => c.id));
  const earlier = [...s.claims.values()].filter(
    (c) => !freshIds.has(c.id) && c.kind !== "normative",
  );
  const [a, b] = await Promise.all([
    check(s, expertModel, "expert_check", "Erste Prüfung.", checkable, earlier),
    check(
      s,
      verifierModel,
      "expert_verify",
      "Unabhängige Zweitprüfung: sei streng, akzeptiere nur, was der Beleg wörtlich oder rechnerisch trägt.",
      checkable,
      earlier,
    ),
  ]);
  for (const r of [a, b]) if (r) result.metas.push(r.meta);
  const byId = (r: typeof a) => new Map((r?.checks ?? []).map((c) => [c.claimId, c]));
  const ca = byId(a);
  const cb = byId(b);
  const known = new Map([...s.claims.values()].map((c) => [c.id, c]));
  const pairs = new Set<string>();
  for (const claim of checkable) {
    const verdicts: ModelVerdict[] = [];
    const x = ca.get(claim.id);
    const y = cb.get(claim.id);
    if (x)
      verdicts.push({
        model: a?.meta.model ?? expertModel,
        verdict: x.verdict,
        reason: x.reason.slice(0, 300),
      });
    if (y)
      verdicts.push({
        model: b?.meta.model ?? verifierModel,
        verdict: y.verdict,
        reason: `${y.reason.slice(0, 280)}${verifierModel === expertModel ? " (Zweitprüfung, gleiches Modell)" : ""}`,
      });
    if (verdicts.length === 0) continue;
    const contra = [x, y].find(
      (v) =>
        v?.contradictsClaimId &&
        known.has(v.contradictsClaimId) &&
        v.contradictsClaimId !== claim.id,
    );
    let state: Claim["state"];
    if (claim.citations.length === 0) state = "assumption";
    else if (verdicts.some((v) => v.verdict === "contradicted") || contra) state = "contradicted";
    else if (verdicts.length === 2 && verdicts.every((v) => v.verdict === "supported"))
      state = "verified";
    else state = "unverified";
    const updated: Claim = {
      ...claim,
      state,
      verifyingModels: verdicts,
      contradiction: contra?.contradictsClaimId
        ? {
            withClaimId: contra.contradictsClaimId,
            note: L(contra.contradictionNote ?? contra.reason),
            resolution: "unresolved",
          }
        : null,
    };
    result.updated.push(updated);
    if (contra?.contradictsClaimId) {
      const other = known.get(contra.contradictsClaimId);
      const key = [claim.id, contra.contradictsClaimId].sort().join("|");
      if (other && !pairs.has(key)) {
        pairs.add(key);
        result.notes.push({
          utteranceIds: [...new Set([other.utteranceId, claim.utteranceId])],
          note: `${claim.atomicText} / ${other.atomicText}: ${contra.contradictionNote ?? contra.reason}`,
          noteEn: null,
        });
      }
    }
  }
  return result;
}
