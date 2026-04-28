/**
 * Review request campaign: emails paid-plan owners asking them to prompt
 * their customers for a Google review. Runs weekly via the worker.
 *
 * Uses the jobs table to track sends so each business only gets one email
 * per campaign cycle (type = "review_request_sent").
 */

import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb, businesses, jobs } from "@/lib/db";
import { normalizePlanTierFromDb } from "@/lib/plans";

const PAID_TIERS = ["starter", "growth", "pro", "agency", "base", "managed", "entry"];
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com";

function resendConfig() {
  return {
    apiKey: process.env.RESEND_API_KEY ?? "",
    from: process.env.RESEND_FROM_EMAIL ?? "GravyBlock <hello@gravyblock.com>",
  };
}

async function sendEmail(to: string, subject: string, html: string) {
  const cfg = resendConfig();
  if (!cfg.apiKey) return { ok: false, reason: "no api key" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({ from: cfg.from, to: [to], subject, html }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error: ${res.status} ${body}`);
  }
  return { ok: true };
}

function buildReviewRequestHtml(businessName: string, reviewUrl: string, workspaceUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
<tr><td style="padding:32px 40px 24px;border-bottom:1px solid #e5e5e5;">
  <p style="margin:0;font-size:20px;font-weight:700;color:#111;">GravyBlock</p>
</td></tr>
<tr><td style="padding:32px 40px;">
  <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111;line-height:1.3;">
    One small action that helps ${businessName} rank higher
  </h1>
  <p style="margin:0 0 16px;font-size:15px;color:#444;line-height:1.6;">
    Google reviews are one of the strongest signals for local search. Even a handful of new reviews this week can move your ranking.
  </p>
  <p style="margin:0 0 24px;font-size:15px;color:#444;line-height:1.6;">
    Here is a simple ask: share your Google review link with your last 5 customers. One sentence, via text or email, is enough.
    Most satisfied customers are happy to leave a review when asked directly.
  </p>
  <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#111;">Your Google review link:</p>
  <a href="${reviewUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:6px;margin-bottom:24px;">
    Open review page
  </a>
  <p style="margin:0 0 16px;font-size:14px;color:#444;line-height:1.6;">
    Copy that link and text it to a recent customer: <em>"Hey, would you mind leaving us a Google review? It really helps. Here's the link: [paste link]"</em>
  </p>
  <p style="margin:0 0 16px;font-size:14px;color:#666;line-height:1.6;">
    GravyBlock is tracking your review count and will let you know when it moves. Your latest visibility report is in your workspace.
  </p>
  <a href="${workspaceUrl}" style="display:inline-block;background:#f4f4f5;color:#111;text-decoration:none;font-size:13px;font-weight:600;padding:10px 20px;border-radius:6px;">
    View my workspace
  </a>
</td></tr>
<tr><td style="padding:24px 40px;border-top:1px solid #e5e5e5;">
  <p style="margin:0;font-size:13px;color:#888;">GravyBlock &bull; <a href="${siteUrl}" style="color:#888;">gravyblock.com</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export async function runReviewRequestBatch(): Promise<{ sent: number; skipped: number }> {
  const db = getDb();
  if (!db) return { sent: 0, skipped: 0 };

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  // Find paid businesses with a billing email
  const allPaid = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      billingEmail: businesses.billingEmail,
      placeId: businesses.placeId,
      googleMapsUri: businesses.googleMapsUri,
      planTier: businesses.planTier,
    })
    .from(businesses)
    .where(inArray(businesses.planTier, PAID_TIERS))
    .limit(50);

  let sent = 0;
  let skipped = 0;

  for (const biz of allPaid) {
    if (!biz.billingEmail) { skipped++; continue; }

    // Skip if already sent a review request this week (JSONB payload check)
    const [existing] = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          eq(jobs.type, "review_request_sent"),
          gte(jobs.createdAt, weekAgo),
          sql`${jobs.payload}->>'businessId' = ${biz.id}`,
        ),
      )
      .limit(1);

    if (existing) { skipped++; continue; }

    // Build the review URL
    const reviewUrl = biz.placeId
      ? `https://search.google.com/local/writereview?placeid=${biz.placeId}`
      : biz.googleMapsUri ?? `https://www.google.com/search?q=${encodeURIComponent(biz.name + " reviews")}`;

    const workspaceUrl = `${siteUrl}/workspace/${biz.id}`;

    try {
      await sendEmail(
        biz.billingEmail,
        `Quick tip to help ${biz.name} get more Google reviews this week`,
        buildReviewRequestHtml(biz.name, reviewUrl, workspaceUrl),
      );

      await db.insert(jobs).values({
        type: "review_request_sent",
        status: "completed",
        payload: { businessId: biz.id, email: biz.billingEmail },
      });

      sent++;
    } catch (err) {
      console.error("[review-request] send failed", {
        businessId: biz.id,
        error: err instanceof Error ? err.message : String(err),
      });
      skipped++;
    }
  }

  return { sent, skipped };
}
