import { getBuildVersion, getDeployedAt, getGitSha } from "@/lib/build-metadata";
import { getSqlClient } from "@/lib/db";

/** TEMPORARY — checking for existing opened/clicked events before asking for a new test send. Remove once webhook gate fully closes. */
async function checkOpenClickEvents() {
  const sql = getSqlClient();
  if (!sql) return null;
  try {
    return await sql.unsafe(`
      select event_type as "eventType", email_id as "emailId", svix_message_id as "svixMessageId",
             recipient, created_at as "createdAt"
      from email_events
      where event_type in ('opened', 'clicked')
      order by created_at desc
      limit 20
    `);
  } catch (err) {
    return { checkFailed: err instanceof Error ? err.message : String(err) };
  }
}

function isSet(...names: string[]): boolean {
  return names.every((n) => Boolean(process.env[n]?.trim()));
}

/**
 * TEMPORARY — behavioral proof the pause guard blocks a real (non-test,
 * non-internal-domain) send at the actual production send boundary, not
 * just by code inspection. Calls the real sendFollowupEmail() function
 * (same one runFollowupOutreachBatch uses) from inside this same running
 * process. Recipient is deliberately example.com — an IANA/RFC 2606
 * reserved domain that will never accept real mail and belongs to no real
 * person — so even a guard failure could not reach an actual prospect.
 * Remove once the pause gate is fully closed.
 */
async function checkPauseBoundaryBehavior() {
  const sql = getSqlClient();
  const testRecipient = "outreach-pause-boundary-test@example.com";
  try {
    const { sendFollowupEmail } = await import("@/lib/outreach/outreach-emailer");
    const beforeRows = sql
      ? await sql.unsafe(`select count(*)::int as "count" from outreach_sends where recipient = $1`, [testRecipient])
      : [{ count: null }];

    const result = await sendFollowupEmail({
      businessName: "Pause Boundary Test — not a real business",
      email: testRecipient,
    });

    const afterRows = sql
      ? await sql.unsafe(`select count(*)::int as "count" from outreach_sends where recipient = $1`, [testRecipient])
      : [{ count: null }];

    // Independent, out-of-band confirmation nothing actually reached Resend:
    // list Resend's own recent sends and confirm this address isn't among them.
    let resendSentToTestAddress: unknown = "not_checked";
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      const res = await fetch("https://api.resend.com/emails?limit=5", { headers: { authorization: `Bearer ${apiKey}` } });
      if (res.ok) {
        const body = (await res.json()) as { data?: Array<{ to?: string[] }> };
        resendSentToTestAddress = (body.data ?? []).some((e) => e.to?.includes(testRecipient));
      } else {
        resendSentToTestAddress = `fetch_failed_${res.status}`;
      }
    }

    return {
      testRecipient,
      functionResult: result,
      blockedBeforeResend: result.skipped === true && result.ok === false,
      outreachSendsRowCountBefore: beforeRows[0]?.count,
      outreachSendsRowCountAfter: afterRows[0]?.count,
      noOutreachSendsRowCreated: beforeRows[0]?.count === afterRows[0]?.count,
      resendSentToTestAddress,
    };
  } catch (err) {
    return { checkFailed: err instanceof Error ? err.message : String(err) };
  }
}

export async function GET() {
  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
  const environment = process.env.NODE_ENV ?? "unknown";
  const [openClickEvents, pauseBoundaryBehavior] = await Promise.all([
    checkOpenClickEvents(),
    checkPauseBoundaryBehavior(),
  ]);

  return Response.json({
    openClickEvents,
    pauseBoundaryBehavior,
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
