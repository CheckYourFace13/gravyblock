// Read-only against Google and the sites: pulls Search Console page+query data for every house account now (the same function the daily engine runs)
// and prints what came back per site. Writes only the app's own page_performance table.
//   tsx --env-file=/home/deploy/gravyblock/.env scripts/ops/house-gsc-run.ts
import { sql } from "drizzle-orm";
import { getDb } from "../../src/lib/db";
import { listHouseAccounts } from "../../src/lib/house";
import { fetchGscPageQuery } from "../../src/lib/seo/existing-pages";
import { pullSearchConsoleMetrics } from "../../src/lib/integrations/google-search-console";

async function main() {
  const db = getDb();
  if (!db) throw new Error("database unavailable");
  for (const a of await listHouseAccounts()) {
    const r = await fetchGscPageQuery(a.id);
    const m = await pullSearchConsoleMetrics({ businessId: a.id, days: 28 });
    const rows = (await db.execute(sql`select count(*)::int n, count(distinct page_url)::int pages, count(distinct query)::int queries, coalesce(sum(clicks),0)::int clicks, coalesce(sum(impressions),0)::int imps from page_performance where business_id = ${a.id}::uuid`)) as unknown as Array<{ n: number; pages: number; queries: number; clicks: number; imps: number }>;
    const x = rows[0];
    console.log(
      `${a.name.padEnd(16)} fetch=${JSON.stringify(r)} stored rows=${x?.n} pages=${x?.pages} queries=${x?.queries} | 28d clicks=${m.aggregate?.clicks ?? "none"} impressions=${m.aggregate?.impressions ?? "none"} avgPos=${m.aggregate?.averagePosition ?? "-"} verified=${m.verified}`,
    );
    if (m.topQueries?.length) console.log(`    top queries: ${m.topQueries.slice(0, 3).map((q) => `${q.query} (${q.impressions} imp, ${q.clicks} clk, pos ${q.position})`).join("; ")}`);
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.stack : e); process.exitCode = 1; }).finally(() => setTimeout(() => process.exit(), 200));
