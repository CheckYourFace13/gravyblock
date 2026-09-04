import { getDb, funnelEvents } from "@/lib/db";

export type FunnelEventType =
  | "report_landed"
  | "scan_started"
  | "scan_completed"
  | "report_unlocked"
  | "pricing_viewed"
  | "checkout_started"
  | "checkout_completed"
  | "lead_form_submitted";

export type FunnelEventInput = {
  eventType: FunnelEventType;
  sessionId?: string | null;
  businessId?: string | null;
  reportPublicId?: string | null;
  leadId?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  referrer?: string | null;
  path?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Best-effort funnel event insert. Never throws — a tracking failure must
 * never break the scan/checkout/lead flow it's observing.
 */
export async function trackFunnelEvent(input: FunnelEventInput): Promise<void> {
  try {
    const db = getDb();
    if (!db) return;
    await db.insert(funnelEvents).values({
      eventType: input.eventType,
      sessionId: input.sessionId ?? null,
      businessId: input.businessId ?? null,
      reportPublicId: input.reportPublicId ?? null,
      leadId: input.leadId ?? null,
      utmSource: input.utmSource ?? null,
      utmMedium: input.utmMedium ?? null,
      utmCampaign: input.utmCampaign ?? null,
      referrer: input.referrer ?? null,
      path: input.path ?? null,
      metadata: input.metadata ?? {},
    });
  } catch (error) {
    console.error("[funnel-events] insert failed", {
      eventType: input.eventType,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
