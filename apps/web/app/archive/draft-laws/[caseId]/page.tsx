import { redirect } from "next/navigation";
import { caseForDraftLaw } from "@/components/archive/registry.server";

export const dynamic = "force-dynamic";

/** A draft law resolves to its registry episode when there is one, else to the archive filter. */
export default async function DraftLawPage({ params }: { params: Promise<{ caseId: string }> }) {
  const id = decodeURIComponent((await params).caseId);
  const c = await caseForDraftLaw(id);
  redirect(
    c
      ? `/archive/episodes/${encodeURIComponent(c.episode_id)}#${encodeURIComponent(id)}`
      : `/archive?draftLaw=${encodeURIComponent(id)}`,
  );
}
