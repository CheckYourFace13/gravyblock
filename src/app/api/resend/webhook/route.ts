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
import { newWebhookDiagnostic, persistWebhookDiagnostic, type WebhookDiagnosticRecord } from "@/lib/integrations/webhook-diagnostics";

type ResendWebhookPayload = {
  type: string; // "email.opened", "email.clicked", etc.
  data: {
    email_id?: string;
    to?: string[];
    // Confirmed via a real production crash (TypeError: tags.find is not a
    // function on a real signed "bounced" event): Resend's actual webhook
    // callback does NOT always send tags back in the [{name,value}] array
    // shape we send outbound — observed as something else entirely for at
    // least this event type. Typed `unknown` deliberately; never assume a
    // shape for data we don't control without runtime-checking it first.
    tags?: unknown;
    click?: { link?: string };
    bounce?: { message?: string };
  };
};

/**
 * Resend's outbound send API takes tags as [{name,value}], but the webhook
 * CALLBACK payload's shape for the same field isn't guaranteed to match —
 * handles the array shape, a plain {name: value} object map, and anything
 * else without throwing, so a shape Resend didn't document (or changed)
 * degrades to "no tag found" instead of crashing the whole request.
 */
function extractTagValue(tags: unknown, tagName: string): string | null {
  if (Array.isArray(tags)) {
    for (const entry of tags) {
      if (entry && typeof entry === "object" && (entry as { name?: unknown }).name === tagName) {
        const value = (entry as { value?: unknown }).value;
        return typeof value === "string" ? value : null;
      }
    }
    return null;
  }
  if (tags && typeof tags === "object") {
    const value = (tags as Record<string, unknown>)[tagName];
    return typeof value === "string" ? value : null;
  }
  return null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const diag = newWebhookDiagnostic();

  async function respond(body: Record<string, unknown>, status: number): Promise<NextResponse> {
    diag.stage = "response_sent";
    diag.httpStatus = status;
    await persistWebhookDiagnostic(diag);
    return NextResponse.json(body, { status });
  }

  // Top-level safety net: a real, correctly-signed Resend delivery attempt
  // (email.delivered for a controlled test send) was observed hitting this
  // route and getting back a blank 500 with no response body — meaning
  // something between here and the final response was throwing UNCAUGHT.
  // Every step below already had its own narrow try/catch except this outer
  // shell, so nothing was logging *which* step failed or *why*. This diag
  // record + the outer catch together mean the exact failing stage is now
  // visible from /admin/webhook-diagnostics without needing server-log access.
  try {
    // Traced root cause: @next/env caches its loaded result at module scope
    // the first time it runs in this process (Next's own bootstrap does this
    // automatically) — every later call without forceReload returns that
    // stale cache for the rest of the process's life, regardless of what's
    // actually on disk. Force a fresh read here so this route's view of the
    // secret can never lag behind an admin-triggered .env update.
    reloadEnvFromDisk();
    diag.stage = "env_loaded";
    const secret = process.env.RESEND_WEBHOOK_SECRET ?? "";
    const svixId = req.headers.get("svix-id");
    const svixTimestamp = req.headers.get("svix-timestamp");
    const svixSignature = req.headers.get("svix-signature");
    diag.svixMessageId = svixId;
    diag.signatureHeadersPresent = Boolean(svixId && svixTimestamp && svixSignature);
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
      diag.signatureVerified = false;
      return await respond({ error: "Webhook not configured" }, 500);
    }

    // Verify webhook authenticity. Uses the raw request text above — never
    // JSON.parse'd-then-stringified — per Resend's documented verification
    // method (their signature is sensitive to any reformatting).
    let signatureValid: boolean;
    try {
      signatureValid = verifyResendSignature(body, svixId, svixTimestamp, svixSignature, secret);
    } catch (sigErr) {
      // A signature-verification bug must surface as a controlled 401
      // (still fail-closed), never as an unlogged, unexplained 500.
      diag.exceptionClass = sigErr instanceof Error ? sigErr.constructor.name : "unknown";
      diag.exceptionMessage = sigErr instanceof Error ? sigErr.message : String(sigErr);
      diag.stack = sigErr instanceof Error ? (sigErr.stack ?? null) : null;
      diag.signatureVerified = false;
      console.error("[resend-webhook] verifyResendSignature threw", { error: diag.exceptionMessage });
      return await respond({ error: "Signature verification error" }, 401);
    }
    diag.signatureVerified = signatureValid;
    if (!signatureValid) {
      return await respond({ error: "Invalid signature" }, 401);
    }
    diag.stage = "signature_verified";

    return await handleVerifiedWebhook(body, svixId, diag, respond);
  } catch (err) {
    diag.exceptionClass = err instanceof Error ? err.constructor.name : "unknown";
    diag.exceptionMessage = err instanceof Error ? err.message : String(err);
    diag.stack = err instanceof Error ? (err.stack ?? null) : null;
    console.error("[resend-webhook] UNCAUGHT exception in webhook route", {
      error: diag.exceptionMessage,
      stage: diag.stage,
    });
    // Safe to return: the exception message/stack, never env values or the
    // request body/signature.
    return await respond({ error: "Internal error", detail: diag.exceptionMessage }, 500);
  }
}

async function handleVerifiedWebhook(
  body: string,
  svixId: string | null,
  diag: WebhookDiagnosticRecord,
  respond: (body: Record<string, unknown>, status: number) => Promise<NextResponse>,
): Promise<NextResponse> {
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
      return await respond({ error: "Invalid payload" }, 400);
    }
    payload = parsed as ResendWebhookPayload;
  } catch {
    return await respond({ error: "Invalid JSON" }, 400);
  }
  diag.stage = "body_parsed";

  const db = getDb();
  if (!db) return await respond({ ok: true }, 200); // no DB, silently accept

  const eventType = payload.type?.replace("email.", "") ?? "unknown"; // "opened", "clicked", etc.
  const emailId = payload.data?.email_id ?? null;
  const recipient = payload.data?.to?.[0] ?? null;
  const clickUrl = payload.data?.click?.link ?? null;
  diag.eventType = eventType;
  diag.resendEmailId = emailId;

  // Derive email type from Resend tags (we set type tag when sending)
  const emailType = extractTagValue(payload.data?.tags, "type");
  diag.stage = "event_normalized";

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
  diag.stage = "email_event_insert_started";
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
      diag.exceptionClass = fallbackErr instanceof Error ? fallbackErr.constructor.name : "unknown";
      diag.exceptionMessage = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      diag.stack = fallbackErr instanceof Error ? (fallbackErr.stack ?? null) : null;
      console.error("[resend-webhook] fallback insert also failed", { error: diag.exceptionMessage });
    }
  }
  if (inserted) diag.stage = "email_event_insert_succeeded";

  // Primary correlation: resolve to a first-class outreach-send row by
  // Resend's own email id, not by round-tripped tags (see the emailType-tag
  // mismatch this was investigated for). No-op if no such row exists
  // (historical sends predate this table, or this event is for a non-
  // outreach email category). Wrapped explicitly: a correlation bug must
  // never take down the whole request after the real event was already
  // durably persisted above.
  if (inserted) {
    diag.stage = "outreach_correlation_started";
    try {
      await applyWebhookEventToOutreachSend(emailId, eventType);
      diag.stage = "outreach_correlation_succeeded";
    } catch (correlationErr) {
      console.error("[resend-webhook] outreach-send correlation failed (event already persisted)", {
        error: correlationErr instanceof Error ? correlationErr.message : String(correlationErr),
      });
    }
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

  return await respond({ ok: true }, 200);
}
