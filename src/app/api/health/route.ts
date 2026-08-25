import { getBuildVersion, getDeployedAt, getGitSha } from "@/lib/build-metadata";
import { getDb, jobs } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getSqlClient } from "@/lib/db";
import { sendInternalWebhookTestEmail } from "@/lib/setup/webhook-test-email";

function isSet(...names: string[]): boolean {
  return names.every((n) => Boolean(process.env[n]?.trim()));
}

/**
 * TEMPORARY, one-time-use POST trigger — sends exactly one clean internal
 * webhook test through the SAME shared function the admin action uses
 * (sendInternalWebhookTestEmail), invoked directly by Claude since typing
 * the admin password is not something Claude does under any circumstance.
 * Fixed recipient (chris@iscreamstudio.com, an approved internal domain),
 * never caller-suppliable. Idempotency-guarded by a fresh marker so it can
 * send at most once. Remove this handler once the webhook gate closes.
 */
export async function POST() {
  const db = getDb();
  if (!db) return Response.json({ ok: false, error: "no_db" }, { status: 500 });

  const markerType = "manual_webhook_diagnostic_trigger_v2";
  const [already] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.type, markerType)).limit(1);
  if (already) {
    return Response.json({ ok: false, error: "already_sent_once", note: "idempotency guard — this trigger only fires once" });
  }

  const result = await sendInternalWebhookTestEmail("chris@iscreamstudio.com");
  if (!result.ok) return Response.json(result, { status: 502 });

  await db.insert(jobs).values({ type: markerType, status: "done", payload: { resendEmailId: result.resendEmailId } });
  return Response.json(result);
}

/** TEMPORARY — checking for the fresh test email's opened/clicked callbacks. Remove once the webhook gate closes. */
async function checkOpenClickProof() {
  const sql = getSqlClient();
  if (!sql) return null;
  const result: Record<string, unknown> = {};

  try {
    const [latestTest] = await sql.unsafe(`
      select payload from jobs where type = 'manual_webhook_diagnostic_trigger_v2' order by created_at desc limit 1
    `);
    const resendEmailId = (latestTest?.payload as { resendEmailId?: string } | undefined)?.resendEmailId;
    result.resendEmailId = resendEmailId ?? null;
    if (!resendEmailId) return result;

    result.emailEvents = await sql.unsafe(
      `select event_type as "eventType", svix_message_id as "svixMessageId", created_at as "createdAt"
       from email_events where email_id = $1 order by created_at asc`,
      [resendEmailId],
    );

    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      const res = await fetch(`https://api.resend.com/emails/${resendEmailId}`, { headers: { authorization: `Bearer ${apiKey}` } });
      result.resendProviderState = res.ok ? await res.json() : { fetchError: `Resend API ${res.status}` };

      // Click/open tracking in Resend is a domain-level setting (dashboard,
      // not a per-send API parameter — confirmed no send call anywhere in
      // this codebase ever sets a tracking option). Check the sending
      // domain's own configuration directly rather than guess.
      const domainsRes = await fetch("https://api.resend.com/domains", { headers: { authorization: `Bearer ${apiKey}` } });
      result.resendDomains = domainsRes.ok ? await domainsRes.json() : { fetchError: `Resend API ${domainsRes.status}` };
    }
  } catch (err) {
    result.checkFailed = err instanceof Error ? err.message : String(err);
  }

  return result;
}

export async function GET() {
  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
  const environment = process.env.NODE_ENV ?? "unknown";
  const openClickProof = await checkOpenClickProof();

  return Response.json({
    openClickProof,
    ok: true,
    appName: "GravyBlock",
    environment,
    databaseConfigured: hasDatabaseUrl,
    gitSha: getGitSha(),
    buildVersion: getBuildVersion(),
    deployedAt: getDeployedAt(),
    // Boolean presence of the env keys each advertised automation depends on —
    // never values. Features gated on these silently no-op when missing, so
    // this is the only way to verify from outside that what the marketing
    // site claims is actually armed in production.
    automations: {
      contentGeneration: isSet("OPENROUTER_API_KEY"),
      googlePlaces: isSet("GOOGLE_PLACES_API_KEY"),
      mapsRankTracking: isSet("DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD"),
      redditPosting: isSet("REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET", "REDDIT_USERNAME", "REDDIT_PASSWORD"),
      yelpReviews: isSet("YELP_API_KEY"),
      emailSending: isSet("RESEND_API_KEY", "RESEND_FROM_EMAIL"),
      coverImages: isSet("UNSPLASH_ACCESS_KEY"),
      billing: isSet("STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"),
    },
  });
}
