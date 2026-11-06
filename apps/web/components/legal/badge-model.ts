import type { Proposal } from "@sv/contracts";
import { assessLegal } from "@sv/engine/legal/guardrail";

export type LegalBadgeModel = {
  kind: "change" | "basis";
  label: string;
  /** Archive page of the leading provision. */
  href: string;
  /** Every provision with the rule's reason, for the tooltip. */
  title: string;
};

/**
 * What the FR-P6 badge shows for one proposal: "erfordert Änderung ASVG § 131" when the measure
 * needs a change of the law, otherwise "Rechtsgrundlage ASVG § 342 +1". Null when no rule fires.
 */
export function legalBadgeModel(
  proposal: Pick<Proposal, "title" | "components" | "financing">,
  lang: "de" | "en",
): LegalBadgeModel | null {
  const a = assessLegal(proposal);
  const main = a.changes[0] ?? a.touches[0];
  if (!main) return null;
  const change = a.changes.length > 0;
  const refs = a.changes.map((r) => r.ref).join(", ");
  const more = a.touches.length > 1 ? ` +${a.touches.length - 1}` : "";
  return {
    kind: change ? "change" : "basis",
    label: change
      ? lang === "de"
        ? `erfordert Änderung ${refs}`
        : `requires amending ${refs}`
      : `${lang === "de" ? "Rechtsgrundlage" : "Legal basis"} ${main.ref}${more}`,
    href: `/archive/sources/${encodeURIComponent(main.sourceId)}`,
    title: [...a.changes, ...a.touches]
      .map((r) => `${r.ref}${r.detail ? ` ${r.detail}` : ""}: ${r.why}`)
      .join("\n"),
  };
}
