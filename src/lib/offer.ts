/**
 * The one customer-facing paid product. Public pages, emails and checkout read these values so the price and
 * wording cannot drift apart. Internally the product is still the "growth" plan tier (database values, Stripe
 * product and webhook mapping are unchanged); customers never see plan names.
 *
 * Terms: a 14-day free trial (card required, nothing charged during the trial), then $29.99 a month or $299 a year.
 * Cancel anytime. The 30-day money-back guarantee starts at the FIRST PAID charge, which is after the trial, so the two
 * never overlap and are always worded apart.
 */
export const OFFER = {
  name: "GravyBlock",
  /** Monthly price in dollars. Must equal the Stripe price created by scripts/setup-single-price.mjs. */
  price: 29.99,
  priceCents: 2999,
  priceLabel: "$29.99/mo",
  priceLong: "$29.99/month",
  /** Annual price: one payment a year. */
  annualPrice: 299,
  annualCents: 29900,
  annualLabel: "$299/year",
  /** What the annual price works out to a month, and what it saves against twelve monthly payments (29.99 x 12 = 359.88). */
  annualMonthlyEquivalent: "$24.92/month",
  annualSavings: "$60.88",
  /** Free trial length in days. Applied by Checkout as the subscription trial, so nothing is charged until it ends. */
  trialDays: 14,
  trialLabel: "14-day free trial",
  guarantee: "30-day money-back guarantee after your first payment",
  risk: "14-day free trial · Cancel anytime · 30-day money-back guarantee after your first payment",
  cta: "Start your 14-day free trial",
  /** Internal plan tier behind the offer. */
  tier: "growth" as const,
} as const;
