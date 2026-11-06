"use client";

import { catalogAgent, type Lang, type RoomConfig } from "@sv/contracts";
import { laneT } from "@/components/entity/messages";
import { cn } from "@/lib/utils";

const CLIMATE_STROKE: Record<RoomConfig["climate"], string> = {
  cooperative: "var(--success)",
  neutral: "var(--gray-alpha-400)",
  confrontational: "var(--warning)",
};

/**
 * Top-down view of the negotiation room: an oval table with one seat per enabled party,
 * the moderator at the head and the number check opposite. Climate tints the table edge,
 * the round strip below shows the round limit and scheduled event injections.
 */
export function RoomPreview({ config, lang }: { config: RoomConfig; lang: Lang }) {
  const t = laneT(lang);
  const seated = config.agents.filter((a) => a.enabled);
  const W = 420;
  const H = 280;
  const cx = W / 2;
  const cy = H / 2;
  const rx = 150;
  const ry = 82;
  const seatR = 17;
  const n = seated.length;
  // seats spread evenly over both long sides; the head (chair) and foot (expert) stay free
  const gap = 0.36;
  const span = Math.PI - 2 * gap;
  const seats = seated.map((a, i) => {
    const u = ((i + 0.5) / Math.max(1, n)) * 2 * span;
    const ang = u < span ? -Math.PI / 2 + gap + u : Math.PI / 2 + gap + (u - span);
    return { a, x: cx + Math.cos(ang) * (rx + 30), y: cy + Math.sin(ang) * (ry + 30) };
  });
  const climateLabel = t.setup.climates[config.climate];
  return (
    <div className="space-y-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={t.setup.table}>
        <defs>
          <radialGradient id="tableShade" cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="var(--gray-alpha-50)" />
            <stop offset="100%" stopColor="var(--gray-alpha-150)" />
          </radialGradient>
        </defs>
        <ellipse
          cx={cx}
          cy={cy}
          rx={rx}
          ry={ry}
          fill="url(#tableShade)"
          stroke={CLIMATE_STROKE[config.climate]}
          strokeWidth={config.climate === "neutral" ? 1.5 : 3}
          strokeDasharray={config.climate === "confrontational" ? "8 5" : undefined}
        />
        <text x={cx} y={cy - 6} textAnchor="middle" className="fill-muted-foreground" fontSize="11">
          {t.setup.table}
        </text>
        <text
          x={cx}
          y={cy + 12}
          textAnchor="middle"
          className="fill-foreground"
          fontSize="13"
          fontWeight={600}
        >
          {seated.length} {t.setup.seats} · {config.roundLimit} {t.setup.rounds}
        </text>
        <text
          x={cx}
          y={cy + 28}
          textAnchor="middle"
          className="fill-muted-foreground"
          fontSize="10"
        >
          {t.setup.rules[config.decisionRule]} · +{config.budgetCeiling.maxIncreasePct} % ·{" "}
          {climateLabel}
        </text>
        {/* chair */}
        <g transform={`translate(${cx}, ${cy - ry - 26})`}>
          <rect
            x={-seatR}
            y={-seatR}
            width={seatR * 2}
            height={seatR * 2}
            rx={6}
            fill="var(--c-mod)"
          />
          <text y={4} textAnchor="middle" fontSize="11" fontWeight={700} fill="white">
            M
          </text>
          <text y={-seatR - 4} textAnchor="middle" fontSize="9" className="fill-muted-foreground">
            {t.setup.moderatorChair}
          </text>
        </g>
        {/* expert */}
        <g transform={`translate(${cx}, ${cy + ry + 26})`}>
          <rect
            x={-seatR + 3}
            y={-seatR + 3}
            width={(seatR - 3) * 2}
            height={(seatR - 3) * 2}
            rx={5}
            fill="none"
            stroke="var(--c-mod)"
            strokeDasharray="3 2"
          />
          <text
            y={4}
            textAnchor="middle"
            fontSize="10"
            fontWeight={700}
            className="fill-foreground"
          >
            E
          </text>
          <text y={seatR + 10} textAnchor="middle" fontSize="9" className="fill-muted-foreground">
            {t.setup.expertSeat}
          </text>
        </g>
        {seats.map(({ a, x, y }) => {
          const c = catalogAgent(a.agentId);
          return (
            <g key={a.agentId} transform={`translate(${x}, ${y})`}>
              <title>{`${lang === "de" ? c?.nameDe : c?.glossEn} · ${a.mode} · ${a.model}`}</title>
              <line
                x1={0}
                y1={0}
                x2={(cx - x) * 0.16}
                y2={(cy - y) * 0.16}
                stroke="var(--gray-alpha-300)"
              />
              <circle
                r={seatR}
                fill={c?.color ?? "var(--c-opt)"}
                stroke="var(--background)"
                strokeWidth={2}
              />
              {a.mode === "prompted" ? (
                <circle
                  r={seatR + 3}
                  fill="none"
                  stroke={c?.color ?? "var(--c-opt)"}
                  strokeDasharray="3 3"
                />
              ) : null}
              <text y={4} textAnchor="middle" fontSize="11" fontWeight={700} fill="white">
                {c?.code ?? a.agentId}
              </text>
            </g>
          );
        })}
      </svg>
      {/* round strip with scheduled events */}
      <div>
        <div className="flex gap-1">
          {Array.from({ length: config.roundLimit }, (_, i) => i + 1).map((r) => {
            const evs = config.scheduledEvents.filter((e) => e.atRound === r);
            return (
              <div
                key={r}
                className={cn(
                  "relative flex h-7 flex-1 items-center justify-center rounded-md border text-[11px]",
                  evs.length ? "border-warning/50 bg-warning/10" : "bg-gray-alpha-50",
                )}
                title={evs.map((e) => e.title.text).join(", ")}
              >
                <span className="num">R{r}</span>
                {evs.length ? (
                  <span className="ml-1 text-warning">◆{evs.length > 1 ? evs.length : ""}</span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
