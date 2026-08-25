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

export async function GET() {
  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
  const environment = process.env.NODE_ENV ?? "unknown";
  const openClickEvents = await checkOpenClickEvents();

  return Response.json({
    openClickEvents,
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
