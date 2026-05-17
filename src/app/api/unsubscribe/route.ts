/**
 * One-click email unsubscribe handler.
 * Handles both drip leads and cold outreach opt-outs.
 *
 * GET /api/unsubscribe?e=<base64-email>&lid=<leadId-optional>
 *
 * - If lid is provided: sets leads.pipelineStatus = 'unsubscribed'
 * - Always: records an email_optout job so all future emails skip this address
 * - Returns a plain confirmation page (no login required)
 */

import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getDb, leads, jobs } from "@/lib/db";

function decodeEmail(encoded: string): string | null {
  try {
    return Buffer.from(encoded, "base64url").toString("utf-8");
  } catch {
    try {
      return Buffer.from(encoded, "base64").toString("utf-8");
    } catch {
      return null;
    }
  }
}

function confirmationPage(email: string) {
  return new NextResponse(
    `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Unsubscribed — GravyBlock</title>
</head>
<body style="font-family:system-ui,sans-serif;background:#fafafa;min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0;padding:24px">
  <div style="max-width:480px;text-align:center">
    <p style="font-size:48px;margin:0 0 16px">✓</p>
    <h1 style="font-size:22px;font-weight:700;color:#18181b;margin:0 0 8px">You're unsubscribed</h1>
    <p style="font-size:15px;color:#52525b;margin:0 0 24px">
      <strong>${email}</strong> has been removed from all GravyBlock marketing emails.
      You won't hear from us again.
    </p>
    <a href="https://gravyblock.com" style="font-size:14px;color:#dc2626">← Back to GravyBlock</a>
  </div>
</body>
</html>`,
    { status: 200, headers: { "content-type": "text/html" } },
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const encodedEmail = searchParams.get("e");
  const leadId = searchParams.get("lid");

  if (!encodedEmail) {
    return new NextResponse("Missing email parameter", { status: 400 });
  }

  const email = decodeEmail(encodedEmail);
  if (!email || !email.includes("@")) {
    return new NextResponse("Invalid unsubscribe link", { status: 400 });
  }

  const db = getDb();
  if (db) {
    // Mark the lead as unsubscribed if we have their lead ID
    if (leadId) {
      await db
        .update(leads)
        .set({ pipelineStatus: "unsubscribed" })
        .where(eq(leads.id, leadId))
        .catch(() => {}); // don't fail the page load if this errors
    }

    // Also mark any lead with this email address (belt and suspenders)
    await db
      .update(leads)
      .set({ pipelineStatus: "unsubscribed" })
      .where(eq(sql`lower(${leads.email})`, email.toLowerCase()))
      .catch(() => {});

    // Record opt-out for cold outreach and any future emails
    const alreadyOptedOut = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(eq(jobs.type, "email_optout"))
      .where(eq(sql`lower(payload->>'email')`, email.toLowerCase()))
      .limit(1)
      .catch(() => []);

    if (alreadyOptedOut.length === 0) {
      await db
        .insert(jobs)
        .values({
          type: "email_optout",
          status: "completed",
          payload: { email: email.toLowerCase(), unsubscribedAt: new Date().toISOString() },
        })
        .catch(() => {});
    }

    console.info("[unsubscribe] opted out", { email, leadId });
  }

  return confirmationPage(email);
}
