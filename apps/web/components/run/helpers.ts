import {
  type AgentConfig,
  type CitationRef,
  type ClaimState,
  catalogAgent,
  type Lang,
  type LocalizedText,
  localize,
  type Run,
  type Source,
} from "@sv/contracts";

export interface AgentLook {
  id: string;
  code: string;
  color: string;
  name: string;
  unit: string;
}

/** Display identity for a speaker: run config first, catalog second. Institutions only. */
export function agentLook(run: Run | null, id: string, lang: Lang): AgentLook {
  if (id === "moderator")
    return { id, code: "M", color: "var(--c-mod)", name: "Moderator", unit: "" };
  if (id === "expert")
    return {
      id,
      code: "E",
      color: "var(--c-mod)",
      name: lang === "de" ? "Experte" : "Expert",
      unit: "",
    };
  const cfg: AgentConfig | undefined = run?.agents.find((a) => a.id === id);
  const cat = catalogAgent(id);
  const name = cfg
    ? lang === "de"
      ? cfg.institution.nameDe
      : cfg.institution.glossEn
    : lang === "de"
      ? (cat?.nameDe ?? id)
      : (cat?.glossEn ?? id);
  return {
    id,
    code: cfg?.code ?? cat?.code ?? id.toUpperCase(),
    color: cfg?.color ?? cat?.color ?? "var(--c-opt)",
    name,
    unit: cfg?.institution.unit ?? "",
  };
}

export const L = (v: LocalizedText | null | undefined, lang: Lang) => (v ? localize(v, lang) : "");

export function fmtStance(v: number): string {
  const s = v.toFixed(1).replace("-", "−");
  return v > 0 ? `+${s}` : s;
}

export function fmtNum(v: number, lang: Lang, digits = 0): string {
  return v.toLocaleString(lang === "de" ? "de-AT" : "en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Months between a source date and the run's as-of date (FR-P4 age display). */
export function ageMonths(sourceDate: string, asOf: string): number {
  const a = new Date(sourceDate);
  const b = new Date(asOf);
  return Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()));
}

/** Chip label "institution · date · outlet" (W-07); SOZDOK shows the legal reference. */
export function sourceLabel(src: Source | undefined, ref: CitationRef): string {
  if (!src) return ref.sourceId;
  const date =
    src.datePrecision === "year"
      ? src.date.slice(0, 4)
      : src.datePrecision === "month"
        ? src.date.slice(0, 7)
        : src.date;
  if (src.kind === "sozdok" || src.kind === "ris") {
    return ["SOZDOK", src.legalRef ?? src.institution.code].filter(Boolean).join(" · ");
  }
  return [src.institution.code, date, src.outlet ?? src.kind].filter(Boolean).join(" · ");
}

export const claimStateClass: Record<ClaimState, string> = {
  verified: "border-success/30 bg-success/10 text-success",
  unverified: "border-border text-muted-foreground",
  contradicted: "border-warning/40 bg-warning/10 text-warning",
  assumption: "border-border border-dashed text-foreground",
};

export const claimUnderline: Record<ClaimState, string> = {
  verified: "decoration-success",
  unverified: "decoration-gray-alpha-500 decoration-dotted",
  contradicted: "decoration-warning decoration-wavy",
  assumption: "decoration-foreground decoration-dashed italic",
};

export const roundLabel = (n: number) => `R${n}`;

/** Keys for lists that may repeat an item ("x", "x#2", ...), stable without array indices. */
export function withKeys<T>(items: readonly T[], keyOf: (item: T) => string): Array<[string, T]> {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const k = keyOf(item);
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return [n > 1 ? `${k}#${n}` : k, item];
  });
}
