// Moderator round summaries (FR-M6, FR-M7, FR-O1..O3). Conflicts are listed before
// agreement; consensus shares are computed from positions, not from the model.
import type { RoundSummary } from "@sv/contracts";
import { z } from "zod";
import { nameOf } from "./agent.ts";
import { L } from "./config.ts";
import { type CallMeta, structured } from "./llm.ts";
import type { RunState } from "./state.ts";

const BiOut = z.object({ de: z.string(), en: z.string() });
const SummaryOut = z.object({
  openConflicts: z.array(
    z.object({
      topicId: z.string(),
      sideA: z.array(z.string()),
      sideB: z.array(z.string()),
      boundBy: z.array(z.string()),
      note: BiOut,
    }),
  ),
  consensusNotes: z.array(z.object({ topicId: z.string(), note: BiOut })),
  failedProposals: z.array(z.object({ proposalId: z.string(), reason: BiOut })),
  newOptions: z.array(BiOut),
  text: BiOut,
  recommendations: z.array(
    z.object({
      text: BiOut,
      priority: z.enum(["high", "medium", "low"]),
      proposalIds: z.array(z.string()),
    }),
  ),
});

export function topicTally(s: RunState, topicId: string) {
  let support = 0;
  let oppose = 0;
  let of = 0;
  const pro: string[] = [];
  const contra: string[] = [];
  for (const a of s.agentIds) {
    const p = s.positions.get(a)?.get(topicId);
    if (!p) continue;
    of++;
    if (p.stance >= 0.5) {
      support++;
      pro.push(a);
    } else if (p.stance <= -0.5) {
      oppose++;
      contra.push(a);
    }
  }
  return { support, oppose, of, pro, contra };
}

/**
 * Closes a focused exchange with one neutral outcome sentence (FR-M9: the moderation
 * holds no position). The measured stance movement is passed in, so the sentence
 * reports what moved instead of inventing agreement. Falls back to a template.
 */
export async function exchangeOutcome(
  s: RunState,
  x: {
    kind: "bilateral" | "caucus";
    topicId: string | null;
    participants: string[];
    transcript: Array<{ speaker: string; text: string }>;
    moves: Array<{ agentId: string; from: number | null; to: number | null }>;
  },
  model: string,
): Promise<{ de: string; en: string; meta: CallMeta | null }> {
  const topic = s.mandate.topics.find((t) => t.id === x.topicId);
  const label = topic?.label.text ?? "Vorschlag";
  const moved = x.moves.filter(
    (m) => m.from !== null && m.to !== null && Math.abs(m.to - m.from) >= 0.25,
  );
  const fmt = (m: (typeof x.moves)[number]) =>
    `${nameOf(m.agentId)} ${m.from ?? "offen"} auf ${m.to ?? "offen"}`;
  const fallbackDe =
    x.kind === "caucus"
      ? `${x.participants.map(nameOf).join(", ")} gehen mit abgestimmter Linie zu ${label} ins Plenum.`
      : moved.length
        ? `${label}: Bewegung bei ${moved.map(fmt).join(", ")}; der Konflikt ist kleiner, aber nicht gelöst.`
        : `${label}: keine Annäherung, die Positionen bleiben getrennt.`;
  try {
    const r = await structured(
      model,
      "exchange_outcome",
      BiOut,
      [
        {
          role: "system",
          content:
            "Du bist die Moderation ohne eigene Position. Fasse das Ergebnis eines Gesprächs in genau einem nüchternen Satz zusammen (höchstens 30 Wörter), Deutsch (de) und Englisch (en). Erfinde keine Einigung. Nenne nur Institutionen, keine Personen. Kein Gedankenstrich-Zeichen.",
        },
        {
          role: "user",
          content: [
            `${x.kind === "caucus" ? "Koalitionsabstimmung" : "Einzelgespräch"} zu ${label} zwischen ${x.participants.map(nameOf).join(", ")}.`,
            `Gemessene Haltungen vorher und nachher: ${x.moves.map(fmt).join("; ") || "keine"}.`,
            x.transcript.map((t) => `${nameOf(t.speaker)}: ${t.text}`).join("\n"),
            x.kind === "caucus"
              ? "Satz: welche gemeinsame Linie die Partner ins Plenum tragen, oder wo sie uneins bleiben."
              : "Satz: was sich bewegt hat und welche Bedingung offen bleibt.",
          ].join("\n"),
        },
      ],
      { reasoningEffort: "none", maxOutputTokens: 600 },
    );
    return { de: r.data.de, en: r.data.en, meta: r.meta };
  } catch (error) {
    console.warn("exchange_outcome_fallback", error instanceof Error ? error.message : error);
    const fallbackEn =
      x.kind === "caucus"
        ? `${x.participants.join(", ")} go into plenary with an agreed line on ${x.topicId ?? "the tabled proposal"}.`
        : moved.length
          ? `${x.topicId ?? "Proposal"}: movement by ${moved.map((m) => m.agentId).join(", ")}; the conflict is smaller but not resolved.`
          : `${x.topicId ?? "Proposal"}: no rapprochement, positions stay apart.`;
    return { de: fallbackDe, en: fallbackEn, meta: null };
  }
}

export async function summarizeRound(
  s: RunState,
  round: number,
  final: boolean,
  model: string,
): Promise<{ summary: RoundSummary; meta: CallMeta | null }> {
  const topics = s.mandate.topics.map((t) => {
    const x = topicTally(s, t.id);
    return `${t.id} ${t.label.text} (${t.measure.text}): dafür ${x.pro.join(",") || "-"}; dagegen ${x.contra.join(",") || "-"}; ${x.of} Positionen`;
  });
  const utterances = s.utterances
    .filter((u) => u.round === round)
    .map((u) => `${u.id} ${nameOf(u.speaker)}: ${u.text.text}`);
  const props = [...s.proposals.values()].map(
    (p) =>
      `${p.id} (${p.status}) "${p.title.text}" von ${p.originAgent}: dafür ${p.supporters.join(",") || "-"}, bedingt ${p.conditional.join(",") || "-"}, dagegen ${p.opponents.join(",") || "-"}${p.rejectionReason ? `; abgelehnt: ${p.rejectionReason.text}` : ""}`,
  );
  const red = s.agentIds.flatMap((a) =>
    (s.agents.find((x) => x.id === a)?.redLineIds ?? []).map((id) => `${id} (${a})`),
  );
  const contradictions = [...s.claims.values()]
    .filter((c) => c.state === "contradicted" && c.contradiction?.resolution === "unresolved")
    .map((c) => `${c.id}: ${c.atomicText}`);
  const system = [
    "Du bist die Moderation. Du hast keine eigene Position und bewertest keine Interessen (FR-M9).",
    "Fasse die Runde zusammen und nenne ZUERST die offenen Konflikte, erst danach Übereinstimmung. Erfinde keine Einigkeit, die es nicht gibt.",
    "Nenne niemals reale Personen. Kein Gedankenstrich-Zeichen. Alle Texte Deutsch (de) und Englisch (en).",
  ].join("\n");
  const user = [
    `Runde ${round}${final ? " (letzte Runde, Ergebnisdarstellung)" : ""}. Frage: ${s.mandate.question}`,
    `Themen mit Haltungen:\n${topics.join("\n")}`,
    `Vorschläge:\n${props.join("\n") || "keine"}`,
    s.calculus?.nextTabled
      ? `Koalitionskalkül, nächster Kandidat: ${s.calculus.nextTabled.proposalId}: ${s.calculus.nextTabled.reason.text}`
      : "",
    `Rote Linien am Tisch: ${red.join(", ") || "keine"}`,
    contradictions.length ? `Ungeklärte Widersprüche (Experte): ${contradictions.join("; ")}` : "",
    `Äußerungen dieser Runde:\n${utterances.join("\n")}`,
    "",
    "openConflicts: je Konfliktthema die beiden Seiten (Agenten-ids) und boundBy = ids roter Linien, die den Konflikt festhalten.",
    "consensusNotes: nur Themen, bei denen wirklich niemand dagegen ist.",
    "failedProposals: abgelehnte oder blockierte Vorschläge mit Grund. newOptions: neue Optionen, die in der Runde aufkamen.",
    "text: Zwischenstand in drei bis fünf Sätzen, Konflikte zuerst.",
    final
      ? "recommendations: drei bis fünf konkrete Handlungsempfehlungen für Entscheidungsträger (priority, betroffene Vorschlags-ids), ohne Konsens vorzutäuschen."
      : "recommendations: leere Liste.",
  ]
    .filter(Boolean)
    .join("\n");
  const topicIds = new Set(s.mandate.topics.map((t) => t.id));
  const agents = new Set(s.agentIds);
  const consensus = s.mandate.topics
    .map((t) => ({ t, x: topicTally(s, t.id) }))
    .filter(({ x }) => x.of > 0 && x.oppose === 0 && x.support >= x.of - 1);
  try {
    const r = await structured(model, "round_summary", SummaryOut, [
      { role: "system", content: system },
      { role: "user", content: user },
    ]);
    const o = r.data;
    const notes = new Map(o.consensusNotes.map((c) => [c.topicId, c.note]));
    const summary: RoundSummary = {
      round,
      openConflicts: o.openConflicts
        .filter((c) => topicIds.has(c.topicId))
        .map((c) => ({
          topicId: c.topicId,
          sides: [c.sideA.filter((a) => agents.has(a)), c.sideB.filter((a) => agents.has(a))] as [
            string[],
            string[],
          ],
          boundBy: c.boundBy.filter((id) => red.some((r) => r.startsWith(`${id} `))),
          note: L(c.note.de, c.note.en),
        })),
      consensus: consensus.map(({ t, x }) => ({
        topicId: t.id,
        share: [x.support, x.of] as [number, number],
        note: notes.get(t.id)
          ? L(notes.get(t.id)?.de ?? "", notes.get(t.id)?.en)
          : L(
              `${t.label.text}: keine Gegenstimme`,
              `${t.label.translations.en ?? t.label.text}: no opposition`,
            ),
      })),
      failedProposals: o.failedProposals
        .filter((f) => s.proposals.has(f.proposalId))
        .map((f) => ({ proposalId: f.proposalId, reason: L(f.reason.de, f.reason.en) })),
      newOptions: o.newOptions.slice(0, 4).map((n) => L(n.de, n.en)),
      text: L(o.text.de, o.text.en),
      ...(final
        ? {
            recommendations: o.recommendations.slice(0, 6).map((x) => ({
              text: L(x.text.de, x.text.en),
              priority: x.priority,
              proposalIds: x.proposalIds.filter((id) => s.proposals.has(id)),
            })),
          }
        : {}),
    };
    return { summary, meta: r.meta };
  } catch (error) {
    console.warn("summary_fallback", error instanceof Error ? error.message : error);
    const conflicts = s.mandate.topics
      .map((t) => ({ t, x: topicTally(s, t.id) }))
      .filter(({ x }) => x.pro.length > 0 && x.contra.length > 0);
    return {
      summary: {
        round,
        openConflicts: conflicts.map(({ t, x }) => ({
          topicId: t.id,
          sides: [x.pro, x.contra] as [string[], string[]],
          boundBy: [],
          note: L(`${t.label.text}: keine Einigung`, "no agreement"),
        })),
        consensus: consensus.map(({ t, x }) => ({
          topicId: t.id,
          share: [x.support, x.of] as [number, number],
          note: L(`${t.label.text}: keine Gegenstimme`),
        })),
        failedProposals: [],
        newOptions: [],
        text: L(
          `Runde ${round}: ${conflicts.length} offene Konflikte, ${consensus.length} Themen ohne Gegenstimme.`,
        ),
      },
      meta: null,
    };
  }
}
