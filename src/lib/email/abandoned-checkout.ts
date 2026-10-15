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
import { assertOutreachSendingAllowed } from "@/lib/outreach/pause-guard";
import { isOptedOut, unsubscribeFooter } from "@/lib/email/optout";

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

function buildEmail(businessName: string, _plan: string): { subject: string; html: string } {
  void _plan;
  const subject = `You left GravyBlock for ${businessName} unfinished`;

  const html = wrap(`
    <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:#991b1b">Almost there</p>
    <h1 style="margin:8px 0 0;font-size:20px;font-weight:700;color:#18181b">You started GravyBlock but didn't finish</h1>
    <p style="color:#52525b;font-size:15px;margin:16px 0">
      You were in the middle of setting up GravyBlock for <strong>${businessName}</strong>. Something interrupted checkout, which happens all the time.
    </p>
    <p style="color:#52525b;font-size:14px;margin:12px 0">
      GravyBlock finds what is hurting your visibility, does the eligible work automatically and verifies it. It is $39.99 a month.
    </p>
    ${btn(`${siteUrl}/start`, "Continue to secure checkout — $39.99/mo")}
    <p style="color:#71717a;font-size:13px;margin:12px 0">$39.99/month · Cancel anytime · 30-day money-back guarantee</p>
    <p style="color:#71717a;font-size:13px;margin:20px 0 0">
      Questions before you start? Reply to this email and our team will answer.
    </p>
  `);

  return { subject, html };
}

async function hasAbandonedEmailSent(businessId: string, type = "abandoned_checkout_email"): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const [row] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        eq(jobs.type, type),
        eq(sql`payload->>'businessId'`, businessId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

async function recordAbandonedEmailSent(businessId: string, type = "abandoned_checkout_email") {
  const db = getDb();
  if (!db) return;
  await db.insert(jobs).values({
    type,
    status: "completed",
    payload: { businessId },
  });
}

function buildFollowUpEmail(businessName: string, _plan: string): { subject: string; html: string } {
  void _plan;
  const subject = "Your GravyBlock setup is still waiting";
  const html = wrap(`
    <p style="color:#52525b;font-size:15px;margin:0 0 16px 0">Hi,</p>
    <p style="color:#52525b;font-size:15px;margin:0 0 16px 0">
      You started GravyBlock for <strong>${businessName}</strong> a few days ago but didn't finish checkout. Your setup is still there whenever you want it.
    </p>
    <p style="color:#52525b;font-size:14px;margin:0 0 16px 0">
      It is $39.99 a month, with no contract, and a 30-day money-back guarantee if it isn't right for you. If something else stopped you, reply and our team will help.
    </p>
    ${btn(`${siteUrl}/start`, "Continue to secure checkout — $39.99/mo")}
    <p style="color:#71717a;font-size:13px;margin:20px 0 0">
      No pressure. If you're not interested, ignore this; we won't send another.
    </p>
  `);
  return { subject, html };
}

async function sendEmail(to: string, subject: string, htmlIn: string): Promise<boolean> {
  let html = htmlIn;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "GravyBlock <hello@gravyblock.com>";
  if (!apiKey) return false;

  // Authoritative pause check, right at the send boundary — a business with
  // a Stripe customer but planTier="free" is a prospect who never completed
  // signup, the same acquisition-adjacent category the admin pause switch
  // is meant to cover. See pause-guard.ts.
  const pauseCheck = await assertOutreachSendingAllowed(to);
  if (!pauseCheck.allowed) return false;
  if (await isOptedOut(to)) return false;
  html = html.replace("</div></body></html>", `${unsubscribeFooter(to)}</div></body></html>`);

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
  // - Were created at least 1 hour ago — recover the impulse while it's still warm.
  //   (Worker ticks every 15 min, so the first email lands ~1h after abandonment.)
  // - Not more than 14 days ago (don't spam cold old records)
  const windowStart = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const windowEnd = new Date(Date.now() - 60 * 60 * 1000);

  const candidates = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      billingEmail: businesses.billingEmail,
      createdAt: businesses.createdAt,
      pendingPlan: businesses.pendingPlan,
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

  const window3dStart = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const window3dEnd = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

  for (const biz of candidates) {
    const createdAt = new Date(biz.createdAt).getTime();
    if (!biz.billingEmail) { skipped++; continue; }
    const plan = ["starter", "growth", "pro", "agency"].includes(biz.pendingPlan ?? "")
      ? (biz.pendingPlan as string)
      : "starter";

    // Day 1 email: fires 24–72h after checkout was started
    const past24h = createdAt <= windowEnd.getTime();
    const past72h = createdAt <= window3dEnd.getTime();

    if (!past24h) {
      skipped++; // Too recent
      continue;
    }

    const firstSent = await hasAbandonedEmailSent(biz.id, "abandoned_checkout_email");

    if (!firstSent) {
      const { subject, html } = buildEmail(biz.name, plan);
      try {
        const ok = await sendEmail(biz.billingEmail, subject, html);
        if (ok) { await recordAbandonedEmailSent(biz.id, "abandoned_checkout_email"); sent++; }
        else skipped++;
      } catch { skipped++; }
      continue;
    }

    // Day 3 follow-up: fires 72h+ after checkout, only if first email already sent and no follow-up yet
    if (past72h && !await hasAbandonedEmailSent(biz.id, "abandoned_checkout_followup")) {
      const { subject, html } = buildFollowUpEmail(biz.name, plan);
      try {
        const ok = await sendEmail(biz.billingEmail, subject, html);
        if (ok) { await recordAbandonedEmailSent(biz.id, "abandoned_checkout_followup"); sent++; }
        else skipped++;
      } catch { skipped++; }
      continue;
    }

    skipped++;
  }

  return { sent, skipped };
}
