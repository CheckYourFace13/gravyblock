import { gte, count, eq, and, ne, isNotNull } from "drizzle-orm";
import { getDb, businesses, leads, jobs, publishedContent, operatorTasks, contentQueue, scans } from "@/lib/db";
import { getStripeServerClient } from "@/lib/stripe/server";

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
    newLeads24h,
    totalLeads,
    newScans24h,
    totalScans,
    newBusinesses24h,
    allPaidBusinesses,
    totalFreeBusinesses,
    autopilotJobsToday,
    contentPublishedToday,
    tasksToday,
    contentQueuedToday,
    newLeads7d,
    newScans7d,
  ] = await Promise.all([
    db.select({ count: count() }).from(leads).where(gte(leads.createdAt, since24h)),
    db.select({ count: count() }).from(leads),
    db.select({ count: count() }).from(scans).where(gte(scans.createdAt, since24h)),
    db.select({ count: count() }).from(scans),
    db.select({ count: count() }).from(businesses).where(gte(businesses.createdAt, since24h)),
    db.select({
      id: businesses.id,
      name: businesses.name,
      planTier: businesses.planTier,
      billingEmail: businesses.billingEmail,
      stripeSubscriptionId: businesses.stripeSubscriptionId,
      createdAt: businesses.createdAt,
    })
      .from(businesses)
      .where(and(ne(businesses.planTier, "free"), eq(businesses.subscriptionStatus, "active"))),
    db.select({ count: count() }).from(businesses).where(eq(businesses.planTier, "free")),
    db.select({ count: count() }).from(jobs).where(and(eq(jobs.status, "completed"), gte(jobs.createdAt, since24h))),
    db.select({ count: count() }).from(publishedContent).where(gte(publishedContent.createdAt, since24h)),
    db.select({ count: count() }).from(operatorTasks).where(gte(operatorTasks.createdAt, since24h)),
    db.select({ count: count() }).from(contentQueue).where(gte(contentQueue.createdAt, since24h)),
    db.select({ count: count() }).from(leads).where(gte(leads.createdAt, since7d)),
    db.select({ count: count() }).from(scans).where(gte(scans.createdAt, since7d)),
  ]);

  // Pull actual charged amounts from Stripe for each subscriber
  const stripe = getStripeServerClient();
  const subscriberDetails: Array<{
    name: string;
    email: string;
    tier: string;
    standardPrice: number;
    actualMonthly: number | null;
    discountPct: number | null;
    memberSince: Date;
  }> = [];

  for (const biz of allPaidBusinesses) {
    const tier = (biz.planTier ?? "free").toLowerCase();
    const standardPrice = PLAN_PRICES[tier] ?? 0;
    let actualMonthly: number | null = null;
    let discountPct: number | null = null;

    if (stripe && biz.stripeSubscriptionId) {
      try {
        const sub = await stripe.subscriptions.retrieve(biz.stripeSubscriptionId, {
          expand: ["discount", "items.data.price"],
        });
        // Get unit amount from first item
        const item = sub.items?.data?.[0];
        const unitAmount = item?.price?.unit_amount;
        if (unitAmount != null) {
          actualMonthly = unitAmount / 100;
        }
        // Check for active discount
        const discount = (sub as any).discount;
        if (discount?.coupon) {
          const coupon = discount.coupon;
          if (coupon.percent_off) discountPct = coupon.percent_off;
          else if (coupon.amount_off && unitAmount) {
            discountPct = Math.round((coupon.amount_off / unitAmount) * 100);
          }
        }
      } catch {
        // Non-fatal — fall back to standard price
      }
    }

    subscriberDetails.push({
      name: biz.name,
      email: biz.billingEmail ?? "—",
      tier,
      standardPrice,
      actualMonthly,
      discountPct,
      memberSince: new Date(biz.createdAt),
    });
  }

  const tierCounts: Record<string, number> = {};
  for (const s of subscriberDetails) {
    tierCounts[s.tier] = (tierCounts[s.tier] ?? 0) + 1;
  }

  const mrr = subscriberDetails.reduce((sum, s) => sum + (s.actualMonthly ?? s.standardPrice), 0);
  const totalPaid = allPaidBusinesses.length;

  const totalScansCount = totalScans[0]?.count ?? 0;
  const totalLeadsCount = totalLeads[0]?.count ?? 0;
  const scansToLeadRate = totalScansCount > 0 ? Math.round((totalLeadsCount / totalScansCount) * 100) : 0;
  const leadsToSubRate = totalLeadsCount > 0 ? Math.round((totalPaid / totalLeadsCount) * 100) : 0;

  const dateStr = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  // Subscriber rows sorted by plan price descending
  const subscriberRows = subscriberDetails
    .sort((a, b) => (PLAN_PRICES[b.tier] ?? 0) - (PLAN_PRICES[a.tier] ?? 0))
    .map((s) => {
      const priceDisplay = s.actualMonthly !== null
        ? `$${s.actualMonthly.toFixed(2)}/mo${s.discountPct ? ` <span style="color:#16a34a;font-size:11px">(${s.discountPct}% off)</span>` : ""}`
        : `$${s.standardPrice.toFixed(2)}/mo`;
      const since = s.memberSince.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      return `<tr style="border-bottom:1px solid #f4f4f5">
        <td style="padding:8px 12px 8px 0;font-weight:600;color:#18181b">${s.name}</td>
        <td style="padding:8px 12px;color:#52525b;font-size:12px">${s.email}</td>
        <td style="padding:8px 12px;color:#52525b;text-transform:capitalize">${s.tier}</td>
        <td style="padding:8px 0;font-weight:600;color:#18181b">${priceDisplay}</td>
        <td style="padding:8px 0 8px 12px;color:#a1a1aa;font-size:11px">${since}</td>
      </tr>`;
    })
    .join("");

  const html = `
<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;background:#f9f9f9;margin:0;padding:24px">
<div style="max-width:680px;margin:0 auto;background:#fff;border-radius:16px;border:1px solid #e4e4e7;padding:32px">
  <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:#991b1b">GravyBlock</p>
  <h1 style="margin:8px 0 0;font-size:20px;font-weight:700;color:#18181b">Daily report — ${dateStr}</h1>

  <!-- MRR + top stats -->
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:20px 0">
    ${statCard("Est. MRR", `$${mrr.toFixed(2)}`)}
    ${statCard("Paid subscribers", String(totalPaid))}
    ${statCard("Free accounts", String(totalFreeBusinesses[0]?.count ?? 0))}
  </div>

  <!-- Conversion funnel -->
  <h2 style="font-size:14px;font-weight:700;color:#18181b;margin:24px 0 8px">Conversion funnel (all time)</h2>
  <table style="width:100%;border-collapse:collapse">
    <tr>
      <td style="padding:6px 12px 6px 0;color:#52525b;font-size:13px">🔍 Scans run</td>
      <td style="padding:6px 0;font-weight:700;color:#18181b">${totalScansCount.toLocaleString()}</td>
      <td style="padding:6px 0 6px 12px;color:#a1a1aa;font-size:12px">+${newScans24h[0]?.count ?? 0} today · +${newScans7d[0]?.count ?? 0} this week</td>
    </tr>
    <tr>
      <td style="padding:6px 12px 6px 0;color:#52525b;font-size:13px">📧 Emails captured</td>
      <td style="padding:6px 0;font-weight:700;color:#18181b">${totalLeadsCount.toLocaleString()}</td>
      <td style="padding:6px 0 6px 12px;color:#a1a1aa;font-size:12px">+${newLeads24h[0]?.count ?? 0} today · +${newLeads7d[0]?.count ?? 0} this week · ${scansToLeadRate}% of scans</td>
    </tr>
    <tr>
      <td style="padding:6px 12px 6px 0;color:#52525b;font-size:13px">💳 Paid subscribers</td>
      <td style="padding:6px 0;font-weight:700;color:#18181b">${totalPaid}</td>
      <td style="padding:6px 0 6px 12px;color:#a1a1aa;font-size:12px">${leadsToSubRate}% of emails → paid</td>
    </tr>
    <tr>
      <td style="padding:6px 12px 6px 0;color:#52525b;font-size:13px">+${newBusinesses24h[0]?.count ?? 0} new accounts today</td>
      <td colspan="2"></td>
    </tr>
  </table>

  <!-- Subscriber list -->
  <h2 style="font-size:14px;font-weight:700;color:#18181b;margin:24px 0 8px">Active subscribers</h2>
  ${totalPaid > 0 ? `
  <table style="width:100%;border-collapse:collapse">
    <thead>
      <tr style="border-bottom:2px solid #e4e4e7">
        <th style="padding:6px 12px 6px 0;text-align:left;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.05em">Business</th>
        <th style="padding:6px 12px;text-align:left;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.05em">Email</th>
        <th style="padding:6px 12px;text-align:left;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.05em">Plan</th>
        <th style="padding:6px 12px;text-align:left;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.05em">Paying</th>
        <th style="padding:6px 0 6px 12px;text-align:left;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.05em">Since</th>
      </tr>
    </thead>
    <tbody>${subscriberRows}</tbody>
  </table>` : '<p style="color:#a1a1aa;font-size:13px">No active paid subscribers yet.</p>'}

  <!-- Autopilot activity -->
  <h2 style="font-size:14px;font-weight:700;color:#18181b;margin:24px 0 8px">Autopilot activity (last 24h)</h2>
  <table style="width:100%;border-collapse:collapse">
    <tr><td style="padding:3px 12px 3px 0;color:#52525b;font-size:13px">Jobs completed</td><td style="font-weight:700;color:#18181b">${autopilotJobsToday[0]?.count ?? 0}</td></tr>
    <tr><td style="padding:3px 12px 3px 0;color:#52525b;font-size:13px">Content queued</td><td style="font-weight:700;color:#18181b">${contentQueuedToday[0]?.count ?? 0}</td></tr>
    <tr><td style="padding:3px 12px 3px 0;color:#52525b;font-size:13px">Articles published</td><td style="font-weight:700;color:#18181b">${contentPublishedToday[0]?.count ?? 0}</td></tr>
    <tr><td style="padding:3px 12px 3px 0;color:#52525b;font-size:13px">Tasks created (citations, reviews, outreach)</td><td style="font-weight:700;color:#18181b">${tasksToday[0]?.count ?? 0}</td></tr>
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
