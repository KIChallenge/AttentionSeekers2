// Forecasting CLI bridge (ui-plan 2.2, FR-J10): one stdio call at the end of a live run.
// SV_FORECAST_CMD receives the negotiation record as JSON on stdin and returns
// { forecasts: Forecast[], extractorVersion } on stdout. Unset or failing means
// status "unavailable", shown as such instead of hidden (CON-4).
import { spawn } from "node:child_process";
import { catalogAgent, Forecast, type Proposal } from "@sv/contracts";
import { z } from "zod";
import { REPO_ROOT } from "./config.ts";

const BridgeOut = z.object({ forecasts: z.array(Forecast), extractorVersion: z.string() });

export function unavailable(ps: Proposal[]): { forecasts: Forecast[]; extractorVersion: string } {
  return {
    forecasts: ps.map((p) => ({
      measureId: p.id,
      status: "unavailable" as const,
      descriptor: null,
      classKey: p.measureClass ?? "other",
      n: 0,
      k: null,
      interval: null,
      analogs: [],
    })),
    extractorVersion: "none",
  };
}

export async function forecast(
  runId: string,
  question: string,
  asOf: string,
  ps: Proposal[],
  timeoutMs = 90_000,
): Promise<{ forecasts: Forecast[]; extractorVersion: string; note: string }> {
  const cmd = process.env.SV_FORECAST_CMD;
  if (!cmd || ps.length === 0)
    return { ...unavailable(ps), note: cmd ? "no measures" : "SV_FORECAST_CMD unset" };
  const payload = {
    runId,
    question,
    asOf,
    measures: ps.map((p) => ({
      measureId: p.id,
      title: p.title.text,
      measureClass: p.measureClass ?? "other",
      topicIds: p.topicIds,
      status: p.status,
      outcomeClass: p.outcomeClass,
      cost: p.cost,
      supportingRoles: p.supporters.map((a) => catalogAgent(a)?.role ?? "other"),
      opposingRoles: p.opponents.map((a) => catalogAgent(a)?.role ?? "other"),
      conditionalRoles: p.conditional.map((a) => catalogAgent(a)?.role ?? "other"),
    })),
  };
  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = spawn(cmd, { shell: true, cwd: REPO_ROOT, stdio: ["pipe", "pipe", "pipe"] });
      let out = "";
      let err = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("forecast timeout"));
      }, timeoutMs);
      child.stdout.on("data", (d) => {
        out += d;
      });
      child.stderr.on("data", (d) => {
        err += d;
      });
      child.on("error", reject);
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve(out);
        else reject(new Error(`exit ${code}: ${err.slice(-300)}`));
      });
      child.stdin.end(JSON.stringify(payload));
    });
    const parsed = BridgeOut.parse(JSON.parse(stdout.trim().split("\n").at(-1) ?? "{}"));
    return { ...parsed, note: "ok" };
  } catch (error) {
    console.warn(
      "forecast_unavailable",
      error instanceof Error ? error.message.slice(0, 300) : error,
    );
    return { ...unavailable(ps), note: "bridge failed" };
  }
}
