"use client";

// Engineer level: the turn quality gate's decision on one utterance (checks of the first
// draft, checks of the regenerated draft, and the rejected first draft when replaced),
// plus any moderation gate decision that names the utterance.
import type { GateCheck, Utterance } from "@sv/contracts";
import { Chip, Panel } from "@/components/run/bits";
import { L, withKeys } from "@/components/run/helpers";
import { useRun } from "@/components/run/run-context";
import { Level } from "@/components/shell/providers";

const S = {
  de: {
    title: "Qualitäts-Gate",
    none: "Kein Gate-Eintrag (Lauf vor dem Gate oder Beitrag der Moderation).",
    action: { accepted: "angenommen", regenerated: "neu erzeugt", flagged: "markiert übernommen" },
    first: "Erster Entwurf",
    retry: "Neuer Entwurf",
    rejected: "Verworfener Entwurf",
    moderation: "Moderation",
  },
  en: {
    title: "Quality gate",
    none: "No gate record (run predates the gate, or a moderator line).",
    action: { accepted: "accepted", regenerated: "regenerated", flagged: "kept with a flag" },
    first: "First draft",
    retry: "Regenerated draft",
    rejected: "Rejected draft",
    moderation: "Moderation",
  },
} as const;

function Checks({ checks }: { checks: GateCheck[] }) {
  return (
    <ul className="space-y-0.5 text-xs">
      {withKeys(checks, (c) => c.check).map(([k, c]) => (
        <li key={k}>
          <span className={c.passed ? "text-muted-foreground" : "font-semibold text-destructive"}>
            {c.passed ? "ok" : "fail"}
          </span>{" "}
          <span className="font-mono">{c.check}</span>
          {typeof c.value === "number" ? (
            <span className="num text-muted-foreground"> ({c.value})</span>
          ) : null}
          {c.reason ? <span>: {c.reason}</span> : null}
        </li>
      ))}
    </ul>
  );
}

export function GatePanel({ u }: { u: Utterance }) {
  const { lang, snap } = useRun();
  const s = S[lang];
  const g = u.gate;
  const mod = (snap.moderationGates ?? []).filter((m) => m.utteranceId === u.id);
  return (
    <Level min="engineer">
      <Panel
        title={s.title}
        aside={
          g ? (
            <Chip
              className={
                g.action === "accepted"
                  ? ""
                  : g.action === "regenerated"
                    ? "border-warning/40 text-warning"
                    : "border-destructive/40 text-destructive"
              }
            >
              {s.action[g.action]}
            </Chip>
          ) : null
        }
      >
        {!g && mod.length === 0 ? <p className="text-xs text-muted-foreground">{s.none}</p> : null}
        {g ? (
          <div className="space-y-2">
            <div>
              <h3 className="text-xs font-semibold">{s.first}</h3>
              <Checks checks={g.first} />
            </div>
            {g.retry?.length ? (
              <div>
                <h3 className="text-xs font-semibold">{s.retry}</h3>
                <Checks checks={g.retry} />
              </div>
            ) : null}
            {g.rejectedText ? (
              <details>
                <summary className="cursor-pointer text-xs font-semibold">{s.rejected}</summary>
                <p className="mt-1 text-xs text-muted-foreground">{g.rejectedText}</p>
              </details>
            ) : null}
          </div>
        ) : null}
        {mod.length ? (
          <ul className="mt-2 space-y-0.5 text-xs">
            {withKeys(mod, (m) => m.kind).map(([k, m]) => (
              <li key={k}>
                <span className="font-semibold">{s.moderation}:</span> {L(m.reason, lang)}
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>
    </Level>
  );
}
