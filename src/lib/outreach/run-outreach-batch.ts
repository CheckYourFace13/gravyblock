import { findWeakBusinesses } from "./prospect-finder";
import { sendProspectEmail } from "./outreach-emailer";
import { hasBeenContacted, recordOutreachSent } from "./outreach-tracker";

const DEFAULT_MAX_EMAILS = 8; // 8 per batch × 3 batches/day = ~24/day, ~480/month

export async function runOutreachBatch(params: {
  city: string;
  state: string;
  industry: string;
  industryLabel?: string;
  agencyName?: string;
  maxEmails?: number;
}): Promise<{ sent: number; skipped: number; prospects: number }> {
  const { city, state, industry, industryLabel, agencyName, maxEmails = DEFAULT_MAX_EMAILS } = params;

  // Hard cap — cold outreach must never run unchecked
  const cap = Math.min(maxEmails, 10);

  console.info("[outreach-batch] Starting", { city, state, industry, cap });

  const prospects = await findWeakBusinesses({ city, state, industry });
  console.info("[outreach-batch] Prospects found", { count: prospects.length });

  let sent = 0;
  let skipped = 0;

  for (const prospect of prospects) {
    if (sent >= cap) break;

    const alreadyContacted = await hasBeenContacted(prospect.placeId);
    if (alreadyContacted) {
      skipped++;
      continue;
    }

    let result: { ok: boolean; skipped?: boolean; reason?: string };
    try {
      result = await sendProspectEmail(prospect, {
        agencyName,
        industryLabel: industryLabel ?? industry,
      });
    } catch (err) {
      console.error("[outreach-batch] Send failed", {
        businessName: prospect.businessName,
        error: err instanceof Error ? err.message : String(err),
      });
      skipped++;
      continue;
    }

    if (!result.ok) {
      console.info("[outreach-batch] Skipped", { businessName: prospect.businessName, reason: result.reason });
      skipped++;
      continue;
    }

    // Derive the email we sent (same logic as emailer)
    let sentEmail: string | undefined;
    if (prospect.website) {
      try {
        const domain = new URL(prospect.website).hostname.replace(/^www\./, "");
        sentEmail = `info@${domain}`;
      } catch { /* ignore */ }
    }

    await recordOutreachSent(prospect.placeId, prospect.businessName, sentEmail);
    console.info("[outreach-batch] Sent", { businessName: prospect.businessName, email: sentEmail, score: prospect.opportunityScore });
    sent++;
  }

  console.info("[outreach-batch] Done", { sent, skipped, prospects: prospects.length });
  return { sent, skipped, prospects: prospects.length };
}
