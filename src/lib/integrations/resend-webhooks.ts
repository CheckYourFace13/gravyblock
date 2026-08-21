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
 * Retrieves the live signing secret for a specific webhook id. Internal use
 * only — callers must never log, return, or display the result; it exists
 * solely for installSigningSecretOnServer() to write directly to the env
 * file, never to pass through an API response or admin UI.
 */
async function fetchSigningSecret(webhookId: string): Promise<{ ok: boolean; secret?: string; error?: string }> {
  const key = apiKey();
  if (!key) return { ok: false, error: "RESEND_API_KEY not configured" };
  const res = await fetch(`${RESEND_API_BASE}/webhooks/${webhookId}`, {
    headers: { authorization: `Bearer ${key}` },
  });
  if (!res.ok) return { ok: false, error: `Resend API ${res.status}` };
  const body = (await res.json()) as { signing_secret?: string };
  if (!body.signing_secret) return { ok: false, error: "Resend did not return a signing secret" };
  return { ok: true, secret: body.signing_secret };
}

export type InstallResult = { ok: boolean; alreadyConfigured?: boolean; error?: string; envPathUsed?: string };

/**
 * One-time, narrowly-scoped setup operation: finds GravyBlock's own
 * registered webhook, retrieves its real signing secret, and writes it
 * directly into the .env file this same process was started from (the file
 * PM2's --env-file / dotenv loading reads), then restarts the PM2 process
 * so it picks up the new value. The secret is never returned to any caller,
 * logged, or displayed — only a boolean result. Refuses to run if a secret
 * is already correctly installed (see checkWebhookSecretMatches), so this
 * naturally becomes a no-op once done rather than needing a separate
 * self-disable step.
 */
export async function installSigningSecretOnServer(expectedEndpoint: string): Promise<InstallResult> {
  const listResult = await listResendWebhooks();
  if (!listResult.ok) return { ok: false, error: listResult.error ?? "could not list webhooks" };

  const webhook = listResult.webhooks.find((w) => w.endpoint === expectedEndpoint);
  if (!webhook) return { ok: false, error: `no webhook registered for ${expectedEndpoint}` };

  const already = await checkWebhookSecretMatches(webhook.id);
  if (already.ok && already.matches === true) {
    return { ok: true, alreadyConfigured: true };
  }

  const secretResult = await fetchSigningSecret(webhook.id);
  if (!secretResult.ok || !secretResult.secret) {
    return { ok: false, error: secretResult.error ?? "failed to retrieve signing secret" };
  }
  const secret = secretResult.secret;

  // Node-only APIs — this module is server-only (invoked from a "use server"
  // admin action), so requiring these lazily here is safe.
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const { exec } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execAsync = promisify(exec);

  const envPath = path.join(process.cwd(), ".env");

  let existing = "";
  try {
    existing = await fs.readFile(envPath, "utf8");
  } catch (err) {
    return { ok: false, error: `could not read ${envPath}: ${err instanceof Error ? err.message : String(err)}` };
  }

  const line = `RESEND_WEBHOOK_SECRET=${secret}`;
  const hasLine = /^RESEND_WEBHOOK_SECRET=/m.test(existing);
  const updated = hasLine
    ? existing.replace(/^RESEND_WEBHOOK_SECRET=.*$/m, line)
    : `${existing.endsWith("\n") || existing === "" ? existing : existing + "\n"}${line}\n`;

  try {
    await fs.writeFile(envPath, updated, "utf8");
  } catch (err) {
    return { ok: false, error: `could not write ${envPath}: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Don't await the restart inline — `pm2 restart` kills this very process,
  // which would cut off the HTTP response to the admin who clicked the
  // button before it ever reached them. Give the response a moment to flush
  // first; the caller's UI tells the admin to check back in ~15s.
  //
  // Use a login shell (`bash -lc`), not a bare exec — PM2 spawns this Node
  // process directly (not through an interactive shell), so `pm2` may not be
  // on its inherited PATH at all (the same nvm-PATH problem self-deploy.sh
  // has to work around by explicitly sourcing nvm.sh first). A login shell
  // sources the profile/nvm setup, matching how a human running this command
  // over SSH would have it on PATH. The outcome is logged to a `jobs` row
  // (never the secret) so a failure here is observable via the DB instead of
  // an invisible console.error only visible in server logs no one can read
  // from here.
  setTimeout(() => {
    (async () => {
      try {
        await execAsync("bash -lc 'pm2 restart gravyblock --update-env'");
        const { getDb, jobs } = await import("@/lib/db");
        const db = getDb();
        if (db) await db.insert(jobs).values({ type: "webhook_secret_install_restart", status: "done", payload: { ok: true } });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[resend-webhooks] PM2 restart after secret install failed", { error: message });
        try {
          const { getDb, jobs } = await import("@/lib/db");
          const db = getDb();
          if (db) await db.insert(jobs).values({ type: "webhook_secret_install_restart", status: "failed", payload: { ok: false, error: message } });
        } catch { /* best effort */ }
      }
    })();
  }, 1500);

  return { ok: true, envPathUsed: envPath };
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
