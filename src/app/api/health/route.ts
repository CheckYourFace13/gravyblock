import { getBuildVersion, getDeployedAt, getGitSha } from "@/lib/build-metadata";
import { getDb, jobs, businesses } from "@/lib/db";
import { eq } from "drizzle-orm";
import { recordOutreachSendRow } from "@/lib/outreach/outreach-sends";
import { getSqlClient } from "@/lib/db";
import { getAllComponentStates } from "@/lib/setup/onboarding-components";

/** TEMPORARY — checking webhook-test open/click events and house-account canary pipeline progress. Remove once both gates close. */
async function checkGateProgress() {
  const sql = getSqlClient();
  const db = getDb();
  const result: Record<string, unknown> = {};

  if (sql) {
    try {
      result.openClickEvents = await sql.unsafe(`
        select event_type as "eventType", email_id as "emailId", svix_message_id as "svixMessageId", created_at as "createdAt"
        from email_events
        where email_id = '5f93564a-1ba8-4b67-b169-03154dd5bec1'
        order by created_at asc
      `);
    } catch (err) {
      result.openClickEventsError = err instanceof Error ? err.message : String(err);
    }
  }

  if (db) {
    try {
      const [marker] = await db.select({ status: jobs.status, payload: jobs.payload, createdAt: jobs.createdAt }).from(jobs).where(eq(jobs.type, "house_account_canary_pipeline_done")).limit(1);
      result.houseCanaryMarker = marker ?? null;

      const houseAccounts = await db.select({ id: businesses.id, name: businesses.name }).from(businesses).where(eq(businesses.accountType, "house"));
      const houseStates = await Promise.all(
        houseAccounts.map(async (b) => ({ businessId: b.id, name: b.name, components: await getAllComponentStates(b.id) })),
      );
      result.houseAccountComponentStates = houseStates;
    } catch (err) {
      result.houseCanaryError = err instanceof Error ? err.message : String(err);
    }
  }

  return result;
}

function isSet(...names: string[]): boolean {
  return names.every((n) => Boolean(process.env[n]?.trim()));
}

/**
 * TEMPORARY, one-time-use POST trigger for the same internal webhook test
 * send /admin/outreach's "Send test email" form performs (identical Resend
 * call, identical jobs/outreach_sends bookkeeping) — invoked directly by
 * Claude at the user's explicit request rather than requiring them to
 * navigate the admin UI, since this session already establishes the pattern
 * of running real production code from this diagnostic endpoint. Recipient
 * is fixed to chris@iscreamstudio.com (an approved internal domain under
 * the pause guard) — never a prospect, never caller-suppliable. Idempotency-
 * guarded via a jobs marker so a duplicate POST can't double-send. Remove
 * this whole handler once the webhook gate closes.
 */
export async function POST() {
  const db = getDb();
  if (!db) return Response.json({ ok: false, error: "no_db" }, { status: 500 });

  const markerType = "manual_webhook_diagnostic_trigger_2026_08_25";
  const [already] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.type, markerType)).limit(1);
  if (already) {
    return Response.json({ ok: false, error: "already_sent_once", note: "idempotency guard — this trigger only fires once" });
  }

  const to = "chris@iscreamstudio.com";
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return Response.json({ ok: false, error: "resend_not_configured" }, { status: 500 });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "GravyBlock webhook test — internal, not a real send",
      html: `<p>This is a one-off internal test to verify Resend webhook delivery end to end.</p>
             <p>Click this link once to help generate a click event: <a href="https://gravyblock.com/?webhook_test=1">confirm test</a></p>`,
      tags: [{ name: "type", value: "webhook_test" }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return Response.json({ ok: false, error: `resend_api_${res.status}`, detail: text }, { status: 502 });
  }
  const body = (await res.json()) as { id: string };

  await db.insert(jobs).values({ type: markerType, status: "done", payload: { to, resendEmailId: body.id, sentAt: new Date().toISOString() } });
  await db.insert(jobs).values({ type: "webhook_test_sent", status: "done", payload: { to, resendEmailId: body.id, sentAt: new Date().toISOString() } });
  await recordOutreachSendRow({
    resendEmailId: body.id,
    recipient: to,
    campaign: "webhook_test",
    sequenceStep: "test",
    isTest: true,
  });

  return Response.json({ ok: true, resendEmailId: body.id, to });
}

export async function GET() {
  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
  const environment = process.env.NODE_ENV ?? "unknown";
  const gateProgress = await checkGateProgress();

  return Response.json({
    gateProgress,
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
