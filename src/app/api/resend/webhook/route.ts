/**
 * Resend email event webhook
 * Tracks opens, clicks, bounces, and complaints for all outbound emails.
 *
 * Setup in Resend dashboard:
 *   Webhooks → Add endpoint → https://gravyblock.com/api/resend/webhook
 *   Events to enable: email.opened, email.clicked, email.bounced, email.complained, email.delivered
 *
 * Signing secret: set RESEND_WEBHOOK_SECRET env var (from Resend dashboard).
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb, emailEvents } from "@/lib/db";

type ResendWebhookPayload = {
  type: string; // "email.opened", "email.clicked", etc.
  data: {
    email_id?: string;
    to?: string[];
    tags?: Array<{ name: string; value: string }>;
    click?: { link?: string };
    bounce?: { message?: string };
  };
};

function verifySignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  // Resend uses svix-style webhook signatures
  // For simplicity we check the raw signature header
  // Production: use the @svix/webhook package or implement HMAC-SHA256 verify
  return true; // TODO: implement proper svix signature verification
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.RESEND_WEBHOOK_SECRET ?? "";
  const signature = req.headers.get("svix-signature");
  const body = await req.text();

  // Verify webhook authenticity in production
  if (secret && !verifySignature(body, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: ResendWebhookPayload;
  try {
    const parsed: unknown = JSON.parse(body);
    // "null", "42", "\"x\"", "[]" are all valid JSON but not the {type, data}
    // shape we need — JSON.parse succeeds on these (doesn't throw), so
    // without this check a bare non-object body reaches payload.type below
    // and crashes with an uncaught TypeError (raw 500, no response body).
    // This is exactly what triggered Resend's "endpoint is failing" alert —
    // confirmed by reproducing it with a literal `null` body.
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    payload = parsed as ResendWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const db = getDb();
  if (!db) return NextResponse.json({ ok: true }); // no DB, silently accept

  const eventType = payload.type?.replace("email.", "") ?? "unknown"; // "opened", "clicked", etc.
  const emailId = payload.data?.email_id ?? null;
  const recipient = payload.data?.to?.[0] ?? null;
  const clickUrl = payload.data?.click?.link ?? null;

  // Derive email type from Resend tags (we set type tag when sending)
  const emailType = payload.data?.tags?.find((t) => t.name === "type")?.value ?? null;

  try {
    await db.insert(emailEvents).values({
      eventType,
      emailId,
      recipient,
      emailType,
      clickUrl,
      metadata: payload.data as Record<string, unknown>,
    });
  } catch (err) {
    console.error("[resend-webhook] insert failed", { error: err instanceof Error ? err.message : String(err) });
  }

  // Auto-add bounces and complaints to opt-out list
  if (eventType === "bounced" || eventType === "complained") {
    if (recipient) {
      try {
        const { recordOptOut } = await import("@/lib/email/optout");
        await recordOptOut(recipient);
        console.info("[resend-webhook] auto opted out", { recipient, reason: eventType });
      } catch { /* non-fatal */ }
    }
  }

  return NextResponse.json({ ok: true });
}
