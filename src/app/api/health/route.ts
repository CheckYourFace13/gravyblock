import { getBuildVersion, getDeployedAt, getGitSha } from "@/lib/build-metadata";
import { getSqlClient } from "@/lib/db";

function isSet(...names: string[]): boolean {
  return names.every((n) => Boolean(process.env[n]?.trim()));
}

/**
 * TEMPORARY — one-time controlled-test-email lifecycle verification.
 * Confirms the just-sent admin test email was: accepted by Resend, delivered
 * with a real signed webhook, persisted to email_events with a real
 * svix_message_id, correlated to its outreach_sends row by resend_email_id,
 * and that the idempotency constraint actually rejects a duplicate insert on
 * that same svix_message_id. Read-only against application data (the one
 * write is a single scoped idempotency probe using a synthetic event_type
 * that the real unique constraint is expected to block, so nothing new is
 * actually persisted). No secrets returned. Remove this whole block once
 * confirmed.
 */
async function checkControlledTestLifecycle() {
  const sql = getSqlClient();
  if (!sql) return { checkFailed: "no_sql_client" };
  try {
    const allOutreachSendsRows = await sql.unsafe(`
      select id, resend_email_id as "resendEmailId", recipient, campaign, sequence_step as "sequenceStep",
             is_test as "isTest", status, attempted_at as "attemptedAt", accepted_at as "acceptedAt"
      from outreach_sends
      order by attempted_at desc
      limit 10
    `);

    const recentWebhookTestJobs = await sql.unsafe(`
      select id, status, payload, created_at as "createdAt"
      from jobs
      where type = 'webhook_test_sent'
      order by created_at desc
      limit 5
    `);

    type OutreachSendRow = { id: string; resendEmailId: string | null; recipient: string; campaign: string; sequenceStep: string; isTest: string; status: string; attemptedAt: string; acceptedAt: string | null };
    const [latestTestSend] = (allOutreachSendsRows as unknown as OutreachSendRow[]).filter((r) => r.isTest === "true");

    if (!latestTestSend) {
      return {
        checkFailed: "no_test_send_found_in_outreach_sends",
        allOutreachSendsRows,
        recentWebhookTestJobs,
      };
    }

    const resendEmailId: string | null = latestTestSend.resendEmailId;

    const emailEventsRows = resendEmailId
      ? await sql.unsafe(
          `select event_type as "eventType", svix_message_id as "svixMessageId", created_at as "createdAt"
           from email_events where email_id = $1 order by created_at asc`,
          [resendEmailId],
        )
      : [];

    // Provider-side state, directly from Resend — independent confirmation
    // this wasn't a synthetic/internal POST.
    let resendProviderState: unknown = null;
    const apiKey = process.env.RESEND_API_KEY;
    if (resendEmailId && apiKey) {
      const res = await fetch(`https://api.resend.com/emails/${resendEmailId}`, {
        headers: { authorization: `Bearer ${apiKey}` },
      });
      resendProviderState = res.ok ? await res.json() : { fetchError: `Resend API ${res.status}` };
    }

    // Zero email_events for an email Resend confirms delivered means either
    // dispatch hasn't happened yet, or Resend has this endpoint DISABLED —
    // Resend auto-disables a webhook endpoint after sustained failures
    // (exactly what a long history of 500s from the pre-fix route would
    // trigger). Check the registration directly rather than guess.
    let resendWebhookRegistration: unknown = null;
    if (apiKey) {
      const res = await fetch("https://api.resend.com/webhooks", { headers: { authorization: `Bearer ${apiKey}` } });
      resendWebhookRegistration = res.ok ? await res.json() : { fetchError: `Resend API ${res.status}` };
    }

    // Idempotency probe: attempt to insert a second row using the SAME real
    // svix_message_id the actual event arrived with. A distinct, clearly-
    // synthetic event_type marker keeps this identifiable/reversible. If the
    // unique constraint works (expected), 0 rows are returned/inserted.
    let idempotencyProbe: { attempted: boolean; svixMessageIdUsed: string | null; rowsInserted: number | null; note: string } = {
      attempted: false,
      svixMessageIdUsed: null,
      rowsInserted: null,
      note: "no real event with a svix_message_id available to probe against",
    };
    const realEventWithSvix = (emailEventsRows as Array<{ svixMessageId: string | null }>).find((e) => e.svixMessageId);
    if (realEventWithSvix?.svixMessageId) {
      const svixId = realEventWithSvix.svixMessageId;
      const probeResult = await sql.unsafe(
        `insert into email_events (event_type, email_id, svix_message_id, metadata)
         values ('idempotency_probe_synthetic', $1, $2, '{}')
         on conflict (svix_message_id) do nothing
         returning id`,
        [resendEmailId, svixId],
      );
      idempotencyProbe = {
        attempted: true,
        svixMessageIdUsed: svixId,
        rowsInserted: probeResult.length,
        note: probeResult.length === 0
          ? "constraint correctly blocked the duplicate (0 rows inserted, as expected)"
          : "UNEXPECTED: a row was inserted — constraint did not block the duplicate",
      };
    }

    const recentWebhookDiagnostics = await sql.unsafe(`
      select status, payload, created_at as "createdAt"
      from jobs
      where type = 'webhook_diagnostic'
      order by created_at desc
      limit 10
    `);

    return {
      outreachSendRow: latestTestSend,
      emailEvents: emailEventsRows,
      resendProviderState,
      resendWebhookRegistration,
      idempotencyProbe,
      recentWebhookDiagnostics,
    };
  } catch (err) {
    return { checkFailed: err instanceof Error ? err.message : String(err) };
  }
}

export async function GET() {
  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
  const environment = process.env.NODE_ENV ?? "unknown";
  const controlledTestLifecycle = await checkControlledTestLifecycle();

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
    controlledTestLifecycle,
  });
}
