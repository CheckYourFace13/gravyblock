/**
 * The one customer-facing paid product. Public pages, emails and checkout read these values so the price and
 * wording cannot drift apart. Internally the product is still the "growth" plan tier (database values, Stripe
 * product and webhook mapping are unchanged); customers never see plan names.
 */
export const OFFER = {
  name: "GravyBlock",
  /** Monthly price in dollars. Must equal the Stripe price created by scripts/setup-single-price.mjs. */
  price: 39.99,
  priceCents: 3999,
  priceLabel: "$39.99/mo",
  priceLong: "$39.99/month",
  risk: "Cancel anytime · 30-day money-back guarantee",
  cta: "Start GravyBlock — $39.99/mo",
  /** Internal plan tier behind the offer. */
  tier: "growth" as const,
} as const;
