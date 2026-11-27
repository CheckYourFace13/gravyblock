/**
 * Sender health for the Friday owner report: one short section built from data GravyBlock already records (Resend webhook events, GrokBot delivery log, the
 * unsolicited-outreach pause). Exceptions are flagged; there is no separate dashboard and nothing for the owner to do unless a line says so.
 * Resend "delivered" means the receiving server accepted the message. It does not show inbox versus spam placement, which is reported as NOT MEASURED.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { coldOutreachPauseState } from "@/lib/outreach/cold-pause";

type Row = { t: string; delivered: number; bounced: number; hard: number; complained: number };

/** Exceptions worth the owner's attention, from per-class numbers (pure, tested). */
export function senderExceptions(rows: Row[], grokbotFailed: number): string[] {
  const out: string[] = [];
  for (const r of rows) {
    const sent = r.delivered + r.bounced;
    if (sent >= 10 && r.bounced / sent > 0.02) out.push(`${r.t}: bounce rate ${((r.bounced / sent) * 100).toFixed(1)}% (${r.bounced} of ${sent}); keep it under 2%`);
    if (r.complained > 0) out.push(`${r.t}: ${r.complained} spam complaint(s)`);
  }
  if (grokbotFailed > 0) out.push(`GrokBot: ${grokbotFailed} email(s) failed this week (see the GrokBot line)`);
  return out;
}

export async function senderHealthSection(now = new Date()): Promise<string> {
  const db = getDb();
  if (!db) return "";
  const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const rows = (await db.execute(sql`
    select coalesce(email_type, 'untagged') t,
           count(*) filter (where event_type = 'delivered')::int delivered,
           count(*) filter (where event_type = 'bounced')::int bounced,
           count(*) filter (where event_type = 'bounced' and metadata->'bounce'->>'type' = 'Permanent')::int hard,
           count(*) filter (where event_type = 'complained')::int complained
    from email_events where created_at >= ${since}::timestamptz group by 1 order by 2 desc`)) as unknown as Row[];
  const [g] = (await db.execute(sql`select count(*) filter (where status = 'failed')::int failed, count(*) filter (where status = 'sent')::int sent from grokbot_deliveries where created_at >= ${since}::timestamptz and kind <> 'test'`)) as unknown as Array<{ failed: number; sent: number }>;
  const pause = await coldOutreachPauseState();
  const ex = senderExceptions(rows.map((r) => ({ ...r, delivered: Number(r.delivered), bounced: Number(r.bounced), hard: Number(r.hard), complained: Number(r.complained) })), Number(g?.failed ?? 0));
  const L: string[] = [];
  L.push("SENDER HEALTH (last 7 days; hello@gravyblock.com via Resend)");
  L.push(`  Unsolicited outreach: ${pause.paused ? `PAUSED since ${pause.since?.slice(0, 10) ?? "unknown"} (${pause.reason ?? "sender reputation"}); resuming needs your approval` : "running"}${pause.error ? ` (state unreadable, treated as paused: ${pause.error})` : ""}`);
  L.push(`  ${rows.length ? rows.map((r) => { const n = Number(r.delivered) + Number(r.bounced); return `${r.t}: ${n} sent, ${r.bounced} bounced (${n ? ((Number(r.bounced) / n) * 100).toFixed(1) : "0.0"}%)${n < 10 ? " [small sample: too few to call healthy]" : ""}${Number(r.complained) ? `, ${r.complained} complaints` : ""}`; }).join("; ") : "no email events recorded"}`);
  L.push(`  GrokBot emails: ${Number(g?.sent ?? 0)} sent, ${Number(g?.failed ?? 0)} failed`);
  L.push("  Inbox vs spam placement: NOT MEASURED (delivered only means the receiving server accepted the message; Gmail placement needs Gmail Postmaster Tools or the recipient's own check).");
  L.push(ex.length ? `  EXCEPTIONS: ${ex.join("; ")}` : "  No exceptions among email types with at least 10 sends (smaller samples are labelled above and are not called healthy).");
  return L.join("\n");
}
