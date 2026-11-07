// Seeds TheDrinkPlace as a Studio product from what its public pages state. Read-only toward the site: it loads the public home page and fetches the logo.
// Every quoted fact must appear verbatim in the live page text or it is skipped. Idempotent. Publishes nothing.
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-seed-thedrinkplace.ts
import sharp from "sharp";
import { closeStudioDb, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { launchBrowser } from "../../src/lib/marketing-studio/creative/render";
import { fetchPublicImage } from "../../src/lib/marketing-studio/remote-import";
import { addClaim, addFact, approveAsset, createProduct, listAssets, listFacts, listProducts, saveBrandProfile, verifyFact } from "../../src/lib/marketing-studio/repository";
import { INTERNAL_SCOPE } from "../../src/lib/marketing-studio/scope";
import { storeImageAsset } from "../../src/lib/marketing-studio/uploads";

const ACTOR = "acquisition-prep (public sources, owner directive 2026-11-07)";
const URL0 = "https://thedrinkplace.com/";
const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();

// [key, value, quoted]: quoted facts must appear verbatim in the live page text, otherwise they are skipped.
const FACTS: Array<[string, string, boolean]> = [
  ["product_name", "TheDrinkPlace", true],
  ["product_type", "Drink discovery website for adults: drinks, bars and happy hours", false],
  ["tagline", "Rate it. Find it. Buy it.", true],
  ["headline", "Find your next great drink", true],
  ["description", "Close to home or somewhere new — explore drinks, bars, and happy hours in supported destinations. Coverage varies by city.", true],
  ["description", "Discover drinks and where to enjoy or buy them. We don’t sell or ship alcohol.", true],
  ["audience", "Confirm you are 21 or older.", true],
  ["website_url", URL0, false],
  ["feature", "Cans, bottles, and taproom pours.", true],
  ["feature", "Bourbon, rye, Scotch, and more.", true],
  ["cta", "Search drinks", true],
  ["cta_url", "https://thedrinkplace.com/search", false],
];
const PROHIBITED = ["sells alcohol", "ships or delivers alcohol", "live inventory or stock", "lowest prices", "best bar", "number one", "encourages drinking", "for anyone under 21"];

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
  let product = existing.find((p) => p.slug === "thedrinkplace");
  if (!product) product = await createProduct(INTERNAL_SCOPE, ACTOR, { name: "TheDrinkPlace", kind: "website", slug: "thedrinkplace", publicUrl: URL0, ownerKind: "house" }, db);
  console.log(`TheDrinkPlace product ${product.id}`);
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
  const assets = await listAssets(INTERNAL_SCOPE, product.id, db);
  if (!assets.some((a) => a.kind === "logo")) {
    const fetched = await fetchPublicImage("https://thedrinkplace.com/icon.svg");
    // SVG is rejected by the uploader (it can carry script); rasterizing it server-side with sharp is safe, no script runs.
    const png = await sharp(fetched.bytes, { density: 384 }).resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const a = await storeImageAsset(INTERNAL_SCOPE, ACTOR, product.id, { bytes: png, originalName: "thedrinkplace-logo.png", kind: "logo", provenance: "public_fetch", sourceUrl: "https://thedrinkplace.com/icon.svg" }, db);
    await approveAsset(INTERNAL_SCOPE, ACTOR, product.id, a.id, "Public icon from the product's own site, used under the owner's acquisition directive.", db);
    console.log(`  logo ${a.width}x${a.height} approved`);
  }
  await saveBrandProfile(INTERNAL_SCOPE, ACTOR, product.id, { colors: { primary: "#ff4d8d" } }, db);
  console.log("seed complete");
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => closeStudioDb());
