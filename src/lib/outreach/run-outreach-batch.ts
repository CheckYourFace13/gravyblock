import { findWeakBusinesses } from "./prospect-finder";
import { sendProspectEmail } from "./outreach-emailer";
import { hasBeenContacted, recordOutreachSent } from "./outreach-tracker";
import { runProspectPreScan } from "./prospect-prescan";
import { isOptedOut } from "@/lib/email/optout";

const DEFAULT_MAX_EMAILS = 25; // 25 per batch × 4 weekday windows = ~100/day

export async function runOutreachBatch(params: {
  city: string;
  state: string;
  industry: string;
  industryLabel?: string;
  agencyName?: string;
  maxEmails?: number;
}): Promise<{ sent: number; skipped: number; prospects: number }> {
  const { city, state, industry, industryLabel, agencyName, maxEmails = DEFAULT_MAX_EMAILS } = params;

  const cap = maxEmails; // no artificial ceiling — controlled via admin UI

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

    // Cheap disqualifiers first — don't pay for a pre-scan on a prospect the
    // emailer would skip anyway (unparseable domain or opted out).
    let candidateEmail: string | undefined;
    if (prospect.website) {
      try {
        const domain = new URL(prospect.website).hostname.replace(/^www\./, "");
        candidateEmail = `info@${domain}`;
      } catch { /* ignore */ }
    }
    if (!candidateEmail) {
      skipped++;
      continue;
    }
    if (await isOptedOut(candidateEmail)) {
      skipped++;
      continue;
    }

    // Run their scan BEFORE emailing so the email leads with a real score and
    // a link to their actual report instead of an invitation to go run one.
    // Falls back to the invite-style email when the pre-scan fails (null).
    const preScan = await runProspectPreScan(prospect);

    let result: { ok: boolean; skipped?: boolean; reason?: string };
    try {
      result = await sendProspectEmail(prospect, {
        agencyName,
        industryLabel: industryLabel ?? industry,
        preScan,
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

    await recordOutreachSent(prospect.placeId, prospect.businessName, candidateEmail, prospect.city, preScan?.publicId);
    console.info("[outreach-batch] Sent", {
      businessName: prospect.businessName,
      email: candidateEmail,
      score: prospect.opportunityScore,
      preScanned: Boolean(preScan),
      reportScore: preScan?.score,
    });
    sent++;
  }

  console.info("[outreach-batch] Done", { sent, skipped, prospects: prospects.length });
  return { sent, skipped, prospects: prospects.length };
}
