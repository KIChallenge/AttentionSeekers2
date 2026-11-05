import "./env.ts";
import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb } from "../src/client.ts";

const db = getDb();
await migrate(db, { migrationsFolder: path.resolve(import.meta.dirname, "../migrations") });
console.log("migrations applied");
await closeDb();
