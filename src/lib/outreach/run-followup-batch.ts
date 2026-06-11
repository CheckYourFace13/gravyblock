/**
 * Follow-up outreach batch — sends email #2 to cold prospects who:
 *   - Got email #1 between 3 and 21 days ago
 *   - Have not received a follow-up yet
 *   - Have not opted out
 *
 * Email offers: first month free with code EMAILFREE.
 * Runs once per day via the worker.
 */

import { getFollowupCandidates, recordFollowupSent } from "./outreach-tracker";
import { sendFollowupEmail } from "./outreach-emailer";
import { isOptedOut } from "@/lib/email/optout";

export async function runFollowupOutreachBatch(
  batchSize = 20,
): Promise<{ sent: number; skipped: number; errors: number }> {
  const candidates = await getFollowupCandidates(3, 21, batchSize);

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const c of candidates) {
    if (!c.email) { skipped++; continue; }

    try {
      const result = await sendFollowupEmail({
        businessName: c.businessName,
        email: c.email,
        city: c.city || undefined,
      });

      if (result.skipped) {
        skipped++;
        continue;
      }

      if (result.ok) {
        await recordFollowupSent(c.placeId, c.businessName, c.email);
        sent++;
        console.info("[followup-outreach] sent", { businessName: c.businessName, email: c.email });
      }
    } catch (error) {
      errors++;
      console.error("[followup-outreach] failed", {
        businessName: c.businessName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { sent, skipped, errors };
}
