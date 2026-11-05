// Engine CLI.
//   run      --question "..." [--template wartezeiten] [--rounds 5] [--id X] [--reference]
//            [--as-of YYYY-MM-DD] [--seed N] [--climate neutral] [--agents gm,sv,...]
//            [--room-file room.json] [--mandate-file mandate.json] [--stdout] [--no-db]
//            [--out-dir runs]
//   room     --question "..." [--template ...] [--select]   prints { room, mandate } JSON
//   fork     --base <runId> --from-round N [--id X] [--edit-agent a --remove s1,s2 --add s3]
//   validate <file.ndjson>                                   foldRun check + summary
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  foldRun,
  Mandate,
  parseNdjson,
  RoomConfig,
  type RunEvent,
  summarizeRun,
  TEMPLATES,
  Template,
} from "@sv/contracts";
import { REPO_ROOT } from "./config.ts";
import { buildMandate, defaultRoom } from "./room.ts";
import { newRunId, runNegotiation } from "./runner.ts";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    question: { type: "string" },
    template: { type: "string" },
    rounds: { type: "string" },
    id: { type: "string" },
    reference: { type: "boolean" },
    "as-of": { type: "string" },
    seed: { type: "string" },
    climate: { type: "string" },
    agents: { type: "string" },
    model: { type: "string" },
    "room-file": { type: "string" },
    "mandate-file": { type: "string" },
    stdout: { type: "boolean" },
    "no-db": { type: "boolean" },
    "out-dir": { type: "string" },
    select: { type: "boolean" },
    base: { type: "string" },
    "from-round": { type: "string" },
    "edit-agent": { type: "string" },
    remove: { type: "string" },
    add: { type: "string" },
  },
});

const cmd = positionals[0] ?? "run";
const out = values.stdout ? process.stderr : process.stdout;
const log = (...a: unknown[]) => out.write(`${a.map(String).join(" ")}\n`);

function roomFromArgs() {
  if (values["room-file"])
    return RoomConfig.parse(JSON.parse(readFileSync(values["room-file"], "utf8")));
  const template = Template.parse(values.template ?? "custom");
  const question = values.question ?? TEMPLATES.find((t) => t.id === template)?.question ?? "";
  if (!question) throw new Error("--question is required");
  return defaultRoom({
    question,
    template,
    roundLimit: values.rounds ? Number(values.rounds) : undefined,
    asOf: values["as-of"],
    seed: values.seed ? Number(values.seed) : undefined,
    climate: values.climate as "cooperative" | "neutral" | "confrontational" | undefined,
    agentIds: values.agents?.split(",").map((x) => x.trim()),
    model: values.model,
  });
}

function loadEvents(runId: string): RunEvent[] {
  const file = path.join(values["out-dir"] ?? path.join(REPO_ROOT, "runs"), `${runId}.ndjson`);
  if (!existsSync(file)) throw new Error(`run not found: ${file}`);
  return parseNdjson(readFileSync(file, "utf8"));
}

async function main() {
  if (cmd === "validate") {
    const file = positionals[1];
    if (!file) throw new Error("validate <file.ndjson>");
    const events = parseNdjson(readFileSync(file, "utf8"));
    const snap = foldRun(events, { keepTraces: true });
    const sum = summarizeRun(snap);
    const types: Record<string, number> = {};
    for (const e of events) types[e.type] = (types[e.type] ?? 0) + 1;
    log(
      JSON.stringify(
        { ok: true, events: events.length, status: snap.status, summary: sum, types },
        null,
        2,
      ),
    );
    return;
  }
  if (cmd === "room") {
    const room = roomFromArgs();
    const r = await buildMandate(room, {
      selectActors: values.select ?? room.template === "custom",
    });
    process.stdout.write(`${JSON.stringify({ room: r.room, mandate: r.mandate })}\n`);
    return;
  }
  let stdoutOpen = true;
  // A closed pipe (client went away) must not kill the run; the file and DB keep it.
  process.stdout.on("error", () => {
    stdoutOpen = false;
  });
  const onEvent = values.stdout
    ? (e: RunEvent) => {
        if (stdoutOpen) process.stdout.write(`${JSON.stringify(e)}\n`);
      }
    : (e: RunEvent) => {
        if (e.type === "round.started")
          log(`round ${e.round} phase ${e.phase} order ${e.speakingOrder.join(",")} t=${e.tMs}ms`);
        if (e.type === "utterance.completed")
          log(
            `  ${e.utterance.id} ${e.utterance.speaker.padEnd(9)} ${e.utterance.kind.padEnd(20)} ${e.utterance.text.text.slice(0, 110).replace(/\n/g, " ")}`,
          );
        if (e.type === "run.completed") log(`completed: ${e.endCondition.id} t=${e.tMs}ms`);
      };
  if (cmd === "fork") {
    if (!values.base || !values["from-round"])
      throw new Error("fork needs --base and --from-round");
    const base = loadEvents(values.base);
    const first = base[0];
    if (first?.type !== "run.started") throw new Error("base run has no run.started");
    const fromRound = Number(values["from-round"]);
    const edit = values["edit-agent"]
      ? {
          agentId: values["edit-agent"],
          remove: values.remove?.split(",").filter(Boolean) ?? [],
          add: values.add?.split(",").filter(Boolean) ?? [],
        }
      : undefined;
    const res = await runNegotiation({
      room: first.run.room,
      mandate: first.run.mandate,
      runId: values.id ?? newRunId("fork"),
      variant: {
        kind: "fork",
        baseRunId: values.base,
        fromRound,
        edit: {
          agentId: edit?.agentId ?? first.run.agents[0]?.id ?? "gm",
          removeSegmentIds: edit?.remove ?? [],
          addSegmentIds: edit?.add ?? [],
        },
      },
      outDir: values["out-dir"],
      db: !values["no-db"],
      onEvent,
      fork: { baseEvents: base, fromRound, edit },
    });
    log(
      JSON.stringify({
        runId: res.runId,
        file: res.file,
        durationMs: res.durationMs,
        usage: res.usage,
        db: res.db,
      }),
    );
    return;
  }
  // run
  const room = roomFromArgs();
  const mandate = values["mandate-file"]
    ? Mandate.parse(JSON.parse(readFileSync(values["mandate-file"], "utf8")))
    : undefined;
  const res = await runNegotiation({
    room,
    mandate,
    runId: values.id,
    isReference: values.reference ?? false,
    outDir: values["out-dir"],
    db: !values["no-db"],
    selectActors: !values["room-file"] && !values.agents && room.template === "custom",
    onEvent,
  });
  const snap = foldRun(res.events);
  log(
    JSON.stringify({
      runId: res.runId,
      file: res.file,
      durationMs: res.durationMs,
      usage: res.usage,
      db: res.db,
      summary: summarizeRun(snap),
    }),
  );
}

main().catch((error) => {
  process.stderr.write(
    `engine_failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
