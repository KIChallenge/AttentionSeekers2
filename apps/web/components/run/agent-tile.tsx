import { catalogAgent } from "@sv/contracts";
import { cn } from "@/lib/utils";

/** Code tile in the agent hue. Identity is colour plus code plus name, never colour alone. */
export function AgentTile({
  agentId,
  size = "sm",
  withName = false,
  lang = "de",
  className,
}: {
  agentId: string;
  size?: "sm" | "lg";
  withName?: boolean;
  lang?: "de" | "en";
  className?: string;
}) {
  const special = agentId === "moderator" || agentId === "expert";
  const a = catalogAgent(agentId);
  const code = special ? (agentId === "moderator" ? "M" : "E") : (a?.code ?? agentId.toUpperCase());
  const color = special ? "var(--c-mod)" : (a?.color ?? "var(--c-opt)");
  const name = special
    ? agentId === "moderator"
      ? "Moderator"
      : lang === "de"
        ? "Experte"
        : "Expert"
    : lang === "de"
      ? a?.nameDe
      : a?.glossEn;
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} title={name}>
      <span
        className={cn(
          "inline-grid shrink-0 place-items-center rounded-[5px] font-semibold text-white",
          size === "sm" ? "size-4 text-[8px]" : "size-7 text-xs",
          agentId === "fm" && "outline-1 outline-offset-1 outline-dashed outline-[var(--c-fm)]",
        )}
        style={{ background: color }}
        data-agent={agentId}
      >
        {code}
      </span>
      {withName ? <span className="text-sm">{name}</span> : null}
    </span>
  );
}
