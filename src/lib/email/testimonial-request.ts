/**
 * Testimonial request — sent once to paid customers ~21 days after they
 * subscribe, asking for a short testimonial via /feedback. This is how we
 * build social proof. Deduped per business via jobs (type =
 * testimonial_request_<businessId>). Runs once/day from the worker.
 */

import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { getDb, businesses, jobs } from "@/lib/db";

const PAID_TIERS = ["starter", "growth", "pro", "agency", "base", "managed", "entry"];
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com";

function resendConfig() {
  return {
    apiKey: process.env.RESEND_API_KEY ?? "",
    from: process.env.RESEND_FROM_EMAIL ?? "Chris at GravyBlock <chris@gravyblock.com>",
  };
}

function buildEmail(businessName: string, feedbackUrl: string): { html: string; text: string } {
  const text = `Hi,

It's Chris, the founder of GravyBlock. You've been with us a few weeks now, and I'd genuinely love to hear how it's going for ${businessName}.

If GravyBlock has been useful, would you share a sentence or two? It takes 30 seconds and it honestly helps a small team more than you'd think:

${feedbackUrl}

And if something's NOT working, I want to hear that even more — just reply to this email and it comes straight to me.

Thanks for being one of our early customers.

Chris
GravyBlock`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.65;color:#1a1a1a;max-width:540px;margin:0 auto;padding:32px 20px;background:#fff">
  <p style="margin:0 0 18px">Hi,</p>
  <p style="margin:0 0 18px">It's Chris, the founder of GravyBlock. You've been with us a few weeks now, and I'd genuinely love to hear how it's going for <strong>${businessName}</strong>.</p>
  <p style="margin:0 0 18px">If GravyBlock has been useful, would you share a sentence or two? It takes 30 seconds and it honestly helps a small team more than you'd think:</p>
  <p style="margin:0 0 24px;text-align:center">
    <a href="${feedbackUrl}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 28px;border-radius:999px">Share my experience →</a>
  </p>
  <p style="margin:0 0 18px;font-size:14px;color:#555">And if something's <strong>not</strong> working, I want to hear that even more — just reply to this email and it comes straight to me.</p>
  <p style="margin:0 0 6px;font-size:14px">Thanks for being one of our early customers.<br/>Chris<br/><a href="${SITE_URL}" style="color:#dc2626;text-decoration:none">GravyBlock</a></p>
</body></html>`;

  return { html, text };
}

export async function runTestimonialRequestBatch(batchSize = 10): Promise<{ sent: number }> {
  const cfg = resendConfig();
  if (!cfg.apiKey) return { sent: 0 };

  const db = getDb();
  if (!db) return { sent: 0 };

  // Paid businesses that subscribed 21–45 days ago (give them time to see value).
  const windowStart = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
  const windowEnd = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000);

  const candidates = await db
    .select({ id: businesses.id, name: businesses.name, email: businesses.billingEmail })
    .from(businesses)
    .where(
      and(
        inArray(businesses.planTier, PAID_TIERS),
        gte(businesses.createdAt, windowStart),
        lte(businesses.createdAt, windowEnd),
        ne(businesses.accountType, "house"),
      ),
    )
    .limit(batchSize * 3);

  let sent = 0;

  for (const biz of candidates) {
    if (sent >= batchSize) break;
    if (!biz.email) continue;

    // Dedup: one request per business, ever.
    const jobType = `testimonial_request_${biz.id}`;
    const [already] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.type, jobType)).limit(1);
    if (already) continue;

    const feedbackUrl = `${SITE_URL}/feedback?b=${biz.id}`;
    const { html, text } = buildEmail(biz.name, feedbackUrl);

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({
          from: cfg.from,
          to: [biz.email],
          subject: `How's GravyBlock working for ${biz.name}?`,
          html,
          text,
          tags: [{ name: "type", value: "testimonial_request" }],
        }),
      });
      if (res.ok) {
        await db.insert(jobs).values({ id: randomUUID(), type: jobType, status: "done", payload: { email: biz.email } });
        sent++;
      }
    } catch (err) {
      console.error("[testimonial-request] send failed", { businessId: biz.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { sent };
}
