// Entity resolution for previews, the command palette and backlinks (W-54). Server-only.
import { AGENT_CATALOG, catalogAgent, type Lang, localize, type Source } from "@sv/contracts";
import {
  draftLawLabel,
  draftLawOf,
  firstSegmentText,
  getSourcesByIds,
  institutions,
  isPress,
  PRESS_SNIPPET_CHARS,
  quickSources,
  sourcesFor,
  sourcesForDraftLaw,
} from "@/components/archive/data.server";
import { registry, statsCatalogue } from "@/components/archive/registry.server";
import { laneT } from "./messages";
import {
  type EntityPreview,
  type EntityType,
  entityHref,
  scopedId,
  splitScoped,
} from "./types";
import { snapshotOf, usageIndex, usesOfSource } from "./usage.server";

function clip(text: string | null | undefined, n = 220): string | null {
  if (!text) return null;
  return text.length > n ? `${text.slice(0, n).trimEnd()} …` : text;
}

function kindLabel(lang: Lang, kind: string) {
  return (laneT(lang).archive.kinds as Record<string, string>)[kind] ?? kind;
}

export function sourcePreview(s: Source, lang: Lang, snippet: string | null = null): EntityPreview {
  const role = AGENT_CATALOG.find((a) => a.role === s.institution.role);
  return {
    type: "source",
    id: s.id,
    title: s.title ?? s.legalRef ?? s.id,
    subtitle: `${s.institution.nameDe} · ${s.date}${s.outlet ? ` · ${s.outlet}` : ""}`,
    meta: [kindLabel(lang, s.kind), s.legalRef ?? "", s.corpusRevision].filter(Boolean),
    snippet: clip(snippet, isPress(s) ? Math.min(PRESS_SNIPPET_CHARS, 220) : 220),
    href: entityHref("source", s.id),
    agentId: role?.id ?? null,
    date: s.date,
  };
}

function agentPreview(id: string, lang: Lang): EntityPreview | null {
  const a = catalogAgent(id);
  if (!a) return null;
  const t = laneT(lang);
  return {
    type: "agent",
    id,
    title: lang === "de" ? a.nameDe : a.glossEn,
    subtitle: lang === "de" ? a.glossEn : a.nameDe,
    meta: [a.code, a.origin, a.mode === "fitted" ? t.setup.fitted : t.setup.prompted],
    snippet: null,
    href: entityHref("agent", id),
    agentId: id,
  };
}

export async function getPreview(
  type: EntityType,
  id: string,
  lang: Lang,
): Promise<EntityPreview | null> {
  const t = laneT(lang);
  switch (type) {
    case "source": {
      const s = (await getSourcesByIds([id])).get(id);
      return s ? sourcePreview(s, lang, await firstSegmentText(id)) : null;
    }
    case "institution": {
      const row = (await institutions()).find((i) => i.code === id);
      if (!row) return null;
      const agent = AGENT_CATALOG.find((a) => a.role === row.role);
      return {
        type,
        id,
        title: row.nameDe,
        subtitle: row.glossEn,
        meta: [`${row.count} ${t.archive.sources}`, row.role],
        snippet: null,
        href: entityHref(type, id),
        agentId: agent?.id ?? null,
      };
    }
    case "draft_law": {
      const c = (await registry()).cases.get(id);
      const label = draftLawLabel(id);
      if (!c) return { type, id, title: label, subtitle: null, meta: [], snippet: null, href: entityHref(type, id) };
      return {
        type,
        id,
        title: c.title,
        subtitle: `${c.me_citation} · ${c.ressort} · ${c.first_draft_date}`,
        meta: [
          `${c.n_stellungnahmen} ${t.archive.episode.stellungnahmen}`,
          (t.archive.episode.outcomes as Record<string, string>)[c.outcome] ?? c.outcome,
        ],
        snippet: null,
        href: entityHref(type, id),
        date: c.first_draft_date,
      };
    }
    case "episode": {
      const e = (await registry()).episodes.get(id);
      if (!e) return null;
      return {
        type,
        id,
        title: e.title,
        subtitle: `${e.gp}. GP · ${e.ressort} · ${e.first_draft_date}`,
        meta: [
          (t.archive.episode.outcomes as Record<string, string>)[e.outcome] ?? e.outcome,
          e.measure_class,
          `${e.n_stellungnahmen} ${t.archive.episode.stellungnahmen}`,
        ],
        snippet: e.vote_text,
        href: entityHref(type, id),
        date: e.first_draft_date,
      };
    }
    case "statistic": {
      const s = (await statsCatalogue()).series.find((x) => x.id === id);
      if (!s) return null;
      return {
        type,
        id,
        title: s.dir,
        subtitle: s.publisher,
        meta: [s.licence, s.coverage],
        snippet: clip(s.contains),
        href: entityHref(type, id),
      };
    }
    case "run": {
      const snap = await snapshotOf(id);
      const run = snap?.run;
      if (!run) return null;
      return {
        type,
        id,
        title: run.mandate.question,
        subtitle: `${run.id} · ${run.createdAt.slice(0, 10)}`,
        meta: [run.variant.kind, `${run.agents.length} ${t.entity.types.agent}`, run.status],
        snippet: null,
        href: entityHref(type, id),
      };
    }
    case "utterance":
    case "claim": {
      const [runId, local] = splitScoped(id);
      const snap = await snapshotOf(runId);
      if (!snap) return null;
      if (type === "utterance") {
        const u = snap.utterances[local];
        if (!u) return null;
        const a = catalogAgent(u.speaker);
        return {
          type,
          id,
          title: `${u.id} · ${a ? (lang === "de" ? a.nameDe : a.glossEn) : u.speaker}`,
          subtitle: `${t.replay.kinds[u.kind as keyof typeof t.replay.kinds] ?? u.kind} · R${u.round}`,
          meta: [runId, u.model],
          snippet: clip(localize(u.text, lang)),
          href: entityHref(type, id),
          agentId: u.speaker,
        };
      }
      const c = snap.claims[local];
      if (!c) return null;
      const u = snap.utterances[c.utteranceId];
      return {
        type,
        id,
        title: c.atomicText,
        subtitle: `${c.id} · ${c.utteranceId}`,
        meta: [c.state, c.kind, `${c.citations.length} ${t.archive.sources}`],
        snippet: null,
        href: entityHref(type, id, { utteranceId: c.utteranceId }),
        agentId: u?.speaker ?? null,
      };
    }
    case "agent":
      return agentPreview(id, lang);
  }
}

// ---------------- search ----------------

export async function searchEntities(q: string, lang: Lang): Promise<EntityPreview[]> {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return [];
  const has = (...xs: Array<string | null | undefined>) =>
    xs.some((x) => x?.toLowerCase().includes(needle));
  const out: EntityPreview[] = [];

  for (const a of AGENT_CATALOG)
    if (has(a.nameDe, a.glossEn, a.code, a.id)) {
      const p = agentPreview(a.id, lang);
      if (p) out.push(p);
    }

  const [sources, insts, reg, stats, idx] = await Promise.all([
    quickSources(q, 8),
    institutions(),
    registry(),
    statsCatalogue(),
    usageIndex(),
  ]);
  for (const i of insts.filter((i) => has(i.code, i.nameDe, i.glossEn)).slice(0, 6))
    out.push({
      type: "institution",
      id: i.code,
      title: i.nameDe,
      subtitle: i.glossEn,
      meta: [`${i.count}`],
      snippet: null,
      href: entityHref("institution", i.code),
      agentId: AGENT_CATALOG.find((a) => a.role === i.role)?.id ?? null,
    });
  for (const s of sources) out.push(sourcePreview(s, lang));
  let n = 0;
  for (const c of reg.cases.values()) {
    if (n >= 6) break;
    if (has(c.title, c.case_id, c.me_citation, ...c.schlagworte)) {
      n++;
      out.push({
        type: "draft_law",
        id: c.case_id,
        title: c.title,
        subtitle: c.me_citation,
        meta: [c.first_draft_date],
        snippet: null,
        href: entityHref("draft_law", c.case_id),
      });
    }
  }
  n = 0;
  for (const e of reg.episodes.values()) {
    if (n >= 6) break;
    if (has(e.title, e.episode_id)) {
      n++;
      out.push({
        type: "episode",
        id: e.episode_id,
        title: e.title,
        subtitle: `${e.episode_id} · ${e.first_draft_date}`,
        meta: [e.outcome],
        snippet: null,
        href: entityHref("episode", e.episode_id),
      });
    }
  }
  for (const s of stats.series.filter((s) => has(s.dir, s.publisher, s.contains)).slice(0, 5))
    out.push({
      type: "statistic",
      id: s.id,
      title: s.dir,
      subtitle: s.publisher,
      meta: [s.licence],
      snippet: null,
      href: entityHref("statistic", s.id),
    });
  for (const r of idx.runs.filter((r) => has(r.question, r.id)).slice(0, 6))
    out.push({
      type: "run",
      id: r.id,
      title: r.question,
      subtitle: r.id,
      meta: [r.variantKind, r.outcomeBadge],
      snippet: null,
      href: entityHref("run", r.id),
    });
  let un = 0;
  let cn = 0;
  for (const [runId, snap] of idx.snapshots) {
    for (const u of Object.values(snap.utterances)) {
      if (un >= 8) break;
      const text = localize(u.text, lang);
      if (u.id.toLowerCase() === needle || text.toLowerCase().includes(needle)) {
        un++;
        const i = text.toLowerCase().indexOf(needle);
        out.push({
          type: "utterance",
          id: scopedId(runId, u.id),
          title: `${u.id} · ${catalogAgent(u.speaker)?.code ?? u.speaker}`,
          subtitle: runId,
          meta: [],
          snippet: clip(i > 60 ? `… ${text.slice(i - 40)}` : text, 140),
          href: entityHref("utterance", scopedId(runId, u.id)),
          agentId: u.speaker,
        });
      }
    }
    for (const c of Object.values(snap.claims)) {
      if (cn >= 6) break;
      if (c.id.toLowerCase() === needle || c.atomicText.toLowerCase().includes(needle)) {
        cn++;
        out.push({
          type: "claim",
          id: scopedId(runId, c.id),
          title: c.atomicText,
          subtitle: `${c.id} · ${runId}`,
          meta: [c.state],
          snippet: null,
          href: entityHref("claim", scopedId(runId, c.id), { utteranceId: c.utteranceId }),
        });
      }
    }
  }
  return out;
}

// ---------------- backlinks ----------------

export interface BacklinkGroup {
  type: EntityType;
  label?: string;
  items: Array<EntityPreview & { note?: string | null }>;
}

export async function backlinksFor(
  type: EntityType,
  id: string,
  lang: Lang,
): Promise<BacklinkGroup[]> {
  const t = laneT(lang);
  const groups: BacklinkGroup[] = [];
  const add = (g: BacklinkGroup) => {
    if (g.items.length) groups.push(g);
  };
  const idx = await usageIndex();

  if (type === "source") {
    const uses = await usesOfSource(id);
    const runs = [...new Set(uses.map((u) => u.runId))];
    add({
      type: "run",
      items: runs.flatMap((r) => {
        const run = idx.snapshots.get(r)?.run;
        return run
          ? [{ type: "run" as const, id: r, title: run.mandate.question, subtitle: r, meta: [], snippet: null, href: entityHref("run", r) }]
          : [];
      }),
    });
    const claimUses = uses.filter((u) => u.kind === "claim" && u.claimId);
    add({
      type: "claim",
      items: claimUses.map((u) => ({
        type: "claim" as const,
        id: scopedId(u.runId, u.claimId ?? ""),
        title: u.text ?? u.claimId ?? "",
        subtitle: `${u.claimId} · ${u.utteranceId}`,
        meta: [],
        snippet: null,
        href: entityHref("claim", scopedId(u.runId, u.claimId ?? ""), {
          utteranceId: u.utteranceId ?? undefined,
        }),
        agentId: u.agentId,
        note: u.recencyWeight !== null ? `w ${u.recencyWeight.toFixed(2)}` : null,
      })),
    });
    const utts = [
      ...new Map(
        uses.filter((u) => u.utteranceId).map((u) => [`${u.runId}~${u.utteranceId}`, u]),
      ).values(),
    ];
    add({
      type: "utterance",
      items: utts.map((u) => {
        const snap = idx.snapshots.get(u.runId);
        const utt = u.utteranceId ? snap?.utterances[u.utteranceId] : undefined;
        return {
          type: "utterance" as const,
          id: scopedId(u.runId, u.utteranceId ?? ""),
          title: `${u.utteranceId} · ${catalogAgent(utt?.speaker ?? u.agentId ?? "")?.code ?? ""}`,
          subtitle: u.runId,
          meta: [],
          snippet: utt ? clip(localize(utt.text, lang), 140) : null,
          href: entityHref("utterance", scopedId(u.runId, u.utteranceId ?? "")),
          agentId: utt?.speaker ?? u.agentId,
          note:
            u.kind === "retrieval"
              ? t.archive.detail.retrieval
              : u.kind === "position"
                ? t.archive.detail.position
                : t.archive.detail.claim,
        };
      }),
    });
    const positions = uses.filter((u) => u.kind === "position");
    const byAgent = new Map<string, number>();
    for (const p of positions) if (p.agentId) byAgent.set(p.agentId, (byAgent.get(p.agentId) ?? 0) + 1);
    add({
      type: "agent",
      items: [...byAgent.entries()].flatMap(([a, count]) => {
        const p = agentPreview(a, lang);
        return p ? [{ ...p, note: `${count} ${t.replay.positions}` }] : [];
      }),
    });
    const s = (await getSourcesByIds([id])).get(id);
    if (s) {
      const dl = draftLawOf(s);
      if (dl) {
        const c = (await registry()).cases.get(dl);
        add({
          type: "draft_law",
          items: [
            {
              type: "draft_law",
              id: dl,
              title: c?.title ?? draftLawLabel(dl),
              subtitle: draftLawLabel(dl),
              meta: [],
              snippet: null,
              href: entityHref("draft_law", dl),
            },
          ],
        });
        if (c)
          add({
            type: "episode",
            items: [
              {
                type: "episode",
                id: c.episode_id,
                title: c.title,
                subtitle: c.episode_id,
                meta: [],
                snippet: null,
                href: entityHref("episode", c.episode_id),
              },
            ],
          });
      }
      add({
        type: "institution",
        items: [
          {
            type: "institution",
            id: s.institution.code,
            title: s.institution.nameDe,
            subtitle: s.institution.glossEn,
            meta: [],
            snippet: null,
            href: entityHref("institution", s.institution.code),
          },
        ],
      });
    }
    return groups;
  }

  if (type === "agent") {
    const a = catalogAgent(id);
    add({
      type: "run",
      items: idx.runs
        .filter((r) => r.agents.includes(id))
        .map((r) => ({ type: "run" as const, id: r.id, title: r.question, subtitle: r.id, meta: [], snippet: null, href: entityHref("run", r.id) })),
    });
    if (a) {
      const srcs = await sourcesFor({ role: a.role }, 12);
      add({ type: "source", items: srcs.map((s) => sourcePreview(s, lang)) });
    }
    return groups;
  }

  if (type === "institution") {
    const srcs = await sourcesFor({ code: id }, 12);
    add({ type: "source", items: srcs.map((s) => sourcePreview(s, lang)) });
    const role = srcs[0]?.institution.role;
    const agent = AGENT_CATALOG.find((x) => x.role === role);
    if (agent) {
      const p = agentPreview(agent.id, lang);
      if (p) add({ type: "agent", items: [p] });
    }
    return groups;
  }

  if (type === "draft_law" || type === "episode") {
    const reg = await registry();
    const cases =
      type === "draft_law"
        ? [reg.cases.get(id)].filter((c) => c !== undefined)
        : (reg.episodes.get(id)?.members ?? []).flatMap((m) => reg.cases.get(m) ?? []);
    const srcs = (await Promise.all(cases.map((c) => sourcesForDraftLaw(c.case_id, 40)))).flat();
    add({ type: "source", items: srcs.map((s) => sourcePreview(s, lang)) });
    if (type === "draft_law" && cases[0])
      add({
        type: "episode",
        items: [
          {
            type: "episode",
            id: cases[0].episode_id,
            title: cases[0].title,
            subtitle: cases[0].episode_id,
            meta: [],
            snippet: null,
            href: entityHref("episode", cases[0].episode_id),
          },
        ],
      });
    if (type === "episode")
      add({
        type: "run",
        items: [...idx.snapshots.values()]
          .filter((s) => s.run?.variant.kind === "backtest" && s.run.variant.episodeId === id)
          .flatMap((s) =>
            s.run
              ? [{ type: "run" as const, id: s.run.id, title: s.run.mandate.question, subtitle: s.run.id, meta: [], snippet: null, href: entityHref("run", s.run.id) }]
              : [],
          ),
      });
    return groups;
  }

  if (type === "run") {
    add({
      type: "run",
      label: "fork",
      items: [...idx.snapshots.values()]
        .filter((s) => s.run && "baseRunId" in s.run.variant && s.run.variant.baseRunId === id)
        .flatMap((s) =>
          s.run
            ? [{ type: "run" as const, id: s.run.id, title: s.run.mandate.question, subtitle: `${s.run.variant.kind} · ${s.run.id}`, meta: [], snippet: null, href: entityHref("run", s.run.id) }]
            : [],
        ),
    });
    const cited = new Set<string>();
    for (const [sid, uses] of idx.bySource) if (uses.some((u) => u.runId === id)) cited.add(sid);
    const srcs = await getSourcesByIds([...cited]);
    add({ type: "source", items: [...srcs.values()].map((s) => sourcePreview(s, lang)) });
    return groups;
  }

  if (type === "utterance" || type === "claim") {
    const [runId, local] = splitScoped(id);
    const snap = idx.snapshots.get(runId);
    if (!snap) return groups;
    const uid = type === "utterance" ? local : snap.claims[local]?.utteranceId;
    if (type === "utterance") {
      add({
        type: "utterance",
        items: Object.values(snap.utterances)
          .filter((u) => u.respondsTo === local)
          .map((u) => ({
            type: "utterance" as const,
            id: scopedId(runId, u.id),
            title: `${u.id} · ${catalogAgent(u.speaker)?.code ?? u.speaker}`,
            subtitle: t.replay.respondsTo,
            meta: [],
            snippet: clip(localize(u.text, lang), 140),
            href: entityHref("utterance", scopedId(runId, u.id)),
            agentId: u.speaker,
          })),
      });
      const triggered = Object.values(snap.positions)
        .flatMap((byTopic) => Object.values(byTopic).flat())
        .filter((p) => p.trigger?.utteranceId === local);
      add({
        type: "agent",
        label: t.replay.positionChange,
        items: triggered.flatMap((p) => {
          const a = agentPreview(p.agentId, lang);
          return a ? [{ ...a, note: `${p.topicId} R${p.round} → ${p.stance.toFixed(1)}` }] : [];
        }),
      });
    }
    const claims = Object.values(snap.claims).filter((c) =>
      type === "claim" ? c.contradiction?.withClaimId === local : c.utteranceId === uid,
    );
    add({
      type: "claim",
      items: claims.map((c) => ({
        type: "claim" as const,
        id: scopedId(runId, c.id),
        title: c.atomicText,
        subtitle: c.id,
        meta: [c.state],
        snippet: null,
        href: entityHref("claim", scopedId(runId, c.id), { utteranceId: c.utteranceId }),
      })),
    });
    return groups;
  }
  return groups;
}
