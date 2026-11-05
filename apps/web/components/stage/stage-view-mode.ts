"use client";

import { useCallback, useEffect, useState } from "react";

// Stage view mode: the tile grid is the default and the fallback; 3D and the meeting view are
// opt-in. The choice is remembered per browser, and ?view=grid|3d|meeting in the URL overrides
// it for one visit. The URL follows the mode so a meeting link can be shared or reloaded.

export type StageViewMode = "grid" | "3d" | "meeting";

const KEY = "sv.stage.view";

export const isStageViewMode = (v: string | null): v is StageViewMode =>
  v === "grid" || v === "3d" || v === "meeting";

export function useStageViewMode(): [StageViewMode, (v: StageViewMode) => void] {
  const [mode, setMode] = useState<StageViewMode>("grid");
  useEffect(() => {
    let v: string | null = null;
    try {
      v = new URLSearchParams(window.location.search).get("view");
      if (!isStageViewMode(v)) v = window.localStorage.getItem(KEY);
      if (v === "meeting" && !window.location.search.includes("view=meeting")) v = null;
    } catch {
      // storage blocked: stay on the grid
    }
    if (isStageViewMode(v)) setMode(v);
  }, []);
  const set = useCallback((v: StageViewMode) => {
    setMode(v);
    try {
      // the meeting view lives in the URL only: a later visit opens the normal stage
      if (v !== "meeting") window.localStorage.setItem(KEY, v);
      const url = new URL(window.location.href);
      if (url.searchParams.has("view") || v === "meeting") {
        url.searchParams.set("view", v);
        window.history.replaceState(window.history.state, "", url);
      }
    } catch {
      // not persisted, still switched
    }
  }, []);
  return [mode, set];
}
