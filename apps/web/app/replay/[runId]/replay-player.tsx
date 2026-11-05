"use client";

import { localize, PHASES } from "@sv/contracts";
import { useState } from "react";
import { AgentTile } from "@/components/run/agent-tile";
import { usePrefs } from "@/components/shell/providers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRunStream } from "@/lib/use-run-stream";

// Replay player (W-44). Stub: speed, play/pause/restart and a live list; the scrubber and
// shared live-view components land with W-44.
const SPEEDS = [1, 2, 4, 8, 0] as const;

export function ReplayPlayer({ runId }: { runId: string }) {
  const { t, lang } = usePrefs();
  const [speed, setSpeed] = useState<number>(4);
  const { snapshot: s, state, error, start, stop, resume } = useRunStream(runId, { speed });
  const phase = PHASES[s.currentPhase - 1];
  const last = s.utteranceOrder.slice(-8).reverse();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-4 text-2xl">{t.replay.title}</h1>
        <Badge variant="outline">{s.source === "live" ? t.replay.live : t.replay.replay}</Badge>
        <Badge variant="outline" className="num">
          {t.run.round} {s.currentRound || "–"} ·{" "}
          {phase ? (lang === "de" ? phase.de : phase.en) : ""}
        </Badge>
        <Badge variant="outline" className="num">
          {t.replay.events} {s.lastSeq + 1}
        </Badge>
        <span className="flex-1" />
        <span className="text-xs text-muted-foreground">{t.replay.speed}</span>
        {SPEEDS.map((x) => (
          <Button
            key={x}
            size="xs"
            variant={x === speed ? "default" : "outline"}
            onClick={() => setSpeed(x)}
          >
            {x === 0 ? "max" : `${x}x`}
          </Button>
        ))}
        {state === "streaming" ? (
          <Button size="sm" variant="outline" onClick={stop}>
            {t.replay.pause}
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => void resume()}>
            {t.replay.play}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => void start()}>
          {t.replay.restart}
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <h2 className="text-base">{s.run?.mandate.question}</h2>
      {s.activeSpeaker ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <AgentTile agentId={s.activeSpeaker} withName lang={lang} />…
        </div>
      ) : null}
      <ul className="space-y-2">
        {last.map((id) => {
          const u = s.utterances[id];
          if (!u) return null;
          return (
            <li key={id} className="rounded-2xl border p-3 text-sm">
              <div className="mb-1 flex items-center gap-2">
                <AgentTile agentId={u.speaker} withName lang={lang} />
                <span className="font-mono text-xs text-muted-foreground">
                  {u.id}
                  {u.respondsTo ? ` → ${u.respondsTo}` : ""}
                </span>
                <Badge variant="outline" className="text-muted-foreground">
                  {u.kind}
                </Badge>
              </div>
              <p>{localize(u.text, lang)}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
