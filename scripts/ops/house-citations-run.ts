// Re-runs the citation engine for every house account now (the monthly batch would do it within 28 days). Read/verify only; edits no site.
//   tsx --env-file=/home/deploy/gravyblock/.env scripts/ops/house-citations-run.ts
import { eq } from "drizzle-orm";
import { businesses, getDb } from "../../src/lib/db";
import { runCitationEngineForBusiness } from "../../src/lib/citations/engine";

async function main() {
  const db = getDb();
  if (!db) throw new Error("no database");
  const rows = await db.select({ id: businesses.id, name: businesses.name }).from(businesses).where(eq(businesses.accountType, "house"));
  for (const r of rows.sort((a, b) => a.name.localeCompare(b.name))) {
    const out = await runCitationEngineForBusiness(r.id);
    console.log(`${r.name.padEnd(16)} ${JSON.stringify(out)}`);
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.stack : e); process.exitCode = 1; }).finally(() => setTimeout(() => process.exit(), 300));
