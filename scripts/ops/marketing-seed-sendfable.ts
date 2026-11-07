// Seeds SendFable as a Studio product from what its public page states. Read-only toward SendFable: it fetches the public page and logo, nothing else.
// Every fact is quoted from https://sendfable.com/ and verified against the live page text before it is stored. Idempotent. Publishes nothing.
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-seed-sendfable.ts
import { closeStudioDb, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { launchBrowser } from "../../src/lib/marketing-studio/creative/render";
import { fetchPublicImage } from "../../src/lib/marketing-studio/remote-import";
import { addClaim, addFact, approveAsset, createProduct, listFacts, listProducts, saveBrandProfile, verifyFact } from "../../src/lib/marketing-studio/repository";
import { INTERNAL_SCOPE } from "../../src/lib/marketing-studio/scope";
import { storeImageAsset } from "../../src/lib/marketing-studio/uploads";

const ACTOR = "acquisition-prep (public sources, owner directive 2026-11-07)";
const URL0 = "https://sendfable.com/";
const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();

// [key, value, quoted]: quoted facts must appear verbatim in the live page text, otherwise they are skipped.
const FACTS: Array<[string, string, boolean]> = [
  ["product_name", "SendFable", true],
  ["product_type", "Email and text marketing for small businesses", false],
  ["tagline", "Email and text marketing without the marketing-software headache", true],
  ["description", "Scribe turns fresh content into a campaign that looks like you. You choose when it sends.", true],
  ["website_url", URL0, false],
  ["feature", "Pick a goal. We suggest a template, subject, and next step, then you finish in your account.", true],
  ["feature", "SendFable uses that content to create a campaign that looks like your business.", true],
  ["feature", "Nothing sends until you choose Send now or schedule it.", true],
  ["feature", "Before you launch, we flag missing unsubscribes, weak links, and common footguns.", true],
  ["feature", "Import a CSV or add a signup to your site.", true],
  ["feature", "Blocks, brand colors, subject preview, and Send Confidence", true],
  ["feature", "Reply-To points at your real address so conversations land in your inbox.", true],
  ["plan", "Free: $0, up to 500 contacts, up to 1,000 emails/month", false],
  ["plan", "Starter: $12/mo, up to 2,500 contacts", false],
  ["plan", "Growth: $29/mo, up to 10,000 contacts", false],
  ["plan", "Pro: $69/mo, up to 20,000 contacts", false],
  ["plan", "Pro Plus: $99/mo, up to 40,000 contacts", false],
  ["pricing_note", "No credit card · Cancel anytime", true],
  ["cta", "Start free", true],
  ["cta_url", "https://sendfable.com/signup", false],
];
const PROHIBITED = ["guaranteed inbox placement", "best email marketing", "number one", "sends emails automatically", "sends on its own", "campaign result numbers shown on the page (they are labelled demo data)", "instant results"];

async function main() {
  const db = requireStudioDb();
  const handle = await launchBrowser();
  let pageText = "";
  try {
    const ctx = await handle.browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(URL0, { waitUntil: "networkidle", timeout: 60_000 });
    pageText = await page.evaluate(() => document.body.innerText);
    await ctx.close();
  } finally {
    await handle.close();
  }
  const existing = await listProducts(INTERNAL_SCOPE, db);
  let product = existing.find((p) => p.slug === "sendfable");
  if (!product) product = await createProduct(INTERNAL_SCOPE, ACTOR, { name: "SendFable", kind: "saas", slug: "sendfable", publicUrl: URL0, ownerKind: "house" }, db);
  console.log(`SendFable product ${product.id}`);
  const have = new Set((await listFacts(INTERNAL_SCOPE, product.id, db)).map((f) => norm(f.factValue)));
  let added = 0;
  for (const [key, value, quoted] of FACTS) {
    if (quoted && !norm(pageText).includes(norm(value))) {
      console.log(`  SKIPPED (not on the live page): ${value.slice(0, 70)}`);
      continue;
    }
    if (have.has(norm(value))) continue;
    const f = await addFact(INTERNAL_SCOPE, ACTOR, product.id, { factKey: key, factValue: value, sourceKind: "public_page", sourceUrl: URL0 }, db);
    if (!f.verifiedAt) await verifyFact(INTERNAL_SCOPE, ACTOR, product.id, f.id, db);
    added++;
  }
  console.log(`  facts added and verified: ${added}`);
  for (const text of PROHIBITED) await addClaim(INTERNAL_SCOPE, ACTOR, product.id, { kind: "prohibited", text, rationale: "Not stated by the product, or contradicted by its own page" }, db).catch(() => {});
  const assets = await (await import("../../src/lib/marketing-studio/repository")).listAssets(INTERNAL_SCOPE, product.id, db);
  if (!assets.some((a) => a.kind === "logo")) {
    const fetched = await fetchPublicImage("https://sendfable.com/apple-icon.png");
    const a = await storeImageAsset(INTERNAL_SCOPE, ACTOR, product.id, { bytes: fetched.bytes, originalName: "sendfable-logo.png", kind: "logo", provenance: "public_fetch", sourceUrl: "https://sendfable.com/apple-icon.png" }, db);
    await approveAsset(INTERNAL_SCOPE, ACTOR, product.id, a.id, "Public logo from the product's own site, used under the owner's acquisition directive.", db);
    console.log(`  logo ${a.width}x${a.height} approved`);
  }
  await saveBrandProfile(INTERNAL_SCOPE, ACTOR, product.id, { colors: { primary: "#c44732" } }, db);
  console.log("seed complete");
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => closeStudioDb());
