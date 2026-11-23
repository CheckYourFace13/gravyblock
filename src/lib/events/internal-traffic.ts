/**
 * Traffic that must never count as a genuine visitor, scan, signup or conversion: the owner's own browsing (admin session), internal tests and video captures
 * (a `gb_internal=1` cookie that the capture and QA tooling sets), and automated clients (crawlers, link previews, headless tools). The mark is stored on the event
 * (metadata.excluded) so every report can leave that whole session out, and a scan started from such a session is classified as internal, not public.
 */
export type TrafficExclusion = "internal" | "bot";

const BOT_UA = /(bot|crawl|spider|slurp|preview|facebookexternalhit|headlesschrome|lighthouse|pingdom|uptime|monitor|curl|wget|python-requests|go-http-client|axios|node-fetch|playwright|puppeteer)/i;

export function trafficExclusion(cookies: { get(name: string): { value: string } | undefined }, userAgent: string | null | undefined): TrafficExclusion | null {
  if (cookies.get("gb_internal")?.value === "1" || cookies.get("gb_admin_session")?.value) return "internal";
  if (!userAgent || BOT_UA.test(userAgent)) return "bot";
  return null;
}
