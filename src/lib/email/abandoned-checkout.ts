/**
 * Abandoned checkout recovery emails.
 *
 * Fires once, 24 hours after a Stripe customer is created for a business
 * that never completed payment. Signal: stripeCustomerId is set but
 * planTier is still "free".
 *
 * Worker calls runAbandonedCheckoutBatch() every tick; deduped via jobs table.
 */

import { and, eq, isNotNull, isNull, gte, sql } from "drizzle-orm";
import { getDb, businesses, jobs } from "@/lib/db";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com";

function btn(href: string, label: string) {
  return `<a href="${href}" style="display:inline-block;background:#dc2626;color:#fff;font-weight:700;font-size:13px;padding:10px 24px;border-radius:100px;text-decoration:none">${label}</a>`;
}

function wrap(content: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;background:#f9f9f9;margin:0;padding:24px">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;border:1px solid #e4e4e7;padding:32px">
${content}
<p style="margin:32px 0 0;font-size:12px;color:#a1a1aa">GravyBlock &middot; <a href="${siteUrl}/scan" style="color:#a1a1aa">Run another scan</a></p>
</div></body></html>`;
}

function buildEmail(businessName: string, plan: string): { subject: string; html: string } {
  const planLabel = plan === "growth" ? "Scale" : plan === "pro" ? "Pro" : "Starter";
  const planPrice = plan === "growth" ? "$74.99" : plan === "pro" ? "$149.99" : "$39.99";
  const introPrice = plan === "growth" ? "$74.99" : plan === "pro" ? "$74.99" : "$39.99";

  const subject = `You left ${businessName}'s plan unfinished`;

  const html = wrap(`
    <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:#991b1b">Almost There</p>
    <h1 style="margin:8px 0 0;font-size:20px;font-weight:700;color:#18181b">You started ${planLabel} — but didn't finish</h1>
    <p style="color:#52525b;font-size:15px;margin:16px 0">
      You were in the middle of setting up GravyBlock ${planLabel} for <strong>${businessName}</strong>. Something interrupted the checkout — happens all the time.
    </p>
    <p style="color:#52525b;font-size:14px;margin:12px 0">
      Your workspace is ready and waiting. To activate ${planLabel} and start the autopilot, just complete checkout below.
    </p>
    <div style="margin:20px 0;padding:16px;background:#fef2f2;border:1px solid #fecaca;border-radius:12px">
      <p style="margin:0;font-size:14px;font-weight:700;color:#991b1b">${planLabel} — ${introPrice}/month first month</p>
      <p style="margin:6px 0 0;font-size:13px;color:#3f3f46">
        Use code <strong>INTRO50</strong> at checkout for 50% off your first month.
        ${plan === "growth" ? "Includes weekly AI articles, Reddit outreach, backlink prospecting, and AI citation monitoring." : "Includes monthly visibility monitoring, citation audit, review queue, and content ideas."}
        No contract. Cancel any time.
      </p>
    </div>
    ${btn(`${siteUrl}/scan?plan=${plan}`, `Complete ${planLabel} checkout`)}
    <p style="color:#71717a;font-size:13px;margin:20px 0 0">
      If you have questions before signing up, reply to this email. A real person will answer.
    </p>
  `);

  return { subject, html };
}

async function hasAbandonedEmailSent(businessId: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const [row] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        eq(jobs.type, "abandoned_checkout_email"),
        eq(sql`payload->>'businessId'`, businessId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

async function recordAbandonedEmailSent(businessId: string) {
  const db = getDb();
  if (!db) return;
  await db.insert(jobs).values({
    type: "abandoned_checkout_email",
    status: "completed",
    payload: { businessId },
  });
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "GravyBlock <hello@gravyblock.com>";
  if (!apiKey) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  return res.ok;
}

export async function runAbandonedCheckoutBatch(): Promise<{ sent: number; skipped: number }> {
  const db = getDb();
  if (!db) return { sent: 0, skipped: 0 };

  // Find businesses that:
  // - Have a stripeCustomerId (Stripe customer was created = checkout was initiated)
  // - Still on free tier (payment never completed)
  // - Have a billingEmail (we can reach them)
  // - Were created at least 24 hours ago (give them time to complete on their own)
  // - Not more than 14 days ago (don't spam cold old records)
  const windowStart = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const windowEnd = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const candidates = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      billingEmail: businesses.billingEmail,
      createdAt: businesses.createdAt,
    })
    .from(businesses)
    .where(
      and(
        eq(businesses.planTier, "free"),
        isNotNull(businesses.stripeCustomerId),
        isNotNull(businesses.billingEmail),
        gte(businesses.createdAt, windowStart),
      ),
    )
    .limit(50);

  let sent = 0;
  let skipped = 0;

  for (const biz of candidates) {
    const createdAt = new Date(biz.createdAt).getTime();
    if (createdAt > windowEnd.getTime()) {
      skipped++; // Too recent — hasn't been 24h yet
      continue;
    }

    if (!biz.billingEmail) { skipped++; continue; }
    if (await hasAbandonedEmailSent(biz.id)) { skipped++; continue; }

    const { subject, html } = buildEmail(biz.name, "starter");

    try {
      const ok = await sendEmail(biz.billingEmail, subject, html);
      if (ok) {
        await recordAbandonedEmailSent(biz.id);
        sent++;
      } else {
        skipped++;
      }
    } catch {
      skipped++;
    }
  }

  return { sent, skipped };
}
