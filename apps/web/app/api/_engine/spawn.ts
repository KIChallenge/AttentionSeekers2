// Server-only bridge to the engine CLI (packages/engine/src/cli.ts). The web app does
// not import the engine; it runs it as a child process, so a run survives a closed
// browser tab and the web package gains no dependencies. Events land in
// runs/<id>.ndjson and the database; the stream route replays them.
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const cwd = process.cwd();
export const repoRoot = path.resolve(
  /*turbopackIgnore: true*/ cwd,
  cwd.endsWith(path.join("apps", "web")) ? "../.." : ".",
);
const cli = path.join(/*turbopackIgnore: true*/ repoRoot, "packages", "engine", "src", "cli.ts");
const envFile = path.join(/*turbopackIgnore: true*/ repoRoot, ".env");

const RUN_ID = /^[a-zA-Z0-9_.-]{1,120}$/;
export const isRunId = (id: string) => RUN_ID.test(id) && !id.includes("..");

export function newRunId(prefix = "run"): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  return `${prefix}-${stamp}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Writes a JSON argument to a private temp file and returns its path. */
export function tempJson(name: string, value: unknown): string {
  const dir = mkdtempSync(path.join(tmpdir(), "sv-engine-"));
  const file = path.join(dir, name);
  writeFileSync(file, JSON.stringify(value));
  return file;
}

/**
 * Environment for the engine child. Empty values would shadow the repo .env (Node's
 * --env-file never overrides a set variable), so they are dropped; when a .env file
 * exists the gateway and database settings come from it.
 */
function childEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const fromFile = existsSync(envFile);
  for (const key of Object.keys(env)) {
    const managed =
      key.startsWith("OPENAI_COMPATIBLE_") || key === "DATABASE_URL" || key.startsWith("SV_");
    if (env[key] === "" || (fromFile && managed && key !== "SV_REPLAY_DIR")) delete env[key];
  }
  return env;
}

export function spawnEngine(
  args: string[],
  opts: { detached?: boolean; pipe?: boolean } = {},
): ChildProcess {
  const child = spawn(
    process.execPath,
    [`--env-file-if-exists=${envFile}`, "--no-warnings", cli, ...args],
    {
      cwd: repoRoot,
      env: childEnv(),
      detached: opts.detached ?? false,
      stdio: opts.pipe ? ["ignore", "pipe", "pipe"] : ["ignore", "ignore", "pipe"],
    },
  );
  child.stderr?.on("data", (d: Buffer) => {
    const line = d.toString().trim();
    if (line) console.warn("engine", line.slice(0, 500));
  });
  return child;
}

/** Runs the engine to completion and returns stdout (used for the mandate preview). */
export function runEngine(args: string[], timeoutMs = 120_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawnEngine(args, { pipe: true });
    let out = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("engine timeout"));
    }, timeoutMs);
    child.stdout?.on("data", (d: Buffer) => {
      out += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`engine exited with ${code}`));
    });
  });
}

/** NDJSON response from a live engine child (stdout carries RunEvents). */
export function ndjsonFrom(child: ChildProcess, runId: string): Response {
  const stdout = child.stdout;
  if (!stdout) return Response.json({ error: "engine has no stdout" }, { status: 500 });
  let closed = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      stdout.on("data", (d: Buffer) => {
        if (!closed) controller.enqueue(new Uint8Array(d));
      });
      stdout.on("end", () => {
        if (!closed) {
          closed = true;
          controller.close();
        }
      });
      child.on("error", (e) => {
        if (!closed) {
          closed = true;
          controller.error(e);
        }
      });
    },
    cancel() {
      // The run keeps going; the file and the database keep every event.
      closed = true;
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "Content-Encoding": "identity",
      "X-Accel-Buffering": "no",
      "X-Sv-Mode": "live",
      "X-Sv-Run-Id": runId,
    },
  });
}

/** Resolves once runs/<id>.ndjson holds run.started (or after the timeout). */
export async function waitForRunFile(runId: string, timeoutMs: number): Promise<boolean> {
  const dir = process.env.SV_REPLAY_DIR ?? "runs";
  const base = path.isAbsolute(dir) ? dir : path.join(/*turbopackIgnore: true*/ repoRoot, dir);
  const file = path.join(/*turbopackIgnore: true*/ base, `${runId}.ndjson`);
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (existsSync(file) && statSync(file).size > 0) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}
