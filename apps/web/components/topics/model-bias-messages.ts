// Strings for the model comparison (DE/EN).
const de = {
  title: "Modellvergleich: Richtung und Abweichung",
  back: "Themenvergleich",
  link: "Modellvergleich",
  caveat: (n: number) =>
    `Gemessen wird die Modellabhängigkeit der Simulation, nicht reale Politik. n = 1 Lauf je Modellfamilie (${n} Läufe), also Tendenzen, keine Befunde. „Erwartet“ ist der Median der Eröffnungshaltungen aus Runde 1 über alle Läufe; diese stützen sich auf abgerufene, datierte Stellungnahmen.`,
  summary: (best: string, bs: string, worst: string, ws: string, pull: string) =>
    `Am nächsten an Daten und Geschichte bleibt ${best} (${bs}), am weitesten abseits liegt ${worst} (${ws})${pull}.`,
  pull: (run: string, pole: string, v: string) =>
    `; am stärksten zieht ${run} die Institutionen Richtung ${pole} (${v})`,
  rankTitle: "Erwartbar oder abseits",
  rankHead: {
    rank: "Rang",
    run: "Lauf",
    score: "Wert",
    stance: "Haltung",
    outcome: "Ergebnis",
    quality: "Qualität",
  },
  tier: { near: "erwartbar", mid: "dazwischen", far: "abseits" } as Record<string, string>,
  scale: ["erwartbar", "abseits"] as [string, string],
  formulaTitle: "Wie der Wert entsteht",
  formula: [
    "Haltung = min(1, mittlere |Endhaltung − erwartete Haltung| / 2), über alle Institutionen und Themen (Skala −2 bis +2).",
    "Ergebnis = |Zustimmungsquote der Vorschläge − historische Quote|, historische Quote = Anteil der Gesundheits-Erstentwürfe, die binnen 24 Monaten beschlossen wurden.",
    "Qualität = 1 − Gesamtwert des Qualitätsaudits (Relevanz, Bezug, Belege, Konsistenz).",
    "Wert = (0,5 · Haltung + 0,25 · Ergebnis + 0,25 · Qualität) / Summe der vorhandenen Gewichte. Fehlt ein Audit, zählen nur Haltung und Ergebnis.",
    "0 heißt: Endhaltungen wie erwartet, Zustimmungsquote wie historisch, Audit fehlerfrei.",
  ],
  noAudit: "kein Audit",
  dirTitle: "Richtung je Modell",
  dirNote:
    "Mittlere Verschiebung aller Institutionen von der erwarteten zur Endposition, je Achse.",
  more: (pole: string) => `mehr ${pole}`,
  mapTitle: "Positionskarte",
  mapRun: "Lauf",
  mapExpected: "erwartet",
  mapFinal: "Ende",
  mapOthers: "andere Läufe",
  mapShift: "Verschiebung",
  heatTitle: "Abweichung je Institution",
  heatNote: "Mittlere |Endhaltung − erwartete Haltung| über die Themen, Skala 0 bis 4.",
  persona: "Persona-Eval",
  personaNote:
    "Anteil echter Stellungnahmen ab 2023 (nicht im Training), deren Richtung das Modell mit Dossier-Persona traf.",
  noEval: "keine Eval",
  tempTitle: "Verhandlungstemperament",
  temp: {
    accepted: "Angenommen",
    gap: "Lücke zur Geschichte",
    moves: "Wechsel je Runde",
    held: "Rote Linien gehalten",
    touched: "berührt",
    conditional: "Bedingte Stimmen",
  },
  histRow: "Historisch (Gesundheit, 24 Monate)",
  histNote: (k: number, n: number) =>
    `${k} von ${n} Erstentwürfen beschlossen. Die Simulation nimmt deutlich weniger Vorschläge an; die Lücke zeigt, wie viel strenger der Raum ist.`,
  movesNote: "Positionswechsel mit benanntem Auslöser, je Runde nach der Eröffnung.",
  heldNote:
    "Gehalten: die Institution hat auf den Themen ihrer roten Linie das Vorzeichen der Eröffnung behalten.",
};
export type ModelBiasMessages = typeof de;

const en: ModelBiasMessages = {
  title: "Model comparison: direction and deviation",
  back: "Topic comparison",
  link: "Model comparison",
  caveat: (n: number) =>
    `This measures how much the simulation depends on the model, not real politics. n = 1 run per model family (${n} runs), so these are tendencies, not findings. "Expected" is the median round-1 opening stance across all runs; openings are grounded in retrieved, dated statements.`,
  summary: (best: string, bs: string, worst: string, ws: string, pull: string) =>
    `Closest to the data and the record is ${best} (${bs}), furthest off is ${worst} (${ws})${pull}.`,
  pull: (run: string, pole: string, v: string) =>
    `; ${run} pulls the institutions hardest towards ${pole} (${v})`,
  rankTitle: "Expected or off track",
  rankHead: {
    rank: "Rank",
    run: "Run",
    score: "Score",
    stance: "Stance",
    outcome: "Outcome",
    quality: "Quality",
  },
  tier: { near: "expected", mid: "in between", far: "off track" },
  scale: ["expected", "off track"] as [string, string],
  formulaTitle: "How the score is built",
  formula: [
    "Stance = min(1, mean |final stance − expected stance| / 2), over every institution and topic (scale −2 to +2).",
    "Outcome = |share of proposals accepted − historical rate|, historical rate = share of health first drafts enacted within 24 months.",
    "Quality = 1 − overall score of the quality audit (relevance, responsiveness, grounding, consistency).",
    "Score = (0.5 · stance + 0.25 · outcome + 0.25 · quality) / sum of the weights present. Without an audit only stance and outcome count.",
    "0 means: final stances as expected, acceptance as in history, a flawless audit.",
  ],
  noAudit: "no audit",
  dirTitle: "Direction per model",
  dirNote: "Mean shift of all institutions from the expected to the final position, per axis.",
  more: (pole: string) => `more ${pole.toLowerCase()}`,
  mapTitle: "Position map",
  mapRun: "Run",
  mapExpected: "expected",
  mapFinal: "final",
  mapOthers: "other runs",
  mapShift: "Shift",
  heatTitle: "Deviation per institution",
  heatNote: "Mean |final stance − expected stance| over the topics, scale 0 to 4.",
  persona: "Persona eval",
  personaNote:
    "Share of held-out real statements (2023 on) whose direction the model matched with the dossier persona.",
  noEval: "no eval",
  tempTitle: "Negotiation temperament",
  temp: {
    accepted: "Accepted",
    gap: "Gap to history",
    moves: "Moves per round",
    held: "Red lines held",
    touched: "touched",
    conditional: "Conditional votes",
  },
  histRow: "Historical (health, 24 months)",
  histNote: (k: number, n: number) =>
    `${k} of ${n} first drafts enacted. The simulation accepts far fewer proposals; the gap shows how much stricter the room is.`,
  movesNote: "Stance moves with a named trigger, per round after the opening.",
  heldNote:
    "Held: the institution kept the sign of its opening stance on the topics of its red line.",
};

export const modelBiasT = (lang: "de" | "en"): ModelBiasMessages => (lang === "de" ? de : en);
