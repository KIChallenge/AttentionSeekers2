// Compromise synthesis: after the end condition the moderator drafts one conditional
// package from the proposals and positions that came closest, then each institution answers
// once (support, conditional support, opposition with its condition). Nothing is forced:
// the tally is checked against the room's decision rule and reported as it is.
import type {
  CompromisePackage,
  CompromiseResult,
  CompromiseVote,
  DecisionRule,
  Proposal,
} from "@sv/contracts";
import { z } from "zod";
import { nameOf, systemPrompt } from "./agent.ts";
import { quorumFor } from "./coalition.ts";
import { L, redLinesOf } from "./config.ts";
import { type CallMeta, structured } from "./llm.ts";
import { topicTally } from "./moderator.ts";
import type { RunState } from "./state.ts";

const BiOut = z.object({ de: z.string(), en: z.string() });

export const PackageOut = z.object({
  title: BiOut,
  rationale: BiOut,
  components: z.array(z.object({ text: BiOut, proposalIds: z.array(z.string()) })),
  conditions: z.array(
    z.object({
      kind: z.enum(["financing", "evaluation", "sunset", "pilot", "governance", "other"]),
      text: BiOut,
    }),
  ),
  expectedSupport: z.array(z.string()),
  expectedConditional: z.array(z.string()),
  expectedOppose: z.array(z.object({ agentId: z.string(), reason: BiOut })),
  redLinesTouched: z.array(z.object({ redLineId: z.string(), note: BiOut })),
});
export type PackageOut = z.infer<typeof PackageOut>;

export const RatifyOut = z.object({
  stance: z.enum(["support", "conditional", "oppose"]),
  condition: z.string().nullable(),
  conditionEn: z.string().nullable(),
  reason: z.string(),
  reasonEn: z.string(),
  statement: z.string(),
  statementEn: z.string(),
  redLinesTouched: z.array(z.string()),
});
export type RatifyOut = z.infer<typeof RatifyOut>;

/** Share of the table behind a proposal: support counts 1, conditional support 0.5. */
export function closeness(p: Proposal, n: number): number {
  if (n === 0) return 0;
  return (p.supporters.length + 0.5 * p.conditional.length) / n;
}

/** The proposals that came closest, best first (withdrawn ones never count). */
export function closestProposals(proposals: Proposal[], n: number, max = 5): Proposal[] {
  return proposals
    .filter((p) => p.status !== "withdrawn")
    .sort(
      (a, b) =>
        closeness(b, n) - closeness(a, n) ||
        a.opponents.length - b.opponents.length ||
        b.acceptance - a.acceptance,
    )
    .slice(0, max);
}

/** Tally of the ratification round against the decision rule (conditional counts as yes). */
export function tallyCompromise(
  packageId: string,
  votes: Array<Pick<CompromiseVote, "agentId" | "stance">>,
  room: {
    decisionRule: DecisionRule;
    qualifiedMajority: { needed: number; of: number } | null;
  },
  seated: string[],
  vetoPlayers: string[],
): CompromiseResult {
  const of = (st: CompromiseVote["stance"]) =>
    votes.filter((v) => v.stance === st).map((v) => v.agentId);
  const support = of("support");
  const conditional = of("conditional");
  const oppose = of("oppose");
  const yes = new Set([...support, ...conditional]);
  const n = seated.length;
  const needed = quorumFor(room.decisionRule, n, room.qualifiedMajority);
  const missingVetoPlayers =
    room.decisionRule === "veto_players" ? vetoPlayers.filter((v) => !yes.has(v)) : [];
  const passes =
    room.decisionRule === "consensus"
      ? oppose.length === 0 && yes.size >= n
      : yes.size >= needed && missingVetoPlayers.length === 0;
  const tallyDe = `${support.length} dafür, ${conditional.length} bedingt, ${oppose.length} dagegen`;
  const tallyEn = `${support.length} for, ${conditional.length} conditional, ${oppose.length} against`;
  const why = !passes
    ? room.decisionRule === "consensus"
      ? { de: "Konsens verlangt alle Stimmen", en: "consensus needs every vote" }
      : missingVetoPlayers.length
        ? {
            de: `es fehlen die Vetospieler ${missingVetoPlayers.map(nameOf).join(", ")}`,
            en: `missing veto players ${missingVetoPlayers.join(", ")}`,
          }
        : { de: `nötig wären ${needed} von ${n}`, en: `${needed} of ${n} needed` }
    : null;
  return {
    packageId,
    support,
    conditional,
    oppose,
    passes,
    rule: room.decisionRule,
    needed,
    missingVetoPlayers,
    note: passes
      ? L(
          `Kompromissvorschlag tragfähig unter Bedingungen (${tallyDe}).`,
          `Compromise proposal carries with conditions (${tallyEn}).`,
        )
      : L(
          `Kompromissvorschlag gescheitert (${tallyDe}): ${why?.de}.`,
          `Compromise proposal failed (${tallyEn}): ${why?.en}.`,
        ),
  };
}

const proposalLine = (p: Proposal) => {
  const votes = (p.votes ?? [])
    .map((v) => `${v.agentId} ${v.vote}${v.reason.text ? ` (${v.reason.text.slice(0, 140)})` : ""}`)
    .join("; ");
  const cost = p.cost ? `, Kosten ${p.cost.value} ${p.cost.unit}` : "";
  return `${p.id} [${p.status}] "${p.title.text}" von ${p.originAgent}${cost}${p.financing ? `, Finanzierung: ${p.financing.text}` : ""}${p.components?.length ? `, Bausteine: ${p.components.map((c) => c.text).join(" | ")}` : ""}. Dafür ${p.supporters.join(",") || "-"}, bedingt ${p.conditional.join(",") || "-"}, dagegen ${p.opponents.join(",") || "-"}.${votes ? ` Stimmen: ${votes}` : ""}${p.rejectionReason ? ` Abgelehnt: ${p.rejectionReason.text}` : ""}`;
};

export function packageMessages(s: RunState) {
  const n = s.agentIds.length;
  const closest = closestProposals([...s.proposals.values()], n);
  const topics = s.mandate.topics.map((t) => {
    const x = topicTally(s, t.id);
    return `${t.id} ${t.label.text}: dafür ${x.pro.join(",") || "-"}; dagegen ${x.contra.join(",") || "-"}`;
  });
  const red = s.agentIds.flatMap((a) => redLinesOf(a).map((r) => `${r.id} (${a}): ${r.de}`));
  const last = s.summaries.at(-1);
  const system = [
    "Du bist die Moderation ohne eigene Position. Die Verhandlung ist beendet. Entwirf genau EIN bedingtes Kompromisspaket aus den Vorschlägen und Haltungen, die einer Mehrheit am nächsten kamen.",
    "Das Paket ist ein Vorschlag, kein Beschluss. Erfinde keine Zustimmung: expectedSupport, expectedConditional und expectedOppose geben deine nüchterne Einschätzung anhand der bisherigen Stimmen wieder.",
    "Baue Bedingungen ein, die Einwände auflösen können: Finanzierungsquelle (financing), Evaluierung mit Messgröße und Zeitpunkt (evaluation), Befristung (sunset), Pilot (pilot), Zuständigkeit (governance).",
    "Verletze keine rote Linie bewusst. Wenn ein Baustein eine rote Linie berührt, nenne sie in redLinesTouched (id) und wie das Paket damit umgeht.",
    "Höchstens fünf Bausteine (components), jeder mit den Vorschlags-ids, aus denen er stammt. Nur Institutionen, keine Personen. Kein Gedankenstrich-Zeichen. Alle Texte Deutsch (de) und Englisch (en).",
  ].join("\n");
  const user = [
    `Frage: ${s.mandate.question}`,
    `Entscheidungsregel: ${s.room.decisionRule}; Budgetdeckel +${s.room.budgetCeiling.maxIncreasePct} %; Institutionen am Tisch: ${s.agentIds.join(", ")}.`,
    `Vorschläge, die am nächsten kamen:\n${closest.map(proposalLine).join("\n") || "keine"}`,
    `Haltungen je Thema:\n${topics.join("\n")}`,
    `Rote Linien:\n${red.join("\n") || "keine"}`,
    last ? `Letzte Zusammenfassung: ${last.text.text}` : "",
    last?.openConflicts.length
      ? `Offene Konflikte: ${last.openConflicts.map((c) => `${c.topicId}: ${c.note.text}`).join("; ")}`
      : "",
    "title: kurzer Titel des Pakets. rationale: zwei bis drei Sätze, was am nächsten kam und welcher Tausch das Paket trägt.",
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    closest,
    messages: [
      { role: "system" as const, content: system },
      { role: "user" as const, content: user },
    ],
  };
}

/** Maps the model's draft to the contract, keeping only known ids. */
export function toPackage(
  s: RunState,
  o: PackageOut,
  id: string,
  round: number,
  closest: Proposal[],
): CompromisePackage {
  const agents = new Set(s.agentIds);
  const known = new Set(s.proposals.keys());
  const redOwner = new Map(s.agentIds.flatMap((a) => redLinesOf(a).map((r) => [r.id, a])));
  const components = o.components.slice(0, 5).map((c) => ({
    text: L(c.text.de, c.text.en),
    proposalIds: c.proposalIds.filter((p) => known.has(p)),
  }));
  const basedOn = [...new Set(components.flatMap((c) => c.proposalIds))];
  return {
    id,
    round,
    title: L(o.title.de, o.title.en),
    rationale: L(o.rationale.de, o.rationale.en),
    components,
    conditions: o.conditions
      .slice(0, 6)
      .map((c) => ({ kind: c.kind, text: L(c.text.de, c.text.en) })),
    basedOn: basedOn.length ? basedOn : closest.slice(0, 2).map((p) => p.id),
    expected: {
      support: o.expectedSupport.filter((a) => agents.has(a)),
      conditional: o.expectedConditional.filter((a) => agents.has(a)),
      oppose: o.expectedOppose
        .filter((x) => agents.has(x.agentId))
        .map((x) => ({ agentId: x.agentId, reason: L(x.reason.de, x.reason.en) })),
    },
    redLinesTouched: o.redLinesTouched
      .filter((r) => redOwner.has(r.redLineId))
      .map((r) => ({
        redLineId: r.redLineId,
        agentId: redOwner.get(r.redLineId) as string,
        note: L(r.note.de, r.note.en),
      })),
    utteranceId: null,
  };
}

export async function draftPackage(
  s: RunState,
  id: string,
  round: number,
  model: string,
): Promise<{ pkg: CompromisePackage; meta: CallMeta }> {
  const { closest, messages } = packageMessages(s);
  const r = await structured(model, "compromise_package", PackageOut, messages, {
    reasoningEffort: "low",
  });
  return { pkg: toPackage(s, r.data, id, round, closest), meta: r.meta };
}

/** Plain-language description of the package for the moderator's utterance and the prompts. */
export function packageText(pkg: CompromisePackage): { de: string; en: string } {
  const comp = pkg.components.map((c, i) => `(${i + 1}) ${c.text.text}`).join(" ");
  const compEn = pkg.components
    .map((c, i) => `(${i + 1}) ${c.text.translations.en ?? c.text.text}`)
    .join(" ");
  const cond = pkg.conditions.map((c) => c.text.text).join("; ");
  const condEn = pkg.conditions.map((c) => c.text.translations.en ?? c.text.text).join("; ");
  return {
    de: `Kompromissvorschlag des Moderators: ${pkg.title.text}. ${pkg.rationale.text} Bausteine: ${comp}${cond ? ` Bedingungen: ${cond}.` : ""} Ich bitte jede Institution um eine kurze Antwort: Zustimmung, Zustimmung unter einer Bedingung oder Ablehnung mit Grund.`,
    en: `Moderator's compromise proposal: ${pkg.title.translations.en ?? pkg.title.text}. ${pkg.rationale.translations.en ?? pkg.rationale.text} Components: ${compEn}${condEn ? ` Conditions: ${condEn}.` : ""} I ask each institution for a short answer: support, support under one condition, or opposition with a reason.`,
  };
}

export function ratifyMessages(s: RunState, agentId: string, pkg: CompromisePackage) {
  const own = [...s.proposals.values()]
    .filter((p) => pkg.basedOn.includes(p.id))
    .map((p) => {
      const v = p.votes?.find((x) => x.agentId === agentId);
      return `${p.id} "${p.title.text}": deine letzte Stimme ${v ? `${v.vote}${v.reason.text ? ` (${v.reason.text.slice(0, 160)})` : ""}` : "keine"}`;
    });
  const text = packageText(pkg);
  return [
    { role: "system" as const, content: systemPrompt(s, agentId) },
    {
      role: "user" as const,
      content: [
        "Die Verhandlung ist beendet. Die Moderation legt zum Abschluss einen Kompromissvorschlag vor. Es gibt genau eine Antwortrunde.",
        text.de,
        pkg.redLinesTouched.length
          ? `Berührte rote Linien laut Moderation: ${pkg.redLinesTouched.map((r) => `${r.redLineId} (${nameOf(r.agentId)}): ${r.note.text}`).join("; ")}`
          : "",
        own.length ? `Deine bisherigen Stimmen zu den Grundlagen:\n${own.join("\n")}` : "",
        "Antworte als Institution: stance = support, conditional oder oppose. Bei conditional nenne in condition genau die eine Bedingung, ohne die ihr nicht zustimmt. Bei oppose nenne in condition, was eure Haltung ändern würde (oder null). reason: ein Satz Begründung. statement: zwei bis drei Sätze, die ihr im Plenum sagt (ohne interne Kennungen außer Vorschlags-ids). redLinesTouched: ids eurer roten Linien, die das Paket berührt. Stimme nur zu, wenn das Paket eure roten Linien wahrt. support heißt: das Paket enthält eure Bedingungen bereits. conditional nur, wenn eure eine Bedingung innerhalb dieses Pakets erfüllbar ist; widerspricht sie der Finanzierung oder einem Baustein des Pakets, oder erfüllt das Paket eure Kernforderung nicht, dann oppose. Bedingte Zustimmung ist keine Höflichkeit, sondern eine Zusage. Englische Fassungen in den Feldern mit En.",
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];
}

export async function ratify(
  s: RunState,
  agentId: string,
  pkg: CompromisePackage,
  model: string,
): Promise<{ out: RatifyOut; meta: CallMeta }> {
  const r = await structured(model, "compromise_vote", RatifyOut, ratifyMessages(s, agentId, pkg), {
    reasoningEffort: "low",
    maxOutputTokens: 2000,
  });
  const ownRed = new Set(redLinesOf(agentId).map((x) => x.id));
  return {
    out: { ...r.data, redLinesTouched: r.data.redLinesTouched.filter((x) => ownRed.has(x)) },
    meta: r.meta,
  };
}
