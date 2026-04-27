import { findWeakBusinesses } from "./prospect-finder";
import { sendProspectEmail } from "./outreach-emailer";
import { hasBeenContacted, recordOutreachSent } from "./outreach-tracker";

const DEFAULT_MAX_EMAILS = 5;

export async function runOutreachBatch(params: {
  city: string;
  state: string;
  industry: string;
  agencyName?: string;
  maxEmails?: number;
}): Promise<{ sent: number; skipped: number; prospects: number }> {
  const { city, state, industry, agencyName, maxEmails = DEFAULT_MAX_EMAILS } = params;

  // Safety cap — cold outreach must never run unchecked
  const cap = Math.min(maxEmails, DEFAULT_MAX_EMAILS);

  console.info("[outreach-batch] Starting batch", { city, state, industry, cap });

  const prospects = await findWeakBusinesses({ city, state, industry });

  console.info("[outreach-batch] Found prospects", { count: prospects.length });

  let sent = 0;
  let skipped = 0;

  for (const prospect of prospects) {
    if (sent >= cap) break;

    // Check if already contacted
    const alreadyContacted = await hasBeenContacted(prospect.placeId);
    if (alreadyContacted) {
      console.info("[outreach-batch] Skipping already-contacted prospect", {
        placeId: prospect.placeId,
        businessName: prospect.businessName,
      });
      skipped++;
      continue;
    }

    // Attempt send
    let result: { ok: boolean; skipped?: boolean; reason?: string };
    try {
      result = await sendProspectEmail(prospect, agencyName ? { agencyName } : undefined);
    } catch (err) {
      console.error("[outreach-batch] Email send failed", {
        placeId: prospect.placeId,
        businessName: prospect.businessName,
        error: err,
      });
      skipped++;
      continue;
    }

    if (!result.ok) {
      console.info("[outreach-batch] Email skipped", {
        placeId: prospect.placeId,
        businessName: prospect.businessName,
        reason: result.reason,
      });
      skipped++;
      continue;
    }

    // Derive the email that was sent (same logic as outreach-emailer)
    let sentEmail: string | undefined;
    if (prospect.website) {
      try {
        const domain = new URL(prospect.website).hostname.replace(/^www\./, "");
        sentEmail = `info@${domain}`;
      } catch {
        // ignore
      }
    }

    await recordOutreachSent(prospect.placeId, prospect.businessName, sentEmail);

    console.info("[outreach-batch] Email sent", {
      placeId: prospect.placeId,
      businessName: prospect.businessName,
      email: sentEmail,
    });

    sent++;
  }

  console.info("[outreach-batch] Batch complete", { sent, skipped, prospects: prospects.length });

  return { sent, skipped, prospects: prospects.length };
}
