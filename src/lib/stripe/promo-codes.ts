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
] as const;

export type PromoCode = (typeof PROMO_CODES)[number];

export function normalizePromoCode(raw?: string | null): PromoCode | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  return (PROMO_CODES as readonly string[]).includes(trimmed)
    ? (trimmed as PromoCode)
    : null;
}
