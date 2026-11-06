"use client";

import { PauseIcon, PlayIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  type ButtonHTMLAttributes,
  forwardRef,
  type MouseEvent,
  type ReactNode,
  useCallback,
} from "react";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// One control system for every playback surface (stage transport, Meeting pill, replay player,
// run header). Round icon buttons from Hugeicons, no text glyphs; sizes in rem so projector mode
// (root font 125 %) scales them; md 36 px, lg 44 px, xl 56 px. `tone` picks the palette: "surface"
// for the app's light or dark page, "call" for the dark video-call overlay.

export type PlaybackTone = "surface" | "call";
export type PlaybackSize = "md" | "lg" | "xl";
export type PlaybackVariant = "primary" | "ghost" | "accent" | "danger";

const SIZE: Record<PlaybackSize, { box: string; icon: number }> = {
  md: { box: "h-9 min-w-9", icon: 18 },
  lg: { box: "h-11 min-w-11", icon: 20 },
  xl: { box: "h-14 min-w-14", icon: 26 },
};

const VARIANT: Record<PlaybackTone, Record<PlaybackVariant, string>> = {
  surface: {
    primary: "bg-foreground text-background hover:bg-foreground/85",
    ghost:
      "border border-border bg-background text-foreground hover:bg-gray-alpha-100 aria-pressed:bg-gray-alpha-150 aria-pressed:shadow-[inset_0_1px_3px_rgb(0_0_0/0.18)] dark:aria-pressed:shadow-[inset_0_1px_3px_rgb(0_0_0/0.6)]",
    accent: "border border-info/40 bg-background text-info hover:bg-info/10",
    danger: "border border-destructive/40 bg-background text-destructive hover:bg-destructive/10",
  },
  call: {
    primary: "bg-white text-[#0b0d12] hover:bg-white/88",
    ghost:
      "text-white/90 hover:bg-white/12 aria-pressed:bg-white/22 aria-pressed:shadow-[inset_0_1px_3px_rgb(0_0_0/0.5)]",
    accent: "text-sky-300 hover:bg-sky-300/15",
    danger: "bg-red-600/90 text-white hover:bg-red-600",
  },
};

const FOCUS: Record<PlaybackTone, string> = {
  surface: "focus-visible:ring-ring focus-visible:ring-offset-background",
  call: "focus-visible:ring-white focus-visible:ring-offset-[#0b0d12]",
};

/** Pointer clicks must not keep focus, or Space would re-click the button instead of toggling play. */
const noPointerFocus = (e: MouseEvent) => e.preventDefault();

export interface PlaybackButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label" | "title"> {
  icon: IconSvgElement;
  /** Accessible name; also the tooltip text. */
  label: string;
  /** Shortcut as shown to people, e.g. "Leertaste" or "←". */
  shortcut?: string;
  /** Shortcut in aria-keyshortcuts syntax, e.g. "Space" or "ArrowLeft". */
  keys?: string;
  size?: PlaybackSize;
  variant?: PlaybackVariant;
  tone?: PlaybackTone;
  /** Fill the icon (play, pause) instead of stroking it. */
  filled?: boolean;
  /** Optional visible text after the icon; the button becomes a pill. */
  text?: ReactNode;
  pressed?: boolean;
}

export const PlaybackButton = forwardRef<HTMLButtonElement, PlaybackButtonProps>(
  function PlaybackButton(
    {
      icon,
      label,
      shortcut,
      keys,
      size = "md",
      variant = "ghost",
      tone = "surface",
      filled = false,
      text,
      pressed,
      className,
      onMouseDown,
      ...rest
    },
    ref,
  ) {
    const dims = SIZE[size];
    const onDown = useCallback(
      (e: MouseEvent<HTMLButtonElement>) => {
        noPointerFocus(e);
        onMouseDown?.(e);
      },
      [onMouseDown],
    );
    const button = (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        aria-keyshortcuts={keys}
        aria-pressed={pressed}
        onMouseDown={onDown}
        data-playback-button={variant}
        className={cn(
          "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full outline-none transition-[background-color,transform,opacity] duration-150 select-none",
          "focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-95 disabled:pointer-events-none disabled:opacity-40",
          dims.box,
          text ? "pr-3.5 pl-2.5 text-sm font-medium whitespace-nowrap" : "",
          VARIANT[tone][variant],
          FOCUS[tone],
          className,
        )}
        {...rest}
      >
        <HugeiconsIcon
          icon={icon}
          size={dims.icon}
          strokeWidth={filled ? 1.5 : 2}
          fill={filled ? "currentColor" : "none"}
          className="pointer-events-none shrink-0"
          aria-hidden="true"
        />
        {text ? <span>{text}</span> : null}
      </button>
    );
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="top" sideOffset={6} className={cn(tone === "call" && "z-[80]")}>
          {label}
          {shortcut ? <Kbd>{shortcut}</Kbd> : null}
        </TooltipContent>
      </Tooltip>
    );
  },
);

/** Play or pause: one button whose icon follows the state. Prominent: one size up from its row. */
export function PlayPauseButton({
  playing,
  onToggle,
  labels,
  shortcut,
  size = "lg",
  tone = "surface",
  className,
}: {
  playing: boolean;
  onToggle: () => void;
  labels: { play: string; pause: string };
  shortcut: string;
  size?: PlaybackSize;
  tone?: PlaybackTone;
  className?: string;
}) {
  return (
    <PlaybackButton
      icon={playing ? PauseIcon : PlayIcon}
      filled
      label={playing ? labels.pause : labels.play}
      shortcut={shortcut}
      keys="Space"
      size={size}
      variant="primary"
      tone={tone}
      onClick={onToggle}
      data-playback="toggle"
      data-state={playing ? "playing" : "paused"}
      className={cn(playing ? "" : "[&_svg]:translate-x-px", className)}
    />
  );
}

/** Compact segmented control; options fill the full height so the hit target is the whole cell. */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  shortcut,
  size = "md",
  tone = "surface",
  className,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: ReactNode; title?: string }>;
  onChange: (v: T) => void;
  label: string;
  /** Shortcut that cycles the value, shown in the tooltip. */
  shortcut?: string;
  size?: PlaybackSize;
  tone?: PlaybackTone;
  className?: string;
}) {
  const call = tone === "call";
  const control = (
    <fieldset
      aria-label={label}
      className={cn(
        // the hairline is an inset shadow, not a border, so every option keeps the full height
        "inline-flex shrink-0 rounded-full",
        size === "md" ? "h-9" : "h-11",
        call
          ? "bg-white/6 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12)]"
          : "bg-gray-alpha-50 shadow-[inset_0_0_0_1px_var(--border)]",
        className,
      )}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={on}
            aria-label={typeof o.label === "string" ? `${label} ${o.label}` : undefined}
            title={o.title}
            onMouseDown={noPointerFocus}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative h-full min-w-9 rounded-full px-2.5 text-xs font-medium tabular-nums outline-none transition-colors select-none",
              size === "lg" && "min-w-11 px-3 text-sm",
              "focus-visible:ring-2 focus-visible:ring-offset-2",
              call
                ? "text-white/65 hover:text-white aria-pressed:text-[#0b0d12]"
                : "text-muted-foreground hover:text-foreground aria-pressed:text-foreground",
              FOCUS[tone],
            )}
          >
            {on ? (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-[3px] rounded-full",
                  call ? "bg-white" : "bg-background shadow-xs ring-1 ring-border",
                )}
              />
            ) : null}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </fieldset>
  );
  if (!shortcut) return control;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{control}</TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className={cn(call && "z-[80]")}>
        {label}
        <Kbd>{shortcut}</Kbd>
      </TooltipContent>
    </Tooltip>
  );
}

/** Row of playback controls: one tooltip provider, a labelled group. */
export function PlaybackGroup({
  label,
  className,
  children,
  ...rest
}: {
  label: string;
  className?: string;
  children: ReactNode;
} & Record<`data-${string}`, string | undefined>) {
  return (
    <TooltipProvider delayDuration={350} skipDelayDuration={600}>
      <fieldset
        aria-label={label}
        className={cn("m-0 flex min-w-0 items-center gap-2 border-0 p-0", className)}
        {...rest}
      >
        {children}
      </fieldset>
    </TooltipProvider>
  );
}

/** Thin vertical divider between control clusters. */
export function PlaybackDivider({ tone = "surface" }: { tone?: PlaybackTone }) {
  return (
    <span
      aria-hidden="true"
      className={cn("mx-0.5 h-6 w-px shrink-0", tone === "call" ? "bg-white/15" : "bg-border")}
    />
  );
}

/**
 * Playhead for a horizontal scrubber: a 2 px line with a 14 px knob ringed in the surface colour,
 * positioned by a CSS `left` value. Pointer-transparent, the track underneath takes the clicks.
 */
export function Playhead({
  left,
  tone = "surface",
  className,
}: {
  left: string;
  tone?: PlaybackTone;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-playhead
      className={cn(
        "pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full transition-[left] duration-150 ease-out",
        tone === "call" ? "bg-white" : "bg-foreground",
        className,
      )}
      style={{ left }}
    >
      <span
        className={cn(
          "absolute top-1/2 left-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-sm ring-2",
          tone === "call" ? "bg-white ring-[#0b0d12]" : "bg-foreground ring-background",
        )}
      />
    </span>
  );
}
