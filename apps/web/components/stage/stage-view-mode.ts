"use client";

import { useCallback, useEffect, useState } from "react";

// Stage view mode: the tile grid is the default and the fallback; 3D is opt-in. The choice is
// remembered per browser, and ?view=3d or ?view=grid in the URL overrides it for one visit.

export type StageViewMode = "grid" | "3d";

const KEY = "sv.stage.view";

const valid = (v: string | null): v is StageViewMode => v === "grid" || v === "3d";

export function useStageViewMode(): [StageViewMode, (v: StageViewMode) => void] {
  const [mode, setMode] = useState<StageViewMode>("grid");
  useEffect(() => {
    let v: string | null = null;
    try {
      v = new URLSearchParams(window.location.search).get("view");
      if (!valid(v)) v = window.localStorage.getItem(KEY);
    } catch {
      // storage blocked: stay on the grid
    }
    if (valid(v)) setMode(v);
  }, []);
  const set = useCallback((v: StageViewMode) => {
    setMode(v);
    try {
      window.localStorage.setItem(KEY, v);
    } catch {
      // not persisted, still switched
    }
  }, []);
  return [mode, set];
}
