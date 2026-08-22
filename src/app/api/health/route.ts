import { getBuildVersion, getDeployedAt, getGitSha } from "@/lib/build-metadata";
import { getDb } from "@/lib/db";
import { sql } from "drizzle-orm";

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
async function checkRecentSchemaMigrations(): Promise<Record<string, boolean> | null> {
  const db = getDb();
  if (!db) return null;
  try {
    const rows = (await db.execute(sql`
      select
        exists (select 1 from information_schema.columns where table_name='visibility_snapshots' and column_name='score_method_version') as visibility_snapshots_score_method_version,
        exists (select 1 from information_schema.columns where table_name='email_events' and column_name='svix_message_id') as email_events_svix_message_id,
        exists (select 1 from information_schema.tables where table_name='outreach_sends') as outreach_sends_table
    `)) as unknown as { rows: Array<Record<string, boolean>> };
    return rows.rows?.[0] ?? null;
  } catch {
    return null;
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
