"use client";

import type { Lang } from "@sv/contracts";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { EvalExample } from "./data.server";
import type { Verdict } from "./parse";
import { modelsT } from "./strings";

interface Inst {
  role: string;
  name: string;
  code: string;
  verdict: Verdict | null;
}

interface Gen {
  model: string;
  text: string;
  ms: number;
  inCharacter: number | null;
}
interface Result {
  role: string;
  masked: number;
  adapter: Gen;
  base: Gen;
}

type Status = "checking" | "online" | "offline";

/**
 * Side-by-side generation through /api/models/generate (adapter sv-<role> vs base sv-base,
 * same role card). If the proxy is unreachable, the precomputed held-out examples are shown
 * instead, so the section never renders empty on stage.
 */
export function Playground({
  lang,
  institutions,
  examples,
}: {
  lang: Lang;
  institutions: Inst[];
  examples: EvalExample[];
}) {
  const t = modelsT(lang).playground;
  const tv = modelsT(lang).table.verdicts;
  const [status, setStatus] = useState<Status>("checking");
  const [scorer, setScorer] = useState(false);
  const [role, setRole] = useState(
    institutions.find((i) => i.role === "nursing")?.role ?? institutions[0]?.role ?? "",
  );
  const [prompt, setPrompt] = useState(t.sampleTexts[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const nf = new Intl.NumberFormat(lang === "de" ? "de-AT" : "en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const nameOf = (r: string) => institutions.find((i) => i.role === r)?.name ?? r;

  useEffect(() => {
    let live = true;
    fetch("/api/models/generate", { cache: "no-store" })
      .then((r) => r.json())
      .then((s: { proxy: boolean; scorer: boolean }) => {
        if (!live) return;
        setStatus(s.proxy ? "online" : "offline");
        setScorer(s.scorer);
      })
      .catch(() => live && setStatus("offline"));
    return () => {
      live = false;
    };
  }, []);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/models/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role, prompt }),
      });
      if (r.status === 503) {
        setStatus("offline");
        return;
      }
      if (!r.ok) throw new Error(String(r.status));
      setResult((await r.json()) as Result);
    } catch {
      setError(t.error);
    } finally {
      setBusy(false);
    }
  }

  const shown = examples.filter((e) => e.role === role);
  const offlineList = shown.length ? shown : examples;

  return (
    <div className="space-y-4 rounded-2xl border bg-card p-4" data-testid="models-playground">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span
          className={cn(
            "inline-block size-2 rounded-full",
            status === "online" && "bg-emerald-500",
            status === "offline" && "bg-red-500",
            status === "checking" && "bg-muted-foreground animate-pulse",
          )}
        />
        <span className="font-medium">
          {status === "online" ? t.online : status === "offline" ? t.offline : t.checking}
        </span>
        {status === "online" && !scorer ? (
          <span className="text-xs text-muted-foreground">({t.scorerOff})</span>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-[16rem_1fr]">
        <div className="space-y-1 text-sm">
          <label htmlFor="models-role" className="text-muted-foreground">
            {t.institution}
          </label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger id="models-role" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {institutions.map((i) => (
                <SelectItem key={i.role} value={i.role}>
                  {i.name}
                  {i.verdict ? (
                    <span className="ml-1 text-xs text-muted-foreground">({tv[i.verdict]})</span>
                  ) : null}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 text-sm">
          <label htmlFor="models-prompt" className="text-muted-foreground">
            {t.prompt}
          </label>
          <Textarea
            id="models-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t.placeholder}
            rows={3}
            maxLength={2000}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">{t.samples}:</span>
        {t.sampleTexts.map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => setPrompt(s)}
            className="rounded-control border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
            title={s}
          >
            {i + 1}
          </button>
        ))}
        <span className="flex-1" />
        <Button
          onClick={run}
          disabled={busy || status !== "online" || prompt.trim().length < 5}
          size="sm"
        >
          {busy ? (
            <>
              <Spinner /> {t.running}
            </>
          ) : (
            t.run
          )}
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {status === "online" && result ? (
        <div className="space-y-2">
          <div className="grid gap-3 md:grid-cols-2">
            <Output
              title={`${t.adapter} · ${result.adapter.model}`}
              gen={result.adapter}
              scorer={scorer}
              t={t}
              nf={nf}
            />
            <Output
              title={`${t.base} · ${result.base.model}`}
              gen={result.base}
              scorer={scorer}
              t={t}
              nf={nf}
            />
          </div>
          {result.masked ? (
            <p className="text-xs text-muted-foreground">{t.masked(result.masked)}</p>
          ) : null}
        </div>
      ) : null}

      {status === "offline" ? (
        <div className="space-y-3">
          <p className="max-w-4xl text-sm text-muted-foreground">{t.offlineText}</p>
          <div className="text-sm font-medium">{t.examples}</div>
          {offlineList.map((e) => (
            <div key={`${e.role}-${e.draft}`} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{nameOf(e.role)}</span>
                <span>
                  {t.draft} <span className="font-mono">{e.draft}</span>
                </span>
                {e.referenceStance !== null ? (
                  <span>
                    {t.stance} {t.refStance}: {e.referenceStance}
                  </span>
                ) : null}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Output
                  title={`${t.adapter} · sv-${e.role}`}
                  gen={e.adapter}
                  scorer
                  t={t}
                  nf={nf}
                />
                <Output title={`${t.base} · sv-base`} gen={e.base} scorer t={t} nf={nf} />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">{t.note}</p>
    </div>
  );
}

function Output({
  title,
  gen,
  scorer,
  t,
  nf,
}: {
  title: string;
  gen: {
    text: string;
    inCharacter: number | null;
    ms?: number;
    loops?: boolean;
    stance?: number | null;
  };
  scorer: boolean;
  t: ReturnType<typeof modelsT>["playground"];
  nf: Intl.NumberFormat;
}) {
  return (
    <article className="flex flex-col gap-2 rounded-xl border p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-mono">{title}</span>
        <span className="flex-1" />
        {gen.loops ? <Badge variant="destructive">{t.loops}</Badge> : null}
        {gen.stance !== undefined && gen.stance !== null ? (
          <Badge variant="outline">
            {t.stance} {gen.stance}
          </Badge>
        ) : null}
        {gen.inCharacter !== null ? (
          <Badge variant="secondary">
            {t.inChar} {nf.format(gen.inCharacter)}
          </Badge>
        ) : scorer ? null : (
          <span className="text-muted-foreground">{t.scorerOff}</span>
        )}
        {gen.ms ? (
          <span className="text-muted-foreground">
            {nf.format(gen.ms / 1000)} {t.seconds}
          </span>
        ) : null}
      </div>
      <p className="max-h-80 overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap">
        {gen.text}
      </p>
    </article>
  );
}
