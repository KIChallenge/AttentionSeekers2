import type { Lang } from "@sv/contracts";

const locale = (lang: Lang) => (lang === "de" ? "de-AT" : "en-GB");

export function fmtInt(v: number, lang: Lang): string {
  return Math.round(v).toLocaleString(locale(lang));
}

/** 12.3k style for dense columns. */
export function fmtCompact(v: number, lang: Lang): string {
  return v.toLocaleString(locale(lang), { notation: "compact", maximumFractionDigits: 1 });
}

/** Estimated USD: more digits for sub-cent amounts. */
export function fmtUsd(v: number, lang: Lang): string {
  const digits = v === 0 ? 2 : v < 0.01 ? 4 : v < 1 ? 3 : 2;
  return `$${v.toLocaleString(locale(lang), { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** 840 ms, 9.96 s, 1:05 min. */
export function fmtMs(ms: number, lang: Lang): string {
  const a = Math.abs(ms);
  const sign = ms < 0 ? "-" : "";
  if (a < 1000) return `${sign}${Math.round(a)} ms`;
  if (a < 60_000)
    return `${sign}${(a / 1000).toLocaleString(locale(lang), { maximumFractionDigits: a < 10_000 ? 2 : 1 })} s`;
  const s = Math.round(a / 1000);
  return `${sign}${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} min`;
}

/** Run clock position, m:ss (negative before run start). */
export function fmtClock(ms: number): string {
  const sign = ms < 0 ? "-" : "";
  const s = Math.round(Math.abs(ms) / 1000);
  return `${sign}${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function fmtPct(v: number): string {
  return `${Math.round(v * 100)} %`;
}
