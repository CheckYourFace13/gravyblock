/**
 * Breakup outreach batch — sends email #3 (the final "closing your file" touch)
 * to prospects who:
 *   - Got the follow-up (email #2) 5–30 days ago
 *   - Never got a breakup email
 *   - Have not opted out
 *
 * Breakup emails consistently get the highest reply rate of any sequence step.
 * Runs once per day via the worker.
 */

import { getBreakupCandidates, recordBreakupSent } from "./outreach-tracker";
import { sendBreakupEmail } from "./outreach-emailer";
import { recordOutreachSendRow } from "./outreach-sends";
import { recordOutreachSendFailure } from "./outreach-health";

export async function runBreakupOutreachBatch(
  batchSize = 40,
): Promise<{ sent: number; skipped: number; errors: number }> {
  const candidates = await getBreakupCandidates(5, 30, batchSize);

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const c of candidates) {
    if (!c.email) { skipped++; continue; }

    try {
      const result = await sendBreakupEmail({
        businessName: c.businessName,
        email: c.email,
        city: c.city || undefined,
      });

      if (result.skipped) { skipped++; continue; }

      if (result.ok) {
        await recordBreakupSent(c.placeId, c.businessName, c.email);
        await recordOutreachSendRow({
          resendEmailId: result.resendEmailId ?? null,
          placeId: c.placeId,
          recipient: c.email,
          campaign: "cold_outreach_breakup",
          sequenceStep: "breakup",
        });
        sent++;
        console.info("[breakup-outreach] sent", { businessName: c.businessName, email: c.email });
      }
    } catch (error) {
      errors++;
      const message = error instanceof Error ? error.message : String(error);
      console.error("[breakup-outreach] failed", { businessName: c.businessName, error: message });
      await recordOutreachSendFailure({ campaign: "cold_outreach_breakup", businessName: c.businessName, error: message });
    }
  }

  return { sent, skipped, errors };
}
