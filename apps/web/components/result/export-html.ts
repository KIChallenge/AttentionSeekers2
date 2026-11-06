// Self-contained HTML rendering of the eight-part result document (W-38, FR-O4, FR-L6).
// Server-safe (no React, no client modules): mirrors ResultDocument section by section from
// the same snapshot helpers and the same strings, so the export never says anything the
// screen does not. One file per language, inline CSS, no scripts, links absolute.
import {
  type Lang,
  type OutcomeClass,
  positionAt,
  type Run,
  type RunSnapshot,
  topicStatus,
} from "@sv/contracts";
import {
  nameOf as agentNameOf,
  COMPROMISE_T,
  compromiseTally,
  tx,
} from "@/components/outcome/compromise-strings";
import type { Evidence } from "@/components/run/evidence";
import { agentLook, fmtStance, L } from "@/components/run/helpers";
import { runStrings } from "@/components/run/strings";

const esc = (v: unknown): string =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );

/** Agent hues as plain values; the app resolves them from CSS variables. */
const HUES: Record<string, string> = {
  gm: "#2a78d6",
  sv: "#1baf7a",
  ak: "#e34948",
  va: "#eb6834",
  ka: "#6250d6",
  pf: "#e87ba4",
  bl: "#008300",
  pv: "#eda100",
  fm: "#4b4b4b",
  opt: "#8a8a8a",
  mod: "#a6a6a6",
};
const DARK_INK = new Set(["sv", "pf", "pv", "moderator", "expert"]);

function hue(color: string): string {
  const m = /^var\(--c-([a-z]+)\)$/.exec(color);
  return m ? (HUES[m[1] ?? "opt"] ?? HUES.opt ?? "#8a8a8a") : color;
}

function tile(run: Run, id: string, lang: Lang): string {
  const a = agentLook(run, id, lang);
  const ink = DARK_INK.has(id) ? "#171717" : "#fff";
  const dashed = id === "fm" ? " dashed" : "";
  return `<span class="tile${dashed}" style="background:${esc(hue(a.color))};color:${ink}" title="${esc(a.name)}">${esc(a.code)}</span>`;
}

const CSS = `
*{box-sizing:border-box}
body{margin:0;background:#fafafa;color:#0f0f10;font:15px/1.6 Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:880px;margin:0 auto;padding:32px 20px 64px}
header h1{font-size:26px;line-height:1.25;margin:0 0 4px}
.sub,.muted{color:#5b5b5b}
.small{font-size:12.5px}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
article{background:#fff;border:1px solid #0000001a;border-radius:16px;padding:0 24px;margin-top:20px}
section{border-top:1px solid #00000014;padding:20px 0;break-inside:avoid}
section:first-child{border-top:0}
h2{font-size:18px;margin:0 0 8px}
h2 .n{color:#6b6b6b;margin-right:8px;font-variant-numeric:tabular-nums}
h3{font-size:15px;margin:12px 0 4px}
p{margin:6px 0}
ul,ol{margin:6px 0;padding-left:20px}
li{margin:4px 0}
table{width:100%;border-collapse:collapse;font-size:14px}
td{padding:6px 8px 6px 0;vertical-align:top;border-bottom:1px solid #00000010}
tr:last-child td{border-bottom:0}
.tile{display:inline-grid;place-items:center;min-width:18px;height:18px;padding:0 3px;border-radius:5px;font-size:9px;font-weight:600;vertical-align:-3px;margin-right:2px}
.tile.dashed{outline:1px dashed #4b4b4b;outline-offset:1px}
.chip{display:inline-block;border:1px solid #0000001f;border-radius:999px;padding:0 8px;font-size:12px;margin:1px 2px}
.chip.red{border-color:#e6000040;color:#b30000}
.chip.dash{border-style:dashed}
.grid3{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.box{border:1px solid #0000001a;border-radius:12px;padding:10px 12px}
.num{font-variant-numeric:tabular-nums}
a{color:inherit}
footer{margin-top:16px}
@media print{body{background:#fff}main{padding:0}article{border:0;padding:0}a{text-decoration:none}}
`;

export interface ExportOptions {
  /** Absolute origin for links back into the app, e.g. http://localhost:3000 */
  origin: string;
  exportedAt?: Date;
}

export function renderResultHtml(
  snap: RunSnapshot,
  run: Run,
  evidence: Evidence,
  lang: Lang,
  opts: ExportOptions,
): string {
  const t = runStrings[lang];
  const m = run.mandate;
  const topics = m.topics;
  const status = topics.map((tp) => ({ tp, st: topicStatus(snap, tp.id) }));
  const proposals = snap.proposalOrder.map((id) => snap.proposals[id]).filter((p) => !!p);
  const accepted = proposals.filter((p) => p?.status === "accepted");
  const open = snap.summaries.at(-1)?.openConflicts ?? [];
  const topicName = (id: string) => {
    const tp = topics.find((x) => x.id === id);
    return tp ? L(tp.label, lang) : id;
  };
  const statusLabel = (s: OutcomeClass) =>
    s === "consensus"
      ? t.result.consensus
      : s === "majority"
        ? t.result.majority
        : s === "minority"
          ? t.result.minority
          : t.analysis.pStatus.open;
  const to = lang === "de" ? "bis" : "to";
  const base = `${opts.origin.replace(/\/$/, "")}/runs/${encodeURIComponent(run.id)}`;
  const tileOf = (id: string) => tile(run, id, lang);
  const redLine = (id: string) =>
    evidence.redLines[id] ? L(evidence.redLines[id].text, lang) : id;
  const section = (n: number, title: string, body: string) =>
    `<section id="s${n}"><h2><span class="n">${n}.</span>${esc(title)}</h2>${body}</section>`;

  const s1 = [
    `<p style="font-size:16px;font-weight:600">${esc(m.question)}</p>`,
    `<p><span class="muted">${esc(t.result.objective)}: </span>${esc(L(m.objective, lang))}</p>`,
    m.constraints.length
      ? `<ul>${m.constraints.map((c) => `<li>${esc(L(c, lang))}</li>`).join("")}</ul>`
      : "",
    `<p class="small muted">${esc(t.analysis.rule_[run.room.decisionRule])} · ${run.room.roundLimit} ${esc(t.common.round)} · as-of ${esc(m.asOf)}</p>`,
  ].join("");

  const s2 = `<table><tbody>${m.actors
    .map((a) => {
      const look = agentLook(run, a.agentId, lang);
      return `<tr><td style="white-space:nowrap">${tileOf(a.agentId)} <a href="${base}/agents/${esc(a.agentId)}">${esc(look.name)}</a></td><td class="muted">${esc(L(a.reason, lang))}</td><td class="mono small muted">${esc(run.modelAssignment[a.agentId] ?? "")}</td></tr>`;
    })
    .join("")}</tbody></table>`;

  const s3 = [
    snap.summaries.length
      ? snap.summaries
          .map(
            (s) =>
              `<p><strong>${esc(t.result.roundLine(s.round))}: </strong>${esc(L(s.text, lang))}</p>`,
          )
          .join("")
      : `<p class="muted">${esc(t.result.noSummaries)}</p>`,
    `<p><a href="${base}?view=full">${esc(t.result.fullDebate)} →</a></p>`,
  ].join("");

  const s4 = open.length
    ? `<ul>${open
        .map(
          (c) =>
            `<li><strong>${esc(topicName(c.topicId))}</strong>: ${esc(L(c.note, lang))}<div>${c.sides[0].map(tileOf).join("")} <span class="muted small">vs</span> ${c.sides[1].map(tileOf).join("")} ${c.boundBy.map((id) => `<span class="chip red">${esc(redLine(id))}</span>`).join("")}</div></li>`,
        )
        .join("")}</ul>`
    : `<p class="muted">${esc(t.result.noConflicts)}</p>`;

  const s5 = proposals.length
    ? `<ul>${proposals
        .map((p) =>
          p
            ? `<li><span class="mono small muted">${esc(p.id)}</span> ${tileOf(p.originAgent)} ${esc(L(p.title, lang))} · <span class="muted">${esc(t.analysis.pStatus[p.status])}</span>${p.rejectionReason ? `<span class="muted"> · ${esc(L(p.rejectionReason, lang))}</span>` : ""}</li>`
            : "",
        )
        .join("")}</ul>`
    : `<p class="muted">${esc(t.result.noProposals)}</p>`;
  const k = snap.compromise;
  const kc = COMPROMISE_T[lang === "en" ? "en" : "de"];
  const kl = lang === "en" ? "en" : "de";
  const kVotes = Object.values(snap.compromiseVotes ?? {});
  const s5k = k
    ? `<h3>${esc(kc.title)}: ${esc(tx(k.title, kl))}</h3>${snap.compromiseResult ? `<p><strong>${esc(compromiseTally(snap.compromiseResult, kl))}</strong></p>` : ""}<p class="muted">${esc(tx(k.rationale, kl))}</p><ol>${k.components.map((c) => `<li>${esc(tx(c.text, kl))}</li>`).join("")}</ol>${k.conditions.length ? `<ul>${k.conditions.map((c) => `<li>${esc(kc.kind[c.kind])}: ${esc(tx(c.text, kl))}</li>`).join("")}</ul>` : ""}<ul>${kVotes.map((v) => `<li>${tileOf(v.agentId)} ${esc(agentNameOf(v.agentId, kl))}: ${esc(kc[v.stance])}${v.condition ? `, ${esc(tx(v.condition, kl))}` : ""}<span class="muted"> · ${esc(tx(v.reason, kl))}</span></li>`).join("")}</ul>`
    : "";

  const s6 =
    `<div class="grid3">${(["consensus", "majority", "minority"] as const)
      .map((k) => {
        const rows = status.filter((x) => x.st.status === k);
        const items = rows.length
          ? rows
              .map(({ tp, st }) => {
                const minority =
                  k === "minority"
                    ? `<div>${run.agents
                        .filter((a) => (positionAt(snap, a.id, tp.id)?.stance ?? 0) >= 0.5)
                        .map((a) => tileOf(a.id))
                        .join("")}</div>`
                    : "";
                return `<li>${esc(L(tp.label, lang))} <span class="num muted">${st.support}/${st.of}</span>${minority}</li>`;
              })
              .join("")
          : `<li class="muted">·</li>`;
        return `<div class="box"><div class="small muted">${esc(statusLabel(k))}</div><ul style="list-style:none;padding:0">${items}</ul></div>`;
      })
      .join("")}</div>` + `<p class="small muted">${esc(t.analysis.rule)}</p>`;

  const s7 =
    `<ul>${status
      .filter((x) => x.st.status === "no_result" || open.some((c) => c.topicId === x.tp.id))
      .map(({ tp, st }) => {
        const c = open.find((x) => x.topicId === tp.id);
        const sides = c
          ? ` <span class="small muted">${c.sides[1]
              .map(
                (a) =>
                  `${esc(agentLook(run, a, lang).code)} ${esc(fmtStance(positionAt(snap, a, tp.id)?.stance ?? 0))}`,
              )
              .join(", ")}</span>`
          : "";
        return `<li><strong>${esc(L(tp.label, lang))}</strong> <span class="chip">${esc(statusLabel(st.status))}</span>${c ? `<span class="muted"> ${esc(L(c.note, lang))}</span>` : ""}${sides}</li>`;
      })
      .join("")}</ul>` + `<p class="small muted">${esc(t.analysis.neverForced)}</p>`;

  const figs = snap.figures.length
    ? `<ul>${snap.figures
        .map(
          (f) =>
            `<li><span class="mono small muted">${esc(f.measureId)}</span> ${esc(t.outcome.metric[f.metric])}: <strong class="num">${esc(f.value ?? t.outcome.notModelled)} ${f.value !== null ? esc(f.unit) : ""}</strong>${f.low !== null && f.high !== null ? ` <span class="num muted">(${esc(f.low)} ${to} ${esc(f.high)})</span>` : ""}${f.inputs.some((i) => i.assumption) ? ` <span class="chip dash">${esc(t.outcome.assumption)}</span>` : ""}</li>`,
        )
        .join("")}</ul>`
    : `<p class="muted">${esc(t.outcome.noFigures)}</p>`;
  const forecasts = snap.forecasts
    .map(
      (f) =>
        `<p><span class="mono small muted">${esc(f.measureId)}</span> ${esc(
          f.status === "ok" && f.k !== null
            ? `${t.outcome.sentence(f.k, f.n)}${f.interval ? ` (${Math.round(f.interval.low * 100)} ${to} ${Math.round(f.interval.high * 100)} %)` : ""}.`
            : f.status === "small_n"
              ? t.outcome.smallN(f.n)
              : t.outcome.unavailable,
        )}</p>`,
    )
    .join("");
  const recs = [
    ...accepted.map((p) => (p ? `<li>${esc(t.result.recPackage(L(p.title, lang)))}</li>` : "")),
    ...open.map(
      (c) => `<li>${esc(t.result.recOpen(`${topicName(c.topicId)} (${L(c.note, lang)})`))}</li>`,
    ),
    `<li>${esc(t.result.recEvidence)}</li>`,
  ].join("");
  const end = snap.endCondition
    ? `<p class="small muted">${esc(t.result.endCondition)}: ${esc(L(snap.endCondition.note, lang))}</p>`
    : "";
  const expert = snap.expertNotes.length
    ? `<p class="small muted">${esc(t.live.expert)}: ${esc(snap.expertNotes.map((n) => L(n.note, lang)).join("; "))} (${snap.expertNotes
        .flatMap((n) => n.utteranceIds)
        .map((id) => `<a class="mono" href="${base}/inspect/${esc(id)}">${esc(id)}</a>`)
        .join(" ")})</p>`
    : "";
  const s8 = `${figs}${forecasts}<h3>${esc(t.result.recommendations)}</h3><ol>${recs}</ol>${end}${expert}`;

  const exportedAt = (opts.exportedAt ?? new Date()).toISOString().replace("T", " ").slice(0, 16);
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="HealthPolicy Simulator">
<title>${esc(t.result.title)} · ${esc(run.id)}</title>
<style>${CSS}</style>
</head>
<body>
<main>
<header>
<h1>${esc(t.result.title)}</h1>
<p class="sub">${esc(t.result.sub)} <span class="mono">${esc(run.id)}</span> · ${esc(run.createdAt.slice(0, 10))}</p>
</header>
<article>
${section(1, t.result.s1, s1)}
${section(2, t.result.s2, s2)}
${section(3, t.result.s3, s3)}
${section(4, t.result.s4, s4)}
${section(5, t.result.s5, s5 + s5k)}
${section(6, t.result.s6, s6)}
${section(7, t.result.s7, s7)}
${section(8, t.result.s8, s8)}
</article>
<footer class="small muted">
<p>${esc(t.result.exportNote)}</p>
<p>${esc(t.result.run)} <a class="mono" href="${base}/result">${esc(run.id)}</a> · ${esc(t.result.exportedAt)} ${esc(exportedAt)} UTC · ${lang.toUpperCase()}</p>
</footer>
</main>
</body>
</html>
`;
}
