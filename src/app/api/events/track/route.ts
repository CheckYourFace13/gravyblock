import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { trackFunnelEvent, type FunnelEventType } from "@/lib/events/track";
import { getAttributionToken, setAttributionToken } from "@/lib/events/attribution";

export const dynamic = "force-dynamic";

const SESSION_COOKIE = "gb_visitor";
const VALID_TYPES = new Set<FunnelEventType>([
  "report_landed",
  "scan_started",
  "scan_completed",
  "report_unlocked",
  "pricing_viewed",
  "checkout_started",
  "checkout_completed",
  "lead_form_submitted",
]);

/**
 * Lightweight first-party funnel beacon for steps with no dedicated server
 * action (pricing view, scan start on the client). Never blocks the page —
 * client callers should fire-and-forget this.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const p = body as Record<string, unknown>;
  const eventType = typeof p.eventType === "string" ? p.eventType : "";
  if (!VALID_TYPES.has(eventType as FunnelEventType)) {
    return NextResponse.json({ ok: false, error: "Unknown event type" }, { status: 400 });
  }

  const jar = await cookies();
  let sessionId = jar.get(SESSION_COOKIE)?.value;
  if (!sessionId) {
    sessionId = randomUUID();
    jar.set(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 90,
    });
  }

  // A token arriving in the body (from ?src= on a fresh outreach-link
  // landing) establishes attribution for the rest of this visitor's
  // session; otherwise inherit whatever the cookie already carries, so
  // later steps (pricing view, checkout) stay attributed without every
  // caller needing to know about the token.
  const incomingToken = typeof p.attributionToken === "string" ? p.attributionToken.slice(0, 200) : null;
  if (incomingToken) await setAttributionToken(incomingToken);
  const attributionToken = incomingToken ?? (await getAttributionToken());

  await trackFunnelEvent({
    eventType: eventType as FunnelEventType,
    sessionId,
    businessId: typeof p.businessId === "string" ? p.businessId : null,
    reportPublicId: typeof p.reportPublicId === "string" ? p.reportPublicId : null,
    utmSource: typeof p.utmSource === "string" ? p.utmSource.slice(0, 120) : (attributionToken ? "cold_outreach" : null),
    utmMedium: typeof p.utmMedium === "string" ? p.utmMedium.slice(0, 120) : null,
    utmCampaign: typeof p.utmCampaign === "string" ? p.utmCampaign.slice(0, 120) : null,
    referrer: typeof p.referrer === "string" ? p.referrer.slice(0, 500) : null,
    path: typeof p.path === "string" ? p.path.slice(0, 300) : null,
    metadata: attributionToken ? { attributionToken } : {},
  });

  return NextResponse.json({ ok: true });
}
