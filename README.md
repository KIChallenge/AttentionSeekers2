# HealthPolicy Simulator (UC2, KI Challenge)

Transparent multi-agent LLM simulation of Austrian health-policy negotiations. Nine
institutional agents (Gesundheitsministerium, Sozialversicherung, Ärztekammer,
Vertragsärzt:innen, Krankenanstalten, Pflegevertretung, Bundesländer,
Patientenvertretung, Finanzministerium) negotiate a question under a moderator, with every
claim traced to a dated institutional source. Institutions only: no real person is
represented or quoted (CON-1/CON-2).

## Solution and approach

- **One event protocol.** The engine emits a stream of `RunEvent`s (NDJSON, Zod-validated,
  `packages/contracts/src/events.ts`). Live runs and replays use the same lines; a replay
  re-emits stored events with their recorded timing (`?speed=`).
- **One reducer.** `foldRun(events)` in `@sv/contracts` turns events into a `RunSnapshot`.
  Server pages and the streaming client both use it.
- **Game-theoretic layer.** Per agent per round a `StrategicAssessment` (leverage, veto
  status, BATNA, coalition options, dependencies, incentives per proposal, cooperation vs
  blockade); per round a moderator `CoalitionCalculus` (veto players, minimal winning
  coalitions, blockers); per agent per round a `RoundLesson` fed into the next round.
- **Setup room.** `RoomConfig` records template, parties, per-agent model and temperament,
  decision rule, round limit, budget ceiling, as-of date, climate, pressures and injected
  events, so every run is reproducible.
- **Evidence.** Postgres 17 + pgvector, German full-text search plus embeddings; the as-of
  date limits what an agent can retrieve (FR-H2).

Design documents: `docs/ui-plan.md`, `docs/coverage-matrix.md`, PRD `uc2-requirements.md`.

## Repository layout

```
apps/web            Next.js 16 app (dashboard, setup room, run, replay, archive)
packages/contracts  Zod schemas, RunEvent protocol, foldRun, agent catalog, JSON Schema export
packages/db         drizzle-orm/node-postgres schema, migrations, run store, JSONL importers
packages/tsconfig   shared TS configs
runs/               cached runs as NDJSON (fixture-wartezeiten.ndjson = reference fixture)
data/, forecasting/ Python tracks (data preparation, reference-class forecasting)
```

## Dependencies and prerequisites

- Node.js 24+ (scripts run TypeScript directly via Node type stripping), pnpm 10
- Docker (for Postgres 17 + pgvector), optional: the app replays from `runs/` without it
- An OpenAI-compatible gateway (Bifrost or similar) for live runs
- Python 3.12 + uv for the `data/` and `forecasting/` tracks (see their READMEs)

## How to run

```bash
pnpm install
cp .env.example .env          # fill in the gateway URL and key for live runs
pnpm db:up                    # pgvector container on 127.0.0.1:55432
pnpm db:migrate               # apply migrations
pnpm db:import                # fixture sources (+ track JSONL files when present)
pnpm runs:load                # load runs/*.ndjson into run_events and read models
pnpm dev                      # http://localhost:3000
```

Checks: `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm lint`.
Regenerate the fixture run: `pnpm fixture`. Export JSON Schema for the Python tracks:
`pnpm contracts:schema` (writes `packages/contracts/schema/`).

Replay API: `GET /api/runs/<runId>/stream?from=<seq>&speed=<x>` (NDJSON; `speed=0` sends
everything at once). Run list: `GET /api/runs`.

## Configuration

| Variable                     | Purpose                                                           |
| ---------------------------- | ----------------------------------------------------------------- |
| `OPENAI_COMPATIBLE_BASE_URL` | Gateway base URL for all model calls                              |
| `OPENAI_COMPATIBLE_API_KEY`  | Gateway key (never committed)                                     |
| `DATABASE_URL`               | Postgres connection; if unreachable the app falls back to `runs/` |
| `SV_REPLAY_DIR`              | Directory with cached `*.ndjson` runs (default `runs`)            |
| `SV_FORECAST_CMD`            | Optional forecasting CLI called once at the end of a live run     |

## Known limitations and open points

- The negotiation engine (`packages/engine`) is not in this foundation; the fixture run
  `runs/fixture-wartezeiten.ndjson` is illustrative (plausible placeholder numbers and
  source ids), not a real simulation result.
- Screens beyond the dashboard are stubs; see the lane tickets in `docs/ui-plan.md` 6.
- JSONL importer field names for the data track are provisional; Stellungnahmen import
  requires `--assume-masked` after checking `data/derived/masking_summary.json`.
- Embeddings are not computed at import yet (column exists, 768 dims).
- `MethodNote` shape is provisional until the forecasting track confirms it.
- Third-party code: UI primitives, design tokens and streaming patterns are adapted from the
  team's earlier project medlyn (shadcn/ui, MIT); see `docs/ui-plan.md` section 1.
