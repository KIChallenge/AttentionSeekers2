// Locale and disclosure level live in cookies so server components render the right
// variant on first paint. Theme is handled by next-themes.
import type { Lang } from "@sv/contracts";
import { de, type Messages } from "@/messages/de";
import { en } from "@/messages/en";

export const LOCALE_COOKIE = "sv-locale";
export const LEVEL_COOKIE = "sv-level";

export const LEVELS = ["executive", "analyst", "engineer"] as const;
export type Level = (typeof LEVELS)[number];

export function parseLocale(value: string | undefined): Lang {
  return value === "en" ? "en" : "de";
}
export function parseLevel(value: string | undefined): Level {
  return (LEVELS as readonly string[]).includes(value ?? "") ? (value as Level) : "analyst";
}
export function messagesFor(lang: Lang): Messages {
  return lang === "en" ? en : de;
}
export const levelRank: Record<Level, number> = { executive: 0, analyst: 1, engineer: 2 };
