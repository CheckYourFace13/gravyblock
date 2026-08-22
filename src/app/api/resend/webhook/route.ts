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
import { verifyResendSignature } from "@/lib/integrations/verify-resend-signature";
import { applyWebhookEventToOutreachSend } from "@/lib/outreach/outreach-sends";
import { reloadEnvFromDisk } from "@/lib/env/reload-env";

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

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Traced root cause: @next/env caches its loaded result at module scope
  // the first time it runs in this process (Next's own bootstrap does this
  // automatically) — every later call without forceReload returns that
  // stale cache for the rest of the process's life, regardless of what's
  // actually on disk. Force a fresh read here so this route's view of the
  // secret can never lag behind an admin-triggered .env update.
  reloadEnvFromDisk();
  const secret = process.env.RESEND_WEBHOOK_SECRET ?? "";
  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");
  const body = await req.text();

  // FAIL CLOSED: a missing secret must never mean "skip verification and
  // accept" — that let anyone who found this URL POST fabricated
  // delivered/opened/clicked/bounced/complained events. Previously
  // `if (secret && !verify(...))` short-circuited to `false` (accept)
  // whenever `secret` was empty, which is exactly what was happening in
  // production (RESEND_WEBHOOK_SECRET was unset). Now a missing secret is a
  // hard configuration error that rejects every request until it's fixed.
  if (!secret) {
    console.error("[resend-webhook] CRITICAL: RESEND_WEBHOOK_SECRET is not configured — rejecting all webhook requests until this is fixed");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  // Verify webhook authenticity. Uses the raw request text above — never
  // JSON.parse'd-then-stringified — per Resend's documented verification
  // method (their signature is sensitive to any reformatting).
  if (!verifyResendSignature(body, svixId, svixTimestamp, svixSignature, secret)) {
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

  // Idempotent on svix-id: Resend/Svix retries and dashboard "replay" reuse
  // the same svix-id for the same logical delivery attempt. onConflictDoNothing
  // means a retry/replay can never create a duplicate row, double-count a
  // bounce/open/click in the funnel, or fire the opt-out side effect twice.
  // (svixId can be null for a manually-posted/legacy event — those aren't
  // deduped against each other, which matches prior behavior for those cases.)
  //
  // `inserted` starts false, not true: a caught exception below must never
  // be treated as "the row landed" — that was a real bug (confirmed live:
  // the svix_message_id column was missing from production's email_events
  // table, so every insert threw, was swallowed here, and downstream
  // correlation/opt-out logic ran anyway as if the event had been recorded,
  // when in fact zero rows were ever persisted).
  let inserted = false;
  try {
    const rows = await db
      .insert(emailEvents)
      .values({
        eventType,
        emailId,
        recipient,
        emailType,
        clickUrl,
        svixMessageId: svixId,
        metadata: payload.data as Record<string, unknown>,
      })
      .onConflictDoNothing({ target: emailEvents.svixMessageId })
      .returning({ id: emailEvents.id });
    inserted = rows.length > 0;
  } catch (err) {
    console.error("[resend-webhook] insert with svixMessageId failed — retrying without it (schema may not be migrated yet)", {
      error: err instanceof Error ? err.message : String(err),
    });
    // Fall back to the pre-idempotency insert shape so an event is still
    // captured (without dedup protection) rather than silently lost while
    // the svix_message_id column isn't present on this DB yet.
    try {
      const rows = await db
        .insert(emailEvents)
        .values({ eventType, emailId, recipient, emailType, clickUrl, metadata: payload.data as Record<string, unknown> })
        .returning({ id: emailEvents.id });
      inserted = rows.length > 0;
    } catch (fallbackErr) {
      console.error("[resend-webhook] fallback insert also failed", {
        error: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
      });
    }
  }

  // Primary correlation: resolve to a first-class outreach-send row by
  // Resend's own email id, not by round-tripped tags (see the emailType-tag
  // mismatch this was investigated for). No-op if no such row exists
  // (historical sends predate this table, or this event is for a non-
  // outreach email category).
  if (inserted) {
    await applyWebhookEventToOutreachSend(emailId, eventType);
  }

  // Auto-add bounces and complaints to opt-out list — only on the first
  // delivery of this event, never on a deduped retry/replay.
  if (inserted && (eventType === "bounced" || eventType === "complained")) {
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
