export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m} min ${String(s % 60).padStart(2, "0")} s` : `${s} s`;
}

export function formatDate(iso: string, lang: "de" | "en"): string {
  return new Date(iso).toLocaleDateString(lang === "de" ? "de-AT" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
