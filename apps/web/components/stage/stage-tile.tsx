"use client";

import { memo } from "react";
import { cn } from "@/lib/utils";

// One call-grid tile (FR-S5, FR-S7). The figure is a deliberately abstract emblem: a
// geometric head with a voice slot instead of a face, shoulders carrying the institution
// code. No eyes, no names, no photographic detail. The mouth and the level meter read the
// CSS variable --amp, which the player writes once per animation frame on the stage root,
// so audio-rate animation never re-renders React.

export type TileRole = "agent" | "moderator" | "expert";

function Head({ role, color }: { role: TileRole; color: string }) {
  if (role === "moderator")
    return <rect x="60" y="50" width="80" height="80" rx="22" fill={color} />;
  if (role === "expert")
    return <polygon points="100,46 141,69 141,113 100,136 59,113 59,69" fill={color} />;
  return <circle cx="100" cy="90" r="42" fill={color} />;
}

export function StageFigure({
  role,
  color,
  code,
  active,
}: {
  role: TileRole;
  color: string;
  code: string;
  active: boolean;
}) {
  return (
    <svg viewBox="0 0 200 200" className="h-full w-full" role="presentation" aria-hidden="true">
      {active ? (
        <circle cx="100" cy="100" r="96" fill={color} opacity="0.12" className="stage-halo" />
      ) : null}
      {/* shoulders */}
      <path d="M28 200 C 32 150, 62 136, 100 136 C 138 136, 168 150, 172 200 Z" fill={color} />
      <path
        d="M28 200 C 32 150, 62 136, 100 136 C 138 136, 168 150, 172 200 Z"
        fill="#000"
        opacity="0.18"
      />
      <Head role={role} color={color} />
      {/* voice slot: opens with amplitude */}
      <rect
        x="80"
        y="98"
        width="40"
        height="16"
        rx="8"
        fill="#fff"
        opacity="0.92"
        style={{
          transformBox: "fill-box",
          transformOrigin: "center",
          transform: active ? "scaleY(calc(0.18 + var(--amp, 0) * 1.1))" : "scaleY(0.18)",
        }}
      />
      {/* code badge on the chest */}
      <text
        x="100"
        y="182"
        textAnchor="middle"
        fontSize="26"
        fontWeight="700"
        fill="#fff"
        letterSpacing="1"
        style={{ fontFamily: "var(--font-geist-sans), system-ui, sans-serif" }}
      >
        {code}
      </text>
    </svg>
  );
}

const BARS = [0.55, 0.85, 1, 0.75, 0.5];

function Meter({ active, color }: { active: boolean; color: string }) {
  return (
    <span className="flex h-5 items-center gap-[3px]" aria-hidden="true">
      {BARS.map((k, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative bars
          key={i}
          className="block h-full w-[4px] origin-center rounded-full"
          style={{
            background: active ? color : "var(--gray-alpha-400)",
            transform: active ? `scaleY(calc(0.15 + var(--amp, 0) * ${k}))` : "scaleY(0.15)",
          }}
        />
      ))}
    </span>
  );
}

export const StageTile = memo(function StageTile({
  role,
  code,
  color,
  label,
  active,
  answered,
  addressed = false,
  dimmed,
  speakingLabel,
  addressedLabel = "",
}: {
  role: TileRole;
  code: string;
  color: string;
  /** Institution label for assistive tech and the hover title only. */
  label: string;
  active: boolean;
  /** The utterance on screen answers this tile's earlier utterance. */
  answered: boolean;
  /** The utterance on screen is addressed to this tile (bilateral or caucus partner). */
  addressed?: boolean;
  dimmed: boolean;
  speakingLabel: string;
  addressedLabel?: string;
}) {
  return (
    <figure
      aria-label={
        active ? `${label}, ${speakingLabel}` : addressed ? `${label}, ${addressedLabel}` : label
      }
      title={label}
      data-active={active || undefined}
      className={cn(
        "relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border bg-card transition-[opacity,transform,box-shadow,filter] duration-300",
        active && "z-10 scale-[1.04] shadow-lg",
        dimmed && !active && !answered && !addressed && "opacity-45 saturate-50",
        (answered || addressed) && !active && "opacity-90",
        addressed && !active && "scale-[1.01]",
      )}
      style={{
        boxShadow: active
          ? `0 0 0 4px ${color}, 0 12px 32px -8px color-mix(in srgb, ${color} 55%, transparent)`
          : addressed
            ? `0 0 0 3px color-mix(in srgb, ${color} 80%, transparent)`
            : answered
              ? `0 0 0 2px color-mix(in srgb, ${color} 60%, transparent)`
              : undefined,
        background: `linear-gradient(180deg, color-mix(in srgb, ${color} ${active ? 16 : 7}%, var(--card)) 0%, var(--card) 85%)`,
      }}
    >
      <div className="min-h-0 flex-1 px-[12%] pt-[6%]">
        <StageFigure role={role} color={color} code={code} active={active} />
      </div>
      <figcaption className="flex h-9 shrink-0 items-center gap-2 border-t bg-card/80 px-3">
        <span
          className="inline-grid h-5 min-w-5 place-items-center rounded-[5px] px-1 text-[10px] font-semibold text-white"
          style={{ background: color }}
        >
          {code}
        </span>
        {active ? (
          <span className="text-xs font-medium" style={{ color }}>
            {speakingLabel}
          </span>
        ) : addressed ? (
          <span className="text-xs font-medium" style={{ color }}>
            ← {addressedLabel}
          </span>
        ) : answered ? (
          <span className="text-xs text-muted-foreground">↩</span>
        ) : null}
        <span className="flex-1" />
        <Meter active={active} color={color} />
      </figcaption>
    </figure>
  );
});
