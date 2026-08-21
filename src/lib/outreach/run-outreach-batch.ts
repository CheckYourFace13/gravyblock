import { findWeakBusinesses } from "./prospect-finder";
import { sendProspectEmail } from "./outreach-emailer";
import { hasBeenContacted, recordOutreachSent } from "./outreach-tracker";
import { runProspectPreScan } from "./prospect-prescan";
import { isOptedOut } from "@/lib/email/optout";
import { discoverContactEmail } from "./discover-contact-email";

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
    // emailer would skip anyway (no website, or opted out).
    if (!prospect.website) {
      skipped++;
      continue;
    }
    // Only email an address actually published on the prospect's own site —
    // never a blind info@{domain} guess. Guessed addresses have an unknown
    // (likely high) bounce rate and damage GravyBlock's own sending domain.
    const contact = await discoverContactEmail(prospect.website);
    if (!contact.email) {
      skipped++;
      continue;
    }
    const candidateEmail = contact.email;
    if (await isOptedOut(candidateEmail)) {
      skipped++;
      continue;
    }

    // Run their scan BEFORE emailing so the email leads with a real score,
    // their actual top fixes, and a link to their real report. A generic
    // "invite yourself to scan" email with no specifics converts worse and
    // reads as one more piece of spam — if the pre-scan fails, skip this
    // prospect entirely rather than send the un-personalized fallback.
    // (Places/site-crawl calls that back this rarely fail outright, so this
    // costs very few sends — see prospect-prescan.ts's cost note.)
    const preScan = await runProspectPreScan(prospect);
    if (!preScan) {
      console.info("[outreach-batch] Skipped — pre-scan failed, no generic fallback sent", { businessName: prospect.businessName });
      skipped++;
      continue;
    }

    let result: { ok: boolean; skipped?: boolean; reason?: string; resendEmailId?: string | null };
    try {
      result = await sendProspectEmail(prospect, candidateEmail, {
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

    await recordOutreachSent(
      prospect.placeId,
      prospect.businessName,
      candidateEmail,
      prospect.city,
      preScan?.publicId,
      contact.source,
      contact.confidence,
      result.resendEmailId ?? undefined,
    );
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
