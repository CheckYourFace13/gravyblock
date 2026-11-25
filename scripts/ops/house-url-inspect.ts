// Read-only: asks Google's URL Inspection API (covered by the existing read-only Search Console grant) how Google sees a few pages of one house site.
//   tsx --env-file=/home/deploy/gravyblock/.env scripts/ops/house-url-inspect.ts "<house name>" [limit]
// Samples pages that had impressions in the older window but not the current one. Never writes to Google or to a site.
import { sql } from "drizzle-orm";
import { getDb } from "../../src/lib/db";
import { getFreshAccessToken, getGoogleConnection } from "../../src/lib/integrations/google-oauth";

async function main() {
  const name = process.argv[2];
  const limit = Number(process.argv[3] ?? 6);
  const db = getDb();
  if (!db || !name) throw new Error("usage: house-url-inspect.ts <house name> [limit]");
  const [b] = (await db.execute(sql`select id from businesses where account_type = 'house' and name = ${name} limit 1`)) as unknown as Array<{ id: string }>;
  if (!b) throw new Error("no such house account");
  const conn = await getGoogleConnection(b.id);
  const token = await getFreshAccessToken(b.id);
  if (!conn?.searchConsoleProperty || !token) throw new Error("not connected");
  const starts = (await db.execute(sql`select distinct period_start s from page_performance where business_id = ${b.id}::uuid order by 1 desc`)) as unknown as Array<{ s: string }>;
  const [cur, prior] = [starts[0]?.s, starts[1]?.s];
  const pages = (await db.execute(sql`
    select page_url, sum(impressions)::int imps from page_performance where business_id = ${b.id}::uuid and period_start = ${prior}
      and page_url not in (select page_url from page_performance where business_id = ${b.id}::uuid and period_start = ${cur})
    group by 1 order by 2 desc limit ${limit}`)) as unknown as Array<{ page_url: string; imps: number }>;
  console.log(`${name}: property ${conn.searchConsoleProperty}; inspecting ${pages.length} pages that lost all impressions`);
  for (const p of pages) {
    const res = await fetch("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ inspectionUrl: p.page_url, siteUrl: conn.searchConsoleProperty }),
    });
    const j = (await res.json().catch(() => ({}))) as { inspectionResult?: { indexStatusResult?: Record<string, unknown> }; error?: { message?: string } };
    const s = j.inspectionResult?.indexStatusResult;
    console.log(`${p.page_url.slice(0, 80)} (was ${p.imps} imp) -> ${res.status} verdict=${s?.verdict} coverage="${s?.coverageState}" robots=${s?.robotsTxtState} indexing=${s?.indexingState} fetch=${s?.pageFetchState} lastCrawl=${s?.lastCrawlTime} googleCanonical=${s?.googleCanonical ?? "-"} ${j.error?.message ?? ""}`);
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => setTimeout(() => process.exit(), 200));
