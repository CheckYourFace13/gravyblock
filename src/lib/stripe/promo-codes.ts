/**
 * Centralised promo-code allowlist.
 * Keep in sync with actual Stripe coupon IDs (run scripts/create-coupons.mjs once).
 */

export const PROMO_CODES = [
  "ILoveYouFree",
  "ILikeYou50",
  "INTRO50",
  "PRODUCTHUNT",
  "GOOGLE50",
  "CONNECT",
  "EMAILFREE",
] as const;

export type PromoCode = (typeof PROMO_CODES)[number];

export function normalizePromoCode(raw?: string | null): PromoCode | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  return (PROMO_CODES as readonly string[]).includes(trimmed)
    ? (trimmed as PromoCode)
    : null;
}

/**
 * Maps each advertised promo code to its real Stripe **coupon ID**.
 *
 * Stripe's checkout `discounts: [{ coupon }]` takes a coupon ID, NOT the
 * customer-facing code. Some coupons were created with an ID equal to the code
 * (EMAILFREE, PRODUCTHUNT, GOOGLE50, CONNECT) so they map to themselves. Others
 * (notably INTRO50) have auto-generated IDs and MUST be mapped explicitly —
 * passing the literal string "INTRO50" returns "No such coupon" and throws the
 * entire checkout, which is why self-serve signups were silently failing.
 *
 * Verified against live Stripe on 2026-06-22. If coupons are recreated, re-run
 * the verification and update these IDs.
 */
const COUPON_ID_BY_PROMO: Record<PromoCode, string> = {
  INTRO50: "jCfNjmSs",
  EMAILFREE: "EMAILFREE",
  PRODUCTHUNT: "PRODUCTHUNT",
  GOOGLE50: "GOOGLE50",
  CONNECT: "CONNECT",
  ILoveYouFree: "kCH2CBpE",
  ILikeYou50: "KkHmRUT9",
};

/**
 * Resolves an advertised promo code to its Stripe coupon ID.
 * Returns null when the code is unknown so callers can fall back to
 * `allow_promotion_codes` (checkout still completes) rather than throwing.
 */
export function resolveCouponId(code?: string | null): string | null {
  const normalized = normalizePromoCode(code);
  if (!normalized) return null;
  return COUPON_ID_BY_PROMO[normalized] ?? null;
}
