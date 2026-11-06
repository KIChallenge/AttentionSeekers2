import { useSyncExternalStore } from "react";

/**
 * Live match of a CSS media query. Server render and first client render return
 * `serverValue`, so layouts that also hide via CSS breakpoints do not flash.
 */
export function useMediaQuery(query: string, serverValue = true): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}
