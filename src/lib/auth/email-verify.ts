import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stateless email-verification tokens (HMAC of businessId + email). No DB row
 * needed — the link self-validates. Used to confirm a customer's account email.
 */
function secret(): string {
  return (
    process.env.CUSTOMER_AUTH_SECRET?.trim() ||
    process.env.ADMIN_SECRET?.trim() ||
    "dev-only-change-me"
  );
}

export function makeVerifyToken(businessId: string, email: string): string {
  return createHmac("sha256", secret())
    .update(`${businessId}:${email.toLowerCase()}`)
    .digest("hex");
}

export function checkVerifyToken(businessId: string, email: string, token: string): boolean {
  const expected = makeVerifyToken(businessId, email);
  if (token.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function verifyEmailUrl(businessId: string, email: string): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com";
  const token = makeVerifyToken(businessId, email);
  const params = new URLSearchParams({ b: businessId, e: email.toLowerCase(), t: token });
  return `${site.replace(/\/$/, "")}/verify-email?${params.toString()}`;
}
