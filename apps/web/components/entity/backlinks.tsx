import type { Lang } from "@sv/contracts";
import { AgentTile } from "@/components/run/agent-tile";
import { EntityLink } from "./entity-link";
import { laneT } from "./messages";
import { backlinksFor } from "./resolve.server";
import type { EntityType } from "./types";

/** Backlinks block for any entity page (W-54): everything that points here, grouped by type. */
export async function Backlinks({
  type,
  id,
  lang,
  title,
  exclude = [],
}: {
  type: EntityType;
  id: string;
  lang: Lang;
  title?: string;
  exclude?: EntityType[];
}) {
  const t = laneT(lang);
  const groups = (await backlinksFor(type, id, lang)).filter((g) => !exclude.includes(g.type));
  return (
    <section className="rounded-2xl border bg-card p-4" aria-label={title ?? t.entity.backlinks}>
      <h2 className="mb-3 text-sm font-medium">{title ?? t.entity.backlinks}</h2>
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.entity.noBacklinks}</p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={`${g.type}-${g.label ?? ""}`}>
              <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                {g.label ?? t.entity.types[g.type]}
                <span className="num">{g.items.length}</span>
              </div>
              <ul className="space-y-1.5">
                {g.items.slice(0, 25).map((it) => (
                  <li
                    key={`${it.type}:${it.id}`}
                    className="flex min-w-0 items-start gap-2 text-sm"
                  >
                    {it.agentId ? <AgentTile agentId={it.agentId} className="mt-0.5" /> : null}
                    <div className="min-w-0 flex-1">
                      <EntityLink
                        type={it.type}
                        id={it.id}
                        href={it.href}
                        prefetched={it}
                        className="line-clamp-2"
                      >
                        {it.title}
                      </EntityLink>
                      {it.subtitle || it.note ? (
                        <div className="truncate font-mono text-[11px] text-muted-foreground">
                          {[it.subtitle, it.note].filter(Boolean).join(" · ")}
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
