"use client";

import {
  AGENT_CATALOG,
  type Climate,
  type DecisionRule,
  type Lang,
  type LocalizedText,
  type PressureLevel,
  type RoomAgent,
  RoomConfig,
  type ScheduledEvent,
  TEMPLATES,
  type TemperamentSetting,
  type Template,
} from "@sv/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useMemo, useState } from "react";
import { laneT } from "@/components/entity/messages";
import { AgentTile } from "@/components/run/agent-tile";
import { usePrefs } from "@/components/shell/providers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { RoomPreview } from "./room-preview";

export interface AgentDefaults {
  reason: LocalizedText | null;
  temperament: TemperamentSetting | null;
  model: string | null;
}

const DIALS: Array<keyof TemperamentSetting> = [
  "concession",
  "assertiveness",
  "coalitionAppetite",
  "riskTolerance",
];
const LEVELS: PressureLevel[] = ["none", "low", "medium", "high"];
const CLIMATES: Climate[] = ["cooperative", "neutral", "confrontational"];
const RULES: DecisionRule[] = ["consensus", "qualified_majority", "veto_players"];
const EVENT_KINDS: ScheduledEvent["kind"][] = [
  "statistic",
  "court_ruling",
  "press_report",
  "budget_shock",
  "political",
  "other",
];

/** Reasons for the optional parties (FR-A9); the core nine come from the reference run. */
const OPTIONAL_REASON: Record<string, { de: string; en: string }> = {
  nr: { de: "Beschließt die gesetzliche Umsetzung", en: "Passes the statutory implementation" },
  ph: { de: "Evidenz zu Wirksamkeit und Bedarf", en: "Evidence on effectiveness and need" },
  wk: { de: "Arbeitgeberseite in der Selbstverwaltung", en: "Employer side in self-governance" },
  abk: { de: "Versichertenseite in der Selbstverwaltung", en: "Insured side in self-governance" },
  lk: { de: "Versorgung im ländlichen Raum", en: "Care in rural areas" },
  ind: { de: "Arzneimittel, Medizinprodukte, Innovation", en: "Medicines, devices, innovation" },
};

function lt(_lang: Lang, de: string, en: string): LocalizedText {
  return { lang: "de", text: de, translations: { en } } as LocalizedText;
}

function initialConfig(
  defaults: Record<string, AgentDefaults>,
  models: string[],
  asOf: string,
  lang: Lang,
): RoomConfig {
  const fallbackModel = models[0] ?? "azure/gpt-5-mini";
  const agents: RoomAgent[] = AGENT_CATALOG.map((a) => {
    const d = defaults[a.id];
    const opt = OPTIONAL_REASON[a.id];
    return {
      agentId: a.id,
      enabled: a.origin === "core",
      origin: a.origin,
      mode: a.mode,
      suggestedByModerator: a.origin === "core",
      reason: d?.reason ?? lt(lang, opt?.de ?? a.nameDe, opt?.en ?? a.glossEn),
      model: d?.model ?? fallbackModel,
      temperament: d?.temperament ?? {
        concession: 0.5,
        assertiveness: 0.5,
        coalitionAppetite: 0.5,
        riskTolerance: 0.5,
      },
    };
  });
  const core = agents.filter((a) => a.enabled).length;
  return {
    template: "wartezeiten",
    question: TEMPLATES[0]?.question ?? "",
    lang,
    agents,
    moderatorModel: fallbackModel,
    expertModel: models[1] ?? fallbackModel,
    decisionRule: "consensus",
    qualifiedMajority: { needed: Math.ceil((core * 2) / 3), of: core },
    roundLimit: 5,
    budgetCeiling: { maxIncreasePct: 5, baselineEurBn: null, note: null },
    asOf,
    climate: "neutral",
    pressures: { time: "medium", budget: "high", public: "medium" },
    scheduledEvents: [],
    coldRatification: true,
    seed: 20261105,
  };
}

function Section({
  n,
  title,
  children,
  aside,
}: {
  n: number;
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-card p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="num inline-grid size-6 place-items-center rounded-full bg-foreground text-xs text-background">
          {n}
        </span>
        <h2 className="text-base">{title}</h2>
        <span className="flex-1" />
        {aside}
      </div>
      {children}
    </section>
  );
}

function Seg<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div
      className="inline-flex flex-wrap rounded-control border p-0.5"
      role="radiogroup"
      aria-label={label}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-[8px] px-2.5 py-1 text-xs",
            o.value === value
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Dial({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="grid grid-cols-[1fr_6rem_2rem] items-center gap-2 text-xs">
      <span className="truncate text-muted-foreground">{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-foreground"
      />
      <span className="num text-right">{value.toFixed(2)}</span>
    </label>
  );
}

export function SetupRoom({
  defaults,
  models,
  asOf,
}: {
  defaults: Record<string, AgentDefaults>;
  models: string[];
  asOf: string;
}) {
  const { t: base, lang } = usePrefs();
  const t = laneT(lang);
  const router = useRouter();
  const [cfg, setCfg] = useState<RoomConfig>(() => initialConfig(defaults, models, asOf, lang));
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const enabled = cfg.agents.filter((a) => a.enabled);
  const parsed = useMemo(() => RoomConfig.safeParse(cfg), [cfg]);
  const set = <K extends keyof RoomConfig>(k: K, v: RoomConfig[K]) =>
    setCfg((c) => ({ ...c, [k]: v }));
  const setAgent = (id: string, patch: Partial<RoomAgent>) =>
    setCfg((c) => {
      const agents = c.agents.map((a) => (a.agentId === id ? { ...a, ...patch } : a));
      const of = agents.filter((a) => a.enabled).length;
      return {
        ...c,
        agents,
        qualifiedMajority: c.qualifiedMajority
          ? { of, needed: Math.min(of, Math.max(1, Math.ceil((of * 2) / 3))) }
          : c.qualifiedMajority,
      };
    });
  const toggle = (id: string) => {
    const a = cfg.agents.find((x) => x.agentId === id);
    if (a) setAgent(id, { enabled: !a.enabled });
  };
  const pickTemplate = (id: Template) => {
    const tpl = TEMPLATES.find((x) => x.id === id);
    setCfg((c) => ({ ...c, template: id, question: tpl?.question ?? c.question }));
  };
  const modelOptions = [...new Set([...models, ...cfg.agents.map((a) => a.model)])];

  const start = async () => {
    if (!parsed.success) {
      setMsg({
        kind: "error",
        text: `${t.setup.invalid}: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`,
      });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (res.status === 404 || res.status === 405) {
        setMsg({ kind: "info", text: t.setup.engineMissing });
        return;
      }
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status} ${body.slice(0, 200)}`);
      }
      const j = (await res.json()) as { runId?: string; id?: string };
      const id = j.runId ?? j.id;
      setMsg({ kind: "info", text: `${t.setup.started}: ${id ?? ""}` });
      if (id) router.push(`/runs/${encodeURIComponent(id)}`);
    } catch (e) {
      setMsg({
        kind: "error",
        text: `${t.setup.startFailed}: ${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      setBusy(false);
    }
  };

  const addEvent = () =>
    set("scheduledEvents", [
      ...cfg.scheduledEvents,
      {
        id: `ev-${cfg.scheduledEvents.length + 1}`,
        atRound: Math.min(cfg.roundLimit, 3),
        kind: "statistic",
        title: lt(lang, "", ""),
        body: lt(lang, "", ""),
        sourceRef: null,
      },
    ]);
  const setEvent = (i: number, patch: Partial<ScheduledEvent>) =>
    set(
      "scheduledEvents",
      cfg.scheduledEvents.map((e, j) => (j === i ? { ...e, ...patch } : e)),
    );
  const text = (v: string): LocalizedText => ({ lang, text: v, translations: {} }) as LocalizedText;

  const agentRow = (a: RoomAgent) => {
    const c = AGENT_CATALOG.find((x) => x.id === a.agentId);
    if (!c) return null;
    const expanded = open === a.agentId;
    return (
      <li
        key={a.agentId}
        className={cn("rounded-xl border", a.enabled ? "bg-background" : "bg-gray-alpha-50")}
      >
        <div className="flex flex-wrap items-center gap-2 p-2.5">
          <Checkbox
            checked={a.enabled}
            onCheckedChange={(v) => setAgent(a.agentId, { enabled: v === true })}
            aria-label={c.nameDe}
          />
          <AgentTile agentId={a.agentId} />
          <div className={cn("min-w-0 flex-1", !a.enabled && "opacity-60")}>
            <div className="truncate text-sm">{lang === "de" ? c.nameDe : c.glossEn}</div>
            <div className="truncate text-xs text-muted-foreground">
              {a.reason.translations?.[lang] && a.reason.lang !== lang
                ? a.reason.translations[lang]
                : a.reason.text}
            </div>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "text-[11px]",
              a.mode === "fitted"
                ? "border-success/40 text-success"
                : "border-dashed text-muted-foreground",
            )}
            title={a.mode === "fitted" ? t.setup.fittedHint : t.setup.promptedHint}
          >
            {a.mode === "fitted" ? t.setup.fitted : t.setup.prompted}
          </Badge>
          {a.suggestedByModerator ? (
            <Badge
              variant="secondary"
              className="hidden text-[11px] sm:inline-flex"
              title={t.setup.suggested}
            >
              M
            </Badge>
          ) : null}
          <Button
            size="xs"
            variant="ghost"
            onClick={() => setOpen(expanded ? null : a.agentId)}
            aria-expanded={expanded}
            className="font-mono text-[11px] text-muted-foreground"
          >
            {a.model.split("/").at(-1)} {expanded ? "▴" : "▾"}
          </Button>
        </div>
        {expanded ? (
          <div className="grid grid-cols-1 gap-3 border-t p-3 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">{t.setup.model}</div>
              <Select value={a.model} onValueChange={(v) => setAgent(a.agentId, { model: v })}>
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {modelOptions.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="xs"
                variant="outline"
                onClick={() =>
                  setCfg((cc) => ({
                    ...cc,
                    agents: cc.agents.map((x) => ({ ...x, model: a.model })),
                  }))
                }
              >
                {t.setup.model} {t.setup.applyAll}
              </Button>
            </div>
            <div className="space-y-1.5">
              <div className="text-xs text-muted-foreground">{t.setup.temperament}</div>
              {DIALS.map((d) => (
                <Dial
                  key={d}
                  label={t.setup[d]}
                  value={a.temperament[d]}
                  onChange={(v) =>
                    setAgent(a.agentId, { temperament: { ...a.temperament, [d]: v } })
                  }
                />
              ))}
            </div>
          </div>
        ) : null}
      </li>
    );
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_440px]">
      <div className="min-w-0 space-y-4">
        <Section n={1} title={t.setup.step1}>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => pickTemplate(tpl.id)}
                aria-pressed={cfg.template === tpl.id}
                className={cn(
                  "min-w-0 rounded-xl border p-2.5 text-left text-sm [overflow-wrap:anywhere] hyphens-auto transition-colors",
                  cfg.template === tpl.id
                    ? "border-foreground bg-gray-alpha-100"
                    : "hover:bg-gray-alpha-50",
                )}
              >
                <div className="font-medium leading-snug">{lang === "de" ? tpl.de : tpl.en}</div>
                {tpl.id === "wartezeiten" ? (
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {base.dashboard.reference}
                  </div>
                ) : null}
              </button>
            ))}
            <button
              type="button"
              onClick={() => set("template", "custom")}
              aria-pressed={cfg.template === "custom"}
              className={cn(
                "rounded-xl border border-dashed p-2.5 text-left text-sm",
                cfg.template === "custom"
                  ? "border-foreground bg-gray-alpha-100"
                  : "hover:bg-gray-alpha-50",
              )}
            >
              {t.setup.custom}
            </button>
          </div>
          <div className="block">
            <span className="mb-1 block text-xs text-muted-foreground">{t.setup.question}</span>
            <Textarea
              value={cfg.question}
              onChange={(e) =>
                setCfg((c) => ({ ...c, question: e.target.value, template: c.template }))
              }
              rows={3}
            />
          </div>
        </Section>

        <Section
          n={2}
          title={t.setup.step2}
          aside={
            <span className="num text-xs text-muted-foreground">
              {enabled.length} {t.setup.agentsSeated}
            </span>
          }
        >
          <div className="mb-1.5 text-xs text-muted-foreground">{t.setup.core}</div>
          <ul className="mb-4 space-y-1.5">
            {cfg.agents.filter((a) => a.origin === "core").map(agentRow)}
          </ul>
          <div className="mb-1.5 text-xs text-muted-foreground">{t.setup.optional}</div>
          <ul className="space-y-1.5">
            {cfg.agents.filter((a) => a.origin === "optional").map(agentRow)}
          </ul>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(["moderatorModel", "expertModel"] as const).map((k) => (
              <div key={k} className="block">
                <span className="mb-1 block text-xs text-muted-foreground">{t.setup[k]}</span>
                <Select value={cfg[k]} onValueChange={(v) => set(k, v)}>
                  <SelectTrigger size="sm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {modelOptions.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </Section>

        <Section n={3} title={t.setup.step3}>
          <div className="space-y-4">
            <div>
              <div className="mb-1.5 text-xs text-muted-foreground">{t.setup.decisionRule}</div>
              <Seg
                label={t.setup.decisionRule}
                value={cfg.decisionRule}
                options={RULES.map((r) => ({ value: r, label: t.setup.rules[r] }))}
                onChange={(r) =>
                  setCfg((c) => ({
                    ...c,
                    decisionRule: r,
                    qualifiedMajority:
                      r === "qualified_majority"
                        ? { of: enabled.length, needed: Math.ceil((enabled.length * 2) / 3) }
                        : null,
                  }))
                }
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                {t.setup.rulesHint[cfg.decisionRule]}
              </p>
              {cfg.decisionRule === "qualified_majority" && cfg.qualifiedMajority ? (
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <Input
                    type="number"
                    min={1}
                    max={cfg.qualifiedMajority.of}
                    value={cfg.qualifiedMajority.needed}
                    onChange={(e) =>
                      set("qualifiedMajority", {
                        of: enabled.length,
                        needed: Math.max(1, Math.min(enabled.length, Number(e.target.value) || 1)),
                      })
                    }
                    className="h-8 w-20"
                  />
                  <span className="text-muted-foreground">
                    {t.replay.of} {cfg.qualifiedMajority.of} {t.setup.needed}
                  </span>
                </div>
              ) : null}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">
                  {t.setup.roundLimit}
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={1}
                    max={8}
                    value={cfg.roundLimit}
                    onChange={(e) => set("roundLimit", Number(e.target.value))}
                    className="flex-1 accent-foreground"
                  />
                  <span className="num w-6 text-right text-sm">{cfg.roundLimit}</span>
                </div>
              </label>
              <div className="block">
                <span className="mb-1 block text-xs text-muted-foreground">
                  {t.setup.budgetCeiling}
                </span>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step={0.5}
                    value={cfg.budgetCeiling.maxIncreasePct}
                    onChange={(e) =>
                      set("budgetCeiling", {
                        ...cfg.budgetCeiling,
                        maxIncreasePct: Number(e.target.value),
                      })
                    }
                    className="h-8 w-20"
                  />
                  <span className="text-xs text-muted-foreground">{t.setup.budgetUnit}</span>
                </div>
              </div>
              <div className="block">
                <span className="mb-1 block text-xs text-muted-foreground">{t.setup.asOf}</span>
                <Input
                  type="date"
                  value={cfg.asOf}
                  onChange={(e) => e.target.value && set("asOf", e.target.value)}
                  className="h-8"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {t.setup.asOfHint}{" "}
              <Link href={`/archive?asOf=${cfg.asOf}`} className="underline">
                {t.dash.archiveCta} →
              </Link>
            </p>
            <div className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={cfg.coldRatification}
                onCheckedChange={(v) => set("coldRatification", v === true)}
              />
              {t.setup.coldRatification}
            </div>
          </div>
        </Section>

        <Section n={4} title={t.setup.step4}>
          <div className="space-y-4">
            <div>
              <div className="mb-1.5 text-xs text-muted-foreground">{t.setup.climate}</div>
              <Seg
                label={t.setup.climate}
                value={cfg.climate}
                options={CLIMATES.map((c) => ({ value: c, label: t.setup.climates[c] }))}
                onChange={(c) => set("climate", c)}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(
                [
                  ["time", t.setup.pressureTime],
                  ["budget", t.setup.pressureBudget],
                  ["public", t.setup.pressurePublic],
                ] as const
              ).map(([k, label]) => (
                <div key={k}>
                  <div className="mb-1.5 text-xs text-muted-foreground">{label}</div>
                  <Seg
                    label={label}
                    value={cfg.pressures[k]}
                    options={LEVELS.map((l) => ({ value: l, label: t.setup.levels[l] }))}
                    onChange={(l) => set("pressures", { ...cfg.pressures, [k]: l })}
                  />
                </div>
              ))}
            </div>
            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{t.setup.events}</span>
                <span className="flex-1" />
                <Button size="xs" variant="outline" onClick={addEvent}>
                  + {t.setup.addEvent}
                </Button>
              </div>
              <ul className="space-y-2">
                {cfg.scheduledEvents.map((ev, i) => (
                  <li key={ev.id} className="space-y-2 rounded-xl border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-warning">◆</span>
                      <Select
                        value={ev.kind}
                        onValueChange={(v) => setEvent(i, { kind: v as ScheduledEvent["kind"] })}
                      >
                        <SelectTrigger size="sm" className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {EVENT_KINDS.map((k) => (
                            <SelectItem key={k} value={k}>
                              {t.setup.eventKinds[k]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="text-xs text-muted-foreground">{t.setup.atRound}</span>
                      <Input
                        type="number"
                        min={1}
                        max={cfg.roundLimit}
                        value={ev.atRound}
                        onChange={(e) =>
                          setEvent(i, {
                            atRound: Math.max(
                              1,
                              Math.min(cfg.roundLimit, Number(e.target.value) || 1),
                            ),
                          })
                        }
                        className="h-8 w-16"
                      />
                      <span className="flex-1" />
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() =>
                          set(
                            "scheduledEvents",
                            cfg.scheduledEvents.filter((_, j) => j !== i),
                          )
                        }
                      >
                        {t.setup.remove}
                      </Button>
                    </div>
                    <Input
                      placeholder={t.setup.eventTitle}
                      value={ev.title.text}
                      onChange={(e) => setEvent(i, { title: text(e.target.value) })}
                      className="h-8"
                    />
                    <Textarea
                      placeholder={t.setup.eventBody}
                      value={ev.body.text}
                      onChange={(e) => setEvent(i, { body: text(e.target.value) })}
                      rows={2}
                    />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Section>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-[66px] lg:self-start">
        <section className="rounded-2xl border bg-card p-4">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>{t.setup.table}</span>
            <span>{t.setup.climates[cfg.climate]}</span>
          </div>
          <RoomPreview config={cfg} lang={lang} />
          <div className="mt-3 flex flex-wrap gap-1">
            {cfg.agents
              .filter((a) => !a.enabled)
              .map((a) => (
                <button
                  key={a.agentId}
                  type="button"
                  onClick={() => toggle(a.agentId)}
                  className="rounded-md border border-dashed p-1 opacity-50 hover:opacity-100"
                  title={`+ ${a.agentId}`}
                >
                  <AgentTile agentId={a.agentId} />
                </button>
              ))}
          </div>
        </section>
        <section className="rounded-2xl border bg-card p-4 text-sm">
          <h2 className="mb-3 flex items-center gap-2 text-base">
            <span className="num inline-grid size-6 place-items-center rounded-full bg-foreground text-xs text-background">
              5
            </span>
            {t.setup.step5}
          </h2>
          <p className="mb-3 leading-snug">{cfg.question}</p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <dt className="text-muted-foreground">{t.setup.step2}</dt>
            <dd className="num">
              {enabled.length} ({enabled.filter((a) => a.mode === "prompted").length}{" "}
              {t.setup.prompted})
            </dd>
            <dt className="text-muted-foreground">{t.setup.decisionRule}</dt>
            <dd>
              {t.setup.rules[cfg.decisionRule]}
              {cfg.qualifiedMajority && cfg.decisionRule === "qualified_majority"
                ? ` ${cfg.qualifiedMajority.needed}/${cfg.qualifiedMajority.of}`
                : ""}
            </dd>
            <dt className="text-muted-foreground">{t.setup.roundLimit}</dt>
            <dd className="num">{cfg.roundLimit}</dd>
            <dt className="text-muted-foreground">{t.setup.budgetCeiling}</dt>
            <dd className="num">+{cfg.budgetCeiling.maxIncreasePct} %</dd>
            <dt className="text-muted-foreground">{t.setup.asOf}</dt>
            <dd className="num font-mono">{cfg.asOf}</dd>
            <dt className="text-muted-foreground">{t.setup.pressures}</dt>
            <dd>
              {t.setup.levels[cfg.pressures.time]} / {t.setup.levels[cfg.pressures.budget]} /{" "}
              {t.setup.levels[cfg.pressures.public]}
            </dd>
            <dt className="text-muted-foreground">{t.setup.events}</dt>
            <dd className="num">{cfg.scheduledEvents.length}</dd>
            <dt className="text-muted-foreground">{t.setup.model}</dt>
            <dd className="font-mono text-[11px]">
              {[...new Set(enabled.map((a) => a.model))].length} /{" "}
              {cfg.moderatorModel.split("/").at(-1)}
            </dd>
          </dl>
          {!parsed.success ? (
            <p className="mt-3 text-xs text-warning">
              {t.setup.invalid}: {parsed.error.issues[0]?.path.join(".")}
            </p>
          ) : null}
          {msg ? (
            <p
              className={cn(
                "mt-3 rounded-lg border p-2.5 text-xs",
                msg.kind === "error"
                  ? "border-destructive/40 text-destructive"
                  : "border-info/40 bg-info/5 text-info",
              )}
              role="status"
            >
              {msg.text}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              onClick={() => void start()}
              disabled={busy || !parsed.success}
              className="flex-1"
            >
              {busy ? t.setup.starting : base.setup.start}
            </Button>
            <Button asChild variant="outline">
              <Link href="/replay/fixture-wartezeiten">{base.setup.replayReference}</Link>
            </Button>
          </div>
          <button
            type="button"
            className="mt-2 text-xs text-muted-foreground underline"
            onClick={() => {
              void navigator.clipboard?.writeText(JSON.stringify(cfg, null, 2)).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            {copied ? t.setup.copied : t.setup.copyJson}
          </button>
        </section>
      </aside>
    </div>
  );
}
