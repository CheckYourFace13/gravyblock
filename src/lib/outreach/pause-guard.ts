/**
 * The single authoritative choke point for every automated prospect-
 * acquisition email send (cold outreach initial/follow-up/breakup, lead
 * drip, lead re-engagement, abandoned-checkout recovery). Call this
 * immediately before the actual Resend API call in each send function —
 * not just once per batch/scheduler — so a newly added send path can never
 * accidentally bypass the admin pause switch. This was the exact gap that
 * let real follow-up/breakup emails go out while outreach was believed
 * paused: the pause check lived only in the worker's scheduling logic, and
 * nothing enforced it at the send boundary itself.
 *
 * FAILS CLOSED: any error reading the pause setting (DB error, timeout,
 * malformed config, missing row) returns allowed:false, never allowed:true.
 * This is deliberately DIFFERENT from getOutreachSettings()'s own defaults
 * (which fail open to `paused: false` — fine for that function's purpose of
 * pre-filling the admin settings form on a fresh install, but wrong for a
 * sending gate). Ambiguity about whether sending is safe must never be
 * treated as permission to send.
 *
 * Test/internal sends may bypass the pause, but ONLY to GravyBlock's own
 * domains — never based on a caller-supplied boolean alone, which would let
 * a mistaken isTest=true (or a compromised/careless call site) send to an
 * arbitrary real prospect while paused. Scoping the bypass to the
 * recipient's domain means the bypass is self-verifying: it doesn't matter
 * what a caller claims, only who the email is actually going to.
 */
import { getOutreachSettings } from "@/app/admin/(dashboard)/outreach/actions";
import { getSqlClient, getDb, jobs } from "@/lib/db";
import { eq } from "drizzle-orm";

export const INTERNAL_TEST_DOMAINS = ["gravyblock.com", "iscreamstudio.com"];

export type OutreachSendCheck = { allowed: true } | { allowed: false; reason: string };

export function isInternalTestRecipient(recipient: string): boolean {
  const domain = recipient.split("@")[1]?.toLowerCase().trim() ?? "";
  return INTERNAL_TEST_DOMAINS.includes(domain);
}

export async function assertOutreachSendingAllowed(recipient: string): Promise<OutreachSendCheck> {
  if (isInternalTestRecipient(recipient)) {
    return { allowed: true };
  }

  let paused: boolean;
  try {
    const settings = await getOutreachSettings();
    paused = settings.paused;
  } catch (err) {
    // Fail closed — cannot determine pause state, so do not send.
    return {
      allowed: false,
      reason: `outreach pause state unavailable (${err instanceof Error ? err.message : String(err)}) — SKIPPED, not assumed enabled`,
    };
  }

  if (paused) {
    return { allowed: false, reason: "outreach is paused" };
  }
  return { allowed: true };
}

/**
 * Defense-in-depth monitor, per item 7 of the pause-integrity audit: even
 * though assertOutreachSendingAllowed() should make it impossible going
 * forward, this independently re-checks recent real sends against the
 * pause state that was actually in effect when each was attempted, and
 * raises a CRITICAL admin alert for any mismatch — catching a future send
 * path that gets added without calling the guard. Idempotent per violating
 * row (won't re-alert on the same send every time it runs); cheap enough to
 * run every worker tick since it only looks at the last 24h.
 */
export async function checkForPauseIntegrityViolations(): Promise<{ violations: number }> {
  const sql = getSqlClient();
  const db = getDb();
  if (!sql || !db) return { violations: 0 };

  const rows = (await sql.unsafe(`
    select
      os.id, os.resend_email_id as "resendEmailId", os.recipient, os.campaign,
      os.sequence_step as "sequenceStep", os.attempted_at as "attemptedAt"
    from outreach_sends os
    where os.is_test = 'false'
      and os.attempted_at >= now() - interval '24 hours'
      and (
        select (j.payload->>'paused')::boolean
        from jobs j
        where j.type = 'outreach_settings' and j.created_at <= os.attempted_at
        order by j.created_at desc
        limit 1
      ) is true
  `)) as unknown as Array<{ id: string; resendEmailId: string | null; recipient: string; campaign: string; sequenceStep: string; attemptedAt: string }>;

  let violations = 0;
  for (const row of rows) {
    const markerType = `outreach_pause_violation_${row.id}`;
    const [alreadyAlerted] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.type, markerType)).limit(1);
    if (alreadyAlerted) continue;

    violations++;
    console.error("[outreach] CRITICAL: OUTREACH PAUSE VIOLATION — a real prospect email was sent while outreach was paused", {
      outreachSendId: row.id,
      resendEmailId: row.resendEmailId,
      recipient: row.recipient,
      campaign: row.campaign,
      sequenceStep: row.sequenceStep,
      attemptedAt: row.attemptedAt,
    });
    await db.insert(jobs).values({
      type: markerType,
      status: "failed",
      payload: { ...row, alertedAt: new Date().toISOString() },
    });
    await db.insert(jobs).values({
      type: "outreach_pause_violation",
      status: "failed",
      payload: { ...row, alertedAt: new Date().toISOString() },
    });
  }

  return { violations };
}
