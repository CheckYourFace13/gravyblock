/**
 * Single public offer: GravyBlock at $39.99/month.
 *
 * Creates (once) a $39.99/month Stripe price on the existing Growth product and points
 * STRIPE_PRICE_GROWTH_MONTHLY at it. Stripe prices are immutable, so this adds a new price
 * and leaves the old ones untouched (there are no subscribers on them). Runs on every deploy
 * and is idempotent: it finds the price by lookup key and rewrites the env var in place.
 * The app additionally refuses to open checkout unless the configured price is exactly $39.99.
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
const CENTS = 3999;
const LOOKUP_KEY = "gravyblock_monthly_3999";
const ENV_PATH = resolve(process.cwd(), ".env");

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
  const existing = await stripe.prices.list({ lookup_keys: [LOOKUP_KEY], active: true, limit: 1 });
  let price = existing.data[0];
  if (price && (price.unit_amount !== CENTS || price.recurring?.interval !== "month")) price = undefined;
  if (!price) {
    price = await stripe.prices.create({
      product: GROWTH_PRODUCT_ID,
      currency: "usd",
      unit_amount: CENTS,
      recurring: { interval: "month" },
      lookup_key: LOOKUP_KEY,
      transfer_lookup_key: true,
      nickname: "GravyBlock monthly",
    });
    console.log(`[setup-single-price] created ${price.id}`);
  }
  setEnvVar("STRIPE_PRICE_GROWTH_MONTHLY", price.id);
} catch (error) {
  console.error("[setup-single-price] failed (non-fatal)", error instanceof Error ? error.message : error);
}
