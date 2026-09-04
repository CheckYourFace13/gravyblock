import { cookies } from "next/headers";

/**
 * First-party outreach-attribution cookie. Carries only an opaque token
 * (no email address, no PII) that maps back to a specific outreach send —
 * see run-outreach-batch.ts / run-followup-batch.ts / run-breakup-batch.ts,
 * which generate this token before sending and persist it (with campaign/
 * industry/city/contact type/business) on the corresponding cold_outreach_*
 * job row. Once set on first landing (report page, via ?src=), later funnel
 * events (pricing view, checkout start/complete) inherit it automatically
 * without needing the param threaded through every link on the site.
 */
export const ATTRIBUTION_COOKIE = "gb_attr";

export async function getAttributionToken(): Promise<string | null> {
  return (await cookies()).get(ATTRIBUTION_COOKIE)?.value ?? null;
}

export async function setAttributionToken(token: string): Promise<void> {
  (await cookies()).set(ATTRIBUTION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
}
