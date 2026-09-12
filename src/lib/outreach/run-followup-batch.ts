/**
 * Follow-up outreach batch — sends email #2 to cold prospects who:
 *   - Got email #1 between 3 and 21 days ago
 *   - Have not received a follow-up yet
 *   - Have not opted out
 *
 * Links back to the same personalized report as the initial email and
 * introduces the offer: Autopilot $74.99/mo, locked while subscribed.
 * Runs once per day via the worker.
 */

import { randomUUID } from "node:crypto";
import { getFollowupCandidates, recordFollowupSent, getReportSummary } from "./outreach-tracker";
import { sendFollowupEmail } from "./outreach-emailer";
import { isOptedOut } from "@/lib/email/optout";
import { recordOutreachSendRow } from "./outreach-sends";
import { recordOutreachSendFailure } from "./outreach-health";

export async function runFollowupOutreachBatch(
  batchSize = 20,
): Promise<{ sent: number; skipped: number; errors: number }> {
  const candidates = await getFollowupCandidates(3, 21, batchSize);

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const c of candidates) {
    if (!c.email) { skipped++; continue; }

    const attributionToken = randomUUID();
    const reportSummary = c.reportPublicId ? await getReportSummary(c.reportPublicId) : null;
    try {
      const result = await sendFollowupEmail({
        businessName: c.businessName,
        email: c.email,
        city: c.city || undefined,
        attributionToken,
        reportPublicId: c.reportPublicId,
        findingTitle: reportSummary?.findingTitle ?? null,
      });

      if (result.skipped) {
        skipped++;
        continue;
      }

      if (result.ok) {
        await recordFollowupSent(c.placeId, c.businessName, c.email, c.city || undefined, attributionToken);
        await recordOutreachSendRow({
          resendEmailId: result.resendEmailId ?? null,
          placeId: c.placeId,
          recipient: c.email,
          campaign: "cold_outreach_followup",
          sequenceStep: "followup",
        });
        sent++;
        console.info("[followup-outreach] sent", { businessName: c.businessName, email: c.email });
      }
    } catch (error) {
      errors++;
      const message = error instanceof Error ? error.message : String(error);
      console.error("[followup-outreach] failed", { businessName: c.businessName, error: message });
      await recordOutreachSendFailure({ campaign: "cold_outreach_followup", businessName: c.businessName, error: message });
    }
  }

  return { sent, skipped, errors };
}
