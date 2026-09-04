"use client";

import { useEffect } from "react";

type Props = {
  eventType: "scan_started" | "pricing_viewed" | "report_landed";
  businessId?: string | null;
  reportPublicId?: string | null;
};

/** Fires a first-party funnel event once on mount. Fire-and-forget — never blocks render. */
export function FunnelBeacon({ eventType, businessId, reportPublicId }: Props) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // Outreach email links pre-fill /scan with ?q=&city=&e=<base64 email> and
    // carry no utm_ params of their own — treat that shape as attributed
    // cold-outreach traffic so it isn't silently lumped in with "unknown".
    const looksLikeOutreachLink = params.has("e") && params.has("q");
    // Report links carry ?src=<opaque per-send token> instead — see
    // run-outreach-batch.ts. Establishes first-party attribution for the
    // rest of this visitor's session (server persists it as a cookie);
    // never PII, never an email address.
    const attributionToken = params.get("src");
    const payload = {
      eventType,
      businessId: businessId ?? null,
      reportPublicId: reportPublicId ?? null,
      attributionToken,
      utmSource: params.get("utm_source") ?? (looksLikeOutreachLink || attributionToken ? "cold_outreach" : null),
      utmMedium: params.get("utm_medium"),
      utmCampaign: params.get("utm_campaign"),
      referrer: document.referrer || null,
      path: window.location.pathname,
    };
    fetch("/api/events/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
    // Fire once per mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
