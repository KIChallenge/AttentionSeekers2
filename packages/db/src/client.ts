import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.ts";

export type Db = NodePgDatabase<typeof schema>;

let pool: pg.Pool | null = null;
let db: Db | null = null;

/** Lazily created pool; throws if DATABASE_URL is unset. */
export function getDb(url = process.env.DATABASE_URL): Db {
  if (db) return db;
  if (!url) throw new Error("DATABASE_URL is not set");
  pool = new pg.Pool({ connectionString: url, max: 5, connectionTimeoutMillis: 1500 });
  // An idle client losing its connection (database restarted) must not crash the app.
  pool.on("error", (error) => console.warn("pg_pool_error", error.message));
  db = drizzle(pool, { schema });
  return db;
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = null;
  db = null;
}
