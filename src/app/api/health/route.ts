import { getBuildVersion, getDeployedAt, getGitSha } from "@/lib/build-metadata";
import { getSqlClient } from "@/lib/db";

function isSet(...names: string[]): boolean {
  return names.every((n) => Boolean(process.env[n]?.trim()));
}

/**
 * TEMPORARY, one-time post-migration integrity check — added after the
 * user manually ran `drizzle-kit push` on the VPS to add
 * email_events.svix_message_id (with a unique constraint over 130 existing
 * rows), the outreach_sends table, and visibility_snapshots.score_method_version.
 * Verifies no data loss and confirms the constraint actually exists, using
 * only read-only aggregate queries (counts, min/max timestamps, existence
 * checks) — no row-level data, no secrets. Remove this block once confirmed.
 */
async function checkRecentSchemaMigrations() {
  const sql = getSqlClient();
  if (!sql) return { checkFailed: "no_sql_client" };
  try {
    const [existence] = await sql.unsafe(`
      select
        exists (select 1 from information_schema.columns where table_name='visibility_snapshots' and column_name='score_method_version') as "visibilitySnapshotsScoreMethodVersion",
        exists (select 1 from information_schema.columns where table_name='email_events' and column_name='svix_message_id') as "emailEventsSvixMessageId",
        exists (select 1 from information_schema.tables where table_name='outreach_sends') as "outreachSendsTable",
        exists (select 1 from information_schema.columns where table_name='outreach_sends' and column_name='resend_email_id') as "outreachSendsResendEmailId",
        exists (
          select 1 from pg_constraint c join pg_class t on c.conrelid = t.oid
          where t.relname='email_events' and c.contype='u' and c.conname ilike '%svix_message_id%'
        ) as "svixMessageIdUniqueConstraint",
        exists (
          select 1 from pg_constraint c join pg_class t on c.conrelid = t.oid
          where t.relname='outreach_sends' and c.contype='u' and c.conname ilike '%resend_email_id%'
        ) as "resendEmailIdUniqueConstraint",
        exists (select 1 from information_schema.tables where table_name='funnel_events') as "funnelEventsTable"
    `);

    const [emailEventsCount] = await sql.unsafe(`select count(*)::int as "count" from email_events`);
    const [emailEventsRange] = await sql.unsafe(
      `select min(created_at) as "earliest", max(created_at) as "latest" from email_events`,
    );
    const byType = await sql.unsafe(
      `select event_type as "eventType", count(*)::int as "count" from email_events group by event_type order by count(*) desc`,
    );
    const [nullSvix] = await sql.unsafe(
      `select count(*)::int as "count" from email_events where svix_message_id is null`,
    );
    const [outreachSendsCount] = existence.outreachSendsTable
      ? await sql.unsafe(`select count(*)::int as "count" from outreach_sends`)
      : [{ count: null }];

    return {
      existence,
      emailEvents: {
        totalRows: emailEventsCount.count,
        earliest: emailEventsRange.earliest,
        latest: emailEventsRange.latest,
        byType,
        nullSvixMessageIdCount: nullSvix.count,
      },
      outreachSends: { totalRows: outreachSendsCount.count },
    };
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
