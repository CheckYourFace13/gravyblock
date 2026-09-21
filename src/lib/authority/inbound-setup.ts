/**
 * Receiving-domain readiness. Once reply.gravyblock.com is verified in Resend (DNS is a one-time
 * infrastructure step), this switches authority replies over to the automatic reply handler:
 * it makes sure the existing webhook also receives `email.received` and records that inbound is ready.
 * Until then pitches keep the previous Reply-To, so no reply is ever lost.
 */
import { eq } from "drizzle-orm";
import { getDb, jobs } from "@/lib/db";

const DOMAIN = "reply.gravyblock.com";

export async function ensureInboundReceiving(): Promise<{ state: string }> {
  const db = getDb();
  const key = process.env.RESEND_API_KEY;
  if (!db || !key) return { state: "unavailable" };
  const [ready] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.type, "inbound_domain_ready")).limit(1);
  if (ready) return { state: "ready" };
  const h = { authorization: `Bearer ${key}`, "content-type": "application/json" };
  const list = (await fetch("https://api.resend.com/domains", { headers: h, signal: AbortSignal.timeout(10000) }).then((r) => r.json()).catch(() => null)) as { data?: { id: string; name: string; status: string; capabilities?: { receiving?: string } }[] } | null;
  const d = list?.data?.find((x) => x.name === DOMAIN);
  if (!d) return { state: "domain_not_created" };
  if (d.status !== "verified") {
    await fetch(`https://api.resend.com/domains/${d.id}/verify`, { method: "POST", headers: h, signal: AbortSignal.timeout(10000) }).catch(() => null);
    return { state: `domain_${d.status}` };
  }
  const hooks = (await fetch("https://api.resend.com/webhooks", { headers: h, signal: AbortSignal.timeout(10000) }).then((r) => r.json()).catch(() => null)) as { data?: { id: string; endpoint: string; events: string[] }[] } | null;
  const hook = hooks?.data?.find((w) => w.endpoint === "https://gravyblock.com/api/resend/webhook");
  if (!hook) return { state: "webhook_missing" };
  if (!hook.events.includes("email.received")) {
    const r = await fetch(`https://api.resend.com/webhooks/${hook.id}`, { method: "PATCH", headers: h, body: JSON.stringify({ events: [...hook.events, "email.received"] }), signal: AbortSignal.timeout(10000) }).catch(() => null);
    if (!r || !r.ok) return { state: "webhook_update_failed" };
  }
  await db.insert(jobs).values({ type: "inbound_domain_ready", status: "completed", payload: { domain: DOMAIN, at: new Date().toISOString() } });
  return { state: "ready" };
}
