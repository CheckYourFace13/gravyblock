/**
 * A narrow pause for UNSOLICITED outreach only (GravyBlock's cold sales emails, their follow-ups and break-up emails, and house authority pitches and their
 * follow-ups). It exists because cold outreach shares hello@gravyblock.com with customer mail and GrokBot audits, and its first-email bounce rate (5.9%) and
 * near-zero engagement put that shared reputation at risk.
 *
 * It deliberately does NOT touch: transactional mail, customer communications, lead drip to people who scanned, review requests, the Friday owner report,
 * GrokBot emails, replies to people who wrote to us, and all unsubscribe / suppression processing (those keep working while paused).
 *
 * State: the latest of a `cold_outreach_pause` / `cold_outreach_resume` job row. Fails closed: if the state cannot be read, unsolicited sending is treated as paused.
 * Resuming is an owner decision (scripts/ops/outreach-pause.ts resume) and is recorded with who approved it.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { isInternalTestRecipient } from "./pause-guard";

export type ColdPauseState = { paused: boolean; since: string | null; reason: string | null; error?: string };

export async function coldOutreachPauseState(): Promise<ColdPauseState> {
  try {
    const db = getDb();
    if (!db) return { paused: true, since: null, reason: null, error: "no database" };
    const rows = (await db.execute(sql`select type, created_at, payload from jobs where type in ('cold_outreach_pause', 'cold_outreach_resume') order by created_at desc limit 1`)) as unknown as Array<{ type: string; created_at: string; payload: { reason?: string } | null }>;
    const r = rows[0];
    if (!r) return { paused: false, since: null, reason: null };
    return { paused: r.type === "cold_outreach_pause", since: new Date(r.created_at).toISOString(), reason: r.payload?.reason ?? null };
  } catch (err) {
    return { paused: true, since: null, reason: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Call at the send boundary of every unsolicited outreach email, next to the existing pause guard. */
export async function assertColdOutreachAllowed(recipient: string): Promise<{ allowed: true } | { allowed: false; reason: string }> {
  if (isInternalTestRecipient(recipient)) return { allowed: true };
  const s = await coldOutreachPauseState();
  if (s.error) return { allowed: false, reason: `cold outreach pause state unavailable (${s.error}); skipped, not assumed allowed` };
  return s.paused ? { allowed: false, reason: `unsolicited outreach is paused since ${s.since?.slice(0, 10)} (${s.reason ?? "sender reputation"})` } : { allowed: true };
}
