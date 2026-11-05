// Entity link layer (W-54, FR-T12): one id scheme and one href rule for every entity type.
// Run-scoped entities (claim, utterance) use "<runId>~<localId>".

export const ENTITY_TYPES = [
  "source",
  "institution",
  "draft_law",
  "episode",
  "statistic",
  "claim",
  "utterance",
  "run",
  "agent",
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export function isEntityType(v: string): v is EntityType {
  return (ENTITY_TYPES as readonly string[]).includes(v);
}

export interface EntityRef {
  type: EntityType;
  id: string;
}

export interface EntityPreview extends EntityRef {
  title: string;
  subtitle: string | null;
  meta: string[];
  snippet: string | null;
  href: string;
  /** Agent or institution code tile. */
  agentId?: string | null;
  /** FR-H2 date of the entity where it has one. */
  date?: string | null;
}

export function scopedId(runId: string, localId: string): string {
  return `${runId}~${localId}`;
}

export function splitScoped(id: string): [string, string] {
  const i = id.indexOf("~");
  return i < 0 ? [id, ""] : [id.slice(0, i), id.slice(i + 1)];
}

const enc = encodeURIComponent;

export function entityHref(type: EntityType, id: string, extra?: { utteranceId?: string }): string {
  switch (type) {
    case "source":
      return `/archive/sources/${enc(id)}`;
    case "institution":
      return `/archive?institution=${enc(id)}`;
    case "draft_law":
      return `/archive/draft-laws/${enc(id)}`;
    case "episode":
      return `/archive/episodes/${enc(id)}`;
    case "statistic":
      return `/archive/stats#${enc(id)}`;
    case "claim": {
      const [runId] = splitScoped(id);
      const uid = extra?.utteranceId;
      return uid ? `/runs/${enc(runId)}/inspect/${enc(uid)}` : `/runs/${enc(runId)}`;
    }
    case "utterance": {
      const [runId, uid] = splitScoped(id);
      return `/runs/${enc(runId)}?view=full&u=${enc(uid)}`;
    }
    case "run":
      return `/runs/${enc(id)}`;
    case "agent":
      return `/archive/agents/${enc(id)}`;
  }
}
