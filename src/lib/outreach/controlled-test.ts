/**
 * Admin-only controlled test of the REAL cold-outreach send path
 * (sendProspectEmail — the exact function run-outreach-batch.ts calls),
 * without enabling the outreach scheduler and without touching a real
 * prospect. Fixed synthetic business, fixed admin-supplied recipient,
 * isTest=true throughout — never writes to the real per-prospect contact
 * history (recordOutreachSent), never counts toward the jobs-based funnel
 * totals /admin/outreach reads, never touches suppression/opt-out counts
 * beyond what a real bounce/complaint would legitimately still need to
 * respect for the test address itself.
 */
import type { Prospect } from "./prospect-finder";
import { sendProspectEmail } from "./outreach-emailer";
import { recordOutreachSendRow } from "./outreach-sends";
import { isOptedOut } from "@/lib/email/optout";

const TEST_PLACE_ID = "controlled-test-not-a-real-place";

export async function runControlledOutreachPathTest(
  recipient: string,
): Promise<{ ok: boolean; error?: string; resendEmailId?: string | null }> {
  if (await isOptedOut(recipient)) {
    return { ok: false, error: "This address has opted out — use a different one" };
  }

  const syntheticProspect: Prospect = {
    placeId: TEST_PLACE_ID,
    businessName: "GravyBlock Internal Test Business",
    address: "123 Test St, Internal, XX 00000",
    city: "Internal",
    website: "https://gravyblock.com",
    opportunityScore: 0,
    weaknessReasons: ["controlled test — not a real prospect"],
  };

  let result: { ok: boolean; skipped?: boolean; reason?: string; resendEmailId?: string | null };
  try {
    result = await sendProspectEmail(syntheticProspect, recipient, {
      agencyName: undefined,
      industryLabel: "internal test",
      preScan: null,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  if (!result.ok) {
    return { ok: false, error: result.reason ?? "send returned not-ok" };
  }

  // Deliberately NOT calling recordOutreachSent (the jobs-based per-prospect
  // history / funnel-count writer) — this must never look like a real
  // contacted prospect or count toward production totals. Only the
  // first-class row, explicitly flagged as a test.
  await recordOutreachSendRow({
    resendEmailId: result.resendEmailId ?? null,
    placeId: TEST_PLACE_ID,
    recipient,
    campaign: "cold_outreach",
    sequenceStep: "test",
    contactSource: "controlled_test_fixed_recipient",
    contactConfidence: "n/a",
    isTest: true,
  });

  return { ok: true, resendEmailId: result.resendEmailId ?? null };
}
