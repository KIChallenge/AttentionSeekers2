import type { Proposal } from "@sv/contracts";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { legalBadgeModel } from "./badge-model";

// FR-P6 badge: the legal guardrail's verdict on one proposal, next to its title. The verdict is
// the same deterministic assessment the Experte note in the run record carries
// (packages/engine/src/legal), so runs recorded before the guardrail get the badge too.
// Warning accent only when the measure needs a change of the law; otherwise a quiet line.
export function LegalBadge({
  proposal,
  lang,
}: {
  proposal: Pick<Proposal, "title" | "components" | "financing">;
  lang: "de" | "en";
}) {
  const m = legalBadgeModel(proposal, lang);
  if (!m) return null;
  return (
    <Link
      href={m.href}
      title={m.title}
      data-legal-badge={m.kind}
      className={cn(
        "mt-0.5 inline-flex rounded-[5px] border px-1.5 text-[11px] leading-5 no-underline",
        m.kind === "change"
          ? "border-warning/40 bg-warning/10 text-warning"
          : "text-muted-foreground",
      )}
    >
      {m.label}
    </Link>
  );
}
