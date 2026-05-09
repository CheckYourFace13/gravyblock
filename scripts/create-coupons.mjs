/**
 * Run once on the server to create all launch coupons in Stripe.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_live_... node scripts/create-coupons.mjs
 *
 * Or if .env is loaded:
 *   node -r dotenv/config scripts/create-coupons.mjs
 */

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("STRIPE_SECRET_KEY not set");
  process.exit(1);
}

async function stripe(method, path, body) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body
      ? new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v)]))
      : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Stripe error: ${json.error?.message}`);
  return json;
}

const coupons = [
  {
    id: "PRODUCTHUNT",
    name: "Product Hunt — 50% off first 2 months",
    percent_off: 50,
    duration: "repeating",
    duration_in_months: 2,
    max_redemptions: 500,
  },
  {
    id: "GOOGLE50",
    name: "Google Ads — 50% off first month",
    percent_off: 50,
    duration: "once",
    max_redemptions: 1000,
  },
  {
    id: "CONNECT",
    name: "LinkedIn — First month free",
    percent_off: 100,
    duration: "once",
    max_redemptions: 500,
  },
];

for (const coupon of coupons) {
  try {
    const result = await stripe("POST", "/coupons", coupon);
    console.log(`✓ Created: ${result.id}  (${coupon.name})`);
  } catch (err) {
    if (err.message?.includes("already exists")) {
      console.log(`⏭  Already exists: ${coupon.id}`);
    } else {
      console.error(`✗ Failed ${coupon.id}:`, err.message);
    }
  }
}

console.log("\nDone. Verify at https://dashboard.stripe.com/coupons");
