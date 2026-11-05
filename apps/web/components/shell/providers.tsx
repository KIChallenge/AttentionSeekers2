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
} from "@/lib/prefs";
import type { Messages } from "@/messages/de";

interface Prefs {
  lang: Lang;
  level: LevelValue;
  t: Messages;
  setLang: (lang: Lang) => void;
  setLevel: (level: LevelValue) => void;
}

const PrefsContext = createContext<Prefs | null>(null);

function writeCookie(name: string, value: string) {
  // biome-ignore lint/suspicious/noDocumentCookie: plain preference cookie read by server components
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}

export function Providers({
  lang: initialLang,
  level: initialLevel,
  children,
}: {
  lang: Lang;
  level: LevelValue;
  children: ReactNode;
}) {
  const router = useRouter();
  const [lang, setLangState] = useState(initialLang);
  const [level, setLevelState] = useState(initialLevel);
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
  const value = useMemo(
    () => ({ lang, level, t: messagesFor(lang), setLang, setLevel }),
    [lang, level, setLang, setLevel],
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
