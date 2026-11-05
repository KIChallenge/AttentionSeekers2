import type { Lang } from "@sv/contracts";

const de = {
  title: "Bühne",
  stageLabel: "Verhandlungsbühne",
  disclaimer:
    "Stilisierte Darstellung. Figuren stehen nur für Institutionen, nicht für Personen. Das Protokoll bleibt maßgeblich.",
  play: "Abspielen",
  pause: "Pause",
  prev: "Vorherige Wortmeldung",
  next: "Nächste Wortmeldung",
  speed: "Tempo",
  sharpest: "Schärfste Erwiderung",
  sharpestHint:
    "Springt zum Austausch: Aussage und die Erwiderung, die eine Position verschoben hat",
  exchange: "Ausgewählter Austausch",
  noExchange: "Keine Erwiderung im Protokoll",
  round: "Runde",
  phase: "Phase",
  speaking: "spricht",
  respondsTo: "antwortet auf",
  latestShift: "Letzte Positionsänderung",
  noShift: "Bisher keine Positionsänderung",
  trigger: "Auslöser",
  claims: "Belege",
  noClaims: "Keine prüfbare Behauptung in dieser Wortmeldung",
  audioOn: "Ton: vorgerenderte Stimmen",
  audioOff: "Ton nicht verfügbar",
  audioOffHint:
    "Für diesen Lauf liegen keine vorgerenderten Stimmen vor. Die Wiedergabe läuft stumm, zeitlich nach Textlänge.",
  audioLoading: "Ton wird geladen",
  inTranscript: "Im Protokoll öffnen",
  utterance: "Wortmeldung",
  of: "von",
  moderator: "Moderation",
  expert: "Experte",
  timeline: "Zeitleiste",
  scope: "Umfang",
  scopeExchange: "Austausch",
  scopeRun: "Ganzer Lauf",
};

export type StageStrings = typeof de;

const en: StageStrings = {
  title: "Stage",
  stageLabel: "Negotiation stage",
  disclaimer:
    "Stylized view. Figures stand for institutions only, never for persons. The record stays canonical.",
  play: "Play",
  pause: "Pause",
  prev: "Previous utterance",
  next: "Next utterance",
  speed: "Speed",
  sharpest: "Sharpest rebuttal",
  sharpestHint: "Jumps to the exchange: a statement and the rebuttal that moved a position",
  exchange: "Selected exchange",
  noExchange: "No rebuttal in the record",
  round: "Round",
  phase: "Phase",
  speaking: "speaking",
  respondsTo: "responds to",
  latestShift: "Latest position change",
  noShift: "No position change yet",
  trigger: "Trigger",
  claims: "Evidence",
  noClaims: "No checkable claim in this utterance",
  audioOn: "Sound: pre-rendered voices",
  audioOff: "Sound not available",
  audioOffHint:
    "No pre-rendered voices exist for this run. Playback is silent, timed by text length.",
  audioLoading: "Loading sound",
  inTranscript: "Open in record",
  utterance: "Utterance",
  of: "of",
  moderator: "Moderation",
  expert: "Expert",
  timeline: "Timeline",
  scope: "Scope",
  scopeExchange: "Exchange",
  scopeRun: "Whole run",
};

export const stageStrings: Record<Lang, StageStrings> = { de, en };
