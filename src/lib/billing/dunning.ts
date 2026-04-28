import { eq } from "drizzle-orm";
import { businesses, getDb } from "@/lib/db";
import { memoryStore } from "@/lib/db/memory-store";
import { getStripeServerClient } from "@/lib/stripe/server";

function resendConfig() {
  return {
    apiKey: process.env.RESEND_API_KEY ?? "",
    from: process.env.RESEND_FROM_EMAIL ?? "",
  };
}

async function sendEmail(input: { to: string; subject: string; html: string }) {
  const cfg = resendConfig();
  if (!cfg.apiKey || !cfg.from) {
    return { ok: false, skipped: true, reason: "missing resend config" };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      from: cfg.from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error: ${res.status} ${body}`);
  }
  return { ok: true, skipped: false };
}

/** Downgrade a business to free tier after the grace period has expired. */
export async function applyDunningDowngrade(businessId: string, reason: string): Promise<void> {
  console.info("[dunning] applying downgrade", { businessId, reason });

  const db = getDb();
  if (!db) {
    const mem = memoryStore.getBusiness(businessId);
    if (!mem) return;
    // Cancel Stripe subscription before zeroing out the plan
    if (mem.stripeSubscriptionId) {
      await cancelStripeSubscription(mem.stripeSubscriptionId);
    }
    memoryStore.updateBusinessBilling({
      businessId,
      planTier: "free",
      stripeCustomerId: mem.stripeCustomerId ?? undefined,
      stripeSubscriptionId: mem.stripeSubscriptionId ?? undefined,
      subscriptionStatus: "past_due_downgraded",
      billingEmail: mem.billingEmail ?? undefined,
      currentPeriodEnd: null,
    });
    return;
  }

  const [biz] = await db
    .select({ stripeSubscriptionId: businesses.stripeSubscriptionId })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (biz?.stripeSubscriptionId) {
    await cancelStripeSubscription(biz.stripeSubscriptionId);
  }

  await db
    .update(businesses)
    .set({
      updatedAt: new Date(),
      planTier: "free",
      subscriptionStatus: "past_due_downgraded",
    })
    .where(eq(businesses.id, businessId));
}

async function cancelStripeSubscription(stripeSubscriptionId: string): Promise<void> {
  const stripe = getStripeServerClient();
  if (!stripe) {
    console.warn("[dunning] Stripe not configured, skipping subscription cancellation");
    return;
  }
  try {
    await stripe.subscriptions.cancel(stripeSubscriptionId);
    console.info("[dunning] Stripe subscription cancelled", { stripeSubscriptionId });
  } catch (err) {
    // Log but do not throw — the DB downgrade should still proceed
    console.error("[dunning] failed to cancel Stripe subscription", { stripeSubscriptionId, err });
  }
}

/** Send the first payment failure warning email. */
export async function sendPaymentFailedEmail(payload: {
  email: string;
  businessName: string;
  planLabel: string;
  amount: number;
  retryDate: string;
  updateBillingUrl: string;
}): Promise<void> {
  const amountFormatted = payload.amount.toFixed(2);
  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
          <tr>
            <td style="padding:32px 40px 24px;border-bottom:1px solid #e5e5e5;">
              <p style="margin:0;font-size:20px;font-weight:700;color:#111111;">GravyBlock</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111111;line-height:1.3;">
                Action needed: payment failed for ${escapeHtml(payload.businessName)}
              </h1>
              <p style="margin:0 0 16px;font-size:15px;color:#444444;line-height:1.6;">
                Your <strong>${escapeHtml(payload.planLabel)}</strong> subscription payment of
                <strong>$${amountFormatted}</strong> failed. We will retry on
                <strong>${escapeHtml(payload.retryDate)}</strong>.
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#444444;line-height:1.6;">
                Update your billing info to avoid any interruption to your GravyBlock automation.
              </p>
              <a href="${payload.updateBillingUrl}"
                 style="display:inline-block;background:#111111;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 24px;border-radius:6px;">
                Update billing info
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #e5e5e5;">
              <p style="margin:0;font-size:13px;color:#888888;">
                GravyBlock &bull; Questions? Reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  await sendEmail({
    to: payload.email,
    subject: `Action needed: payment failed for ${payload.businessName}`,
    html,
  });
}

/** Send the final downgrade notice email after the second failed payment. */
export async function sendDowngradeNoticeEmail(payload: {
  email: string;
  businessName: string;
  planLabel: string;
  reactivateUrl: string;
}): Promise<void> {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
          <tr>
            <td style="padding:32px 40px 24px;border-bottom:1px solid #e5e5e5;">
              <p style="margin:0;font-size:20px;font-weight:700;color:#111111;">GravyBlock</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111111;line-height:1.3;">
                ${escapeHtml(payload.businessName)} has been moved to the free plan
              </h1>
              <p style="margin:0 0 16px;font-size:15px;color:#444444;line-height:1.6;">
                We were unable to collect payment for your <strong>${escapeHtml(payload.planLabel)}</strong> subscription.
                Your account has been moved to the free plan.
              </p>
              <p style="margin:0 0 16px;font-size:15px;color:#444444;line-height:1.6;">
                Your scan history and workspace are preserved. Reactivate anytime to resume automation.
              </p>
              <a href="${payload.reactivateUrl}"
                 style="display:inline-block;background:#111111;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 24px;border-radius:6px;">
                Reactivate plan
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #e5e5e5;">
              <p style="margin:0;font-size:13px;color:#888888;">
                GravyBlock &bull; Questions? Reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  await sendEmail({
    to: payload.email,
    subject: `${payload.businessName} has been moved to the free plan`,
    html,
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
