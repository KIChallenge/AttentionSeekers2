"use client";

import type { Lang } from "@sv/contracts";
import { useRouter } from "next/navigation";
import { ThemeProvider } from "next-themes";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import {
  LEVEL_COOKIE,
  type Level as LevelValue,
  LOCALE_COOKIE,
  levelRank,
  messagesFor,
  PROJECTOR_COOKIE,
} from "@/lib/prefs";
import type { Messages } from "@/messages/de";

interface Prefs {
  lang: Lang;
  level: LevelValue;
  t: Messages;
  setLang: (lang: Lang) => void;
  setLevel: (level: LevelValue) => void;
  /** Projector mode (W-34, NFR-7): larger type and tiles, inspector as overlay. */
  projector: boolean;
  setProjector: (on: boolean) => void;
}

const PrefsContext = createContext<Prefs | null>(null);

function writeCookie(name: string, value: string) {
  // biome-ignore lint/suspicious/noDocumentCookie: plain preference cookie read by server components
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}

export function Providers({
  lang: initialLang,
  level: initialLevel,
  projector: initialProjector = false,
  children,
}: {
  lang: Lang;
  level: LevelValue;
  projector?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const [lang, setLangState] = useState(initialLang);
  const [level, setLevelState] = useState(initialLevel);
  const [projector, setProjectorState] = useState(initialProjector);
  const setLang = useCallback(
    (next: Lang) => {
      writeCookie(LOCALE_COOKIE, next);
      document.documentElement.lang = next;
      setLangState(next);
      router.refresh();
    },
    [router],
  );
  const setLevel = useCallback(
    (next: LevelValue) => {
      writeCookie(LEVEL_COOKIE, next);
      document.documentElement.dataset.level = next;
      setLevelState(next);
      router.refresh();
    },
    [router],
  );
  // Client-only switch: the attribute drives the CSS scale, the context drives layout
  // (sheet inspector, tile size, cursor), so no server round trip is needed.
  const setProjector = useCallback((on: boolean) => {
    writeCookie(PROJECTOR_COOKIE, on ? "1" : "0");
    if (on) document.documentElement.dataset.projector = "";
    else delete document.documentElement.dataset.projector;
    setProjectorState(on);
  }, []);
  const value = useMemo(
    () => ({ lang, level, t: messagesFor(lang), setLang, setLevel, projector, setProjector }),
    [lang, level, setLang, setLevel, projector, setProjector],
  );
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>
    </ThemeProvider>
  );
}

export function usePrefs(): Prefs {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error("usePrefs outside Providers");
  return ctx;
}

/** Renders children only at or above a disclosure level, or only at exactly one. */
export function Level({
  min,
  only,
  children,
}: {
  min?: LevelValue;
  only?: LevelValue;
  children: ReactNode;
}) {
  const { level } = usePrefs();
  if (only && level !== only) return null;
  if (min && levelRank[level] < levelRank[min]) return null;
  return <>{children}</>;
}
