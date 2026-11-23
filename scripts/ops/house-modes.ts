// Read-only: the operating mode (local, regional, national, online) the growth engines use for each house account.
//   tsx --env-file=/home/deploy/gravyblock/.env scripts/ops/house-modes.ts
import { eq } from "drizzle-orm";
import { businesses, getDb } from "../../src/lib/db";
import { getOperatingMode } from "../../src/lib/business-mode";

async function main() {
  const db = getDb();
  if (!db) throw new Error("no database");
  const rows = await db.select({ id: businesses.id, name: businesses.name }).from(businesses).where(eq(businesses.accountType, "house"));
  for (const r of rows.sort((a, b) => a.name.localeCompare(b.name))) {
    const m = await getOperatingMode(r.id);
    console.log(`${r.name.padEnd(16)} ${m.mode.padEnd(9)} city=${m.city ?? "-"} category=${m.category ?? "-"}`);
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.stack : e); process.exitCode = 1; }).finally(() => setTimeout(() => process.exit(), 200));
