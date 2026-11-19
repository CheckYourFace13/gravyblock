/**
 * Single public offer: GravyBlock at $29.99/month or $299/year, with a 14-day free trial (the trial is applied by Checkout).
 *
 * Creates (once each) a $29.99/month and a $299/year Stripe price on the existing Growth product and points
 * STRIPE_PRICE_GROWTH_MONTHLY and STRIPE_PRICE_GROWTH_ANNUAL at them. Stripe prices are immutable, so this adds new prices
 * and never touches or archives older ones: anyone already subscribed at an older price keeps it. Runs on every deploy
 * and is idempotent: it finds each price by lookup key and rewrites the env vars in place.
 * The app additionally refuses to open checkout unless the configured price is exactly the advertised amount and interval.
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import Stripe from "stripe";
import { config } from "dotenv";

config();

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.log("[setup-single-price] STRIPE_SECRET_KEY not set, skipping");
  process.exit(0);
}
const stripe = new Stripe(key, { apiVersion: "2026-03-25.dahlia" });

const GROWTH_PRODUCT_ID = "prod_UPlZG8WLsxNBSn";
const ENV_PATH = resolve(process.cwd(), ".env");
const PRICES = [
  { env: "STRIPE_PRICE_GROWTH_MONTHLY", lookup: "gravyblock_monthly_2999", cents: 2999, interval: "month", nickname: "GravyBlock monthly" },
  { env: "STRIPE_PRICE_GROWTH_ANNUAL", lookup: "gravyblock_annual_29900", cents: 29900, interval: "year", nickname: "GravyBlock annual" },
];

function setEnvVar(name, value) {
  let current = "";
  try {
    current = readFileSync(ENV_PATH, "utf8");
  } catch {
    /* no .env yet */
  }
  const lines = current.split("\n");
  const hadTrailing = lines[lines.length - 1] === "";
  const body = hadTrailing ? lines.slice(0, -1) : lines;
  const pattern = new RegExp(`^${name}=`);
  let replaced = false;
  const next = [];
  for (const line of body) {
    if (!pattern.test(line)) next.push(line);
    else if (!replaced) {
      next.push(`${name}=${value}`);
      replaced = true;
    }
  }
  if (!replaced) next.push(`${name}=${value}`);
  const out = next.join("\n") + "\n";
  if (out === current) {
    console.log(`[setup-single-price] ${name} already ${value}`);
    return;
  }
  writeFileSync(ENV_PATH, out);
  console.log(`[setup-single-price] set ${name}=${value}`);
}

try {
  for (const want of PRICES) {
    const existing = await stripe.prices.list({ lookup_keys: [want.lookup], active: true, limit: 1 });
    let price = existing.data[0];
    if (price && (price.unit_amount !== want.cents || price.recurring?.interval !== want.interval)) price = undefined;
    if (!price) {
      price = await stripe.prices.create({
        product: GROWTH_PRODUCT_ID,
        currency: "usd",
        unit_amount: want.cents,
        recurring: { interval: want.interval },
        lookup_key: want.lookup,
        transfer_lookup_key: true,
        nickname: want.nickname,
      });
      console.log(`[setup-single-price] created ${price.id} (${want.cents} cents per ${want.interval})`);
    }
    setEnvVar(want.env, price.id);
  }
} catch (error) {
  console.error("[setup-single-price] failed (non-fatal)", error instanceof Error ? error.message : error);
}
