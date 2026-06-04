/**
 * Auto-registers the Resend webhook on worker startup if it isn't already set up.
 * Called once when the worker starts. Idempotent — checks existing webhooks first.
 *
 * Required env vars:
 *   RESEND_API_KEY — already required for email sending
 *   NEXT_PUBLIC_SITE_URL — already set
 */

type ResendWebhook = {
  id: string;
  endpoint: string;
};

type ResendWebhooksResponse = {
  data?: ResendWebhook[];
};

const WEBHOOK_URL_PATH = "/api/resend/webhook";
const EVENTS = [
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.bounced",
  "email.complained",
  "email.opened",
  "email.clicked",
];

export async function ensureResendWebhookRegistered(): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) return;

  const targetUrl = `${siteUrl}${WEBHOOK_URL_PATH}`;

  try {
    // Check if webhook already exists
    const listRes = await fetch("https://api.resend.com/webhooks", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!listRes.ok) {
      console.warn("[resend-setup] Could not list webhooks", { status: listRes.status });
      return;
    }

    const { data: existing } = (await listRes.json()) as ResendWebhooksResponse;
    const alreadyRegistered = existing?.some((wh) => wh.endpoint === targetUrl);

    if (alreadyRegistered) {
      console.info("[resend-setup] Webhook already registered — skipping");
      return;
    }

    // Register the webhook
    const createRes = await fetch("https://api.resend.com/webhooks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: targetUrl, events: EVENTS }),
    });

    if (createRes.ok) {
      console.info("[resend-setup] Webhook registered successfully", { url: targetUrl });
    } else {
      const body = await createRes.text();
      console.warn("[resend-setup] Webhook registration failed", { status: createRes.status, body: body.slice(0, 200) });
    }
  } catch (err) {
    // Non-fatal — email tracking just won't work yet
    console.warn("[resend-setup] Webhook setup error", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
