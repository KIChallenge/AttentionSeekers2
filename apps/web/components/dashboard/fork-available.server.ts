import { existsSync } from "node:fs";
import path from "node:path";

/** True once the engine lane has added POST /api/runs/[runId]/fork. */
export function forkRouteAvailable(): boolean {
  const cwd = process.cwd();
  const web = cwd.endsWith(path.join("apps", "web")) ? cwd : path.join(cwd, "apps", "web");
  return ["route.ts", "route.tsx", "route.js"].some((f) =>
    existsSync(path.join(/*turbopackIgnore: true*/ web, "app/api/runs/[runId]/fork", f)),
  );
}
