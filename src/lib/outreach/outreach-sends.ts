import { eq } from "drizzle-orm";
import { getDb, outreachSends } from "@/lib/db";

export type OutreachSendInput = {
  resendEmailId: string | null;
  businessId?: string | null;
  placeId?: string | null;
  recipient: string;
  campaign: "cold_outreach" | "cold_outreach_followup" | "cold_outreach_breakup" | "webhook_test";
  sequenceStep: "initial" | "followup" | "breakup" | "test";
  contactSource?: string | null;
  contactConfidence?: string | null;
  isTest?: boolean;
};

/** Records a real send attempt as a first-class row. Never throws — a tracking failure must never break a send. */
export async function recordOutreachSendRow(input: OutreachSendInput): Promise<void> {
  try {
    const db = getDb();
    if (!db) return;
    await db.insert(outreachSends).values({
      resendEmailId: input.resendEmailId,
      businessId: input.businessId ?? null,
      placeId: input.placeId ?? null,
      recipient: input.recipient,
      campaign: input.campaign,
      sequenceStep: input.sequenceStep,
      contactSource: input.contactSource ?? null,
      contactConfidence: input.contactConfidence ?? null,
      isTest: input.isTest ? "true" : "false",
      status: input.resendEmailId ? "accepted" : "attempted",
      acceptedAt: input.resendEmailId ? new Date() : null,
    });
  } catch (error) {
    console.error("[outreach-sends] record failed", {
      resendEmailId: input.resendEmailId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const EVENT_FIELD: Record<string, "deliveredAt" | "openedAt" | "firstClickedAt" | "bouncedAt" | "complainedAt"> = {
  delivered: "deliveredAt",
  opened: "openedAt",
  clicked: "firstClickedAt",
  bounced: "bouncedAt",
  complained: "complainedAt",
};

/**
 * Resolves an incoming webhook event to its outreach-send row by
 * resendEmailId (the primary correlation key) and updates its status/
 * timestamp. Returns whether a matching row was found — callers should not
 * assume every event belongs to a tracked send (historical sends and
 * non-outreach email types won't have one).
 */
export async function applyWebhookEventToOutreachSend(
  resendEmailId: string | null,
  eventType: string,
): Promise<{ matched: boolean }> {
  if (!resendEmailId) return { matched: false };
  const field = EVENT_FIELD[eventType];
  if (!field) return { matched: false };

  try {
    const db = getDb();
    if (!db) return { matched: false };
    const [existing] = await db
      .select({ id: outreachSends.id })
      .from(outreachSends)
      .where(eq(outreachSends.resendEmailId, resendEmailId))
      .limit(1);
    if (!existing) return { matched: false };

    // Only set the timestamp the first time this event type is seen for this
    // send — a retried/replayed webhook event must not overwrite it.
    const current = await db
      .select({ value: outreachSends[field] })
      .from(outreachSends)
      .where(eq(outreachSends.resendEmailId, resendEmailId))
      .limit(1);
    if (current[0]?.value) return { matched: true };

    await db
      .update(outreachSends)
      .set({ [field]: new Date(), status: eventType })
      .where(eq(outreachSends.resendEmailId, resendEmailId));
    return { matched: true };
  } catch (error) {
    console.error("[outreach-sends] update failed", {
      resendEmailId,
      eventType,
      error: error instanceof Error ? error.message : String(error),
    });
    return { matched: false };
  }
}
