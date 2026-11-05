import { spawn } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { replayDir } from "@/lib/runs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// On-demand voice rendering for runs that have no pre-rendered audio yet, so a run started
// live in front of the jury gets voices on its stage within about a minute. The script runs
// detached with an argument array (no shell); a lock file prevents parallel renders.
const RUN_ID = /^[A-Za-z0-9_-]{1,120}$/;
const LOCK_TTL_MS = 10 * 60 * 1000;

function dirs(runId: string, lang: string) {
  const webRoot = process.cwd();
  const out = path.join(webRoot, "public", "stage", runId, lang);
  return {
    webRoot,
    out,
    manifest: path.join(out, "manifest.json"),
    lock: path.join(out, ".rendering"),
  };
}

function state(runId: string, lang: string): "ready" | "rendering" | "none" {
  const d = dirs(runId, lang);
  if (existsSync(d.manifest)) return "ready";
  if (existsSync(d.lock) && Date.now() - statSync(d.lock).mtimeMs < LOCK_TTL_MS) return "rendering";
  return "none";
}

function runCompleted(runId: string): boolean {
  const file = path.join(/*turbopackIgnore: true*/ replayDir(), `${runId}.ndjson`);
  if (!existsSync(file)) return true;
  const size = statSync(file).size;
  const fd = openSync(file, "r");
  const buf = Buffer.alloc(Math.min(size, 64 * 1024));
  readSync(fd, buf, 0, buf.length, size - buf.length);
  closeSync(fd);
  return buf.toString("utf8").includes('"run.completed"');
}

function parse(req: Request, runId: string) {
  const lang = new URL(req.url).searchParams.get("lang") === "en" ? "en" : "de";
  return RUN_ID.test(runId) ? { lang } : null;
}

export async function GET(req: Request, ctx: { params: Promise<{ runId: string }> }) {
  const { runId } = await ctx.params;
  const p = parse(req, runId);
  if (!p) return Response.json({ error: "bad run id" }, { status: 400 });
  return Response.json({ state: state(runId, p.lang) });
}

export async function POST(req: Request, ctx: { params: Promise<{ runId: string }> }) {
  const { runId } = await ctx.params;
  const p = parse(req, runId);
  if (!p) return Response.json({ error: "bad run id" }, { status: 400 });
  const now = state(runId, p.lang);
  if (now !== "none") return Response.json({ state: now });
  // A run that is still being computed would get voices only for the lines written so far;
  // the stage polls again and rendering starts once run.completed is in the record.
  if (!runCompleted(runId)) return Response.json({ state: "waiting" }, { status: 202 });
  const d = dirs(runId, p.lang);
  mkdirSync(d.out, { recursive: true });
  writeFileSync(d.lock, new Date().toISOString());
  const origin = new URL(req.url).origin;
  // Next sets NODE_OPTIONS and other flags for its own runtime; the script gets a clean env.
  const { NODE_OPTIONS: _n, __NEXT_PRIVATE_ORIGIN: _o, ...env } = process.env;
  const log = openSync(path.join(d.out, ".render.log"), "a");
  const child = spawn(
    process.execPath,
    ["scripts/stage-tts.ts", runId, "--lang", p.lang, "--from", origin],
    { cwd: d.webRoot, detached: true, stdio: ["ignore", log, log], env },
  );
  child.unref();
  return Response.json({ state: "rendering" }, { status: 202 });
}
