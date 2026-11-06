// Family palette and run labels shared by the topic dashboard and the model comparison.
import type { RunColumn } from "@/lib/topic-compare";
import { cn } from "@/lib/utils";
import type { TopicMessages } from "./messages";

/** Fixed hue per family (identity), never by rank. */
export const FAMILY_COLOR: Record<string, string> = {
  gpt: "var(--foreground)",
  nova: "var(--warning)",
  deepseek: "var(--chart-1)",
  qwen: "var(--chart-2)",
  kimi: "var(--chart-3)",
  glm: "var(--chart-4)",
  mistral: "var(--chart-5)",
  mixed: "var(--gray-alpha-500)",
};
export const familyColor = (f: string) => FAMILY_COLOR[f] ?? "var(--info)";

export function FamilyDot({ family, className }: { family: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ background: familyColor(family) }}
    />
  );
}

export function runLabel(r: RunColumn, t: TopicMessages): string {
  if (r.isReference) return `${t.reference}${r.id.endsWith("presse") ? " + Presse" : ""}`;
  const all = r.label.match(/^all_(.+)$/)?.[1];
  return t.label[r.label] ?? (all ? t.allSeats(t.fam[all] ?? all) : r.label);
}
