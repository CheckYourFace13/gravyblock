/**
 * Shared core for the internal webhook test send — used by the admin action
 * (src/app/admin/(dashboard)/outreach/actions.ts's sendWebhookTestEmail,
 * isAdminSession-gated) and by nothing else. Extracted so a one-off
 * diagnostic invocation and the normal admin path can never drift into two
 * different implementations of "what does the test email actually send."
 */
import { getDb, jobs } from "@/lib/db";
import { recordOutreachSendRow } from "@/lib/outreach/outreach-sends";

export type WebhookTestEmailResult = { ok: boolean; error?: string; resendEmailId?: string };

export async function sendInternalWebhookTestEmail(to: string): Promise<WebhookTestEmailResult> {
  if (!to || !to.includes("@")) return { ok: false, error: "Enter a valid email you control" };

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return { ok: false, error: "Resend not configured" };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "GravyBlock webhook test — internal, not a real send",
      html: `<p>This is a one-off internal test to verify Resend webhook delivery end to end.</p>
             <p>Click this link once to help generate a click event: <a href="https://gravyblock.com/?webhook_test=1">confirm test</a></p>`,
      tags: [{ name: "type", value: "webhook_test" }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `Resend API ${res.status}: ${text}` };
  }
  const body = (await res.json()) as { id: string };

  const db = getDb();
  if (db) {
    await db.insert(jobs).values({
      type: "webhook_test_sent",
      status: "done",
      payload: { to, resendEmailId: body.id, sentAt: new Date().toISOString() },
    });
  }
  await recordOutreachSendRow({
    resendEmailId: body.id,
    recipient: to,
    campaign: "webhook_test",
    sequenceStep: "test",
    isTest: true,
  });

  return { ok: true, resendEmailId: body.id };
}
