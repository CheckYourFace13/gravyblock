import { timingSafeEqual, createHmac } from "node:crypto";
import { getDb, jobs } from "@/lib/db";
import { isOptedOut } from "@/lib/email/optout";

/**
 * TEMPORARY, secret-gated, one-off sender for personal (non-cold-outreach)
 * founder follow-ups to specific already-approved recipients. Deliberately
 * separate from src/lib/outreach/outreach-emailer.ts and outreach_sends:
 * these are not cold-outreach/prospect-acquisition sends, so they must not
 * go through assertOutreachSendingAllowed() (which fails closed while
 * outreach is paused — correct for that pipeline, wrong for a manual reply)
 * or land in outreach_sends (which the pause-integrity watchdog in
 * pause-guard.ts scans and would falsely flag as a violation). Still
 * respects the real suppression list via isOptedOut(). Logged to `jobs`
 * only, for a lightweight audit trail. Remove once the two approved sends
 * are done.
 */
function authorized(req: Request): boolean {
  const expected = process.env.ADMIN_SECRET ?? "";
  const provided = req.headers.get("x-admin-secret") ?? "";
  if (!expected || !provided) return false;
  const a = createHmac("sha256", "manual-send").update(provided).digest();
  const b = createHmac("sha256", "manual-send").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { to, subject, html } = (await req.json()) as { to?: string; subject?: string; html?: string };
  if (!to || !to.includes("@") || !subject || !html) {
    return Response.json({ error: "to, subject, html required" }, { status: 400 });
  }

  if (await isOptedOut(to)) {
    return Response.json({ error: "recipient_opted_out", ok: false }, { status: 409 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return Response.json({ error: "resend_not_configured" }, { status: 500 });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
      tags: [{ name: "type", value: "manual_founder_followup" }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return Response.json({ ok: false, error: `Resend API ${res.status}: ${text}` }, { status: 502 });
  }
  const body = (await res.json()) as { id: string };

  const db = getDb();
  if (db) {
    await db.insert(jobs).values({
      type: "manual_founder_followup_sent",
      status: "done",
      payload: { to, subject, resendEmailId: body.id, sentAt: new Date().toISOString() },
    });
  }

  return Response.json({ ok: true, resendEmailId: body.id });
}
