// Moderator step 1 (FR-M1, FR-M2, FR-U9, FR-U10): question + RoomConfig to Mandate.
import {
  AGENT_CATALOG,
  type Axis,
  CORE_AGENT_IDS,
  catalogAgent,
  type Mandate,
  type RoomConfig,
  TEMPLATES,
  type Template,
  type Topic,
} from "@sv/contracts";
import { z } from "zod";
import {
  bi,
  DEFAULT_MODEL,
  defaultTemperament,
  EXPERT_MODEL,
  L,
  profileOf,
  seatModelOf,
  seedAxes,
  seedEvents,
  seedTopics,
  setActiveTemplate,
  templateSeed,
} from "./config.ts";
import { type CallMeta, hasGateway, structured } from "./llm.ts";
import { PHASE_NAMES } from "./phases.ts";

const BiOut = z.object({ de: z.string(), en: z.string() });

const MandateOut = z.object({
  objective: BiOut,
  constraints: z.array(BiOut),
  successMetrics: z.array(BiOut),
  actors: z.array(z.object({ agentId: z.string(), include: z.boolean(), reason: BiOut })),
  topics: z.array(z.object({ id: z.string(), key: z.string(), label: BiOut, measure: BiOut })),
  axes: z.array(
    z.object({
      label: BiOut,
      poleLow: BiOut,
      poleHigh: BiOut,
      topicWeights: z.array(z.object({ topicId: z.string(), weight: z.number() })),
    }),
  ),
  endConditions: z.array(BiOut),
});

export interface RoomInput {
  question: string;
  template?: Template;
  lang?: "de" | "en";
  agentIds?: string[];
  model?: string;
  roundLimit?: number;
  asOf?: string;
  climate?: RoomConfig["climate"];
  seed?: number;
}

/** Default RoomConfig for a question and template; agent selection may be refined by the moderator. */
export function defaultRoom(input: RoomInput): RoomConfig {
  const template = input.template ?? "custom";
  setActiveTemplate(template);
  const seed = templateSeed(template);
  const model = input.model ?? DEFAULT_MODEL();
  // Multi-family seats (FR-X1): unless one model is forced, the seat plan spreads the
  // institutions over four families (DEFAULT_SEAT_PLAN in config.ts).
  const ids = input.agentIds ?? seed?.agents ?? [...CORE_AGENT_IDS];
  return {
    template,
    question: input.question,
    lang: input.lang ?? "de",
    agents: ids.map((agentId) => {
      const c = catalogAgent(agentId);
      return {
        agentId,
        enabled: true,
        origin: c?.origin ?? "optional",
        mode: c?.mode ?? "prompted",
        suggestedByModerator: true,
        reason: L(profileOf(agentId).vetoBasis.de, profileOf(agentId).vetoBasis.en),
        model: input.model ?? seatModelOf(agentId),
        temperament: defaultTemperament(agentId),
      };
    }),
    moderatorModel: model,
    expertModel: EXPERT_MODEL(),
    decisionRule: seed?.decisionRule ?? "veto_players",
    qualifiedMajority: seed?.qualifiedMajority ?? null,
    roundLimit: input.roundLimit ?? seed?.roundLimit ?? 5,
    budgetCeiling: {
      maxIncreasePct: seed?.budgetCeilingPct ?? 5,
      baselineEurBn: null,
      note: L("Deckel gilt für das Gesamtpaket", "Cap applies to the whole package"),
    },
    asOf: input.asOf ?? new Date().toISOString().slice(0, 10),
    climate: input.climate ?? "neutral",
    pressures: { time: "medium", budget: "high", public: "medium" },
    scheduledEvents: seed ? seedEvents(seed) : [],
    coldRatification: false,
    seed: input.seed ?? Math.floor(Math.random() * 1e9),
  };
}

const RULE_DE: Record<RoomConfig["decisionRule"], string> = {
  consensus: "Konsens: alle Beteiligten müssen zustimmen",
  qualified_majority: "Qualifizierte Mehrheit",
  veto_players: "Mehrheit, und alle formalen Vetospieler müssen zustimmen",
};

/**
 * Builds the mandate. With a gateway the moderator writes objective, constraints,
 * metrics, actor reasons and (for templates without seeds) topics and axes. Without a
 * gateway a deterministic fallback keeps the CLI usable.
 */
export async function buildMandate(
  room: RoomConfig,
  opts: { selectActors?: boolean } = {},
): Promise<{ mandate: Mandate; room: RoomConfig; meta: CallMeta | null }> {
  const seed = templateSeed(room.template);
  const enabled = room.agents.filter((a) => a.enabled).map((a) => a.agentId);
  const catalog = AGENT_CATALOG.map(
    (a) =>
      `${a.id}: ${a.nameDe} (${a.origin === "core" ? "Kern" : "optional"}; ${profileOf(a.id).vetoBasis.de})`,
  ).join("\n");
  const fixedTopics = seed ? seedTopics(seed) : null;
  let meta: CallMeta | null = null;
  let out: z.infer<typeof MandateOut> | null = null;
  if (hasGateway()) {
    const system = [
      "Du bist die Moderation einer simulierten Verhandlung österreichischer Gesundheitsinstitutionen.",
      "Du hast keine eigene Position (FR-M9). Du übersetzt die Frage in ein strukturiertes Verhandlungsmandat.",
      "Nenne niemals reale Personen, nur Institutionen. Schreibe kein Gedankenstrich-Zeichen, nutze Kommas oder Doppelpunkte.",
      "Alle Texte auf Deutsch (de) und Englisch (en).",
    ].join("\n");
    const user = [
      `Frage: ${room.question}`,
      `Vorlage: ${room.template}`,
      `Entscheidungsregel: ${RULE_DE[room.decisionRule]}`,
      `Rundenlimit: ${room.roundLimit}; Phasen: ${PHASE_NAMES.map((p) => p.de).join(", ")}`,
      `Budgetdeckel: Gesundheitsausgaben höchstens +${room.budgetCeiling.maxIncreasePct} %`,
      `Stichtag der Evidenz: ${room.asOf}; Klima: ${room.climate}`,
      "",
      "Verfügbare Akteure (id: Institution):",
      catalog,
      "",
      opts.selectActors
        ? "Wähle die relevanten Akteure (include=true) und begründe jede Wahl in einem Satz. Mindestens fünf, höchstens zwölf."
        : `Gesetzte Akteure: ${enabled.join(", ")}. Gib für genau diese include=true und begründe, warum sie am Tisch sitzen; alle anderen include=false mit kurzer Begründung.`,
      fixedTopics
        ? `Themen sind vorgegeben, gib sie unverändert zurück: ${JSON.stringify(fixedTopics.map((t) => ({ id: t.id, key: t.key, label: t.label.text, measure: t.measure.text })))}. Achsen ebenfalls vorgegeben, gib zwei beliebige Achsen zurück (werden ersetzt).`
        : "Leite 5 bis 7 verhandelbare Themen ab (id im Format t-kurzname, key snake_case englisch, label kurz, measure = konkrete Maßnahme) und zwei Achsen für den Positionsraum mit Themengewichten.",
      "Gib zwei bis vier Abbruchbedingungen an (Konvergenz, Rundenlimit, Blockade).",
    ].join("\n");
    try {
      const r = await structured(room.moderatorModel, "mandate", MandateOut, [
        { role: "system", content: system },
        { role: "user", content: user },
      ]);
      out = r.data;
      meta = r.meta;
    } catch (error) {
      console.warn("mandate_fallback", error instanceof Error ? error.message : error);
    }
  }

  // Actors: moderator selection (custom) or the set from the room.
  let agents = room.agents;
  if (opts.selectActors && out) {
    const chosen = out.actors.filter((a) => a.include && catalogAgent(a.agentId));
    if (chosen.length >= 3) {
      const byId = new Map(chosen.map((a) => [a.agentId, a]));
      agents = AGENT_CATALOG.filter((c) => byId.has(c.id)).map((c) => {
        const prev = room.agents.find((a) => a.agentId === c.id);
        const reason = byId.get(c.id)?.reason;
        return {
          agentId: c.id,
          enabled: true,
          origin: c.origin,
          mode: c.mode,
          suggestedByModerator: true,
          reason: reason
            ? bi(reason)
            : L(profileOf(c.id).vetoBasis.de, profileOf(c.id).vetoBasis.en),
          model: prev?.model ?? room.moderatorModel,
          temperament: prev?.temperament ?? defaultTemperament(c.id),
        };
      });
    }
  } else if (out) {
    agents = room.agents.map((a) => {
      const r = out?.actors.find((x) => x.agentId === a.agentId);
      return r ? { ...a, reason: bi(r.reason) } : a;
    });
  }
  const nextRoom: RoomConfig = { ...room, agents };
  const seated = agents.filter((a) => a.enabled);

  let topics: Topic[] = fixedTopics ?? [];
  let axes: [Axis, Axis] | null = seed ? seedAxes(seed) : null;
  if (!fixedTopics && out && out.topics.length >= 3) {
    topics = out.topics.slice(0, 7).map((t, i) => ({
      id: /^t-[a-z0-9-]+$/.test(t.id) ? t.id : `t-${i + 1}`,
      key: t.key.replace(/[^a-z0-9_]/g, "_").toLowerCase(),
      label: bi(t.label),
      measure: bi(t.measure),
    }));
  }
  if (topics.length === 0) {
    topics = [
      {
        id: "t-1",
        key: "measure_main",
        label: L("Kernmaßnahme", "Core measure"),
        measure: L(room.question),
      },
      {
        id: "t-2",
        key: "financing",
        label: L("Finanzierung", "Financing"),
        measure: L("Gegenfinanzierung", "Offsetting finance"),
      },
      {
        id: "t-3",
        key: "governance",
        label: L("Steuerung", "Governance"),
        measure: L("Zuständigkeit", "Competence"),
      },
    ];
  }
  if (!axes) {
    const ids = topics.map((t) => t.id);
    const mk = (i: number, fallback: Axis): Axis => {
      const a = out?.axes[i];
      if (!a) return fallback;
      const weights: Record<string, number> = {};
      for (const w of a.topicWeights) if (ids.includes(w.topicId)) weights[w.topicId] = w.weight;
      if (Object.keys(weights).length === 0) return fallback;
      return {
        id: fallback.id,
        label: bi(a.label),
        poles: [bi(a.poleLow), bi(a.poleHigh)],
        topicWeights: weights,
      };
    };
    const half = Math.ceil(ids.length / 2);
    // without model-proposed axes each axis is named by its own topics, read as for or against
    const named = (part: typeof topics) => ({
      de: part.map((t) => t.label.text).join(", "),
      en: part.map((t) => t.label.translations.en ?? t.label.text).join(", "),
    });
    const axis = (id: "x" | "y", part: typeof topics): Axis => {
      const n = named(part);
      return {
        id,
        label: L(n.de, n.en),
        poles: [L(`Gegen ${n.de}`, `Against ${n.en}`), L(`Für ${n.de}`, `For ${n.en}`)],
        topicWeights: Object.fromEntries(part.map((t) => [t.id, 1 / Math.max(1, part.length)])),
      };
    };
    axes = [mk(0, axis("x", topics.slice(0, half))), mk(1, axis("y", topics.slice(half)))];
  }

  const tpl = TEMPLATES.find((t) => t.id === room.template);
  const mandate: Mandate = {
    question: room.question,
    lang: room.lang,
    objective: out ? bi(out.objective) : L(tpl?.de ?? room.question, tpl?.en),
    constraints: out
      ? out.constraints.map(bi)
      : [L(`Gesundheitsausgaben steigen um höchstens ${room.budgetCeiling.maxIncreasePct} %`)],
    successMetrics: out ? out.successMetrics.map(bi) : [],
    topics,
    axes,
    actors: seated.map((a) => ({ agentId: a.agentId, reason: a.reason })),
    rules: { rounds: room.roundLimit, speakingOrder: "randomised_recorded", seed: room.seed },
    asOf: room.asOf,
    coldRatification: room.coldRatification,
    decisionRule: room.decisionRule,
    budgetCeilingPct: room.budgetCeiling.maxIncreasePct,
    climate: room.climate,
    endConditions: out?.endConditions.length
      ? out.endConditions.map(bi)
      : [
          L(
            "Konvergenz: ein Paket erfüllt die Entscheidungsregel und bleibt stabil",
            "Convergence: a package meets the decision rule and holds",
          ),
          L(`Rundenlimit ${room.roundLimit} erreicht`, `Round limit ${room.roundLimit} reached`),
          L(
            "Blockade: zwei Runden ohne Bewegung und ohne tragfähigen Vorschlag",
            "Deadlock: two rounds without movement or a viable proposal",
          ),
        ],
  };
  return { mandate, room: nextRoom, meta };
}
