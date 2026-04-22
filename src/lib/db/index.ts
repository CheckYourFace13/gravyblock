import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;
type SqlClient = ReturnType<typeof postgres>;

const globalForDb = globalThis as unknown as { gravyblockDb?: Db; gravyblockSql?: SqlClient };

/**
 * In production, callers must not fall back to in-memory persistence when DATABASE_URL is unset.
 * Call at the start of any branch that would use the in-memory store.
 */
export function assertMemoryFallbackAllowed(): void {
  if (process.env.NODE_ENV !== "production") return;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL is required in production. In-memory persistence is disabled; configure Postgres and set DATABASE_URL.",
    );
  }
}

export function getDb(): Db | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;

  if (!globalForDb.gravyblockSql) {
    globalForDb.gravyblockSql = postgres(url, {
      max: Number(process.env.DB_POOL_MAX ?? 5),
      // Disable prepared statements so pgwire-compatible dev targets
      // and managed Postgres behave consistently for typed reads.
      prepare: false,
    });
  }
  if (!globalForDb.gravyblockDb) {
    globalForDb.gravyblockDb = drizzle(globalForDb.gravyblockSql, { schema });
  }
  return globalForDb.gravyblockDb;
}

export function getSqlClient(): SqlClient | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!globalForDb.gravyblockSql) {
    globalForDb.gravyblockSql = postgres(url, {
      max: Number(process.env.DB_POOL_MAX ?? 5),
      prepare: false,
    });
  }
  return globalForDb.gravyblockSql;
}

export * from "./schema";
