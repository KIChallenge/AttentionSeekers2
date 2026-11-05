import type { RunSummary } from "@sv/contracts";
import { Badge } from "@/components/ui/badge";
import type { Messages } from "@/messages/de";

/** Status semantics from the mockup rules: success outline for consensus, red only for failure. */
export function OutcomeBadge({ value, t }: { value: RunSummary["outcomeBadge"]; t: Messages }) {
  const cls: Record<RunSummary["outcomeBadge"], string> = {
    consensus: "border-success/30 bg-success/10 text-success",
    majority: "border-border text-foreground",
    minority: "border-warning/30 bg-warning/10 text-warning",
    no_result: "border-border text-muted-foreground",
    running: "border-info/30 bg-info/10 text-info",
    failed: "",
  };
  return (
    <Badge variant={value === "failed" ? "destructive" : "outline"} className={cls[value]}>
      {value === "running" ? (
        <span className="size-1.5 animate-pulse rounded-full bg-current" />
      ) : null}
      {t.outcome[value]}
    </Badge>
  );
}
