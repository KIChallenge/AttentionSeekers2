import { type Lang, localize } from "@sv/contracts";
import { familyColor } from "@/components/topics/family";
import { topicT } from "@/components/topics/messages";
import type { Overview, RankedRun } from "@/lib/overview-data";
import { overviewT } from "./messages";

type Ranking = NonNullable<Overview["ranking"]>;

const pct = (x: number, lang: Lang) =>
  x.toLocaleString(lang === "de" ? "de-AT" : "en-GB", { style: "percent" });

/** Only the single-family ensemble runs ("Alle Qwen", ...): one row per model family. */
const familyRuns = (r: Ranking) => r.rows.filter((x) => /^all_/.test(x.run.label));
const familyName = (x: RankedRun, lang: Lang) => {
  const f = x.run.label.replace(/^all_/, "");
  return topicT(lang).fam[f] ?? f;
};
const familyOf = (x: RankedRun) => x.run.label.replace(/^all_/, "");

/**
 * Where each model pulls the institutions: mean shift from the data-expected opening to the
 * final stance on the two policy axes. The origin is "as expected"; one dot per family.
 */
function DirectionMap({ r, lang }: { r: Ranking; lang: Lang }) {
  const t = overviewT(lang).sim;
  const pts = familyRuns(r).filter((x) => x.direction.x !== null && x.direction.y !== null);
  if (!r.axes || pts.length === 0) return null;
  const lim = Math.max(
    0.25,
    ...pts.flatMap((p) => [Math.abs(p.direction.x ?? 0), Math.abs(p.direction.y ?? 0)]),
  );
  const ext = Math.ceil(lim * 1.15 * 4) / 4;
  const W = 360;
  const H = 280;
  const pad = 24;
  const sx = (v: number) => W / 2 + (v / ext) * (W / 2 - pad);
  const sy = (v: number) => H / 2 - (v / ext) * (H / 2 - pad);

  // labels sit right of their dot; nudge them apart vertically so none overlap
  const placed = pts
    .map((p) => ({ p, x: sx(p.direction.x ?? 0), y: sy(p.direction.y ?? 0) }))
    .sort((a, b) => a.y - b.y);
  const ly: number[] = [];
  for (const [i, q] of placed.entries()) {
    const prev = ly[i - 1];
    ly.push(prev !== undefined && q.y + 4 - prev < 13 ? prev + 13 : q.y + 4);
  }

  return (
    <figure className="space-y-2">
      <figcaption className="text-xs text-muted-foreground">{t.leanTitle}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={t.leanTitle}>
        <rect
          x={pad}
          y={pad}
          width={W - 2 * pad}
          height={H - 2 * pad}
          rx={10}
          className="fill-muted/40"
        />
        <line x1={pad} x2={W - pad} y1={H / 2} y2={H / 2} className="stroke-border" />
        <line y1={pad} y2={H - pad} x1={W / 2} x2={W / 2} className="stroke-border" />
        <text x={pad + 6} y={H / 2 + 14} className="fill-muted-foreground text-[10px]">
          ◀ {localize(r.axes.x[0], lang)}
        </text>
        <text
          x={W - pad - 6}
          y={H / 2 + 14}
          textAnchor="end"
          className="fill-muted-foreground text-[10px]"
        >
          {localize(r.axes.x[1], lang)} ▶
        </text>
        <text x={W / 2 + 6} y={pad + 14} className="fill-muted-foreground text-[10px]">
          ▲ {localize(r.axes.y[1], lang)}
        </text>
        <text x={W / 2 + 6} y={H - pad - 6} className="fill-muted-foreground text-[10px]">
          ▼ {localize(r.axes.y[0], lang)}
        </text>
        <circle cx={W / 2} cy={H / 2} r={3.5} className="fill-foreground" />
        <text
          x={W / 2 - 6}
          y={H / 2 - 6}
          textAnchor="end"
          className="fill-foreground text-[10px] font-medium"
        >
          {t.leanExpected}
        </text>
        {placed.map(({ p, x, y }, i) => {
          const color = familyColor(familyOf(p));
          const name = familyName(p, lang);
          return (
            <g key={p.run.id}>
              <title>{`${name}: ${(p.direction.x ?? 0).toFixed(2)} / ${(p.direction.y ?? 0).toFixed(2)}`}</title>
              <line
                x1={W / 2}
                y1={H / 2}
                x2={x}
                y2={y}
                stroke={color}
                strokeWidth={1.5}
                strokeOpacity={0.5}
              />
              <circle cx={x} cy={y} r={5} fill={color} />
              <text x={x + 9} y={ly[i]} className="fill-foreground text-[11px] font-medium">
                {name}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/** Share of tabled proposals each family accepted, against the historical enactment rate. */
function AcceptBars({ r, lang }: { r: Ranking; lang: Lang }) {
  const t = overviewT(lang).sim;
  const rows = familyRuns(r)
    .filter((x) => x.acceptRate !== null)
    .sort((a, b) => (b.acceptRate ?? 0) - (a.acceptRate ?? 0));
  if (rows.length === 0) return null;
  const hist = r.histRate;
  const row = "grid grid-cols-[minmax(6rem,auto)_1fr_3rem] items-center gap-3 text-sm";
  return (
    <figure className="space-y-3">
      <figcaption className="text-xs text-muted-foreground">{t.acceptTitle}</figcaption>
      <div className="space-y-2">
        {rows.map((x) => (
          <div key={x.run.id} className={row}>
            <span className="truncate">{familyName(x, lang)}</span>
            <div className="relative h-3.5 rounded-full bg-muted">
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${Math.max(1.5, (x.acceptRate ?? 0) * 100)}%`,
                  background: familyColor(familyOf(x)),
                }}
              />
              <div
                className="absolute -inset-y-1 w-0.5 rounded-full bg-foreground"
                style={{ left: `${hist * 100}%` }}
              />
            </div>
            <span className="num text-right text-muted-foreground">
              {pct(x.acceptRate ?? 0, lang)}
            </span>
          </div>
        ))}
        <div className={row}>
          <span className="font-medium whitespace-nowrap">{t.acceptHist}</span>
          <div className="relative h-3.5 rounded-full bg-muted">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-foreground/70"
              style={{ width: `${hist * 100}%` }}
            />
          </div>
          <span className="num text-right font-medium">{pct(hist, lang)}</span>
        </div>
      </div>
    </figure>
  );
}

export function ModelLean({ r, lang }: { r: Ranking; lang: Lang }) {
  if (familyRuns(r).length === 0) return null;
  return (
    <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-2">
      <DirectionMap r={r} lang={lang} />
      <AcceptBars r={r} lang={lang} />
    </div>
  );
}
