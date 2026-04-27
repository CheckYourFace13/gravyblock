import { gte, count, eq, and, ne } from "drizzle-orm";
import { getDb, businesses, leads, jobs, publishedContent, operatorTasks, contentQueue } from "@/lib/db";

const OWNER_EMAIL = "chris@gravyblock.com";

const PLAN_PRICES: Record<string, number> = {
  starter: 79.99,
  growth: 149.99,
  pro: 299.99,
  agency: 499.99,
};

export async function sendDailyOwnerReport(): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "GravyBlock <hello@gravyblock.com>";
  if (!apiKey) return false;

  const db = getDb();
  if (!db) return false;

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    newLeads,
    newBusinesses,
    allPaidBusinesses,
    autopilotJobsToday,
    contentPublishedToday,
    tasksToday,
    contentQueuedToday,
  ] = await Promise.all([
    db.select({ count: count() }).from(leads).where(gte(leads.createdAt, since24h)),
    db.select({ count: count() }).from(businesses).where(gte(businesses.createdAt, since24h)),
    db.select({ planTier: businesses.planTier, subscriptionStatus: businesses.subscriptionStatus })
      .from(businesses)
      .where(and(ne(businesses.planTier, "free"), eq(businesses.subscriptionStatus, "active"))),
    db.select({ count: count() }).from(jobs).where(and(eq(jobs.status, "completed"), gte(jobs.createdAt, since24h))),
    db.select({ count: count() }).from(publishedContent).where(gte(publishedContent.createdAt, since24h)),
    db.select({ count: count() }).from(operatorTasks).where(gte(operatorTasks.createdAt, since24h)),
    db.select({ count: count() }).from(contentQueue).where(gte(contentQueue.createdAt, since24h)),
  ]);

  const tierCounts: Record<string, number> = {};
  for (const b of allPaidBusinesses) {
    const tier = (b.planTier ?? "free").toLowerCase();
    tierCounts[tier] = (tierCounts[tier] ?? 0) + 1;
  }

  const mrr = Object.entries(tierCounts).reduce((sum, [tier, n]) => sum + (PLAN_PRICES[tier] ?? 0) * n, 0);
  const totalPaid = allPaidBusinesses.length;

  const tierRows = Object.entries(tierCounts)
    .sort(([a], [b]) => (PLAN_PRICES[b] ?? 0) - (PLAN_PRICES[a] ?? 0))
    .map(([tier, n]) => `<tr><td style="padding:4px 12px 4px 0;color:#52525b;text-transform:capitalize">${tier}</td><td style="padding:4px 0;font-weight:700;color:#18181b">${n}</td><td style="padding:4px 0 4px 12px;color:#52525b">$${((PLAN_PRICES[tier] ?? 0) * n).toFixed(2)}/mo</td></tr>`)
    .join("");

  const dateStr = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const html = `
<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;background:#f9f9f9;margin:0;padding:24px">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;border:1px solid #e4e4e7;padding:32px">
  <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:#991b1b">GravyBlock</p>
  <h1 style="margin:8px 0 0;font-size:20px;font-weight:700;color:#18181b">Daily report — ${dateStr}</h1>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:20px 0">
    ${statCard("Active paid businesses", String(totalPaid))}
    ${statCard("Est. MRR", `$${mrr.toFixed(2)}`)}
    ${statCard("New leads (24h)", String(newLeads[0]?.count ?? 0))}
    ${statCard("New businesses (24h)", String(newBusinesses[0]?.count ?? 0))}
  </div>

  <h2 style="font-size:14px;font-weight:700;color:#18181b;margin:20px 0 8px">Subscribers by plan</h2>
  ${totalPaid > 0 ? `<table style="width:100%;border-collapse:collapse">${tierRows}</table>` : '<p style="color:#a1a1aa;font-size:13px">No active paid subscribers yet.</p>'}

  <h2 style="font-size:14px;font-weight:700;color:#18181b;margin:20px 0 8px">Autopilot activity (last 24h)</h2>
  <table style="width:100%;border-collapse:collapse">
    <tr><td style="padding:3px 12px 3px 0;color:#52525b">Jobs completed</td><td style="font-weight:700;color:#18181b">${autopilotJobsToday[0]?.count ?? 0}</td></tr>
    <tr><td style="padding:3px 12px 3px 0;color:#52525b">Content queued</td><td style="font-weight:700;color:#18181b">${contentQueuedToday[0]?.count ?? 0}</td></tr>
    <tr><td style="padding:3px 12px 3px 0;color:#52525b">Articles published</td><td style="font-weight:700;color:#18181b">${contentPublishedToday[0]?.count ?? 0}</td></tr>
    <tr><td style="padding:3px 12px 3px 0;color:#52525b">Tasks created (citations, reviews, outreach)</td><td style="font-weight:700;color:#18181b">${tasksToday[0]?.count ?? 0}</td></tr>
  </table>

  <p style="color:#a1a1aa;font-size:11px;margin:24px 0 0;border-top:1px solid #f4f4f5;padding-top:16px">
    Sent automatically every morning by GravyBlock autopilot.
  </p>
</div>
</body></html>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [OWNER_EMAIL], subject: `GravyBlock daily report — ${dateStr}`, html }),
    });
    return res.ok;
  } catch (err) {
    console.error("[daily-report] send failed", err);
    return false;
  }
}

function statCard(label: string, value: string) {
  return `<div style="background:#f4f4f5;border-radius:12px;padding:16px">
    <p style="margin:0;font-size:11px;color:#71717a;font-weight:600;text-transform:uppercase;letter-spacing:0.1em">${label}</p>
    <p style="margin:6px 0 0;font-size:24px;font-weight:700;color:#18181b">${value}</p>
  </div>`;
}
