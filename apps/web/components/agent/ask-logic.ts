// Pure helpers for the "Ask an institution" sheet: suggested questions from the run, and
// parsing of the streamed answer into text, citation, run-reference and marker parts.
import { type Lang, localize, type RedLine, type RunSnapshot } from "@sv/contracts";

const stance = (v: number) => (v > 0 ? `+${v}` : String(v).replace("-", "−"));

/**
 * Three questions generated from the seat's run: its largest position change, a red line
 * (deep core first) and a rejected proposal it opposed or tabled.
 */
export function suggestedQuestions(
  snap: RunSnapshot,
  agentId: string,
  redLines: Record<string, RedLine>,
  lang: Lang,
): string[] {
  const run = snap.run;
  const cfg = run?.agents.find((a) => a.id === agentId);
  if (!run || !cfg) return [];
  const out: string[] = [];

  const moves = run.mandate.topics
    .map((t) => {
      const list = snap.positions[agentId]?.[t.id] ?? [];
      const a = list[0]?.stance;
      const b = list.at(-1)?.stance;
      return a === undefined || b === undefined
        ? null
        : { topic: localize(t.label, lang), a, b, d: Math.abs(b - a) };
    })
    .filter((x) => x !== null)
    .sort((x, y) => y.d - x.d || Math.abs(y.b) - Math.abs(x.b));
  const m = moves[0];
  if (m)
    out.push(
      m.d > 0
        ? lang === "de"
          ? `Warum haben Sie sich bei ${m.topic} von ${stance(m.a)} auf ${stance(m.b)} bewegt?`
          : `Why did you move on ${m.topic} from ${stance(m.a)} to ${stance(m.b)}?`
        : lang === "de"
          ? `Warum sind Sie bei ${m.topic} hart geblieben?`
          : `Why did you hold firm on ${m.topic}?`,
    );

  const tierRank = { deep_core: 0, policy_core: 1, secondary: 2 } as const;
  const rl = cfg.redLineIds
    .map((id) => redLines[id])
    .filter((r): r is RedLine => !!r)
    .sort((a, b) => tierRank[a.tier] - tierRank[b.tier])[0];
  if (rl) {
    const text = localize(rl.text, lang);
    out.push(
      lang === "de"
        ? `Gibt es einen Preis, für den Sie „${text}“ aufgeben würden?`
        : `Is there a price at which you would give up “${text}”?`,
    );
  }

  const proposals = snap.proposalOrder
    .map((id) => snap.proposals[id])
    .filter((p) => p?.status === "rejected");
  const opposed = proposals.find(
    (p) =>
      p?.opponents.includes(agentId) ||
      p?.votes?.some((v) => v.agentId === agentId && v.vote === "oppose"),
  );
  const own = proposals.find((p) => p?.originAgent === agentId);
  if (opposed) {
    const title = localize(opposed.title, lang);
    out.push(
      lang === "de" ? `Warum haben Sie „${title}“ abgelehnt?` : `Why did you reject “${title}”?`,
    );
  } else if (own) {
    const title = localize(own.title, lang);
    out.push(
      lang === "de"
        ? `Warum ist Ihr Vorschlag „${title}“ gescheitert?`
        : `Why did your proposal “${title}” fail?`,
    );
  }
  return out;
}

/** State keys of a run with `rounds` played rounds: before, r1..rN, after. */
export function stateKeys(rounds: number): string[] {
  return ["before", ...Array.from({ length: rounds }, (_, i) => `r${i + 1}`), "after"];
}

export interface StanceChange {
  topicId: string;
  from: number | null;
  to: number | null;
  changed: boolean;
}

/** Stance per topic at two states, in topic order; `changed` marks a move. */
export function stanceChanges(
  topicIds: readonly string[],
  a: Readonly<Record<string, number>>,
  b: Readonly<Record<string, number>>,
): StanceChange[] {
  return topicIds
    .filter((id) => id in a || id in b)
    .map((id) => {
      const from = a[id] ?? null;
      const to = b[id] ?? null;
      return { topicId: id, from, to, changed: from !== to };
    });
}

export type AnswerPart =
  | { kind: "text"; text: string }
  | { kind: "cite"; handle: string }
  | { kind: "utt"; id: string }
  | { kind: "assumption" }
  | { kind: "profile" };

const MARK = /\[\s*(E\d+(?:\s*,\s*E\d+)*|u\d+-\d+|A|P)\s*\]/g;

/**
 * Splits an answer at its markers: [E3] evidence, [u4-19] own utterance in the run, [A]
 * assumption, [P] answered from the profile. A handle the server did not send turns into an
 * assumption marker, so an invented citation never looks like a source.
 */
export function parseAnswer(
  text: string,
  handles: ReadonlySet<string>,
  utteranceIds: ReadonlySet<string>,
): AnswerPart[] {
  const parts: AnswerPart[] = [];
  let last = 0;
  const pushText = (t: string) => {
    if (!t) return;
    const prev = parts.at(-1);
    if (prev?.kind === "text") prev.text += t;
    else parts.push({ kind: "text", text: t });
  };
  for (const m of text.matchAll(MARK)) {
    pushText(text.slice(last, m.index));
    last = (m.index ?? 0) + m[0].length;
    const body = m[1] ?? "";
    if (body === "A") parts.push({ kind: "assumption" });
    else if (body === "P") parts.push({ kind: "profile" });
    else if (body.startsWith("u")) {
      if (utteranceIds.has(body)) parts.push({ kind: "utt", id: body });
    } else
      for (const h of body.split(",").map((x) => x.trim())) {
        if (handles.has(h)) parts.push({ kind: "cite", handle: h });
        else if (parts.at(-1)?.kind !== "assumption") parts.push({ kind: "assumption" });
      }
  }
  pushText(text.slice(last));
  return parts;
}
