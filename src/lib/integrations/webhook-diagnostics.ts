/**
 * Per-request diagnostic log for the Resend webhook route — reuses the
 * existing `jobs` table (type="webhook_diagnostic") rather than adding new
 * schema, given the self-deploy pipeline's schema-push step has already
 * caused one real incident this session. Exists to answer "which exact
 * stage failed and why" without needing VPS/server-log access: every
 * request writes one row, at whatever stage it reached, right before the
 * response is sent.
 *
 * Never logs: the webhook secret, the raw signature value, API keys, or
 * email body/content. Safe to keep long-term as a lightweight request log —
 * see /admin/webhook-diagnostics for the permanent, admin-gated viewer.
 */
import { getDb, jobs } from "@/lib/db";

export type WebhookStage =
  | "request_received"
  | "env_loaded"
  | "signature_verified"
  | "body_parsed"
  | "event_normalized"
  | "email_event_insert_started"
  | "email_event_insert_succeeded"
  | "outreach_correlation_started"
  | "outreach_correlation_succeeded"
  | "response_sent";

export type WebhookDiagnosticRecord = {
  stage: WebhookStage;
  eventType: string | null;
  resendEmailId: string | null;
  svixMessageId: string | null;
  signatureHeadersPresent: boolean;
  signatureVerified: boolean | null; // null = never reached verification
  httpStatus: number | null;
  exceptionClass: string | null;
  exceptionMessage: string | null;
  stack: string | null;
};

export function newWebhookDiagnostic(): WebhookDiagnosticRecord {
  return {
    stage: "request_received",
    eventType: null,
    resendEmailId: null,
    svixMessageId: null,
    signatureHeadersPresent: false,
    signatureVerified: null,
    httpStatus: null,
    exceptionClass: null,
    exceptionMessage: null,
    stack: null,
  };
}

/** Fire-and-forget by design — a logging failure must never affect the webhook response. */
export async function persistWebhookDiagnostic(record: WebhookDiagnosticRecord): Promise<void> {
  try {
    const db = getDb();
    if (!db) return;
    await db.insert(jobs).values({
      type: "webhook_diagnostic",
      status: record.httpStatus && record.httpStatus < 400 ? "ok" : "failed",
      payload: { ...record },
    });
  } catch (err) {
    console.error("[webhook-diagnostics] failed to persist diagnostic record (non-fatal)", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
