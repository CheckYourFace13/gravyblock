/**
 * Creates annual Stripe prices for all 4 GravyBlock plans if they don't exist.
 * Runs automatically during deploy (GitHub Actions → VPS).
 *
 * - Reads existing monthly price IDs from .env to find the products
 * - Creates annual prices at 25% discount (saves 3 months vs paying monthly)
 * - Appends the new price IDs back to .env so the app picks them up
 * - Fully idempotent: safe to run on every deploy
 */

import Stripe from "stripe";
import { readFileSync, appendFileSync } from "fs";
import { resolve } from "path";
import { config } from "dotenv";

config(); // load .env

const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!stripeKey) {
  console.log("[setup-annual-prices] STRIPE_SECRET_KEY not set — skipping");
  process.exit(0);
}

const stripe = new Stripe(stripeKey, { apiVersion: "2026-03-25.dahlia" });

const ENV_PATH = resolve(process.cwd(), ".env");

function readEnv() {
  try {
    return readFileSync(ENV_PATH, "utf8");
  } catch {
    return "";
  }
}

function appendEnvVar(key, value) {
  const current = readEnv();
  if (current.includes(`${key}=`)) {
    console.log(`[setup-annual-prices] ${key} already set — skipping`);
    return;
  }
  appendFileSync(ENV_PATH, `\n${key}=${value}\n`);
  console.log(`[setup-annual-prices] Added ${key}=${value} to .env`);
}

async function getProductForPrice(priceId) {
  if (!priceId) return null;
  try {
    const price = await stripe.prices.retrieve(priceId);
    return typeof price.product === "string" ? price.product : price.product?.id ?? null;
  } catch {
    return null;
  }
}

async function createOrFindAnnualPrice(productId, amountCents, nickname) {
  // Check if an annual price already exists for this product
  const existing = await stripe.prices.list({
    product: productId,
    recurring: { interval: "year" },
    active: true,
    limit: 5,
  });

  if (existing.data.length > 0) {
    console.log(`[setup-annual-prices] Annual price already exists for ${nickname}: ${existing.data[0].id}`);
    return existing.data[0].id;
  }

  const price = await stripe.prices.create({
    product: productId,
    unit_amount: amountCents,
    currency: "usd",
    recurring: { interval: "year" },
    nickname,
    metadata: { plan: nickname.toLowerCase().replace(" annual", ""), billing: "annual" },
  });

  console.log(`[setup-annual-prices] Created ${nickname}: ${price.id} ($${(amountCents / 100).toFixed(2)}/yr)`);
  return price.id;
}

const PLANS = [
  {
    monthlyEnvVar: "STRIPE_PRICE_STARTER_MONTHLY",
    fallbackEnvVars: ["STRIPE_PRICE_BASE_MONTHLY", "STRIPE_PRICE_ENTRY_MONTHLY"],
    annualEnvVar: "STRIPE_PRICE_STARTER_ANNUAL",
    // $59.99/mo × 12 = $719.88/yr (25% off vs $79.99×12=$959.88)
    amountCents: 71988,
    nickname: "Starter Annual",
  },
  {
    monthlyEnvVar: "STRIPE_PRICE_GROWTH_MONTHLY",
    fallbackEnvVars: [],
    annualEnvVar: "STRIPE_PRICE_GROWTH_ANNUAL",
    // $112.49/mo × 12 = $1,349.88/yr (25% off vs $149.99×12=$1,799.88)
    amountCents: 134988,
    nickname: "Growth Annual",
  },
  {
    monthlyEnvVar: "STRIPE_PRICE_PRO_MONTHLY",
    fallbackEnvVars: [],
    annualEnvVar: "STRIPE_PRICE_PRO_ANNUAL",
    // $187.49/mo × 12 = $2,249.88/yr (25% off vs $249.99×12=$2,999.88)
    amountCents: 224988,
    nickname: "Pro Annual",
  },
  {
    monthlyEnvVar: "STRIPE_PRICE_AGENCY_MONTHLY",
    fallbackEnvVars: [],
    annualEnvVar: "STRIPE_PRICE_AGENCY_ANNUAL",
    // $374.99/mo × 12 = $4,499.88/yr (25% off vs $499.99×12=$5,999.88)
    amountCents: 449988,
    nickname: "Agency Annual",
  },
];

async function main() {
  console.log("[setup-annual-prices] Starting annual price setup...");

  for (const plan of PLANS) {
    // Skip if annual price already configured
    if (process.env[plan.annualEnvVar]) {
      console.log(`[setup-annual-prices] ${plan.annualEnvVar} already in env — skipping`);
      continue;
    }

    // Find the monthly price ID
    const monthlyPriceId =
      process.env[plan.monthlyEnvVar] ||
      plan.fallbackEnvVars.map((v) => process.env[v]).find(Boolean);

    if (!monthlyPriceId) {
      console.warn(`[setup-annual-prices] ${plan.monthlyEnvVar} not set — skipping ${plan.nickname}`);
      continue;
    }

    const productId = await getProductForPrice(monthlyPriceId);
    if (!productId) {
      console.warn(`[setup-annual-prices] Could not find product for ${plan.monthlyEnvVar} — skipping`);
      continue;
    }

    try {
      const annualPriceId = await createOrFindAnnualPrice(productId, plan.amountCents, plan.nickname);
      appendEnvVar(plan.annualEnvVar, annualPriceId);
    } catch (err) {
      console.error(`[setup-annual-prices] Failed for ${plan.nickname}:`, err.message);
    }
  }

  console.log("[setup-annual-prices] Done.");
}

main().catch((err) => {
  console.error("[setup-annual-prices] Fatal error:", err);
  process.exit(1);
});
