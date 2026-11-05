import type { RedLine, Segment, Source } from "@sv/contracts";

/** Evidence extract the run screens resolve citations against (serialisable). */
export interface Evidence {
  sources: Record<string, Source>;
  segments: Record<string, Segment>;
  redLines: Record<string, RedLine>;
}
