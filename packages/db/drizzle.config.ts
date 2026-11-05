import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

const rootEnv = "../../.env";
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://sv:sv@localhost:55432/sv" },
});
