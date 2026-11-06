// The moderator's compromise package with its real support from the ratification round.
// Presentational only, so the outcome page, the result document and the scenario tabs share it.
import type { CompromisePackage, CompromiseResult, CompromiseVote } from "@sv/contracts";
import { AgentTile } from "@/components/run/agent-tile";
import { Chip } from "@/components/run/bits";
import { cn } from "@/lib/utils";
import { COMPROMISE_T, compromiseTally, nameOf, tx } from "./compromise-strings";

export { COMPROMISE_T, compromiseTally };

type Lang = "de" | "en";

export function CompromiseVerdict({ result, lang }: { result: CompromiseResult; lang: Lang }) {
  return (
    <Chip
      className={cn(
        result.passes
          ? "border-success/30 bg-success/10 text-success"
          : "border-warning/40 text-warning",
      )}
    >
      {compromiseTally(result, lang)}
    </Chip>
  );
}

export function CompromiseBlock({
  compromise,
  votes,
  result,
  lang,
  compact = false,
}: {
  compromise: CompromisePackage;
  votes: Record<string, CompromiseVote>;
  result: CompromiseResult | null;
  lang: Lang;
  compact?: boolean;
}) {
  const c = COMPROMISE_T[lang];
  const order = { support: 0, conditional: 1, oppose: 2 } as const;
  const list = Object.values(votes).sort((a, b) => order[a.stance] - order[b.stance]);
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold tracking-tight">{tx(compromise.title, lang)}</h3>
          {result ? <CompromiseVerdict result={result} lang={lang} /> : null}
        </div>
        {result && !result.passes ? (
          <p className="text-sm text-warning">{tx(result.note, lang)}</p>
        ) : null}
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {tx(compromise.rationale, lang)}
        </p>
      </div>
      <div className={cn("grid gap-4", !compact && "lg:grid-cols-2")}>
        <div>
          <div className="mb-1.5 text-xs text-muted-foreground">{c.components}</div>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {compromise.components.map((x) => (
              <li key={x.text.text}>
                {tx(x.text, lang)}
                {x.proposalIds.length ? (
                  <span className="ml-1 font-mono text-[11px] text-muted-foreground">
                    {x.proposalIds.join(", ")}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
        {compromise.conditions.length ? (
          <div>
            <div className="mb-1.5 text-xs text-muted-foreground">{c.conditions}</div>
            <ul className="space-y-1 text-sm">
              {compromise.conditions.map((x) => (
                <li key={x.text.text}>
                  <span className="text-muted-foreground">{c.kind[x.kind]}: </span>
                  {tx(x.text, lang)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      {list.length ? (
        <ul className="divide-y rounded-xl border">
          {list.map((v) => (
            <li key={v.agentId} className="flex items-start gap-3 p-2.5 text-sm">
              <AgentTile agentId={v.agentId} lang={lang} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{nameOf(v.agentId, lang)}</span>
                  <span
                    className={cn(
                      "text-xs",
                      v.stance === "support" && "text-success",
                      v.stance === "oppose" && "text-warning",
                      v.stance === "conditional" && "text-muted-foreground",
                    )}
                  >
                    {c[v.stance]}
                  </span>
                </div>
                {v.condition ? <div>{tx(v.condition, lang)}</div> : null}
                {!compact || !v.condition ? (
                  <div className="text-muted-foreground">{tx(v.reason, lang)}</div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {compromise.redLinesTouched.length ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            {c.redLines} ({compromise.redLinesTouched.length})
          </summary>
          <ul className="mt-1.5 space-y-1">
            {compromise.redLinesTouched.map((r) => (
              <li key={r.redLineId}>
                <span className="text-muted-foreground">{nameOf(r.agentId, lang)}: </span>
                {tx(r.note, lang)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
