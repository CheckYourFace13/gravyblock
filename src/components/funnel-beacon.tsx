"use client";

import { useEffect } from "react";

type Props = {
  eventType: "scan_started" | "pricing_viewed" | "report_landed" | "start_page_viewed";
  businessId?: string | null;
  reportPublicId?: string | null;
  /** Proof category shown on this page ("none" when no proof was shown). */
  proofType?: string | null;
};

/** Fires a first-party funnel event once on mount. Fire-and-forget — never blocks render. */
export function FunnelBeacon({ eventType, businessId, reportPublicId, proofType }: Props) {
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
      proofType: proofType ?? null,
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
    // Human proof: a real person scrolls, taps, types or moves a pointer; crawlers and headless captures that merely load the page do not.
    // One "page_engaged" per mount, only from a trusted (browser-generated) input event, so "views" can be split into people and page loads.
    let engaged = false;
    const onHuman = (ev: Event) => {
      if (engaged || !ev.isTrusted) return;
      engaged = true;
      for (const name of HUMAN_EVENTS) window.removeEventListener(name, onHuman);
      fetch("/api/events/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType: "page_engaged", businessId: businessId ?? null, reportPublicId: reportPublicId ?? null, utmSource: payload.utmSource, utmMedium: payload.utmMedium, utmCampaign: payload.utmCampaign, path: window.location.pathname, detail: eventType }),
        keepalive: true,
      }).catch(() => {});
    };
    if (eventType === "scan_started") for (const name of HUMAN_EVENTS) window.addEventListener(name, onHuman, { passive: true });
    // Fire once per mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => {
      for (const name of HUMAN_EVENTS) window.removeEventListener(name, onHuman);
    };
  }, []);

  return null;
}

const HUMAN_EVENTS = ["pointerdown", "touchstart", "keydown", "scroll", "wheel"] as const;

/** One-off first-party beacon for a behavior step (form interaction, submit, failure). `detail` is a short category, never text the visitor typed. */
export function sendFunnelBeacon(eventType: "scan_form_interacted" | "scan_submitted" | "scan_submit_failed", detail?: string) {
  try {
    const params = new URLSearchParams(window.location.search);
    void fetch("/api/events/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType,
        detail: detail ?? null,
        utmSource: params.get("utm_source"),
        utmMedium: params.get("utm_medium"),
        utmCampaign: params.get("utm_campaign"),
        path: window.location.pathname,
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* tracking never breaks the form */
  }
}
