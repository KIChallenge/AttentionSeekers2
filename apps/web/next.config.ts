import { existsSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

const root = path.resolve(import.meta.dirname, "../..");
const envPath = path.join(root, ".env");
if (process.env.NODE_ENV !== "production" && existsSync(envPath)) process.loadEnvFile(envPath);

const config: NextConfig = {
  transpilePackages: ["@sv/contracts", "@sv/db", "@sv/engine"],
  serverExternalPackages: ["pg"],
  turbopack: { root },
  outputFileTracingRoot: root,
  outputFileTracingExcludes: {
    "/*": ["../../.env*", "../../data/**", "../../forecasting/**", "../../models/**"],
  },
  devIndicators: false,
};

export default config;
