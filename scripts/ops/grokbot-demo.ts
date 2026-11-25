// Proves the GrokBot delivery rules on the real database WITHOUT emailing anyone: a fake sender replaces Resend, and a throwaway house-type record (deleted at the end) is used,
// so no real recommendation, delivery or email is touched.   tsx --env-file=.env scripts/ops/grokbot-demo.ts
import { sql } from "drizzle-orm";
import { getDb } from "../../src/lib/db";
import { enqueueGrokbot, processGrokbotQueue, type SendFn } from "../../src/lib/search-intel/grokbot";
import { loadQueue, syncRecommendations } from "../../src/lib/search-intel/recommendations";
import type { Improvement, SiteIntel } from "../../src/lib/search-intel/types";

const imp = (n: string, over: Partial<Improvement> = {}): Improvement => ({
  kind: "low_ctr", issue: `low_ctr`, identityUrls: [`https://demo.example/${n}`], title: `Rewrite the title of /${n}`, urls: [`https://demo.example/${n}`], evidence: [`"query ${n}": position 3, 500 impressions, CTR 1%`], competitorUrls: [],
  actions: ["Rewrite"], acceptance: ["Live"], potentialClicks28: 20, priority: 50, ...over,
});

async function main() {
  const db = getDb();
  if (!db) throw new Error("database unavailable");
  const [b] = (await db.execute(sql`insert into businesses (name, account_type, website) values ('ZZ Demo GrokBot', 'house', null) returning id`)) as unknown as Array<{ id: string }>;
  const id = b!.id;
  const intel = {
    version: 1, site: { businessId: id, name: "ZZ Demo GrokBot", website: "https://demo.example/" }, generatedAt: new Date().toISOString(), weekEnding: "2026-11-27", endDay: "2026-11-22", googleConnected: true,
    status: { status: "ok", latestDay: "2026-11-22", notes: [] }, w7: null, w28: null, queries7: null, queries28: null, pages7: null, pages28: null, bands: null, lowCtr: [], topPages: [], indexing: { dropped: null, rechecks: [], notes: [] }, seasonal: null,
    competitors: { observedAt: new Date().toISOString(), known: [], sitemapsRead: 0, pagesObserved: 0, baselineEstablishedToday: [], newPages: [], queries: [], notes: [] }, openBriefs: [], authority: { qualified: 0, contacted: 0, verifiedLinks: 0, note: "" }, changes: [], dataQualityNotes: [],
  } as unknown as SiteIntel;
  await db.execute(sql`insert into search_intel_reports (business_id, week_ending, data, prompt) values (${id}, '2026-11-27', ${JSON.stringify(intel)}::jsonb, '')`);

  const sent: Array<{ subject: string; key: string; to: string; from: string }> = [];
  let failNext = false;
  const send: SendFn = async (m) => {
    if (failNext) return { ok: false, error: "Resend 429: simulated rate limit" };
    sent.push({ subject: m.subject, key: m.idempotencyKey, to: m.to, from: m.from });
    return { ok: true, id: `fake_${sent.length}` };
  };
  const activatedAt = new Date(Date.now() - 3_600_000);
  const table = async (label: string) => {
    const rows = (await db.execute(sql`select r.issue, r.status rec_status, d.kind, d.occurrence, d.status, d.attempts, d.last_error, (d.next_attempt_at > now()) waiting from grokbot_deliveries d join search_recommendations r on r.id = d.recommendation_id where d.business_id = ${id} order by d.created_at, d.occurrence`)) as unknown as Array<Record<string, unknown>>;
    console.log(`\n== ${label}`);
    for (const r of rows) console.log("  ", JSON.stringify(r));
    console.log(`   emails actually handed to the sender so far: ${sent.length}`);
  };

  try {
    // an old (pre-activation) recommendation: backlog, must never be sent
    await syncRecommendations(id, [imp("old-backlog")], "2026-11-20");
    await db.execute(sql`update search_recommendations set first_seen_at = now() - interval '10 days' where business_id = ${id}`);
    // a genuinely new one, found after activation
    await syncRecommendations(id, [imp("a-new-problem")], "2026-11-27");
    console.log("1) enqueue:", JSON.stringify(await enqueueGrokbot(id, new Date(), { activatedAt })), "(only the new one; the 10-day-old backlog item is excluded)");
    console.log("   enqueue again after a report regenerates:", JSON.stringify(await enqueueGrokbot(id, new Date(), { activatedAt })), "(nothing new)");
    await table("after enqueue");

    failNext = true;
    console.log("\n2) delivery fails (simulated 429):", JSON.stringify(await processGrokbotQueue(new Date(), { send, activatedAt })));
    await table("after failure: failed, attempt 1, waiting to retry");
    failNext = false;
    console.log("   immediate re-run (retry not due yet):", JSON.stringify(await processGrokbotQueue(new Date(), { send, activatedAt })));
    await db.execute(sql`update grokbot_deliveries set next_attempt_at = now() - interval '1 minute' where business_id = ${id}`);
    console.log("   retry when due:", JSON.stringify(await processGrokbotQueue(new Date(), { send, activatedAt })));
    await table("after retry: sent once");

    await syncRecommendations(id, [imp("a-new-problem", { evidence: ["week 2 numbers"] })], "2026-12-04");
    await enqueueGrokbot(id, new Date(), { activatedAt });
    console.log("\n3) weekly regeneration, enqueue and process again:", JSON.stringify(await processGrokbotQueue(new Date(), { send, activatedAt })));
    const rec = (await loadQueue(id)).find((r) => r.issue === "low_ctr" && r.improvement.urls[0]?.endsWith("a-new-problem"))!;
    console.log(`   recommendation status is still "${rec.status}" (sending never marks in progress, completed or verified); events: ${(await db.execute(sql`select string_agg(type, ', ' order by at) t from search_recommendation_events where recommendation_id = ${rec.id}::uuid`) as unknown as Array<{ t: string }>)[0]?.t}`);
    console.log("   sent subject:", sent[0]?.subject);

    // daily cap
    process.env.GROKBOT_DAILY_CAP = "2";
    await syncRecommendations(id, [imp("cap-1"), imp("cap-2"), imp("cap-3")], "2026-12-04");
    await enqueueGrokbot(id, new Date(), { activatedAt });
    console.log("\n4) three more new items with a daily cap of 2 (1 already sent today):", JSON.stringify(await processGrokbotQueue(new Date(), { send, activatedAt })));
    await table("after cap: one more sent, the rest wait for tomorrow");
    process.env.GROKBOT_DAILY_CAP = "50";
    console.log("   cap raised, next pass:", JSON.stringify(await processGrokbotQueue(new Date(), { send, activatedAt })));

    // reopened occurrence resets the handed-off flag and is emailed again, once
    await db.execute(sql`update search_recommendations set status = 'verified', verified_at = now() - interval '40 days', copied_at = now(), copy_count = 1 where id = ${rec.id}::uuid`);
    console.log("\n5) the verified issue genuinely returns:", JSON.stringify(await syncRecommendations(id, [imp("a-new-problem")], "2027-01-15")));
    const after = (await loadQueue(id)).find((r) => r.id === rec.id)!;
    console.log(`   occurrence ${after.occurrence}, status ${after.status}, handed-off flag reset: ${after.copiedAt === null && after.copyCount === 0}`);
    console.log("   enqueue:", JSON.stringify(await enqueueGrokbot(id, new Date(), { activatedAt })), "| process:", JSON.stringify(await processGrokbotQueue(new Date(), { send, activatedAt })));
    console.log("   process again:", JSON.stringify(await processGrokbotQueue(new Date(), { send, activatedAt })));

    // credentials never leave
    await syncRecommendations(id, [imp("leaky", { evidence: ["debug note: api_key=abcdef1234567890"] })], "2027-01-15");
    await enqueueGrokbot(id, new Date(), { activatedAt });
    console.log("\n6) an item whose text looks like a credential:", JSON.stringify(await processGrokbotQueue(new Date(), { send, activatedAt })));
    await table("final delivery log");
    console.log("\nIdempotency keys sent:", sent.map((s) => s.key.slice(0, 8) + "..." + s.key.slice(-2)).join(", "), "| distinct:", new Set(sent.map((s) => s.key)).size, "of", sent.length);
    console.log("To:", sent[0]?.to, "| From:", sent[0]?.from);
  } finally {
    delete process.env.GROKBOT_DAILY_CAP;
    await db.execute(sql`delete from businesses where id = ${id}`);
    console.log("\n(throwaway record deleted)");
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => setTimeout(() => process.exit(), 300));
