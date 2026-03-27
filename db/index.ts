import "./dns-prefer-ipv4";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { resolveDatabaseUrl } from "./connection-string";
import * as schema from "./schema";

type Schema = typeof schema;

const globalForDb = globalThis as unknown as {
  pool?: Pool;
  drizzle?: NodePgDatabase<Schema>;
};

function getPool(): Pool {
  const url = resolveDatabaseUrl();
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env.local (e.g. your Supabase Postgres connection string)."
    );
  }
  if (!globalForDb.pool) {
    globalForDb.pool = new Pool({
      connectionString: url,
    });
  }
  return globalForDb.pool;
}

function getDrizzle(): NodePgDatabase<Schema> {
  if (!globalForDb.drizzle) {
    globalForDb.drizzle = drizzle(getPool(), { schema });
  }
  return globalForDb.drizzle;
}

/**
 * Lazy Drizzle client — first real use (query) initializes the pool.
 * Prefer Supabase migrations for schema; see `db/schema.ts`.
 */
export const db = new Proxy({} as NodePgDatabase<Schema>, {
  get(_, prop) {
    const instance = getDrizzle();
    const value = Reflect.get(instance, prop, instance);
    if (typeof value === "function") {
      return value.bind(instance);
    }
    return value;
  },
});
