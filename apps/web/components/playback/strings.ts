import type { Lang } from "@sv/contracts";

/** Display names of the playback shortcut keys, for tooltips (aria-keyshortcuts stays DOM-spec). */
export const playbackKeys: Record<
  Lang,
  { space: string; left: string; right: string; shift: string; esc: string }
> = {
  de: { space: "Leertaste", left: "←", right: "→", shift: "Umschalt", esc: "Esc" },
  en: { space: "Space", left: "←", right: "→", shift: "Shift", esc: "Esc" },
};
