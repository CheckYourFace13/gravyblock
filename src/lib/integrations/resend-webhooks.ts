/**
 * Resend's webhook-management API (list/create) — used to verify what's
 * actually registered in Resend's own account settings, since the app code
 * existing and working is not the same as Resend being configured to call it.
 * Never logs or returns the API key or a signing secret to callers outside
 * this module.
 */

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

/**
 * Compares the live Resend signing secret for `webhookId` against this
 * server's RESEND_WEBHOOK_SECRET — WITHOUT ever exposing either value. Only
 * a match/no-match boolean is returned. This is the direct way to answer
 * "did the webhook stop firing because our stored secret is stale" without
 * needing VPS file access or printing a secret anywhere.
 */
export async function checkWebhookSecretMatches(webhookId: string): Promise<SecretCheckResult> {
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

/**
 * Creates a new webhook. Resend returns a fresh signing_secret on creation —
 * this function deliberately does NOT return it to the caller for logging;
 * it's returned only to be shown once, directly, for manual placement into
 * the server's env (there is no remote secret-deploy path to this VPS from
 * here — the deploy pipeline only pulls code over git, never touches .env).
 */
export async function createResendWebhook(
  endpoint: string,
  events: string[],
): Promise<{ ok: boolean; id?: string; signingSecret?: string; error?: string }> {
  const key = apiKey();
  if (!key) return { ok: false, error: "RESEND_API_KEY not configured" };

  const res = await fetch(`${RESEND_API_BASE}/webhooks`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ endpoint, events }),
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `Resend API ${res.status}: ${text}` };
  }
  const body = (await res.json()) as { id: string; signing_secret: string };
  return { ok: true, id: body.id, signingSecret: body.signing_secret };
}
