import type { ArchiveQuery } from "./data.server";

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

function all(p: Params, key: string): string[] {
  if (p instanceof URLSearchParams) return p.getAll(key).flatMap((v) => v.split(",")).filter(Boolean);
  const v = p[key];
  return (Array.isArray(v) ? v : v ? [v] : []).flatMap((x) => x.split(",")).filter(Boolean);
}
function one(p: Params, key: string): string | null {
  return all(p, key)[0] ?? null;
}

/** Parses archive search params (page URL or API) into an ArchiveQuery. */
export function parseArchiveQuery(p: Params): ArchiveQuery {
  const asOf = one(p, "asOf");
  return {
    q: (one(p, "q") ?? "").slice(0, 200),
    kinds: all(p, "kind"),
    institutions: all(p, "institution"),
    years: all(p, "year"),
    draftLaws: all(p, "draftLaw"),
    licences: all(p, "licence"),
    asOf: asOf && /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? asOf : null,
    hideAfter: one(p, "hideAfter") === "1",
    page: Math.max(1, Number.parseInt(one(p, "page") ?? "1", 10) || 1),
  };
}
