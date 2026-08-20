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

import { createHmac, timingSafeEqual } from "node:crypto";
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

const TOLERANCE_SECONDS = 5 * 60;

/**
 * Resend signs webhooks the Svix way: HMAC-SHA256 over "id.timestamp.body"
 * using the base64 payload after the "whsec_" prefix, base64-encoded, and
 * sent as one or more space-separated "v1,<sig>" values in svix-signature.
 * Any match is valid (supports secret rotation). Previously this always
 * returned true, so anyone who found this URL could POST fabricated
 * opened/clicked/delivered/bounced events into emailEvents — the same table
 * the outreach funnel dashboard reads from.
 */
function verifySignature(
  body: string,
  svixId: string | null,
  svixTimestamp: string | null,
  svixSignature: string | null,
  secret: string,
): boolean {
  if (!svixId || !svixTimestamp || !svixSignature || !secret) return false;

  const timestampNum = Number(svixTimestamp);
  if (!Number.isFinite(timestampNum)) return false;
  if (Math.abs(Date.now() / 1000 - timestampNum) > TOLERANCE_SECONDS) return false;

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${svixId}.${svixTimestamp}.${body}`;
  const expected = createHmac("sha256", secretBytes).update(signedContent).digest("base64");
  const expectedBuf = Buffer.from(expected, "base64");

  return svixSignature
    .split(" ")
    .map((part) => part.split(",")[1])
    .filter((sig): sig is string => Boolean(sig))
    .some((sig) => {
      try {
        const sigBuf = Buffer.from(sig, "base64");
        return sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf);
      } catch {
        return false;
      }
    });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.RESEND_WEBHOOK_SECRET ?? "";
  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");
  const body = await req.text();

  // Verify webhook authenticity in production
  if (secret && !verifySignature(body, svixId, svixTimestamp, svixSignature, secret)) {
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
