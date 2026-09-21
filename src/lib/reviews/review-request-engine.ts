/**
 * Review request engine: sends neutral review requests to REAL completed
 * customers whose transactions the business feeds in via the connector
 * (POST /api/connect/transactions/[token]).
 *
 * POLICY (Google review policy: no selective solicitation, no gating):
 * The ONLY eligibility inputs are (1) a completed transaction, (2) the
 * customer is not suppressed / opted out, and (3) timing. There is no rating,
 * sentiment, spend, or any other filter, and every customer gets the identical
 * email. Never add selectivity here.
 */

import { randomBytes } from "crypto";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb, businesses, businessConfigs, reviewRequests, jobs } from "@/lib/db";
import { isOptedOut, unsubscribeUrl } from "@/lib/email/optout";
import { assertOutreachSendingAllowed } from "@/lib/outreach/pause-guard";
import { checkOutreachHealth, recordOutreachSendFailure } from "@/lib/outreach/outreach-health";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MAX_PER_BUSINESS_PER_DAY = 25;
const SENT_JOB_TYPE = "review_request_customer_sent";

/** Returns the business's connector token, creating it (and a config row if needed). */
export async function ensureTransactionsToken(businessId: string): Promise<string | null> {
  const db = getDb();
  if (!db) return null;

  const [cfg] = await db
    .select({ id: businessConfigs.id, token: businessConfigs.transactionsToken })
    .from(businessConfigs)
    .where(eq(businessConfigs.businessId, businessId))
    .limit(1);

  if (cfg?.token) return cfg.token;

  const token = randomBytes(32).toString("hex");

  if (cfg) {
    await db
      .update(businessConfigs)
      .set({ transactionsToken: token, updatedAt: new Date() })
      .where(eq(businessConfigs.id, cfg.id));
  } else {
    await db
      .insert(businessConfigs)
      .values({ businessId, source: "owner_form", transactionsToken: token })
      .onConflictDoNothing({ target: businessConfigs.businessId });
  }

  // Re-read so a concurrent creator's token wins consistently.
  const [fresh] = await db
    .select({ token: businessConfigs.transactionsToken })
    .from(businessConfigs)
    .where(eq(businessConfigs.businessId, businessId))
    .limit(1);
  if (fresh?.token) return fresh.token;

  await db
    .update(businessConfigs)
    .set({ transactionsToken: token, updatedAt: new Date() })
    .where(eq(businessConfigs.businessId, businessId));
  return token;
}

export async function getReviewRequestStats(businessId: string): Promise<Record<string, number>> {
  const db = getDb();
  if (!db) return {};
  const rows = await db
    .select({ status: reviewRequests.status, n: sql<number>`count(*)::int` })
    .from(reviewRequests)
    .where(eq(reviewRequests.businessId, businessId))
    .groupBy(reviewRequests.status);
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = Number(r.n);
  return out;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Bare address from "Name <a@b.com>" or "a@b.com". */
function bareAddress(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1]! : from).trim();
}

function buildHtml(kind: "initial" | "followup", businessName: string, reviewUrl: string, unsubUrl: string): string {
  const name = escapeHtml(businessName);
  const intro =
    kind === "initial"
      ? `Thank you for choosing ${name}. We would appreciate it if you could share your honest experience in a Google review. It helps other people in the community, and it takes about a minute.`
      : `A quick follow-up from ${name}. If you have not had a chance yet, we would appreciate an honest Google review of your experience. This is the only reminder we will send.`;
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#222;">
<div style="max-width:520px;margin:0 auto;font-size:15px;line-height:1.6;">
<p>Hello,</p>
<p>${intro}</p>
<p><a href="${escapeHtml(reviewUrl)}" style="color:#1a56db;">Leave a Google review</a></p>
<p>Thank you,<br>${name}</p>
<p style="margin-top:32px;font-size:12px;color:#888;">You received this because you recently did business with ${name}. <a href="${escapeHtml(unsubUrl)}" style="color:#888;">Unsubscribe</a></p>
</div></body></html>`;
}

async function sendViaResend(params: {
  to: string;
  from: string;
  replyTo: string;
  subject: string;
  html: string;
}): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY ?? "";
  if (!apiKey) throw new Error("RESEND_API_KEY not set");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: params.from,
      to: [params.to],
      reply_to: params.replyTo,
      subject: params.subject,
      html: params.html,
    }),
  });
  if (!res.ok) throw new Error(`Resend error: ${res.status} ${await res.text()}`);
  const data = (await res.json().catch(() => ({}))) as { id?: string };
  return data.id ?? null;
}

export async function runReviewRequestSendBatch(
  limit = 40,
): Promise<{ sent: number; followedUp: number; skipped: number; stopped: number }> {
  const result = { sent: 0, followedUp: 0, skipped: 0, stopped: 0 };
  const db = getDb();
  if (!db) return result;
  if (!process.env.RESEND_API_KEY) return result;

  const health = await checkOutreachHealth();
  if (!health.healthy) return result;

  const now = Date.now();
  const minCompleted = new Date(now - 30 * DAY_MS);
  const maxCompleted = new Date(now - HOUR_MS);
  const followUpBefore = new Date(now - 7 * DAY_MS);
  const utcMidnight = new Date(now);
  utcMidnight.setUTCHours(0, 0, 0, 0);

  const baseFrom = process.env.OUTREACH_FROM_EMAIL ?? process.env.RESEND_FROM_EMAIL ?? "GravyBlock <hello@gravyblock.com>";
  const fromAddress = bareAddress(baseFrom);

  const cols = {
    id: reviewRequests.id,
    businessId: reviewRequests.businessId,
    email: reviewRequests.customerEmail,
    status: reviewRequests.status,
    bizName: businesses.name,
    placeId: businesses.placeId,
    accountEmail: businesses.accountEmail,
    billingEmail: businesses.billingEmail,
    accountType: businesses.accountType,
  };

  // Initial sends first, then follow-ups.
  const pending = await db
    .select(cols)
    .from(reviewRequests)
    .innerJoin(businesses, eq(businesses.id, reviewRequests.businessId))
    .where(
      and(
        eq(reviewRequests.status, "pending"),
        lte(reviewRequests.completedAt, maxCompleted),
        gte(reviewRequests.completedAt, minCompleted),
      ),
    )
    .orderBy(asc(reviewRequests.completedAt))
    .limit(limit);

  const followUps = await db
    .select(cols)
    .from(reviewRequests)
    .innerJoin(businesses, eq(businesses.id, reviewRequests.businessId))
    .where(
      and(
        eq(reviewRequests.status, "sent"),
        lte(reviewRequests.sentAt, followUpBefore),
        gte(reviewRequests.completedAt, minCompleted),
      ),
    )
    .orderBy(asc(reviewRequests.sentAt))
    .limit(limit);

  const todayCounts = new Map<string, number>();
  async function sentToday(businessId: string): Promise<number> {
    const cached = todayCounts.get(businessId);
    if (cached !== undefined) return cached;
    const [row] = await db!
      .select({ n: sql<number>`count(*)::int` })
      .from(jobs)
      .where(and(eq(jobs.type, SENT_JOB_TYPE), eq(jobs.businessId, businessId), gte(jobs.createdAt, utcMidnight)));
    const n = Number(row?.n ?? 0);
    todayCounts.set(businessId, n);
    return n;
  }

  const work = [
    ...pending.map((r) => ({ ...r, kind: "initial" as const })),
    ...followUps.map((r) => ({ ...r, kind: "followup" as const })),
  ].slice(0, limit);

  for (const r of work) {
    try {
      if (!r.placeId) { result.skipped++; continue; }

      const replyTo = r.accountEmail ?? r.billingEmail ?? (r.accountType === "house" ? "chris@gravyblock.com" : null);
      if (!replyTo) { result.skipped++; continue; }

      if (await isOptedOut(r.email)) {
        await db
          .update(reviewRequests)
          .set({ status: "stopped", stoppedReason: "opted_out" })
          .where(eq(reviewRequests.id, r.id));
        result.stopped++;
        continue;
      }

      if ((await sentToday(r.businessId)) >= MAX_PER_BUSINESS_PER_DAY) { result.skipped++; continue; }

      const guard = await assertOutreachSendingAllowed(r.email);
      if (!guard.allowed) { result.skipped++; break; }

      const reviewUrl = `https://search.google.com/local/writereview?placeid=${encodeURIComponent(r.placeId)}`;
      const safeName = r.bizName.replace(/["<>,\r\n]/g, "").trim() || "Your recent business";
      const subject =
        r.kind === "initial"
          ? `How was your experience with ${r.bizName}?`
          : `Reminder: how was your experience with ${r.bizName}?`;

      const resendEmailId = await sendViaResend({
        to: r.email,
        from: `"${safeName}" <${fromAddress}>`,
        replyTo,
        subject,
        html: buildHtml(r.kind, r.bizName, reviewUrl, unsubscribeUrl(r.email)),
      });

      const stamp = new Date();
      await db.insert(jobs).values({
        businessId: r.businessId,
        type: SENT_JOB_TYPE,
        status: "completed",
        payload: { businessId: r.businessId, reviewRequestId: r.id, resendEmailId, kind: r.kind },
      });
      todayCounts.set(r.businessId, (await sentToday(r.businessId)) + 1);

      if (r.kind === "initial") {
        await db.update(reviewRequests).set({ status: "sent", sentAt: stamp }).where(eq(reviewRequests.id, r.id));
        result.sent++;
      } else {
        await db
          .update(reviewRequests)
          .set({ status: "followed_up", followUpAt: stamp })
          .where(eq(reviewRequests.id, r.id));
        result.followedUp++;
      }
    } catch (err) {
      console.error("[review-request-engine] send failed", {
        reviewRequestId: r.id,
        error: err instanceof Error ? err.message : String(err),
      });
      await recordOutreachSendFailure({ source: "review_request_engine", reviewRequestId: r.id });
      result.skipped++;
    }
  }

  return result;
}
