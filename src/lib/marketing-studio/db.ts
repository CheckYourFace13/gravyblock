import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as ms from "@/lib/db/studio-schema";

export type StudioDb = ReturnType<typeof drizzle<typeof ms>>;
type SqlClient = ReturnType<typeof postgres>;

const g = globalThis as unknown as { marketingStudioDb?: StudioDb; marketingStudioSql?: SqlClient };

/**
 * The studio's OWN connection pool (max 3). In production it must use MARKETING_DATABASE_URL, the least-privilege
 * `gb_studio` role that can write only ms_* tables. Falling back to DATABASE_URL in production would silently remove that
 * protection, so it is refused there and allowed only in development and tests.
 */
export function getStudioUrl(): string | null {
  const own = process.env.MARKETING_DATABASE_URL?.trim();
  if (own) return own;
  if (process.env.NODE_ENV === "production") return null;
  return process.env.DATABASE_URL?.trim() || null;
}

export function getStudioDb(): StudioDb | null {
  const url = getStudioUrl();
  if (!url) return null;
  if (!g.marketingStudioSql) {
    g.marketingStudioSql = postgres(url, { max: Math.max(1, Number(process.env.MARKETING_DB_POOL_MAX ?? 3)), idle_timeout: 20, connect_timeout: 10, prepare: false });
  }
  if (!g.marketingStudioDb) g.marketingStudioDb = drizzle(g.marketingStudioSql, { schema: ms });
  return g.marketingStudioDb;
}

export function requireStudioDb(): StudioDb {
  const db = getStudioDb();
  if (!db) throw new Error("Marketing Studio database is not configured (MARKETING_DATABASE_URL)");
  return db;
}

export async function closeStudioDb(): Promise<void> {
  await g.marketingStudioSql?.end({ timeout: 5 });
  g.marketingStudioSql = undefined;
  g.marketingStudioDb = undefined;
}

export { ms };
