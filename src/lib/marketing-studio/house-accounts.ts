/**
 * Read-only list of House Account names for the "linked House Account" picker. A single SELECT on `businesses`, deliberately
 * not importing src/lib/house (which pulls in site-write adapters): Marketing Studio must have no code path to any site write.
 */
import { asc, eq } from "drizzle-orm";
import { businesses, getDb } from "@/lib/db";

export async function listHouseAccountNames(): Promise<Array<{ id: string; name: string }>> {
  const db = getDb();
  if (!db) return [];
  return db.select({ id: businesses.id, name: businesses.name }).from(businesses).where(eq(businesses.accountType, "house")).orderBy(asc(businesses.name));
}
