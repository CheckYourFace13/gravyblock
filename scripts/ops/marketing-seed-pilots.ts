// Seeds the three Phase 1.5 pilots from what each product states PUBLICLY. Read-only toward the products: it fetches public
// pages and images and takes screenshots of public pages; it never edits, deploys to, or reads the repositories of any product.
// Every fact below is quoted from the product's own public page (source URL recorded) and is marked verified by the operator
// directive for pilot preparation, so the owner can still review it in the Studio before anything is used publicly.
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-seed-pilots.ts
import sharp from "sharp";
import { closeStudioDb, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { launchBrowser } from "../../src/lib/marketing-studio/creative/render";
import { fetchPublicImage } from "../../src/lib/marketing-studio/remote-import";
import { addClaim, addFact, approveAsset, createProduct, listProducts, saveBrandProfile, verifyFact } from "../../src/lib/marketing-studio/repository";
import { INTERNAL_SCOPE } from "../../src/lib/marketing-studio/scope";
import { storeImageAsset } from "../../src/lib/marketing-studio/uploads";
import type { UploadKind } from "../../src/lib/marketing-studio/config";

const ACTOR = "pilot-prep (public sources, owner directive)";
const NOTE = "Public asset from the product's own site, used under the owner's Phase 1.5 directive. Review before any public use.";

type FactSeed = [key: string, value: string, url: string];
type Pilot = {
  name: string;
  slug: string;
  kind: "website" | "saas" | "mobile_game";
  ownerKind: "house" | "internal";
  url: string;
  brandPrimary?: string;
  facts: FactSeed[];
  prohibited: string[];
  images: Array<{ url: string; kind: UploadKind; rasterizeSvg?: boolean; name: string }>;
  shots: Array<{ label: string; heading: string | null }>;
};

const DK = "https://drinkknird.com/";
const RN = "https://rentalnoodle.com/";
const SZ = "https://iscreamstudio.com/games/scribblezap/";

const PILOTS: Pilot[] = [
  {
    name: "DrinkKnird", slug: "drinkknird", kind: "website", ownerKind: "house", url: DK,
    facts: [
      ["product_name", "DrinkKnird", DK],
      ["product_type", "Website", DK],
      ["tagline", "Drink, Cook, Discover Something New", DK],
      ["description", "Homemade recipes and cocktails, plus a clear look at what's cooking in food culture—trends, stories, and events worth knowing about.", DK],
      ["website_url", DK, DK],
      ["feature", "What's Hot: The flavors, drinks, and ideas getting attention right now.", DK],
      ["feature", "Food stories worth knowing: Origins, regional classics, and the stories behind dishes and drinks.", DK],
      ["feature", "Food & drink events: Festivals, openings, and experiences worth knowing about.", DK],
      ["feature", "Cook & mix for the season: Recipes and guides made for right now.", DK],
      ["feature", "Kitchen & bar tools: Cocktail batch calculator, cooking temperatures, and measurement converter.", DK],
      ["feature", "Latest recipes: Fresh from the DrinkKnird kitchen and bar.", DK],
      ["cta", "Browse recipes", DK],
      ["cta_url", "https://drinkknird.com/all-recipes", DK],
    ],
    prohibited: ["most popular", "best recipe", "number one", "IBA official", "IBA certified", "health benefits", "medical"],
    images: [{ url: "https://drinkknird.com/images/brand/logo.png", kind: "logo", name: "drinkknird-logo.png" }],
    shots: [{ label: "home-top", heading: null }, { label: "cook-and-mix", heading: "Cook & mix for the season" }, { label: "editorial-picks", heading: "Editorial picks" }],
  },
  {
    name: "RentalNoodle", slug: "rentalnoodle", kind: "saas", ownerKind: "house", url: RN,
    facts: [
      ["product_name", "RentalNoodle", RN],
      ["product_type", "Landlord property management software", RN],
      ["tagline", "Manage every rental from one simple place.", RN],
      ["description", "Keep your properties, tenants, leases, rent, maintenance, inspections, documents, and finances connected in one landlord-friendly platform.", RN],
      ["audience", "Built for independent landlords and growing rental portfolios.", RN],
      ["website_url", RN, RN],
      ["feature", "Properties & tenants: One record per rental, with address, tenant, lease terms, and history.", RN],
      ["feature", "Lease execution: Build or upload a lease, invite signers, and keep completed documents with the property.", RN],
      ["feature", "Rent tracking & ACH: Manual payment recording, with online ACH after Stripe setup.", RN],
      ["feature", "Maintenance: Tenant requests with photos, status updates, and a history.", RN],
      ["feature", "Inspections: Move-in and move-out condition records, photos, and deposit worksheets.", RN],
      ["feature", "Finances: Income and expense tracking, summaries, and Schedule E preparation exports.", RN],
      ["feature", "Tenant portal: Lease, rent, payments, maintenance, messages, and inspections.", RN],
      ["plan", "Free: $0/mo, 1 property, basics", RN],
      ["plan", "Landlord Pro: $12/mo, Up to 5 properties", RN],
      ["plan", "Portfolio: $29/mo, Up to 25 properties", RN],
      ["pricing_note", "Start free. Upgrade when you need more properties or tools.", RN],
      ["cta", "Start Managing Free", RN],
      ["cta_url", "https://rentalnoodle.com/sign-up?intent=owner&from=home", RN],
    ],
    prohibited: ["card rent payments", "pay rent by card", "tax filing", "files your taxes", "financial advice", "legal advice", "screening included", "background checks included", "gps-tagged", "unlimited properties"],
    images: [{ url: "https://rentalnoodle.com/favicon.svg", kind: "logo", rasterizeSvg: true, name: "rentalnoodle-logo.png" }],
    shots: [{ label: "home-top", heading: null }, { label: "core-property-management", heading: "Core property management" }, { label: "pricing", heading: "Simple pricing" }],
  },
  {
    name: "ScribbleZap", slug: "scribblezap", kind: "mobile_game", ownerKind: "internal", url: SZ,
    facts: [
      ["product_name", "ScribbleZap", SZ],
      ["product_type", "Mobile puzzle game", SZ],
      ["tagline", "Trace the edge, cut, and claim the territory.", SZ],
      ["description", "ScribbleZap is a mobile puzzle game published by iScream Studio. Players cut across a board, claim the side without the enemy, and keep filling until the page is theirs. New balls, hazards, and drawing tools are introduced one at a time.", SZ],
      ["website_url", SZ, SZ],
      ["release_status", "Coming Soon", SZ],
      ["platform", "Google Play and the Apple App Store", SZ],
      ["how_it_plays", "Tap and hold to cut across the board.", SZ],
      ["how_it_plays", "Release before reaching the edge to retract the cut.", SZ],
      ["how_it_plays", "Claim the safe side, which is the side without the enemy, and keep filling the page.", SZ],
      ["feature", "Draw and fill: A draw-and-fill puzzle game. Trace the edge, cut, and claim the territory.", SZ],
      ["feature", "Hand-made stages: Campaign stages that each introduce one new ball, hazard, tool, obstacle, or rule, followed by endless play.", SZ],
      ["feature", "Daily Challenge: A new challenge each local day, with streaks and an optional share feature.", SZ],
      ["feature", "Endless Run: A mode with upgrades for longer sessions.", SZ],
      ["cta", "View game", SZ],
      ["cta_url", SZ, SZ],
    ],
    prohibited: ["available now", "download now", "free to play", "no ads", "number one", "app store rating", "multiplayer"],
    images: [
      { url: "https://iscreamstudio.com/games/scribblezap/assets/scribblezap-icon-192.png", kind: "icon", name: "scribblezap-icon-192.png" },
      { url: "https://iscreamstudio.com/games/scribblezap/assets/play-icon-512.png", kind: "logo", name: "scribblezap-store-icon-512.png" },
    ],
    shots: [],
  },
];

async function main() {
  const db = requireStudioDb();
  const existing = await listProducts(INTERNAL_SCOPE, db);
  const handle = await launchBrowser();
  try {
    for (const p of PILOTS) {
      let product = existing.find((x) => x.slug === p.slug);
      if (!product) product = await createProduct(INTERNAL_SCOPE, ACTOR, { name: p.name, kind: p.kind, slug: p.slug, publicUrl: p.url, ownerKind: p.ownerKind }, db);
      console.log(`\n== ${p.name} (${product.id})`);

      for (const [key, value, url] of p.facts) {
        const f = await addFact(INTERNAL_SCOPE, ACTOR, product.id, { factKey: key, factValue: value, sourceKind: "public_page", sourceUrl: url }, db);
        if (!f.verifiedAt) await verifyFact(INTERNAL_SCOPE, ACTOR, product.id, f.id, db);
      }
      for (const text of p.prohibited) await addClaim(INTERNAL_SCOPE, ACTOR, product.id, { kind: "prohibited", text, rationale: "Not stated by the product, or contradicted by its own page" }, db).catch(() => {});

      // Public images (logos and icons) through the SSRF-safe fetcher.
      const assets: Array<{ id: string }> = [];
      for (const img of p.images) {
        try {
          const fetched = await fetchPublicImage(img.url);
          // SVG is rejected by the uploader (it can carry script). Rasterizing it server-side with sharp is safe: no script runs.
          const bytes = img.rasterizeSvg ? await sharp(fetched.bytes, { density: 384 }).resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer() : fetched.bytes;
          const a = await storeImageAsset(INTERNAL_SCOPE, ACTOR, product.id, { bytes, originalName: img.name, kind: img.kind, provenance: "public_fetch", sourceUrl: img.url }, db);
          assets.push(a);
          console.log(`  asset ${img.kind}: ${img.name} ${a.width}x${a.height}`);
        } catch (e) {
          console.log(`  asset FAILED ${img.url}: ${e instanceof Error ? e.message : e}`);
        }
      }

      // Public screenshots of the product's own public page, cropped to real sections (no editing, no redrawing).
      if (p.shots.length) {
        const ctx = await handle.browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
        try {
          const page = await ctx.newPage();
          await page.goto(p.url, { waitUntil: "networkidle", timeout: 45_000 }).catch(() => {});
          await page.waitForTimeout(1500);
          for (const shot of p.shots) {
            let y = 0;
            if (shot.heading) {
              const box = await page.getByText(shot.heading, { exact: true }).first().boundingBox().catch(() => null);
              if (!box) {
                console.log(`  screenshot ${shot.label}: heading not found, skipped`);
                continue;
              }
              const scroll = await page.evaluate(() => window.scrollY);
              y = Math.max(0, box.y + scroll - 90);
            }
            const png = await page.screenshot({ type: "png", fullPage: true, clip: { x: 0, y, width: 1440, height: 900 } });
            const a = await storeImageAsset(INTERNAL_SCOPE, ACTOR, product.id, { bytes: png, originalName: `${p.slug}-${shot.label}.png`, kind: "screenshot", provenance: "public_fetch", sourceUrl: p.url }, db);
            assets.push(a);
            console.log(`  screenshot ${shot.label}: ${a.width}x${a.height}`);
          }
        } finally {
          await ctx.close();
        }
      }
      for (const a of assets) await approveAsset(INTERNAL_SCOPE, ACTOR, product.id, a.id, NOTE, db);

      if (p.brandPrimary) await saveBrandProfile(INTERNAL_SCOPE, ACTOR, product.id, { colors: { primary: p.brandPrimary } }, db);
    }
  } finally {
    await handle.close();
    await closeStudioDb();
  }
  console.log("\nseed complete");
}
void main().catch((e) => {
  console.error("SEED FAILED", e);
  process.exit(1);
});
