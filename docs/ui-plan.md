# UI implementation plan: HealthPolicy Simulator (UC2)

Status: plan, 2026-11-05. Nothing in here is scaffolded yet.
Inputs: `uc2-requirements.md` v2.10 (sections 2.7, 2.8, 2.14, 5, 6, 7, 8, 9, 10), `mockups/` (five screens plus README), `research/papers-addendum.md` (proposed FR-R7, FR-T11, replay-from-round-N, claim-level verification), `schema/outcome-descriptor.schema.json` v0.1, and the medlyn repository at commit `eea5eec` (2026-10-31), read but not installed or run.

Scope: the web app (`apps/web`) and the TypeScript packages it reads from. The negotiation engine is described only as far as the UI depends on its output. The Python tracks in `data/` and `forecasting/` belong to other agents; this plan only defines how their output reaches the UI.

---

## 0. Decisions in one screen

| Topic                   | Decision                                                                                                                                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Transport, engine to UI | NDJSON over `fetch`, one Zod discriminated union `RunEvent`, the pattern of medlyn's `/api/lens` route. Not the AI SDK UI message stream: the debate is not a chat, and replay must be "read the same lines from disk"                                             |
| Live vs replay          | One format. A live run appends events to `run_events`; replay re-emits stored events with their recorded time offsets scaled by `?speed=`. A file fallback (`runs/*.ndjson`) works with no database at all                                                         |
| State in the browser    | One pure reducer `foldRun(snapshot, event)` in `packages/contracts`, used by the server to build snapshots of finished runs and by the client while streaming                                                                                                      |
| Streaming granularity   | Per utterance (`utterance.started` then `utterance.completed`), token deltas optional. The layout never moves when an utterance completes (mockup rule). This survives a Bifrost that cannot stream structured output (NFR-10 is unconfirmed)                      |
| LLM calls in the engine | AI SDK `createOpenAI({ baseURL: BIFROST })` with `provider.chat(model)` for text, plus medlyn's `structured()` strict JSON-schema helper for deliberation records. Both are what medlyn actually does                                                              |
| Database                | Postgres 17 + pgvector in Docker, `drizzle-orm/node-postgres`. Lexical branch moves from ParadeDB `pg_search` to built-in Postgres FTS (`german` config)                                                                                                           |
| i18n                    | No library. Typed dictionaries `messages/de.ts` (source) and `messages/en.ts` (`satisfies Messages`), locale in a cookie, a `<Term>` component for FR-L4                                                                                                           |
| Disclosure levels       | Cookie plus context; `<Level min="analyst">` wrapper mirrors the mockup's `min-analyst`, `min-engineer`, `only-executive` classes                                                                                                                                  |
| Charts                  | Position-space trajectory: custom SVG component (d3-scale only). Debate dynamics, ablation bars, calibration: recharts 3.8.0 through medlyn's `components/ui/chart.tsx`. No React Flow, no TanStack Table                                                          |
| Python tracks           | Batch: JSONL in `data/derived/` and `forecasting/data/` imported into Postgres by a TypeScript importer that validates every row with the contracts. Live: one stdio CLI call to the forecasting package after a run ends. No long-running Python service on stage |

---

## 1. Reuse inventory from medlyn

Paths are relative to the medlyn repository root. "Lift" means copy with only renames. "Adapt" means copy and change behaviour. "Drop" means do not bring it over.

### 1.1 Monorepo and tooling

| medlyn path                                                                                                         | Verdict | Notes                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json` (root scripts), `pnpm-workspace.yaml`, `turbo.json`                                                  | Adapt   | Rename scope `@medlyn/*` to `@sv/*`. Workspace `apps/*`, `packages/*` only; `data/` and `forecasting/` stay outside. Replace `globalPassThroughEnv` with `DATABASE_URL`, `BIFROST_BASE_URL`, `BIFROST_API_KEY`, `SV_REPLAY_DIR`, `SV_FORECAST_CMD` |
| `biome.json`, `.husky/`, `scripts/check-commit-msg.mjs`                                                             | Lift    | Same lint and commit conventions                                                                                                                                                                                                                   |
| `packages/tsconfig/{base,nextjs,node}.json`                                                                         | Lift    | Note `erasableSyntaxOnly` and `allowImportingTsExtensions`: no TS enums or namespaces in shared packages                                                                                                                                           |
| `.env.example`                                                                                                      | Adapt   | Remove Gemini, fish.audio, IBM Quantum, Neon, Vercel keys                                                                                                                                                                                          |
| `apps/www/`, `paper/`, `ml/quantum/`, `ml/synth/`, `ml/multimodal/`, `scripts/vercel-env.mjs`, `apps/*/vercel.json` | Drop    | Not relevant to UC2                                                                                                                                                                                                                                |

### 1.2 App shell, design system, primitives

| medlyn path                                                                        | Verdict          | Notes                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/app/components.json`                                                         | Lift             | shadcn style `radix-luma`, base `neutral`, icon library `hugeicons`                                                                                                                                                                                                                            |
| `apps/app/app/globals.css`                                                         | Lift             | The ElevenLabs-derived token system the mockups were drawn on (gray alpha ramps, `--warning`, `--success`, radii, text scale). Add the nine agent hues and the hatch pattern as tokens                                                                                                         |
| `docs/design/ui-rules.md`, `docs/design/elevenlabs-tokens.md`                      | Lift, then amend | Rewrite the clinical wording; keep the status-badge table, which maps one to one onto the four claim states (section 5.2)                                                                                                                                                                      |
| `apps/app/components/ui/*` (44 shadcn primitives)                                  | Lift             | Includes `resizable.tsx` already rewritten for react-resizable-panels v4 (`Group`, `Panel`, `Separator`), `chart.tsx` (recharts wrapper), `sidebar`, `sheet`, `toggle-group`, `table`, `tabs`, `collapsible`, `command`, `empty`, `skeleton`, `scroll-area`, `popover`, `hover-card`, `dialog` |
| `apps/app/lib/utils.ts`                                                            | Lift             | `cn`                                                                                                                                                                                                                                                                                           |
| `apps/app/app/layout.tsx`                                                          | Adapt            | Keep fonts (Inter plus Geist Mono, the mockup pairing). Replace the inline `medlyn-theme` script with `next-themes` (`attribute="class"`, `system` default) for the Auto/Hell/Dunkel tri-state. `lang` from the locale cookie instead of hard-coded `en`                                       |
| `apps/app/next.config.ts`                                                          | Adapt            | Keep `transpilePackages`, `turbopack.root`, `.env` loading; drop the Vercel tracing excludes except `data/**`, `forecasting/**`                                                                                                                                                                |
| `apps/app/proxy.ts`                                                                | Drop             | Vercel production guard. Next 16 names this file `proxy.ts`; we do not need one                                                                                                                                                                                                                |
| `apps/app/components/shell/{app-sidebar,page-header,sidebar-*,command-search}.tsx` | Adapt            | Top bar plus run navigation instead of patient navigation. `patient-switcher.tsx`, chat history: drop                                                                                                                                                                                          |

### 1.3 Provenance and transparency components

| medlyn path                                                                                                                                                                                                                                                                   | Verdict | Notes                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/app/components/sources/` (`source-overlay`, `source-popover`, `source-passage-content`, `source-segment`, `source-load-state`, `source-language-toggle`, `sources-list-popover`, `document-reader-dialog`, `source-navigation-dialog`, `source-resource.ts`, `hooks/*`) | Lift    | The single canonical source flow (FR-P2, FR-P7, FR-L3): one trigger opens the exact passage with neighbours and its translation. Keep the "no competing hover preview" rule |
| `apps/app/components/sources/source-chips.tsx`                                                                                                                                                                                                                                | Adapt   | Label becomes `institution · date · outlet` (CON-1/CON-2 visible); SOZDOK variant with a solid square, as in the mockup                                                     |
| `apps/app/components/ai-elements/chain-of-thought.tsx`                                                                                                                                                                                                                        | Adapt   | Shell of the deliberation record (FR-T1) and the provider-trace block (FR-T3)                                                                                               |
| `apps/app/components/ai-elements/inline-citation.tsx`                                                                                                                                                                                                                         | Adapt   | Inline claim popover body; swap its `HoverCard` for click (NFR-7: nothing essential on hover)                                                                               |
| `apps/app/components/ai-elements/context.tsx`, `shimmer.tsx`                                                                                                                                                                                                                  | Lift    | Model and parameter popover; loading text                                                                                                                                   |
| `apps/app/components/ai-elements/conversation.tsx`                                                                                                                                                                                                                            | Drop    | Built on `use-stick-to-bottom`; the mockup rules forbid auto-scroll during streaming                                                                                        |
| `apps/app/components/ai-elements/{message,prompt-input,queue,suggestion,artifact}.tsx`                                                                                                                                                                                        | Drop    | Chat surface. `prompt-input.tsx` is 1198 lines; the question entry is a `Textarea` plus `Command`                                                                           |
| `apps/app/components/gen-ui/tool-frame.tsx`, `tool-skeleton.tsx`                                                                                                                                                                                                              | Adapt   | Fixed-viewport panel frame with loading, empty and error states in the same box (demo-stable rule)                                                                          |
| `apps/app/components/gen-ui/passage-card.tsx`, `claim-line.tsx`, `claim-list.tsx`, `timeline.tsx`                                                                                                                                                                             | Adapt   | Passage card in the agent card and inspector; claim line by state; round timeline                                                                                           |
| `apps/app/components/categories/claim-text.tsx`                                                                                                                                                                                                                               | Adapt   | Inline claim span with underline by state                                                                                                                                   |
| `apps/app/components/research/{distribution-chart,retrieval-chart,metric-cards}.tsx`                                                                                                                                                                                          | Adapt   | Working recharts examples on the shared `ChartContainer`; templates for ablation bars, calibration and debate dynamics                                                      |
| `apps/app/components/{patient,categories (rest),cockpit,chat,artifacts}/*`, `hooks/use-{lens,letter,reviews,situation-voice}.ts`                                                                                                                                              | Drop    | Clinical features                                                                                                                                                           |

### 1.4 Streaming and data access

| medlyn path                                                                      | Verdict | Notes                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/app/app/api/lens/route.ts`                                                 | Adapt   | The template for `/api/runs/[runId]/stream`: async iterator to `ReadableStream`, first event awaited before returning headers, cancellation, terminal `error` event, `force-dynamic`, `runtime = "nodejs"` |
| `apps/app/lib/lens-state.ts` (`NdjsonBuffer`, `readLensStream`, reducer pattern) | Adapt   | `NdjsonBuffer` lifts as is; `readRunStream` parses each line with `RunEvent.parse` and enforces ordering by `seq`                                                                                          |
| `apps/app/hooks/use-lens.ts`                                                     | Adapt   | Abort, sequence guard and timeout logic become `useRunStream`                                                                                                                                              |
| `packages/engine/lens/mock.ts` and the `MEDLYN_MOCK` switch                      | Adapt   | Becomes the replay mode; same idea, a canned stream through the same route                                                                                                                                 |
| `apps/app/app/api/passage/[segmentId]/route.ts`, `lib/evidence-server.ts`        | Adapt   | Passage endpoint; id validation regex and error copy kept. Add the CON guard on the serializer                                                                                                             |

### 1.5 Engine modules the UI depends on

| medlyn path                                                                                   | Verdict       | Notes                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/engine/contracts.ts`                                                                | Pattern only  | Keep `IsoDate`, separated status enums, `EvidenceWindow`, the `LensEvent` discriminated-union convention. Entities are rewritten (section 4) into `packages/contracts`                                                                                                                                                                                  |
| `packages/engine/db/client.ts`                                                                | Rewrite       | `drizzle-orm/neon-http` to `drizzle-orm/node-postgres` with a `pg.Pool`. medlyn code reads `result.rows` from `db.execute`, which node-postgres also returns                                                                                                                                                                                            |
| `packages/engine/db/schema.ts`                                                                | Adapt         | Keep `documents`, `segments` (offsets, `text_en`), `segment_embeddings` (vector plus HNSW), `validations` (verdict cache). Rename `patient_id` scoping to `corpus`; drop `facts`, `findings`, `letters`, `reviews`, `lens_cache`, `chats`, `page_assets`                                                                                                |
| `packages/engine/db/migrations-extra/001-search.pgsql`, `apply.ts`                            | Adapt         | Keep `CREATE EXTENSION vector`. Replace the ParadeDB BM25 index with a generated `tsvector` column (`german`) plus GIN index                                                                                                                                                                                                                            |
| `packages/engine/store.ts` (`evidenceWindow`, `assertWindowCurrent`)                          | Adapt         | Keep the invariant (eligible means `doc_date <= asOf`, FR-H2). Change the mechanism: medlyn materialises every eligible document id into the query and checks each one, which does not scale to an archive slice of 10^5 segments. Use a `doc_date <= $asOf and corpus_revision = $rev` predicate and keep a test that nothing after `asOf` is returned |
| `packages/engine/search/{hybrid.ts,lexical.ts}`                                               | Lift          | RRF fusion with bm25/vector ranks per hit, which is exactly the retrieval trace the inspector shows (FR-T6)                                                                                                                                                                                                                                             |
| `packages/engine/search/{bm25.ts,vector.ts,scope.ts}`                                         | Adapt         | Scope by corpus and date instead of patient and id list; lexical branch on Postgres FTS                                                                                                                                                                                                                                                                 |
| `packages/engine/search/embed.ts`                                                             | Rewrite       | Gemini direct to AI SDK `embedMany` through Bifrost (Azure embedding deployment, `dimensions: 768` to keep the column)                                                                                                                                                                                                                                  |
| `packages/engine/llm/client.ts`                                                               | Adapt         | Keep `structured()` (strict JSON schema from Zod, one retry, refusal and truncation errors), the concurrency slot and the key redaction. Change: model id per agent call instead of role env vars, and return usage plus latency for telemetry (FR-T7)                                                                                                  |
| `packages/engine/llm/smoke.ts`                                                                | Adapt         | Basis for the NFR-10 gateway smoke test per model; results shown on `/method`                                                                                                                                                                                                                                                                           |
| `packages/engine/claims/{identity.ts,code-check.ts}`                                          | Lift          | Claim normalisation and cache keys; deterministic numeric and date matching that already knows German month names                                                                                                                                                                                                                                       |
| `packages/engine/claims/validate.ts`                                                          | Adapt         | The `SemanticResult` (supported, partial, unsupported) prompt and the cache are reusable; everything bound to patient facts is not                                                                                                                                                                                                                      |
| `packages/engine/claims/{cascade.ts,local-verifier.ts}`, `ml/verifier/{train,sweep,serve}.py` | Drop          | Trained verifier; needs a Python model server. Two-model verification via the gateway (FR-N7) replaces it                                                                                                                                                                                                                                               |
| `packages/engine/ingest/{normalise.ts,segment.ts,hash.ts}`                                    | Lift (verify) | Offset-preserving normalisation and segmentation for FR-P7, if the data track hands over raw text. Not read line by line for this plan                                                                                                                                                                                                                  |
| `packages/engine/{lens,letter,findings,review,agent}/*`, `ingest/multimodal/*`                | Drop          | Clinical pipeline                                                                                                                                                                                                                                                                                                                                       |
| `ml/verifier/bridge.ts`                                                                       | Pattern only  | The stdio bridge shape reused for the forecasting CLI call                                                                                                                                                                                                                                                                                              |
| `eval/` (promptfoo config, assertions)                                                        | Later         | Agent behaviour tests; not UI scope                                                                                                                                                                                                                                                                                                                     |

### 1.6 Declared in medlyn but not used by its app code

`@xyflow/react` ^12.12.0 and `@tanstack/react-table` ^9.3.1 appear in `apps/app/package.json` but no file in `apps/app` imports them. `next-themes` is imported only by `ui/sonner.tsx`. PRD 5.2 lists React Flow and TanStack Table, but there is no medlyn code to inherit for them, so they carry no reuse saving. This plan does not use them (section 5.6).

Headline: roughly 45 primitives, the whole source flow, the streaming route pattern, the token system, retrieval fusion, the structured-output client and the numeric checker come over almost unchanged. Everything that is a screen in this project is new.

---

## 2. Monorepo layout and data flow

### 2.1 Layout

```
sv-ki-challenge/
  apps/
    web/                      Next.js 16 app (pages, route handlers, components)
      app/
      components/
        ui/                   lifted shadcn primitives
        sources/              lifted source flow
        run/                  live view, transcript, roster, inspector panel
        agent/                agent card
        analysis/             trajectory, matrix, dynamics
        outcome/              effects, forecast, robustness, ablation, ratification
        result/               eight-part document
      messages/{de,en}.ts     typed dictionaries
      lib/                    run-stream client, cookies, formatting
  packages/
    contracts/                Zod entities, RunEvent, foldRun, JSON Schema export
      schema/                 generated JSON Schema for the Python tracks
    db/                       Drizzle schema, node-postgres client, migrations,
                              JSONL importers, run event store, read models
    engine/                   moderator, agents, debate loop, claim boundary,
                              impact model, retrieval, gateway client, runner,
                              replay, forecasting bridge
    tsconfig/
  data/                       Python, data track (other agent; read-only for us)
  forecasting/                Python, forecasting track (other agent; read-only)
  runs/                       cached runs as NDJSON, committed (reference run, ablations)
  docker-compose.yml          pgvector/pgvector:pg17 on :55432, Bifrost on :8080
  docs/
```

Dependency direction: `contracts` depends on `zod` only. `db` depends on `contracts`. `engine` depends on `contracts` and `db`. `apps/web` depends on all three but imports `engine` only inside route handlers (never in client components). The UI can be built against `contracts` plus a fixture run before any engine code exists.

### 2.2 How the Python tracks feed in

Two paths, one per lifecycle stage.

**Batch import (preparation, before any run).** The Python tracks write JSONL; `pnpm db:import` reads it, validates every row with the contract schema, and upserts. Invalid rows fail the import loudly with file and line number. Person-name filtering happens in the data track; the importer refuses any row without `person_filtered: true` (CON-1/CON-2 fail-closed).

| Producer file (proposed names, to confirm with the track owners)                                        | Contract            | Table                                                                    | Read by                                                   |
| ------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------- |
| `data/derived/sources.jsonl`                                                                            | `Source`            | `sources`                                                                | source popover, agent card, inspector                     |
| `data/derived/segments.jsonl` (offsets into source text, optional `text_en`)                            | `Segment`           | `segments` (+ `tsvector`, embeddings computed at import through Bifrost) | retrieval, source popover                                 |
| `data/derived/stance_profiles.jsonl` (per institution, topic key, optional year)                        | `StanceProfile`     | `stance_profiles`                                                        | agent card layer 1, trajectory historical overlay (FR-H3) |
| `data/derived/red_lines.jsonl`                                                                          | `RedLine`           | `red_lines`                                                              | agent card layer 3, matrix red-line dots                  |
| `forecasting/data/descriptors.jsonl` (historical `OutcomeDescriptor`)                                   | `OutcomeDescriptor` | `outcome_descriptors`                                                    | analog list, method note                                  |
| `forecasting/data/method_note.json` (Brier vs status quo, class sizes, ablation verdict, regime caveat) | `MethodNote`        | `method_notes`                                                           | `/method`, forecast block                                 |
| `config/agents/*.json` (in this repo, FR-A7, NFR-3)                                                     | `AgentConfig`       | `agent_configs`                                                          | roster, agent card, mandate review                        |

`packages/contracts` exports JSON Schema (`z.toJSONSchema`) into `packages/contracts/schema/` so the Python side can validate its output with `jsonschema` before writing. The one exception is `OutcomeDescriptor`, where the Python-owned `schema/outcome-descriptor.schema.json` is the source of truth and the Zod mirror is checked against it by a parity test (ticket W-03).

**Live call (end of a run).** FR-J10 requires one extractor for historical and simulated cases, and that extractor is Python. After the final round the engine runs the forecasting CLI once over stdio (`SV_FORECAST_CMD`, for example `uv run --project forecasting svforecast forecast --stdin`), passing the negotiation record as JSON and receiving descriptors plus reference-class forecasts as JSON. The engine emits them as `forecast.computed` events, so the cached run already contains them and a replay never needs Python. If the CLI fails, the event carries `status: "unavailable"` and the UI says so instead of hiding the block (CON-4).

A small HTTP service was considered and rejected: one more process to keep alive on stage, for a call made once per run.

### 2.3 Run storage

`run_events (run_id, seq, ts_ms, type, payload jsonb)` is canonical (NFR-5). At `run.completed` the engine materialises read models used for cross-run group-bys: `runs`, `positions`, `claims`, `proposals`, `utterance_traces` (prompt, retrieval trace, full deliberation; loaded only at engineer level). Robustness and ablation views are `group by runs.variant` (PRD 6.1 note).

`pnpm runs:export <runId>` writes `runs/<slug>.ndjson`; `pnpm runs:load` imports them. If `DATABASE_URL` is unreachable, the run loader reads `SV_REPLAY_DIR` directly, so the reference run replays even with Docker down (acceptance 19).

---

## 3. Route and screen map

Mockup ids (u3-02, u3-03, p-18821, ep-0217) stay stable in the fixture so cross-screen links can be tested exactly as in the mockups.

| Route                                 | Screen (PRD 7.1 / mockup)                                                                                                                                                                                                                                           | Requirement IDs                                                                                               | Contracts read                                                                                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `/`                                   | Dashboard: pinned reference run, run grid (question, date, variant, outcome badge, agreement share, who moved most, duration), filters (variant, model palette, episode, status), "Replay" and "Fork" actions per run, live runs with a running badge, "Neue Frage" | NFR-2, AC 19, FR-X2, FR-K4                                                                                    | `RunSummary[]` (extended: `outcomeBadge`, `movedMost`, `durationMs`, `isReference`)                                                        |
| `/replay/[runId]`                     | Replay player over a finished run: play/pause, speed (1x to 8x), scrubber with round markers and position-change ticks, jump to round or utterance, shares components with the live view                                                                            | NFR-2, FR-T1, FR-U1                                                                                           | `RunEvent` stream with `speed` and `from`                                                                                                  |
| `/archive`                            | Evidence archive: one search over everything the agents reason from (faceted by source type, institution, date, draft law, licence), with an as-of date slider that shows exactly what an agent could see at a given cutoff                                         | FR-H1, FR-H2, FR-P1, FR-H13, CON-1/2                                                                          | `Source[]`, `Segment[]` (FTS + vector hits), facets                                                                                        |
| `/archive/sources/[sourceId]`         | Source detail: metadata, licence line, link to the original (parlament.gv.at, RIS, publisher), name-masked text with masked spans marked, "used in" list (runs and utterances that cited it), "trained on" flag if it is in any persona or classifier training set  | FR-P1, FR-P3, FR-T2, CON-1/2                                                                                  | `Source`, `Segment[]`, `CitationUse[]`, `TrainingMembership[]`                                                                             |
| `/archive/agents/[agentId]`           | Per-agent evidence shelf: the Stellungnahmen, statistics and texts that fit this agent's stance profile, red lines and (if any) persona model, with the training split (train, held-out, after-cutoff) and the fidelity score                                       | FR-C1, FR-C3, FR-J13, addendum persona-fidelity test                                                          | `StanceProfile[]`, `Source[]`, `TrainingManifest`                                                                                          |
| `/archive/episodes/[episodeId]`       | Historical episode: ME, RV, BGBl, VfGH timeline, the institutions' Stellungnahmen side by side, text-reuse highlights from Stellungnahme into law, label and how it was derived                                                                                     | FR-H7, FR-H13, FR-J1a, addendum items 4 and 5                                                                 | `Episode`, `OutcomeDescriptor`, `ReuseSpan[]`                                                                                              |
| `/archive/stats`                      | Statistics catalogue: series used as agent evidence, with source, licence, as-of date and small charts                                                                                                                                                              | FR-N3, FR-P1                                                                                                  | `StatSeries[]`                                                                                                                             |
| `/runs/new`                           | Question entry and mandate review (not mocked)                                                                                                                                                                                                                      | FR-U7, M1, M2, M3, X1, X2, V1, H2, L2, AC 2, AC 13                                                            | `MandateDraft` (streamed), `AgentConfig[]`, `ModelPalette`                                                                                 |
| `/runs/[runId]`                       | Negotiation live view, condensed and full debate (`negotiation.html`)                                                                                                                                                                                               | FR-U1, T4, T5 (panel), T8, T10, P2, P5, A4, A5, M3, M4, M5, M6, M7, M9, N1, N2, R1, NFR-1, NFR-9, AC 5, 6, 11 | `RunSnapshot` via `RunEvent` stream: `Run`, `Mandate`, `Utterance`, `Claim`, `RoundSummary`, `ExpertNote`, `Position`                      |
| `/runs/[runId]?view=full&u=u3-03`     | Full debate with round outline; selected utterance                                                                                                                                                                                                                  | FR-T4, AC 12                                                                                                  | same                                                                                                                                       |
| `/runs/[runId]/agents/[agentId]`      | Agent position card (`agent-card.html`)                                                                                                                                                                                                                             | FR-U2, U8, C1, C2, C3, C4, C5, C6, C7, J13, P1, P3, P4, H9, AC 3, AC 9, AC 17b                                | `AgentConfig`, `StanceProfile[]`, `RedLine[]`, `Temperament`, `Position[]` (this agent), `Source`/`Segment`                                |
| `/runs/[runId]/inspect/[utteranceId]` | Deliberation inspector (`inspector.html`)                                                                                                                                                                                                                           | FR-T1, T2, T3, T5, T6, T7, N7, T9 (bundle button), AC 10                                                      | `Utterance`, `Deliberation`, `UtteranceTrace` (`PromptBlock[]`, `RetrievalTrace`), `Telemetry`, `Claim[]` with `verifyingModels`           |
| `/runs/[runId]/analysis`              | Position-space trajectory, consensus matrix, who moved, open conflicts, coalitions, debate dynamics (`analysis.html`)                                                                                                                                               | FR-U3, U4, U5, H3, A6, proposed R7, R5, AC 5, AC 8                                                            | `Position[]`, `Topic[]`, `Axis[]`, `StanceProfile[]` (history), `RoundSummary[]`, `Coalition[]`, `DynamicsMetrics`                         |
| `/runs/[runId]/outcome`               | Effects and forecast, robustness, ablation, cold ratification (`outcome.html`)                                                                                                                                                                                      | FR-U6, N3, N4, N5, J3, J4, J6, J14, X4, X5, K1, K2, K3, K5, V1 to V5, H4, AC 7, 14, 15, 16, 17, 17c           | `ImpactFigure[]`, `Forecast[]`, `MethodNote`, `RobustnessRow[]`, `CalibrationRow[]`, `AblationDelta[]`, `RatificationVote[]`, `Proposal[]` |
| `/runs/[runId]/result`                | Eight-part result document, print and export DE/EN                                                                                                                                                                                                                  | FR-O1, O2, O3, O4, L6, AC 1, AC 12, AC 18                                                                     | `ResultDocument` (derived by `foldRun`), links to `?view=full`                                                                             |
| `/runs/[runId]/compare/[otherRunId]`  | Fork or variant diff (replay-from-round-N result)                                                                                                                                                                                                                   | addendum item 11, FR-R5, FR-K1                                                                                | two `RunSnapshot`s                                                                                                                         |
| `/runs`                               | All runs grouped by variant                                                                                                                                                                                                                                         | FR-X2, X3, K4                                                                                                 | `RunSummary[]`                                                                                                                             |
| `/method`                             | Method note, model palette and smoke results, inherited-vs-built boundary                                                                                                                                                                                           | FR-J5, J14, K5, X5, NFR-10, CON-6, CON-7                                                                      | `MethodNote`, `SmokeResult[]`                                                                                                              |

Route handlers:

| Handler                                             | Purpose                                                                          |
| --------------------------------------------------- | -------------------------------------------------------------------------------- |
| `POST /api/mandate`                                 | Question to `MandateDraft`, streamed as NDJSON `mandate.*` events                |
| `POST /api/runs`                                    | Start a run from a confirmed mandate and variant; returns `runId`                |
| `GET /api/runs/[runId]/stream?from=<seq>&speed=<x>` | Live tail or replay, same `RunEvent` lines. `from` allows resume after reconnect |
| `POST /api/runs/[runId]/fork`                       | Replay-from-round-N with one edit; returns new `runId`                           |
| `GET /api/runs/[runId]/utterances/[uid]/trace`      | Prompt blocks, retrieval trace, full deliberation (engineer level, lazy)         |
| `GET /api/passages/[segmentId]`                     | Passage, neighbours, translation, source metadata; CON guard on output           |
| `GET /api/runs/[runId]/bundle`                      | FR-T9 export (zip of NDJSON plus traces plus model assignment)                   |
| `GET /api/runs/[runId]/export?lang=de               | en`                                                                              | Self-contained HTML of the result document (FR-O4, L6) |

Page data rule: finished runs are server-rendered from `foldRun(events)`; a running run renders the snapshot so far and the client continues from `seq`. Both use the same reducer, so there is exactly one place where an event changes the screen.

---

## 4. Contracts

### 4.1 Entities (sketch for `packages/contracts/src/*.ts`)

Two rules carried from medlyn: storage schemas may use `.optional()`, but any schema sent to a model as a strict JSON schema must use `.nullable()` (strict mode requires every key; noted in `llm/client.ts`). So LLM output schemas live in `engine/llm-schemas.ts` and are mapped into these entities, never reused directly.

```ts
import { z } from "zod";

// primitives
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const Lang = z.enum(["de", "en"]);
export const AgentId = z.string().regex(/^[a-z]{2,4}$/); // gm, sv, ak, va, ka, pf, bl, pv, fm; FR-A7 adds more via config
export const SpeakerId = z.union([AgentId, z.literal("moderator"), z.literal("expert")]);
export const UtteranceId = z.string().regex(/^u\d+-\d{2,}$/); // u3-02
export const ModelId = z.string(); // gateway model id, e.g. "azure/<deployment>"

/** Original text plus translations; the record is language-independent (FR-L5). */
export const LocalizedText = z.object({
  lang: Lang, // language it was generated or published in
  text: z.string(),
  translations: z.object({ de: z.string().optional(), en: z.string().optional() }).default({}),
});

// descriptor roles: identical enum to schema/outcome-descriptor.schema.json $defs.role
export const Role = z.enum([
  "ministry_health",
  "social_insurance",
  "medical_chamber",
  "contract_physicians",
  "elective_physicians",
  "hospitals",
  "nursing",
  "patients",
  "legislature",
  "ministry_finance",
  "laender",
  "public_health",
  "chamber_commerce",
  "chamber_labour",
  "chamber_agriculture",
  "industry_pharma",
  "other",
]);

// evidence and provenance (FR-P1..P7, CON-1/2, FR-H2)
export const SourceKind = z.enum([
  "press",
  "stellungnahme",
  "sozdok",
  "statistic",
  "parliament",
  "ris",
  "audit",
]);
export const Source = z.object({
  id: z.string(), // p-18821
  kind: SourceKind,
  institution: z.object({ code: z.string(), nameDe: z.string(), glossEn: z.string(), role: Role }),
  date: IsoDate,
  datePrecision: z.enum(["day", "month", "year"]),
  outlet: z.string().nullable(), // "Der Standard", "APA-OTS", null for statute
  title: z.string().nullable(),
  legalRef: z.string().nullable(), // "ASVG § 341 Abs. 1" for SOZDOK
  url: z.string().url().nullable(),
  personFiltered: z.literal(true), // import refuses anything else
  corpusRevision: z.string(),
});
export const Segment = z.object({
  id: z.string(),
  sourceId: z.string(),
  ordinal: z.number().int(),
  start: z.number().int(),
  end: z.number().int(), // offsets into normalised source text (FR-P7)
  text: z.string(),
  textEn: z.string().nullable(),
});
export const CitationRef = z.object({
  sourceId: z.string(),
  segmentId: z.string(),
  start: z.number().int().nullable(),
  end: z.number().int().nullable(), // sub-span within the segment if known
  recencyWeight: z.number().min(0).max(1), // FR-P4, shown as "w 0.92"
});

// claims (FR-T10, FR-N1, N2, N7; addendum items 5 and 6)
export const ClaimState = z.enum(["verified", "unverified", "contradicted", "assumption"]);
export const ModelVerdict = z.object({
  model: ModelId,
  verdict: z.enum(["supported", "partial", "unsupported", "contradicted"]),
  reason: z.string(),
});
export const Claim = z
  .object({
    id: z.string(), // c-3-03-1
    utteranceId: UtteranceId,
    span: z.object({ start: z.number().int(), end: z.number().int() }), // in the original-language text
    atomicText: z.string(), // decontextualised claim that was checked
    kind: z.enum(["numeric", "factual", "legal", "normative"]),
    numeric: z
      .object({
        value: z.number(),
        unit: z.string(),
        low: z.number().nullable(),
        high: z.number().nullable(),
      })
      .nullable(),
    citations: z.array(CitationRef), // empty and state "assumption" go together (FR-P5)
    state: ClaimState,
    verifyingModels: z.array(ModelVerdict), // two families for numeric claims (FR-N7)
    decompositionModel: ModelId.nullable(), // one fixed model per run (addendum item 6)
    contradiction: z
      .object({
        withClaimId: z.string(),
        note: LocalizedText,
        resolution: z.enum(["unresolved", "resolved"]),
      })
      .nullable(),
  })
  .refine((c) => (c.state === "assumption") === (c.citations.length === 0), {
    message: "assumption iff no citation",
  });

// deliberation and traces (FR-T1..T7)
export const Deliberation = z.object({
  utteranceId: UtteranceId,
  sourcesRead: z.array(
    z.object({ ref: CitationRef, use: z.enum(["cited", "read_adverse", "read_not_cited"]) }),
  ),
  priorUtterances: z.array(
    z.object({ id: UtteranceId, relation: z.enum(["responds_to", "own", "context"]) }),
  ),
  options: z.array(
    z.object({
      key: z.string(),
      label: LocalizedText,
      pros: z.array(LocalizedText),
      cons: z.array(LocalizedText),
      status: z.enum(["chosen", "rejected"]),
      rejectReason: LocalizedText.nullable(),
    }),
  ),
  decision: LocalizedText,
  wouldChangeMind: z.array(LocalizedText),
  providerTrace: z.object({
    available: z.boolean(),
    text: z.string().nullable(),
    note: z.string().nullable(),
  }),
  schemaVersion: z.literal(2),
});
export const Telemetry = z.object({
  model: ModelId,
  latencyMs: z.number(),
  tokensIn: z.number().int(),
  tokensOut: z.number().int(),
  costEur: z.number().nullable(),
  retries: z.number().int(),
  fallbackFrom: ModelId.nullable(),
  cacheHit: z.boolean(),
  gatewayRequestId: z.string().nullable(),
  params: z.object({
    temperature: z.number().nullable(),
    maxOutputTokens: z.number().nullable(),
    seed: z.number().nullable(),
  }),
});
export const PromptBlock = z.object({
  role: z.enum(["system", "user", "assistant"]),
  title: z.string(),
  tokens: z.number().int(),
  text: z.string(),
});
export const RetrievalTrace = z.object({
  query: z.string(),
  asOf: IsoDate,
  corpusRevision: z.string(),
  candidates: z.array(
    z.object({
      segmentId: z.string(),
      bm25Rank: z.number().int().nullable(),
      vectorRank: z.number().int().nullable(),
      fused: z.number(),
      recencyWeight: z.number(),
      used: z.boolean(),
      discardReason: z.string().nullable(),
    }),
  ),
});
export const UtteranceTrace = z.object({
  utteranceId: UtteranceId,
  prompt: z.array(PromptBlock),
  retrieval: z.array(RetrievalTrace),
  deliberation: Deliberation,
});

// utterances (FR-U1, A4, A5, M4, NFR-9)
export const UtteranceKind = z.enum([
  "round_opening",
  "position",
  "rebuttal",
  "proposal",
  "position_shift",
  "justification_demand",
  "contradiction_note",
  "round_summary",
  "closing",
]);
export const Utterance = z.object({
  id: UtteranceId,
  round: z.number().int().min(1),
  seq: z.number().int(),
  phase: z.number().int().min(1).max(5),
  speaker: SpeakerId,
  kind: UtteranceKind,
  respondsTo: UtteranceId.nullable(), // required for agents after round 1 (refined in engine)
  text: LocalizedText,
  claimIds: z.array(z.string()),
  redLinesTouched: z.array(z.string()),
  model: ModelId,
  telemetry: Telemetry.nullable(),
  deliberationSummary: z
    .object({ read: z.string(), weighed: z.string(), wouldMoveIt: z.string() })
    .nullable(), // engineer strip
  degraded: z.object({ reason: z.string() }).nullable(), // NFR-9 visible marker
});

// positions and character (FR-C1, C3, C4, A5, U3, U4)
export const Topic = z.object({
  id: z.string(),
  key: z.string(),
  label: LocalizedText,
  measure: LocalizedText,
});
export const Axis = z.object({
  id: z.enum(["x", "y"]),
  label: LocalizedText,
  poles: z.tuple([LocalizedText, LocalizedText]),
  topicWeights: z.record(z.string(), z.number()), // Topic.axis definition from the mandate
});
export const Position = z.object({
  runId: z.string(),
  agentId: AgentId,
  topicId: z.string(),
  round: z.number().int().min(1),
  stance: z.number().min(-2).max(2),
  strength: z.number().min(0).max(1),
  arguments: z.array(LocalizedText),
  citations: z.array(CitationRef),
  rationale: LocalizedText,
  trigger: z.object({ utteranceId: UtteranceId, note: LocalizedText }).nullable(), // FR-A5
});
export const StanceProfile = z.object({
  role: Role,
  topicKey: z.string(),
  year: z.number().int().nullable(), // year set for FR-H3 history rows
  stance: z.number().min(-2).max(2),
  confidence: z.number().min(0).max(1),
  support: z.array(CitationRef),
  fit: z.object({
    n: z.number().int(),
    from: IsoDate,
    to: IsoDate,
    halfLifeYears: z.number(),
    method: z.literal("llm_derived_spot_checked"),
  }),
});
export const RedLine = z.object({
  id: z.string(),
  role: Role,
  text: LocalizedText,
  basis: CitationRef.nullable(),
  tier: z.enum(["deep_core", "policy_core", "secondary"]), // addendum item 6, ACF tiers
  topicKeys: z.array(z.string()),
});
export const Temperament = z.object({
  concession: z.number(),
  assertiveness: z.number(),
  coalitionAppetite: z.number(),
  riskTolerance: z.number(),
  modelBaselineConcession: z.number().nullable(),
  correctedConcession: z.number().nullable(), // FR-C5
  inertnessChecked: z.boolean(), // addendum item 11: hide the control until true
});
export const AgentConfig = z.object({
  id: AgentId,
  role: Role,
  institution: z.object({ nameDe: z.string(), glossEn: z.string(), unit: z.string() }), // "ÖÄK, Kurie niedergelassene Ärzte"
  goals: z.array(LocalizedText),
  interests: z.array(LocalizedText),
  restrictions: z.array(LocalizedText),
  budgetConstraints: z.array(LocalizedText),
  priorities: z.array(z.object({ label: LocalizedText, weight: z.number() })),
  redLineIds: z.array(z.string()),
  temperament: Temperament,
  color: z.string(),
  code: z.string().max(3),
});

// mandate and run (FR-M1..M3, X1, X2, K1, K2, V1, H2)
export const Mandate = z.object({
  question: z.string(),
  lang: Lang,
  objective: LocalizedText,
  constraints: z.array(LocalizedText),
  successMetrics: z.array(LocalizedText),
  topics: z.array(Topic),
  axes: z.tuple([Axis, Axis]),
  actors: z.array(z.object({ agentId: AgentId, reason: LocalizedText })),
  rules: z.object({
    rounds: z.number().int().min(1).max(8),
    speakingOrder: z.literal("randomised_recorded"),
    seed: z.number().int(),
  }),
  asOf: IsoDate,
  coldRatification: z.boolean(),
});
export const RunVariant = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("baseline") }),
  z.object({ kind: z.literal("permutation"), k: z.number().int(), baseRunId: z.string() }),
  z.object({ kind: z.literal("ablation_remove"), agentId: AgentId, baseRunId: z.string() }),
  z.object({
    kind: z.literal("ablation_constraint"),
    agentId: AgentId,
    constraint: z.string(),
    from: z.string(),
    to: z.string(),
    baseRunId: z.string(),
  }),
  z.object({ kind: z.literal("no_peer_control"), baseRunId: z.string() }), // FR-R7 control
  z.object({
    kind: z.literal("fork"),
    baseRunId: z.string(),
    fromRound: z.number().int(),
    edit: z.object({
      agentId: AgentId,
      removeSegmentIds: z.array(z.string()),
      addSegmentIds: z.array(z.string()),
    }),
  }),
  z.object({ kind: z.literal("backtest"), episodeId: z.string() }),
]);
export const Run = z.object({
  id: z.string(),
  createdAt: z.string(),
  mandate: Mandate,
  variant: RunVariant,
  agents: z.array(AgentConfig), // snapshot, so later config edits do not rewrite history
  modelAssignment: z.record(SpeakerId, ModelId),
  status: z.enum(["running", "completed", "failed"]),
  endCondition: z
    .object({
      id: z.enum(["convergence", "max_rounds", "deadlock", "aborted"]),
      note: LocalizedText,
    })
    .nullable(), // FR-M8
});

// rounds and proposals (FR-M6, M7, R2, R3, R4, O2)
export const RoundSummary = z.object({
  round: z.number().int(),
  openConflicts: z.array(
    z.object({
      topicId: z.string(),
      sides: z.tuple([z.array(AgentId), z.array(AgentId)]),
      boundBy: z.array(z.string()),
      note: LocalizedText,
    }),
  ),
  consensus: z.array(
    z.object({
      topicId: z.string(),
      share: z.tuple([z.number().int(), z.number().int()]),
      note: LocalizedText,
    }),
  ),
  failedProposals: z.array(z.object({ proposalId: z.string(), reason: LocalizedText })),
  newOptions: z.array(LocalizedText),
});
export const Proposal = z.object({
  id: z.string(),
  originAgent: AgentId,
  topicIds: z.array(z.string()),
  title: LocalizedText,
  cost: z
    .object({ value: z.number(), low: z.number(), high: z.number(), unit: z.string() })
    .nullable(),
  acceptance: z.number().min(0).max(1),
  feasibility: z.number().min(0).max(1),
  supporters: z.array(AgentId),
  opponents: z.array(AgentId),
  conditional: z.array(AgentId),
  status: z.enum(["open", "accepted", "rejected", "withdrawn"]),
  rejectionReason: LocalizedText.nullable(),
  outcomeClass: z.enum(["consensus", "majority", "minority", "no_result"]).nullable(),
});

// numbers on the outcome page, kept as separate types on purpose
export const ImpactFigure = z.object({
  measureId: z.string(),
  metric: z.enum(["cost_eur_pa", "sv_spend_pp", "wait_weeks_median", "posts_filled"]),
  value: z.number().nullable(),
  low: z.number().nullable(),
  high: z.number().nullable(),
  unit: z.string(),
  inputs: z.array(
    z.object({
      name: LocalizedText,
      value: z.string(),
      citation: CitationRef.nullable(),
      assumption: z.boolean(),
    }),
  ),
  formula: z.string(),
  uncertainty: LocalizedText,
  modelVersion: z.string(),
  notModelled: z.boolean(),
});
export const Forecast = z.object({
  measureId: z.string(),
  status: z.enum(["ok", "small_n", "unavailable"]),
  descriptor: z.lazy(() => OutcomeDescriptor),
  classKey: z.string(),
  n: z.number().int(),
  k: z.number().int().nullable(), // k null when small_n (FR-J3)
  interval: z
    .object({
      low: z.number(),
      high: z.number(),
      method: z.enum(["wilson", "jeffreys"]),
      level: z.number(),
    })
    .nullable(),
  analogs: z.array(
    z.object({
      caseId: z.string(),
      episodeId: z.string(),
      similarity: z.number(),
      outcome: z.string(),
    }),
  ), // k analogs, never one
});
export const RatificationVote = z.object({
  agentId: AgentId,
  verdict: z.enum(["approve", "approve_with_reservation", "reject"]),
  reason: LocalizedText,
  pressureGap: z.boolean(), // FR-V5
});
```

`OutcomeDescriptor` mirrors `schema/outcome-descriptor.schema.json` v0.1 field by field, including the `allOf` conditional:

```ts
const Tri = z.enum(["yes", "no", "unknown"]);
const Stance = z.enum(["support", "oppose", "conditional", "silent", "unknown"]);
const DescriptorBase = z
  .object({
    schema_version: z.literal("0.1"),
    case_id: z.string(),
    episode_id: z.string().optional(),
    measure_class: z.enum([
      "capacity_expansion",
      "capacity_reduction",
      "fee_change",
      "new_service",
      "service_restriction",
      "digitalisation",
      "structural_reform",
      "scope_of_practice",
      "access_rule",
      "prevention_program",
      "workforce",
      "drug_reimbursement",
      "financing_rule",
      "monitoring_reporting",
      "other",
    ]),
    cost_direction: z.enum(["increase", "decrease", "neutral", "unknown"]),
    cost_band: z.enum(["none", "low", "medium", "high", "unknown"]),
    payer: z.enum(["federal", "social_insurance", "laender", "mixed", "private", "unknown"]),
    requires_legislation: Tri,
    requires_15a_agreement: Tri,
    requires_gesamtvertrag: Tri,
    supporting_roles: z.array(Role),
    opposing_roles: z.array(Role),
    conditional_roles: z.array(Role).optional(),
    budget_authority_stance: Stance,
    laender_stance: Stance,
    medical_chamber_stance: Stance,
    contestation: z.enum(["low", "medium", "high"]),
    red_line_crossed: Tri,
    horizon_years: z.number().int().min(0).max(20).nullable(),
    evidence: z
      .array(
        z
          .object({
            doc_id: z.string(),
            date: IsoDate,
            institution_role: Role,
            passage_offsets: z.tuple([z.number().int(), z.number().int()]).optional(),
            field: z.string().optional(),
          })
          .strict(),
      )
      .min(1),
    extractor: z
      .object({
        version: z.string().optional(),
        method: z.enum(["human", "model", "model_human_reviewed"]).optional(),
        model: z.string().optional(),
        reviewed_by: z.string().optional(),
      })
      .optional(),
  })
  .strict();
export const OutcomeDescriptor = z.discriminatedUnion("origin", [
  DescriptorBase.extend({
    origin: z.literal("historical"),
    episode_id: z.string(),
    decision_date: IsoDate,
    outcome: z.enum([
      "implemented",
      "partially_implemented",
      "rejected",
      "lapsed",
      "superseded",
      "unknown",
    ]),
    outcome_record: z
      .object({
        source: z.enum([
          "parlament_gesetzgebungsverfahren",
          "ris_bgbl",
          "ris_15a",
          "rechnungshof",
          "zielsteuerung_monitoring",
          "other",
        ]),
        identifier: z.string(),
        url: z.string().optional(),
      })
      .strict(),
  }),
  DescriptorBase.extend({ origin: z.literal("simulated") }), // .strict() already forbids outcome and decision_date
]);
```

Parity test (W-03): load the JSON Schema file, and for every property assert the Zod enum values equal the JSON enum values, the required lists match, and three fixtures (one historical, one simulated, one invalid simulated with `outcome`) behave identically under both. Uniqueness of role arrays (`uniqueItems`) is a `.refine` on the base.

### 4.2 Streaming event protocol

One envelope, one union, NDJSON, one object per line:

```ts
const Envelope = {
  v: z.literal(1),
  runId: z.string(),
  seq: z.number().int().nonnegative(),
  tMs: z.number().int().nonnegative(),
};

export const RunEvent = z.discriminatedUnion("type", [
  z.object({
    ...Envelope,
    type: z.literal("run.started"),
    run: Run,
    source: z.enum(["live", "replay"]),
  }),
  z.object({
    ...Envelope,
    type: z.literal("round.started"),
    round: z.number().int(),
    phase: z.number().int(),
    speakingOrder: z.array(AgentId),
  }),
  z.object({
    ...Envelope,
    type: z.literal("utterance.started"),
    utteranceId: UtteranceId,
    speaker: SpeakerId,
    round: z.number().int(),
    respondsTo: UtteranceId.nullable(),
    model: ModelId,
  }),
  z.object({
    ...Envelope,
    type: z.literal("utterance.delta"),
    utteranceId: UtteranceId,
    text: z.string(),
  }), // optional
  z.object({
    ...Envelope,
    type: z.literal("utterance.completed"),
    utterance: Utterance,
    claims: z.array(Claim),
  }), // claims carry their initial state
  z.object({ ...Envelope, type: z.literal("utterance.trace"), trace: UtteranceTrace }), // persisted; UI stores lazily
  z.object({ ...Envelope, type: z.literal("claim.updated"), claim: Claim }), // Experte verdict, contradiction
  z.object({
    ...Envelope,
    type: z.literal("expert.note"),
    utteranceIds: z.array(UtteranceId),
    note: LocalizedText,
    resolution: z.enum(["unresolved", "resolved"]),
  }),
  z.object({ ...Envelope, type: z.literal("position.updated"), position: Position }),
  z.object({ ...Envelope, type: z.literal("proposal.updated"), proposal: Proposal }),
  z.object({ ...Envelope, type: z.literal("round.summary"), summary: RoundSummary }),
  z.object({
    ...Envelope,
    type: z.literal("agent.degraded"),
    agentId: AgentId,
    utteranceId: UtteranceId.nullable(),
    reason: z.string(),
  }),
  z.object({
    ...Envelope,
    type: z.literal("translation.ready"),
    utteranceIds: z.array(UtteranceId),
    lang: Lang,
    texts: z.record(z.string(), z.string()),
  }),
  z.object({ ...Envelope, type: z.literal("impact.computed"), figures: z.array(ImpactFigure) }),
  z.object({
    ...Envelope,
    type: z.literal("forecast.computed"),
    forecasts: z.array(Forecast),
    extractorVersion: z.string(),
  }),
  z.object({ ...Envelope, type: z.literal("ratification.vote"), vote: RatificationVote }),
  z.object({
    ...Envelope,
    type: z.literal("run.completed"),
    endCondition: Run.shape.endCondition.unwrap(),
  }),
  z.object({
    ...Envelope,
    type: z.literal("run.error"),
    message: z.string(),
    retryable: z.boolean(),
  }),
  z.object({ ...Envelope, type: z.literal("heartbeat") }),
]);
```

Rules:

1. `seq` is strictly increasing per run and starts at 0 with `run.started`; the client rejects a gap or an out-of-order line (medlyn's `readLensStream` does the same for its first event).
2. Replay re-emits stored lines unchanged except `source: "replay"` in `run.started`; it sleeps `(tMs[i] - tMs[i-1]) / speed`, capped at 1.5 s per gap so a slow live call does not make the replay drag. `speed=0` sends everything at once (instant replay, NFR-2).
3. `utterance.trace` can be large; the client reducer keeps only `traceAvailable: true` and the inspector fetches the trace by id. The file export keeps the lines, so offline replay still has full traces.
4. Ablation, permutation and control runs use the same protocol; their pages show them like any run, and comparison views read the materialised tables.
5. Every text field reaching the UI passes the CON guard in the serializer; a hit replaces the sentence with an institutional placeholder and emits a server log entry. The guard runs on generated utterance text as well as on sources, because a model can name an office holder from parametric memory.
6. `heartbeat` every 10 s keeps proxies from closing a long live run.

`foldRun` produces `RunSnapshot { run, rounds, utterances (ordered), claims (by id), positions (by agent, topic, round), proposals, summaries, expertNotes, figures, forecasts, votes, degraded, activeSpeaker, status }`. `activeSpeaker` is the tier-0 avatar hook (section 7, question 9) for free.

---

## 5. Components per screen

Shared building blocks (in `components/run/` unless noted):

| Component                                                        | Built from                                                                                                     | Used on                                           |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `AgentTile` (code tile, hue, dashed variant for the ninth agent) | plain span, tokens                                                                                             | everywhere; `lg` 28px variant for projector       |
| `SourceChip`                                                     | lifted `SourceChips` + `SourcePopover` (`Popover`, `Dialog` on narrow)                                         | transcript, agent card, inspector, effects inputs |
| `ClaimSpan` (underline by state) and `ClaimBadge`                | `Badge` variants per `ui-rules.md`; click opens `Popover` with atomic claim, cited passage, per-model verdicts | transcript, inspector                             |
| `ClaimStateLegend`                                               | `Badge` row                                                                                                    | live view header, method page                     |
| `Level` (`min="analyst"                                          | "engineer"`, `only="executive"`)                                                                               | context, no DOM                                   | all screens |
| `Term` (German form, EN gloss secondary)                         | span + `Tooltip` for the gloss only as a convenience, gloss also rendered inline in EN mode                    | all institution and legal names                   |
| `PanelFrame` (fixed viewport, loading/empty/error in place)      | adapted `tool-frame`, `Skeleton`, `Empty`, `Alert`                                                             | every card                                        |
| `RoundStepper`                                                   | `ToggleGroup`                                                                                                  | live view, analysis scrubber                      |

### 5.1 Question entry and mandate review (`/runs/new`)

`Textarea` question, `Command` palette of prepared scenarios (reference question, the 2.16 extension list), as-of `Input type=date` (FR-H2) with a note, then the streamed mandate: objective, constraints, success metrics (`Card` list), topics and the two derived axes (`Badge` per topic with axis weight), actor list as a `Table` with `Checkbox` include, reason column (FR-M2) and model `Select` per row (FR-X1, at least two families enforced with an `Alert`), rules block (rounds `Select`, speaking order "randomised, recorded" read-only), `Switch` for cold ratification (FR-V1, off by default), primary `Button` "Verhandlung starten", secondary "Referenzlauf abspielen".

### 5.2 Negotiation live view (`/runs/[runId]`)

Layout: `ResizablePanelGroup` with roster 248px, transcript, inspector 360px at 1200px and wider; below that see section 7, question 1.

- Sub-bar: question (truncated with full title), `RoundStepper` with phase label, live/replay `Badge`, `ToggleGroup` condensed/full, disclosure `ToggleGroup` (Executive/Analyst/Engineer), links to analysis and outcome.
- Roster: moderator and Experte rows, then agents in this round's speaking order (FR-M3), active speaker bar, model tag at engineer level, coalition lines at analyst level (cuttable with FR-A6).
- Transcript: `RoundSeparator`, `RoundSummaryCard` (open conflicts listed first, FR-M6, then agreement, failed proposals, new options; `Collapsible` "11 Beiträge aufklappen"), `UtteranceCard` (header: tile, name, id, reply link, kind badge, red-line badge; body with `ClaimSpan`s and `SourceChip`s; footer: claim-state counts and supported share, telemetry line at engineer level; deliberation strip at engineer level; degraded marker for NFR-9), `ExpertNote` inline after the contested utterance, `UtteranceSkeleton` with fixed header/body/footer (no pulse, no auto-scroll; a "Neue Beiträge" pill instead).
- Executive level: `ExecutiveSummary` card (latest round summary) and `AgreementMeters` (one `Progress` per topic with "7 von 9"), transcript hidden.
- Inspector panel: selected utterance; claims list with states; sources with recency weight; deliberation record (`ChainOfThought` shell); engineer adds model and gateway block; "Vollständig öffnen" to the inspector page.

### 5.3 Agent card (`/runs/[runId]/agents/[agentId]`)

Agent switcher `ToggleGroup` of nine tiles, translation `Switch`. Cards: stance profile per topic (horizontal bar from -2 to +2 with fitted bar and simulated tick, confidence number, `Collapsible` passages with `SourceChip`, recency weight, DE text and EN translation), red lines (`Card` rows with legal basis chip, tier `Badge`, "in Runde 3 durch u3-02 berührt" link), current position and change log (`Timeline` adapted, each change linked to its trigger utterance, FR-A5), playing model and its calibration, temperament (four labelled meters with the model baseline and the FR-C5 correction; hidden behind an `Alert` "Wirkung nicht nachgewiesen" until `inertnessChecked`), register fingerprint (cut candidate, FR-C2), few-shot exemplar (cut, FR-C6), position fidelity (FR-J13, one number plus per-topic divergence), goals and priorities with weights (FR-U8, small bar list).

### 5.4 Deliberation inspector (`/runs/[runId]/inspect/[utteranceId]`)

Utterance quote at top with prev/next `ButtonGroup`, "Als JSON kopieren", "Bundle exportieren". `Tabs` are avoided for the four layers because the mockup stacks them and the demo walks them in order (record, prompt, retrieval, model); instead stacked `Card`s with a sticky in-page `Toggle` nav. Cards: deliberation record (sources read with usage badges, prior utterances, decision, would change its mind, options weighed as a three-column grid with chosen/rejected badges, provider trace note FR-T3), exact prompt (blocks in `Collapsible`, token counts, monospace `pre`; shiki only if time allows, plain is fine for prose prompts), retrieval trace (`Table`: rank columns bm25/vector/fused, recency weight, used or discard reason, as-of date and corpus revision in the header, FR-T6, FR-H2), prior utterances in context, model and parameters, gateway telemetry (latency, tokens, cost, retries, fallback, request id; a recharts stacked bar for time shares is optional), number check (per claim, both models' verdicts, FR-N7), record integrity (hash of the event line).

### 5.5 Analysis (`/runs/[runId]/analysis`)

- Trajectory card: `TrajectoryChart` (custom SVG, section 5.6), historical overlay `Switch`, round scrubber `Slider` plus play `Button`, legend as focus buttons (one tile per agent, `aria-pressed`), annotation line "R3: VÄ bewegt sich, Auslöser u3-02" under the chart.
- Consensus matrix: shadcn `Table` inside `ScrollArea` with sticky topic column; cells are buttons (open the position with its trigger in a `Popover`); neutral alpha ramp for support, CSS diagonal hatch for opposition, printed number always, red dot for a red-line-bound cell, row status label (Konsens 8/9, Mehrheit, Minderheit, offen) per the FR-O2 rule printed below; `ToggleGroup` "Stand Runde 5" / "Veränderung R1 bis R5"; bottom row "Bewegung (Summe |Δ|)".
- Who moved: ranked list with path length, round of largest step, trigger link.
- Open conflicts: cards with the two sides, stance distance, binding red lines (AC 6, checked against the moderator summary, FR-M7).
- Debate dynamics panel (proposed FR-R7): four small multiples (stance change net of the no-peer control, peer-reference rate, argument novelty, concession events), x = round, one line per agent with the focused agent highlighted (shared focus state with the trajectory), held red lines shown as a fifth row of counts so refusal also reads as dynamic behaviour (addendum tension 2). If no control run exists, the first panel shows an `Empty` "Kontrolllauf fehlt" rather than raw change.
- Coalitions table (cut with FR-A6).

### 5.6 Charting choice

| View                                      | Choice                                                                                | Why                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Position-space trajectory (FR-U3, H3)     | Custom SVG React component, `d3-scale` for the two linear scales only                 | Needs direct end labels with collision nudging, focus-dim of eight paths, a dotted per-year overlay for one agent, round scrubbing that animates points along existing paths, and keyboard focus per agent. Recharts scatter-with-line can draw the paths but fights every one of those; React Flow is a node-graph editor and the wrong abstraction. The mockup's `gen_charts.py` already defines the geometry, so the port is mechanical |
| Debate dynamics small multiples (FR-R7)   | recharts 3.8.0 `LineChart` in medlyn's `ChartContainer`, four charts sharing `syncId` | Plain line charts; synced crosshair across panels; values also printed in a compact table below so nothing depends on hover (NFR-7)                                                                                                                                                                                                                                                                                                        |
| Ablation ranking (FR-K3)                  | recharts horizontal `BarChart`, diverging from zero                                   | Measured deltas as bars; FR-K5 warning sits above as an `Alert`                                                                                                                                                                                                                                                                                                                                                                            |
| Robustness map (FR-X4)                    | `Table` grid with survival fraction cells ("9/10")                                    | It is a table, not a chart                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Calibration footnote (FR-X5)              | `Table`                                                                               | Directly under the robustness grid                                                                                                                                                                                                                                                                                                                                                                                                         |
| Forecast glyphs (FR-J4)                   | ten-dot SVG glyph, inline component                                                   | Mandated phrasing plus a glyph, no axis                                                                                                                                                                                                                                                                                                                                                                                                    |
| Agreement meters, priorities, temperament | `Progress` and plain bars                                                             | No chart library                                                                                                                                                                                                                                                                                                                                                                                                                           |

Agent identity is colour plus code plus name, never colour alone (mockup rule); the ninth agent is neutral ink with a dashed path.

### 5.7 Outcome (`/runs/[runId]/outcome`)

Header with links to analysis, export DE, export EN, new question. Four `Tile`s (outcome classes count, package SV spend with range and cap, waiting-time median with range, forecast package line). Effects table (`Table` in `ScrollArea`, sticky measure column): status badge, cost with range, deltas with ranges, an "Annahmen" `Collapsible` per row with inputs (source chip or "Annahme" badge), formula in monospace, uncertainty method, verification counts, impact model version and test count (FR-N3 to N6). Forecast block: realism banner of three tiles (outcome plausibility: measured as base rate; position fidelity: computed; process realism: not measured, FR-J14), then one sentence per measure in the mandated phrasing "in k von n vergleichbaren Fällen umgesetzt" with interval, class descriptor chips, k analogs, small-n `Alert` instead of a rate when n < 5 (FR-J3), method note link. Robustness grid plus calibration table. Ablation card with the FR-K5 warning above the bars, and the forecast of the ablation variant beside the baseline (AC 17c). Cold ratification card with its `Switch` in the header, 3x3 tile grid of verdict badges in projector mode, concession-under-pressure marker (FR-V5), empty state naming the cost of enabling it.

### 5.8 Result document (`/runs/[runId]/result`)

Eight numbered `section`s matching the brief (question, agents and institutions, course and arguments, conflict analysis, compromise proposals, consensus analysis, open disputes, expected effects), each built from the snapshot, never newly generated. A "Volle Debatte" link in section 3 goes to `/runs/[runId]?view=full` (two clicks from the outcome page via "Ergebnisdokument", AC 12). Print stylesheet; export renders the same component server-side into a self-contained HTML file per language.

---

## 6. Build order

Sizes: S is two hours or less, M is half a day. Lanes: F foundation (blocking), A live view and provenance, B character and analysis, C entry, outcome and result, I integration with engine and data. Every ticket lists the requirement IDs it closes; never-cut IDs are in bold. Tickets 1 to 28 are never-cut or M-priority core. Tickets 29 onward follow the PRD 10.3 cut order and are listed in reverse cut order, so the first cut items are built last.

### 6.1 Foundation (lane F, two people, about 1.5 days)

| #    | Ticket                                                                                                                                                                                                                                                                           | Size | Closes                                       | Depends    |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | -------------------------------------------- | ---------- |
| W-01 | Repo scaffold from medlyn layout: root scripts, workspace, turbo, biome, husky, tsconfig, empty `apps/web`, `packages/{contracts,db,engine}`. README records the medlyn reuse grant and the inherited-vs-built boundary                                                          | S    | CON-6, CON-7                                 | none       |
| W-02 | `docker-compose.yml` (pgvector pg17, Bifrost), `packages/db` node-postgres client, drizzle config, base migration (`vector`, FTS column)                                                                                                                                         | S    | FR-H1 groundwork                             | W-01       |
| W-03 | `packages/contracts` v1 per section 4 plus `foldRun`, JSON Schema export script, OutcomeDescriptor parity test                                                                                                                                                                   | M    | **FR-J9**, FR-T10 types                      | W-01       |
| W-04 | Fixture run: transcribe the mockup sample (nine agents, five rounds, 48 utterances, ids u3-02 etc., one contradiction, one assumption chain, one position change, three red-line conflicts, ablation sentence) into `runs/fixture-reference.ndjson`; vitest validates every line | M    | enables lanes A to C without the engine      | W-03       |
| W-05 | `apps/web` shell: lifted `ui/*`, tokens, fonts, `next-themes`, top bar (language switch visible, disclosure control, settings menu with theme and projector mode), typed dictionaries, `Term`, locale and level cookies read in the root layout                                  | M    | **FR-L1**, **FR-L4**, **FR-T8** frame, NFR-8 | W-01       |
| W-06 | Run loader (DB or NDJSON file), `/api/runs/[id]/stream` with replay speed and `from`, `NdjsonBuffer`, `useRunStream`, server snapshot rendering                                                                                                                                  | M    | NFR-2, AC 19                                 | W-03, W-04 |

### 6.2 Never-cut core (lanes A, B, C in parallel, one person each)

| #    | Lane | Ticket                                                                                                                                                                                                  | Size | Closes                                                                            | Depends                                   |
| ---- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------- | ----------------------------------------- |
| W-07 | A    | Source flow: lift `sources/*`, chip label `institution · date · outlet`, SOZDOK variant, `/api/passages/[segmentId]` with DE original and EN translation, serializer CON guard                          | M    | **FR-P2**, FR-P7, **FR-L3**, **CON-1/2**                                          | W-05, W-06                                |
| W-08 | A    | `ClaimSpan`, `ClaimBadge`, claim popover (atomic claim, passage, per-model verdicts), state legend, "Annahme" rendering                                                                                 | S    | **FR-P5**, FR-T10, FR-N7 display                                                  | W-07                                      |
| W-09 | A    | Live view layout: resizable three columns, roster with speaking order and active speaker, round stepper, utterance cards with reply links, round separators, skeletons, "Neue Beiträge" pill            | M    | FR-U1, FR-A4, FR-M3, NFR-1                                                        | W-06                                      |
| W-10 | A    | Condensed vs full debate: moderator summary cards (conflicts first), collapsible rounds, full mode with round outline in the left column, Experte notes, degraded marker                                | M    | **FR-T4**, FR-M6, FR-M7, FR-N2, NFR-9, AC 12                                      | W-09                                      |
| W-11 | A    | Disclosure restructuring: executive summary and agreement meters, analyst default, engineer strip and telemetry line                                                                                    | S    | **FR-T8**, AC 11                                                                  | W-10                                      |
| W-12 | A    | Inspector side panel: claims, sources with recency weight, deliberation record, model block at engineer level                                                                                           | M    | **FR-T1**, FR-T5 (panel), FR-P4                                                   | W-08                                      |
| W-13 | A    | Inspector page: prompt blocks, retrieval trace table with as-of date, prior utterances, telemetry, number check, copy JSON                                                                              | M    | FR-T5, FR-T6, FR-T7, **FR-H2** display, AC 10                                     | W-12                                      |
| W-14 | A    | CON guard check: vitest plus Playwright pass that renders every fixture route in both languages and fails on a person-name pattern match (pattern list from the data track's guard)                     | S    | **CON-1**, **CON-2**, AC 4                                                        | W-10                                      |
| W-15 | B    | Agent card part 1: stance profile per topic (fitted vs simulated) with passages, red lines with legal basis and tier                                                                                    | M    | **FR-C1**, **FR-C3**, **FR-P1**, **FR-P3**, FR-C7, AC 3, AC 9                     | W-07                                      |
| W-16 | B    | Agent card part 2: current position and change log with triggers, playing model, temperament (gated by `inertnessChecked`), position fidelity, goals and priorities                                     | M    | FR-U2, FR-A5, FR-C4, FR-C5, **FR-J13**, FR-U8, AC 17b                             | W-15                                      |
| W-17 | B    | `TrajectoryChart`: mandate axes, nine paths, direct labels, focus, round scrubber, trigger annotation                                                                                                   | M    | **FR-U3**, AC 5, AC 8                                                             | W-06                                      |
| W-18 | B    | Consensus matrix with Stand/Delta toggle, hatch, red-line dots, row status, sticky column                                                                                                               | M    | FR-U4, FR-O2                                                                      | W-06                                      |
| W-19 | B    | Who moved, open conflicts cards                                                                                                                                                                         | S    | FR-U4, FR-R2, AC 6                                                                | W-18                                      |
| W-20 | C    | `/runs/new`: question, scenario palette, as-of date, streamed mandate review, actors with reasons, model assignment per agent with two-family check, cold ratification switch, start and replay buttons | M    | FR-U7, FR-M1, FR-M2, FR-X1, FR-X2, FR-V1, AC 2, AC 13                             | W-05 (fixture mandate until engine lands) |
| W-21 | C    | Outcome page frame, four tiles, effects table with assumptions, formula, ranges                                                                                                                         | M    | FR-U6, **FR-N3**, FR-N4, FR-N5, AC 7                                              | W-06                                      |
| W-22 | C    | Forecast block: mandated sentence, interval, small-n warning, descriptor chips, k analogs, three-tile realism banner, method link                                                                       | M    | **FR-J6**, FR-J3, FR-J4, **FR-J14**, AC 17                                        | W-21                                      |
| W-23 | C    | Ablation card: FR-K5 warning above, delta bars, power ranking, forecast for the ablation variant beside baseline                                                                                        | M    | **FR-K1**, **FR-K2**, **FR-K3**, FR-K5, AC 15, AC 17c                             | W-21                                      |
| W-24 | C    | Result document, eight parts, "Volle Debatte" link, print CSS                                                                                                                                           | M    | FR-O1, FR-O2, FR-O3, AC 1, AC 12                                                  | W-10, W-21                                |
| W-25 | C    | `/method`: method note (Brier vs status quo, class sizes, ablation verdict incl. "inconclusive at this N", regime caveat), model palette with NFR-10 smoke results, inherited-vs-built statement        | S    | FR-J5, **FR-J7** finding display, **FR-J12** statement, **NFR-10** display, CON-6 | W-05                                      |
| W-26 | A    | Utterance localisation: render by selected language from `translations`, "Übersetzung ausstehend" badge, glossary terms in both modes                                                                   | S    | **FR-L2**, FR-L5, AC 18                                                           | W-10                                      |

### 6.3 Integration (lane I, with the engine and data owners)

| #    | Ticket                                                                                                                                                                                                                    | Size | Closes                                        | Depends                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | --------------------------------------------- | ------------------------------------------- |
| W-27 | JSONL importers in `packages/db` for sources, segments (with FTS and embeddings via Bifrost), stance profiles, red lines, historical descriptors, method note; row-level Zod validation, fail on missing `personFiltered` | M    | **FR-H1**, **FR-C1** data path, **CON-1/2**   | W-02, W-03, first JSONL from the data track |
| W-28 | Live run wiring: `POST /api/mandate`, `POST /api/runs` start the engine runner in-process, events persisted then streamed; reconnect via `from`; forecasting CLI bridge at run end with `unavailable` fallback            | M    | FR-U7 live, AC 2, AC 13, **FR-J10** call path | engine runner, W-06                         |

W-28 is the only ticket that waits on the engine. Everything before it runs on the fixture and on the cached reference run once the engine exports one.

### 6.4 Should and could, in reverse cut order (build top to bottom, cut bottom to top)

| #    | Ticket                                                                                                                    | Size | Closes                                   | Cut position (PRD 10.3)                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------- | ---- | ---------------------------------------- | -------------------------------------------------------------------------------- |
| W-29 | Historical overlay on the trajectory for the focused agent                                                                | S    | FR-H3                                    | not in the cut list (S); keep                                                    |
| W-30 | Debate dynamics panel (needs the no-peer control run)                                                                     | M    | proposed FR-R7, addendum item 2 for AC 5 | proposed, not yet in the PRD; build after W-29                                   |
| W-31 | Cold ratification card                                                                                                    | S    | FR-V1 to V5, AC 16                       | not in the cut list; M-priority group                                            |
| W-32 | Run list grouped by variant                                                                                               | S    | FR-X2, FR-K4                             | not in the cut list                                                              |
| W-33 | Bundle export                                                                                                             | S    | FR-T9                                    | not in the cut list (S)                                                          |
| W-34 | Projector mode (font scale, inspector as overlay, `lg` tiles, matrix one number per cell, no streaming cursor)            | S    | NFR-7                                    | not cuttable for the demo                                                        |
| W-35 | Replay-from-round-N: fork dialog on a round separator (edit one agent's evidence), compare route with parent paths dashed | M    | addendum item 11 (C), FR-R5              | add to cut list after FR-H4/H5                                                   |
| W-36 | Analog finder detail popover (k nearest episodes)                                                                         | S    | FR-H4                                    | last in cut list                                                                 |
| W-37 | Robustness grid plus calibration footnote                                                                                 | M    | FR-X4, FR-X5, AC 14                      | cut together with FR-X3 and FR-C5 (coupling rule)                                |
| W-38 | Export DE/EN self-contained HTML                                                                                          | S    | FR-O4, FR-L6                             | cut before FR-H8 to H11                                                          |
| W-39 | Register fingerprint and few-shot exemplar cards                                                                          | S    | FR-C2, FR-C6                             | FR-C6 then FR-C2                                                                 |
| W-40 | Coalition table and roster coalition lines                                                                                | S    | FR-A6                                    | cut early                                                                        |
| W-41 | Conflict map                                                                                                              | S    | FR-U5                                    | cut early; the open-conflicts cards and the matrix movement row cover most of it |
| W-42 | Avatar tier 0 (amplitude bars on `activeSpeaker`)                                                                         | S    | FR-S4                                    | cut first                                                                        |

### 6.4a Added 2026-11-05: dashboard, replay player, evidence archive

Requested by the team after the first plan. The dashboard and replay ride on contracts that already exist (`RunSummary`, `RunEvent` with `from` and `speed`), so they are cheap. The archive is new surface but mostly reads tables that W-27 already imports.

| #    | Ticket                                                                                                                                                                                         | Size | Closes                       | Depends                                          |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---------------------------- | ------------------------------------------------ |
| W-43 | Dashboard at `/`: run grid with outcome badge, agreement share, who moved most, filters, pinned reference run, Replay and Fork actions (absorbs W-32)                                          | M    | NFR-2, FR-X2, FR-K4          | W-05, `RunSummary` extension                     |
| W-44 | Replay player `/replay/[runId]`: speed, scrubber with round markers and position-change ticks, jump-to, reuses live-view components                                                            | M    | NFR-2, demo safety           | W-06, live view tickets                          |
| W-45 | `/archive` search: one query over FTS and vectors, facets, as-of slider that calls the same eligibility function the engine uses (FR-H2), so the archive shows exactly what an agent could see | M    | FR-H1, FR-H2, FR-P1          | W-27                                             |
| W-46 | Source detail with licence line, original link, masked-span markers, "used in" and "trained on" backlinks                                                                                      | S    | FR-P1, FR-P3, FR-T2, CON-1/2 | W-45, `CitationUse`, `TrainingMembership` tables |
| W-47 | Per-agent evidence shelf with training manifest and fidelity score                                                                                                                             | S    | FR-C1, FR-J13                | persona/classifier track, W-46                   |
| W-48 | Episode page: ME to RV to BGBl to VfGH timeline, Stellungnahmen side by side, text-reuse highlights                                                                                            | M    | FR-H7, FR-H13, FR-J1a        | forecasting registry import, reuse spans         |
| W-49 | Stats catalogue page                                                                                                                                                                           | S    | FR-N3                        | data/STATS.md import                             |

| W-50 | Setup room `/runs/new` replaces the plain question entry: template picker (brief transfer list), roster with moderator-suggested parties and reasons, toggles for optional agents (FR-A9), per-agent model and temperament, starting-position preview, rules (decision rule, round limit, budget ceiling, as-of date) and room climate (cooperative to confrontational, time, budget and public pressure, scheduled event injections) | M | FR-U9, FR-U10, FR-M1 | W-05, mandate route |
| W-51 | Strategic panel on the agent card (FR-A10: leverage, veto status and BATNA, coalition options, dependencies, incentives per proposal, cooperation vs blockade) | S | FR-A8, FR-A10 | engine strategic assessment |
| W-52 | Coalition graph and incentive matrix on `/runs/[runId]/analysis` (proposal by institution, payoff sign, veto players marked, minimal winning coalitions, who blocks) | M | FR-A6, FR-A11 | W-51 |
| W-53 | Lesson cards per round in the transcript, and an inspector link from a lesson to the later utterances it changed | S | FR-R5, FR-R8 | engine round learning |
| W-54 | Entity link layer: one `<EntityLink>` component with hover preview for every entity type, backlinks block on every entity page, global command palette search over all types | M | FR-T12 | W-27, W-45 |

Rules for the archive, because it is the one screen that shows source text at volume:

- **Only name-masked text is ever served.** The archive reads the same `personFiltered` rows as the engine; raw PDFs never reach the app. Masked spans are shown as a visible marker so the masking is itself transparent (CON-1/2).
- **Link out, do not republish.** Stellungnahmen PDFs belong to the institutions (data-sources.md: quote with attribution, not wholesale). The archive shows extracted, masked text for search and context plus a prominent link to the parlament.gv.at original, and offers no bulk download. Press items (APA-OTS and the 71 GB archive) show metadata and short snippets only until open question 10 is answered.
- **The as-of slider is the transparency story.** It turns FR-H2 from a backend rule into something the jury can drag: set the date to the SV-OG first draft and watch later documents grey out.

### 6.5 Parallelism

After W-01 to W-06, three people can work without touching each other's files: lane A owns `components/run/` and `components/sources/`, lane B owns `components/agent/` and `components/analysis/`, lane C owns `app/runs/new`, `components/outcome/`, `components/result/`, `app/method`. W-03 and W-04 are the only shared artefacts; changes to them go through one owner. Lane I can start W-27 as soon as the data track produces its first file. With one UI person (the PRD's default), take lane A, then B (W-15, W-17, W-18), then C (W-21, W-22, W-23, W-24), then the rest.

---

## 7. Open layout questions (mockups/README.md)

1. **Inspector versus transcript below 1200px.** At 1200px and wider: three resizable panels with persisted sizes. Below 1200px: the roster collapses to the 56px rail of code tiles (speaking order still readable as tile order, active speaker still marked), and the inspector becomes a right `Sheet` opened by selecting an utterance. Coalitions move off the live view to the analysis page, which is where FR-A6 belongs and is cuttable anyway. Projector mode uses the same sheet behaviour at every width, as the README's projector notes recommend.
2. **Where the full debate lives.** Same route, `?view=full`. In full mode the left column swaps the roster for a round outline: rounds as collapsible groups, utterance rows with tile, id and kind, an agent filter, and counts per round. Selecting a row scrolls the transcript (explicit user action, so not "auto-scroll"). 48 cards need no virtualisation. Condensed mode is the default at executive and analyst levels; engineer opens full.
3. **Executive level content.** On the live view: interim result (open conflicts first), agreement meters, and the single most binding open conflict. The forecast sentence stays on the outcome page only: it does not exist until the run ends, and keeping it there preserves the "four kinds of numbers stay apart" rule. When the run completes, the executive view shows one "Ergebnis liegt vor" card linking to outcome and result.
4. **Nine paths on one trajectory.** Focus behaviour is the default: all nine simulated paths drawn, eight dimmed when one is focused, historical overlay only for the focused agent, presenter drives the scrubber, the trigger annotation is the text the room reads. Small multiples are not built (no ticket); revisit only if the overlay is unreadable on the real data.
5. **Matrix with more than nine actors.** Build the sticky topic column and horizontal `ScrollArea` from the start (W-18); it costs one CSS rule and makes FR-A7 safe.
6. **Effects table at 1024px.** Keep the table, scroll horizontally inside the card with a sticky measure column. Column comparison is the point of the table. In projector mode, ranges move under the value inside the cell to reduce columns.
7. **Language switch coverage.** Both affordances, with clear roles. The global switch governs chrome, labels, badges, notes and utterances (FR-L2, rendered from stored translations, so no re-run, FR-L5). Source passages always show the German original first (FR-L3); in EN mode the translation is shown beneath it by default, in DE mode it is behind the per-passage DE/EN toggle that medlyn's `SourceLanguageToggle` already provides inside the one source popover. Institution and legal names keep the German form with the gloss secondary (FR-L4).
8. **Theme toggle placement.** Into a settings `DropdownMenu` in the top bar (theme Auto/Hell/Dunkel, projector mode, replay speed). The language switch and the disclosure control stay visible in the top bar because the demo uses both on stage (script steps 4 and 10).
9. **Avatar stage.** Not planned beyond tier 0. `RunSnapshot.activeSpeaker` already drives the roster's active row; amplitude bars are W-42 and first to be cut.

Additional finding while reading the mockups: `outcome.html` still describes the forecast as a learned model ("gelernt aus 312 gelabelten historischen Fällen", "Model Card", "Descriptor-Schema v1.2") and prints "7 von 10" next to "n = 34". PRD v2.7 replaced that with reference-class base rates, schema v0.1 and a method note, and the sentence must read "k von n" with n the class size. Implement from the PRD, not from the mockup text.

---

## 8. Risks and unknowns

Versions below are read from medlyn's `apps/app/package.json` and `packages/engine/package.json` at commit `eea5eec`, not from memory: `next` ^16.4.3, `react`/`react-dom` ^19.3.1, `ai` ^7.0.157, `@ai-sdk/openai` ^4.0.105, `@ai-sdk/react` ^4.0.161, `zod` ^4.1.0, `drizzle-orm` ^0.44.0, `drizzle-kit` ^0.31.0, `tailwindcss` ^4.3.3, `shadcn` ^4.23.0, `recharts` 3.8.0 (exact pin), `react-resizable-panels` ^4.15.2, `@tanstack/react-table` ^9.3.1, `@xyflow/react` ^12.12.0, `next-themes` ^0.4.6, `streamdown` ^2.7.1, `shiki` ^4.5.0, `motion` ^14.8.0, `lucide-react` ^1.64.0, `vitest` ^3.2.0, `typescript` ^5.9.0, pnpm 10.18.0, turbo ^2.5.0, biome ^2.6.4.

| #   | Risk                                                                                                                                                                                                                                                                                             | Evidence                                                                                                          | Mitigation                                                                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **Bifrost compatibility of the AI SDK path.** `@ai-sdk/openai` v4 defaults to the Responses API; medlyn deliberately calls `provider.chat(model)` (Chat Completions). Bifrost's OpenAI-compatible surface for streaming, strict `json_schema` and reasoning passthrough is unconfirmed (PRD 5.1) | `apps/app/app/api/chat/route.ts` line 131                                                                         | Always `provider.chat()`. Structured output through medlyn's `structured()` (strict `json_schema`, one retry). UI streams per utterance, so a model that cannot stream structured output still works. NFR-10 smoke test before any role assignment |
| R2  | **Retrieval does not scale as lifted.** `pg_search` is absent from the pgvector image, so `bm25.ts` falls back to in-process BM25 that loads every eligible segment per query; `store.ts` and `scope.ts` pass every eligible document id into SQL and re-check each one                          | `search/bm25.ts`, `search/README.md`, `store.ts`                                                                  | Postgres FTS (`german`) with GIN as the lexical branch; date predicate instead of id lists; keep the as-of invariant test. ParadeDB image is a fallback option but its SQL changed after v0.15, which `bm25.ts` targets                            |
| R3  | **No structured-output or embedding usage of AI SDK v7 to copy.** medlyn uses no `generateObject`/`Output`/`embedMany`; embeddings call Gemini directly (`GEMINI_API_KEY`, 768 dims)                                                                                                             | grep over `apps/app/app` and `packages/engine`                                                                    | Treat `embedMany` through Bifrost as new code with its own smoke test; request `dimensions: 768` or migrate the column. Keep BM25-only as the degraded mode (hybrid already tolerates vector failure)                                              |
| R4  | **OutcomeDescriptor label mismatch.** The schema's `outcome` enum is implemented, partially_implemented, rejected, lapsed, superseded, unknown; FR-J1a names implemented, implemented_modified, not_implemented, target_outcome                                                                  | `schema/outcome-descriptor.schema.json`, PRD FR-J1a                                                               | Contracts follow the schema file (frozen before labelling). Raise with the forecasting owner before W-22; the forecast sentence only needs "implemented" and the class size                                                                        |
| R5  | **Topic keys do not line up.** Fitted stance profiles need a fixed topic taxonomy; the mandate derives topics per question                                                                                                                                                                       | PRD 6.1 Topic, FR-C1                                                                                              | `Topic.key` maps each mandate topic to a taxonomy key from the data track; the agent card shows "kein gefittetes Profil für dieses Thema" when unmapped. Agree the taxonomy with the data track early                                              |
| R6  | **Person names in generated text.** The CON guard is specified for archive text, but models can name office holders from parametric memory                                                                                                                                                       | PRD 3.1, addendum item 9                                                                                          | Guard in the event serializer for all text, plus W-14 render-level test in both languages                                                                                                                                                          |
| R7  | **react-resizable-panels v4 and TanStack Table v9 API changes.** v4 renamed the exports; medlyn's `ui/resizable.tsx` already uses `Group`; TanStack v9 is declared but never used                                                                                                                | `components/ui/resizable.tsx`, grep                                                                               | Lift `resizable.tsx` instead of regenerating it with the shadcn CLI; do not adopt TanStack Table                                                                                                                                                   |
| R8  | **Next 16 specifics.** Middleware is `proxy.ts`; route handler `params` are Promises; Turbopack root set explicitly in a monorepo; workspace packages export raw `.ts` with `transpilePackages`                                                                                                  | `apps/app/proxy.ts`, `api/passage/[segmentId]/route.ts`, `next.config.ts`, `packages/engine/package.json` exports | Copy these exact patterns; `erasableSyntaxOnly` means no TS enums in shared packages                                                                                                                                                               |
| R9  | **Live translation for FR-L2.** Agents speak in one language; showing the other needs a translation pass per round, which adds latency to the three-minute target (NFR-1)                                                                                                                        | FR-L2, FR-L5                                                                                                      | Translate per round in the background, show "Übersetzung ausstehend"; the cached run ships with both languages                                                                                                                                     |
| R10 | **Forecasting CLI on the demo laptop.** The live path needs `uv` and the forecasting package locally; the cached run does not                                                                                                                                                                    | section 2.2                                                                                                       | `forecast.computed` with `status: "unavailable"` renders an honest notice; rehearse with the CLI present                                                                                                                                           |
| R11 | **Temperament may be inert.** Opposite settings may not move positions (addendum item 11)                                                                                                                                                                                                        | papers-addendum Part III                                                                                          | UI hides the temperament control behind `inertnessChecked`                                                                                                                                                                                         |
| R12 | **No medlyn i18n to inherit.** medlyn hard-codes English and `lang="en"`                                                                                                                                                                                                                         | `app/layout.tsx`, grep                                                                                            | Typed dictionaries from day one (W-05); every string through them, checked by a test that DE and EN have the same keys                                                                                                                             |

Unknowns to settle with other tracks before the matching ticket: JSONL file names and fields (W-27), the forecasting CLI arguments and output (W-28), the topic taxonomy (W-15), the guard's pattern list (W-14), and whether the engine emits `utterance.delta` at all (W-09 works either way).
