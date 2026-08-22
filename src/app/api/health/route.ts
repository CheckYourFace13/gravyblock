import { getBuildVersion, getDeployedAt, getGitSha } from "@/lib/build-metadata";
import { getSqlClient } from "@/lib/db";

function isSet(...names: string[]): boolean {
  return names.every((n) => Boolean(process.env[n]?.trim()));
}

/**
 * TEMPORARY, one-time diagnostic — added to confirm whether recent additive
 * schema migrations (visibility_snapshots.score_method_version,
 * email_events.svix_message_id, the outreach_sends table) actually landed on
 * this DB via the self-deploy pipeline's `drizzle-kit push` step, after
 * scoreMethodVersion's own rollout was observed 500ing production. Reports
 * only column/table EXISTENCE booleans — no data, no secrets. Remove this
 * block once confirmed either way; it has no ongoing operational value.
 */
async function checkRecentSchemaMigrations(): Promise<Record<string, boolean> | { checkFailed: string }> {
  const sql = getSqlClient();
  if (!sql) return { checkFailed: "no_sql_client" };
  try {
    const rows = await sql.unsafe(`
      select
        exists (select 1 from information_schema.columns where table_name='visibility_snapshots' and column_name='score_method_version') as "visibilitySnapshotsScoreMethodVersion",
        exists (select 1 from information_schema.columns where table_name='email_events' and column_name='svix_message_id') as "emailEventsSvixMessageId",
        exists (select 1 from information_schema.tables where table_name='outreach_sends') as "outreachSendsTable"
    `);
    return (rows[0] as unknown as Record<string, boolean>) ?? { checkFailed: "no_rows" };
  } catch (err) {
    return { checkFailed: err instanceof Error ? err.message : String(err) };
  }
}

export async function GET() {
  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
  const environment = process.env.NODE_ENV ?? "unknown";
  const schemaCheck = await checkRecentSchemaMigrations();

  return Response.json({
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
    schemaCheck,
  });
}
