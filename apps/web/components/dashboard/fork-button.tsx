"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { laneT } from "@/components/entity/messages";
import { AgentTile } from "@/components/run/agent-tile";
import { usePrefs } from "@/components/shell/providers";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Fork from round N (addendum item 11). Calls the engine's POST /api/runs/[runId]/fork;
 * disabled with a tooltip while that route does not exist.
 */
export function ForkButton({
  runId,
  rounds,
  agents,
  available,
  size = "sm",
  trigger,
}: {
  runId: string;
  rounds: number;
  agents: string[];
  available: boolean;
  size?: "sm" | "xs";
  /** Custom trigger (for example a menu); receives the opener and whether forking is available. */
  trigger?: (open: () => void, available: boolean) => ReactNode;
}) {
  const { t: base, lang } = usePrefs();
  const t = laneT(lang);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(Math.min(3, Math.max(1, rounds)));
  const [agent, setAgent] = useState(agents[0] ?? "sv");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!available && trigger) return <>{trigger(() => undefined, false)}</>;
  if (!available)
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Button size={size} variant="ghost" disabled>
                {base.dashboard.fork}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>{t.dash.forkUnavailable}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/fork`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromRound: round,
          edit: { agentId: agent, removeSegmentIds: [], addSegmentIds: [] },
        }),
      });
      if (res.status === 404) throw new Error(t.dash.forkUnavailable);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { runId?: string; id?: string };
      const next = j.runId ?? j.id;
      setOpen(false);
      if (next) router.push(`/runs/${encodeURIComponent(next)}`);
      else router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {trigger ? (
        trigger(() => setOpen(true), true)
      ) : (
        <Button size={size} variant="ghost" onClick={() => setOpen(true)}>
          {base.dashboard.fork}
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.dash.forkTitle}</DialogTitle>
            <DialogDescription>{t.dash.forkBody}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <div className="mb-1.5 text-xs text-muted-foreground">{t.dash.forkRound}</div>
              <div className="flex gap-1">
                {Array.from({ length: rounds }, (_, i) => i + 1).map((r) => (
                  <Button
                    key={r}
                    size="sm"
                    variant={r === round ? "default" : "outline"}
                    onClick={() => setRound(r)}
                    className="num w-9"
                  >
                    {r}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-xs text-muted-foreground">{t.entity.types.agent}</div>
              <div className="flex flex-wrap gap-1">
                {agents.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAgent(a)}
                    className={cn(
                      "rounded-md border p-1",
                      a === agent ? "border-foreground bg-gray-alpha-100" : "opacity-60",
                    )}
                    aria-pressed={a === agent}
                  >
                    <AgentTile agentId={a} />
                  </button>
                ))}
              </div>
            </div>
            {err ? (
              <p className="text-sm text-destructive">
                {t.dash.forkFailed}: {err}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t.dash.cancel}
            </Button>
            <Button onClick={() => void submit()} disabled={busy}>
              {t.dash.forkStart}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
