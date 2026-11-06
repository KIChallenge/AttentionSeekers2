import { existsSync } from "node:fs";
import path from "node:path";

const rootEnv = path.resolve(import.meta.dirname, "../../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);
process.env.DATABASE_URL ??= "postgres://sv:sv@localhost:55432/sv";
