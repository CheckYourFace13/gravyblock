// Proves, on the real database and the real live pages (read only), how recommendation history behaves: opening, copying, status changes, weekly regeneration, verification,
// reappearance after verification, and the Friday-email buckets. It works on a throwaway house-type record (no website, so no engine touches it) that is deleted at the end,
// so no real recommendation or history is changed.
//   tsx --env-file=.env scripts/ops/search-rec-demo.ts
import { sql } from "drizzle-orm";
import { getDb } from "../../src/lib/db";
import {
  collectEmailItems, loadEvents, loadQueue, markCopied, markReportOpened, setRecommendationStatus, syncRecommendations, unresolvedImprovements, verifyCompleted,
} from "../../src/lib/search-intel/recommendations";
import type { Improvement } from "../../src/lib/search-intel/types";

const imp = (over: Partial<Improvement>): Improvement => ({
  kind: "confirmed_problem", issue: "ctr:no_social_image", identityUrls: [], title: "demo", urls: [], evidence: ["demo evidence"], competitorUrls: [], actions: ["do"], acceptance: ["check"], potentialClicks28: 0, priority: 30, ...over,
});

async function main() {
  const db = getDb();
  if (!db) throw new Error("database unavailable");
  const [b] = (await db.execute(sql`insert into businesses (name, account_type) values ('ZZ Demo Recommendations', 'house') returning id`)) as unknown as Array<{ id: string }>;
  const id = b!.id;
  const A = imp({ issue: "ctr:no_social_image", title: "Add a social preview image", urls: ["https://gravyblock.com/"], priority: 40 });
  const B = imp({ issue: "technical:multiple_h1", title: "Use a single h1", urls: ["https://gravyblock.com/api/health"], priority: 20 });
  const show = async (label: string) => {
    const q = await loadQueue(id);
    console.log(`\n== ${label}`);
    for (const r of q) console.log(`  ${r.ref} ${r.issue.padEnd(24)} status=${r.status.padEnd(11)} occurrence=${r.occurrence} copied=${r.copiedAt ? `yes(x${r.copyCount})` : "no"} week=${r.lastReportWeek} title="${r.title}"`);
    console.log(`  rows=${q.length}; unresolved prompt items: [${unresolvedImprovements(q, new Date()).map((i) => i.ref).join(", ")}]`);
    return q;
  };
  try {
    console.log("1) first weekly report W1:", JSON.stringify(await syncRecommendations(id, [A, B], "2026-11-27")));
    let q = await show("after W1 (both NEW)");
    const [ra, rb] = [q.find((r) => r.issue.startsWith("ctr"))!, q.find((r) => r.issue.startsWith("technical"))!];

    await db.execute(sql`insert into search_intel_reports (business_id, week_ending, data, prompt) values (${id}, '2026-11-27', '{}'::jsonb, '')`);
    console.log("\n2) owner opens the report in admin:", JSON.stringify(await markReportOpened(id, "2026-11-27")));
    await show("after OPEN (NEW -> OPENED; nothing started)");

    console.log("\n3) owner copies the prompt (both items included):", await markCopied(id, [ra.id, rb.id]), "items flagged");
    await show("after COPY (handed off; status unchanged)");

    console.log("\n4) owner: A in progress, B dismissed:", JSON.stringify(await setRecommendationStatus(ra.id, "in_progress")), JSON.stringify(await setRecommendationStatus(rb.id, "dismissed")));
    await show("after status changes");

    console.log("\n5) weekly regeneration W2 with changed evidence and title:", JSON.stringify(await syncRecommendations(id, [{ ...A, title: "Add a social preview image (week 2 wording)", evidence: ["week 2 numbers"], priority: 55 }, B], "2026-12-04")));
    q = await show("after REGENERATION (same rows, statuses and flags kept, evidence refreshed)");

    console.log("\n6) owner marks A completed; read-only live check runs:", JSON.stringify(await setRecommendationStatus(ra.id, "completed")));
    console.log("   verification:", JSON.stringify(await verifyCompleted(id)));
    q = await show("after VERIFICATION (A was completed; the live page shows an og:image, so the fix is confirmed deployed)");
    console.log("   A verification note:", q.find((r) => r.id === ra.id)?.verification?.note, "| checks:", JSON.stringify(q.find((r) => r.id === ra.id)?.verification?.checks.map((c) => ({ check: c.check, pass: c.pass }))));

    console.log("\n7) the same problem is found again right after verification (stale search data):", JSON.stringify(await syncRecommendations(id, [A, B], "2026-12-11")));
    await show("after early reappearance (kept verified, not reopened)");
    await db.execute(sql`update search_recommendations set verified_at = now() - interval '40 days' where id = ${ra.id}::uuid`);
    console.log("\n8) 40 days later the problem genuinely returns:", JSON.stringify(await syncRecommendations(id, [A, B], "2027-01-15")));
    q = await show("after REOPEN (same row, occurrence 2, back to NEW; no duplicate)");

    const items = (await collectEmailItems(new Date())).filter((i) => i.businessId === id);
    console.log("\n9) Friday email buckets for this record:", JSON.stringify(items.map((i) => `${i.bucket}:${i.ref}`)));
    const ev = await loadEvents([ra.id]);
    console.log("\nFull history of A:");
    for (const e of ev.get(ra.id) ?? []) console.log(`  ${e.at.slice(0, 19)} ${e.type}${e.from || e.to ? ` (${e.from ?? "-"} -> ${e.to ?? "-"})` : ""} ${e.note ?? ""}`);
  } finally {
    await db.execute(sql`delete from businesses where id = ${id}`);
    console.log("\n(throwaway record deleted)");
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => setTimeout(() => process.exit(), 300));
