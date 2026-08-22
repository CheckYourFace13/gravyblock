/**
 * Read-only checks against Resend's own webhook-management API — used to
 * verify what's actually registered in Resend's account settings, since the
 * app code existing and working is not the same as Resend being configured
 * to call it. Never logs or returns the API key or a signing secret to
 * callers outside this module.
 */

import { reloadEnvFromDisk } from "@/lib/env/reload-env";

const RESEND_API_BASE = "https://api.resend.com";

export type ResendWebhook = {
  id: string;
  createdAt: string;
  status: string;
  endpoint: string;
  events: string[];
};

export type SecretCheckResult = {
  ok: boolean;
  matches: boolean | null; // null = couldn't determine (API error, no webhook found, or env var unset)
  error?: string;
};

function apiKey(): string {
  return process.env.RESEND_API_KEY ?? "";
}

export async function listResendWebhooks(): Promise<{ ok: boolean; webhooks: ResendWebhook[]; error?: string }> {
  const key = apiKey();
  if (!key) return { ok: false, webhooks: [], error: "RESEND_API_KEY not configured" };

  const res = await fetch(`${RESEND_API_BASE}/webhooks`, {
    headers: { authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    return { ok: false, webhooks: [], error: `Resend API ${res.status}` };
  }
  const body = (await res.json()) as { data?: Array<{ id: string; created_at: string; status: string; endpoint: string; events: string[] }> };
  return {
    ok: true,
    webhooks: (body.data ?? []).map((w) => ({
      id: w.id,
      createdAt: w.created_at,
      status: w.status,
      endpoint: w.endpoint,
      events: w.events,
    })),
  };
}

export type ResendEmailStatus = {
  ok: boolean;
  lastEvent: string | null;
  error?: string;
};

/**
 * Retrieves Resend's own record of what happened to a specific sent email —
 * independent of whether our webhook ever received anything for it. Lets us
 * tell "Resend delivered it but our webhook never fired" apart from "Resend
 * itself never delivered it" without waiting on the webhook at all.
 */
export async function getResendEmailStatus(emailId: string): Promise<ResendEmailStatus> {
  const key = apiKey();
  if (!key) return { ok: false, lastEvent: null, error: "RESEND_API_KEY not configured" };

  const res = await fetch(`${RESEND_API_BASE}/emails/${emailId}`, {
    headers: { authorization: `Bearer ${key}` },
  });
  if (!res.ok) return { ok: false, lastEvent: null, error: `Resend API ${res.status}` };
  const body = (await res.json()) as { last_event?: string };
  return { ok: true, lastEvent: body.last_event ?? null };
}

/**
 * Compares the live Resend signing secret for `webhookId` against this
 * server's RESEND_WEBHOOK_SECRET — WITHOUT ever exposing either value. Only
 * a match/no-match boolean is returned. This is the direct way to answer
 * "did the webhook stop firing because our stored secret is stale" without
 * needing VPS file access or printing a secret anywhere.
 */
export async function checkWebhookSecretMatches(webhookId: string): Promise<SecretCheckResult> {
  // Same reasoning as the webhook route itself: this process's env can be
  // stale relative to what's actually on disk (see reload-env.ts). A
  // diagnostic that reports the wrong answer because of a caching quirk is
  // worse than no diagnostic — force a fresh read before checking.
  reloadEnvFromDisk();
  const key = apiKey();
  const ours = process.env.RESEND_WEBHOOK_SECRET ?? "";
  if (!key) return { ok: false, matches: null, error: "RESEND_API_KEY not configured" };
  if (!ours) return { ok: true, matches: null, error: "RESEND_WEBHOOK_SECRET not set on this server" };

  const res = await fetch(`${RESEND_API_BASE}/webhooks/${webhookId}`, {
    headers: { authorization: `Bearer ${key}` },
  });
  if (!res.ok) return { ok: false, matches: null, error: `Resend API ${res.status}` };
  const body = (await res.json()) as { signing_secret?: string };
  if (!body.signing_secret) return { ok: false, matches: null, error: "Resend did not return a signing secret" };

  return { ok: true, matches: body.signing_secret === ours };
}

