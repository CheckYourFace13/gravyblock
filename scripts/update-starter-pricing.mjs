/**
 * One-time price drop: Starter goes from $79.99/mo ($39.99 intro) to
 * $59.99/mo ($29.99 intro via INTRO50) — the cheapest advertised entry price
 * of any direct competitor (BrightLocal floors at $39, Semrush at $50).
 *
 * Stripe Price objects are immutable once created, so this creates NEW
 * monthly + annual prices on the existing Starter product, archives the old
 * ones so they can't accidentally be reused, and rewrites the env vars.
 * Runs automatically during deploy, safe to re-run (idempotent — skips work
 * once the target prices are already wired up).
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import Stripe from "stripe";
import { config } from "dotenv";

config();

const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!stripeKey) {
  console.log("[update-starter-pricing] STRIPE_SECRET_KEY not set — skipping");
  process.exit(0);
}

const stripe = new Stripe(stripeKey, { apiVersion: "2026-03-25.dahlia" });

const STARTER_PRODUCT_ID = "prod_UOBx09690uK1Yh";
const NEW_MONTHLY_CENTS = 5999; // $59.99/mo (was $79.99)
const NEW_ANNUAL_CENTS = 53988; // $539.88/yr = $44.99/mo equivalent, 25% off (was $719.88/yr)

const ENV_PATH = resolve(process.cwd(), ".env");

function readEnv() {
  try {
    return readFileSync(ENV_PATH, "utf8");
  } catch {
    return "";
  }
}

function setEnvVar(key, value) {
  const current = readEnv();
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(current)) {
    if (new RegExp(`^${key}=${value}$`, "m").test(current)) {
      console.log(`[update-starter-pricing] ${key} already set to ${value} — skipping`);
      return;
    }
    writeFileSync(ENV_PATH, current.replace(pattern, line));
    console.log(`[update-starter-pricing] Updated ${key}=${value}`);
  } else {
    writeFileSync(ENV_PATH, current.endsWith("\n") || current === "" ? current + line + "\n" : current + "\n" + line + "\n");
    console.log(`[update-starter-pricing] Added ${key}=${value}`);
  }
}

async function ensurePrice(interval, amountCents, nickname) {
  const existing = await stripe.prices.list({
    product: STARTER_PRODUCT_ID,
    recurring: { interval },
    active: true,
    limit: 20,
  });

  let targetId = existing.data.find((p) => p.unit_amount === amountCents)?.id;

  if (targetId) {
    console.log(`[update-starter-pricing] Target ${interval} price already exists: ${targetId}`);
  } else {
    const created = await stripe.prices.create({
      product: STARTER_PRODUCT_ID,
      unit_amount: amountCents,
      currency: "usd",
      recurring: { interval },
      nickname,
      metadata: { plan: "starter", billing: interval === "year" ? "annual" : "monthly" },
    });
    targetId = created.id;
    console.log(`[update-starter-pricing] Created ${nickname}: ${targetId} ($${(amountCents / 100).toFixed(2)}/${interval})`);
  }

  // A price can't be archived while it's the product's default_price —
  // repoint the default first (only for the monthly pass; monthly should
  // stay the product's default regardless of pass order). Always checked,
  // not just on creation, so a re-run still fixes a half-finished prior run.
  if (interval === "month") {
    await stripe.products.update(STARTER_PRODUCT_ID, { default_price: targetId });
  }

  // Archive any other stale active prices at this interval so they can't be
  // accidentally reused (existing subscriptions on an old price, if any, are
  // unaffected — archiving only blocks NEW subscriptions from using it).
  for (const stale of existing.data) {
    if (stale.id === targetId) continue;
    await stripe.prices.update(stale.id, { active: false });
    console.log(`[update-starter-pricing] Archived stale ${interval} price: ${stale.id} ($${(stale.unit_amount / 100).toFixed(2)})`);
  }

  return targetId;
}

async function main() {
  console.log("[update-starter-pricing] Starting Starter price drop...");

  const monthlyId = await ensurePrice("month", NEW_MONTHLY_CENTS, "Starter Monthly");
  setEnvVar("STRIPE_PRICE_STARTER_MONTHLY", monthlyId);

  const annualId = await ensurePrice("year", NEW_ANNUAL_CENTS, "Starter Annual");
  setEnvVar("STRIPE_PRICE_STARTER_ANNUAL", annualId);

  console.log("[update-starter-pricing] Done.");
}

main().catch((err) => {
  console.error("[update-starter-pricing] Fatal error:", err);
  process.exit(1);
});
