// Adds Mibble Meadow to the Studio from what its own tester page says (read-only toward the game and its site: one GET of the page and its icon).
// Facts are quoted from that page and verified under the owner's directive; the footage-observed facts (what the real game does on screen) are added
// by marketing-demo-run.ts from the capture's own event log. Idempotent. Publishes, connects and spends nothing.
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-seed-mibble.ts
import { closeStudioDb, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { fetchPublicImage } from "../../src/lib/marketing-studio/remote-import";
import { addFact, approveAsset, createProduct, listFacts, listProducts, verifyFact } from "../../src/lib/marketing-studio/repository";
import { INTERNAL_SCOPE } from "../../src/lib/marketing-studio/scope";
import { storeImageAsset } from "../../src/lib/marketing-studio/uploads";
import { ms } from "../../src/lib/marketing-studio/db";
import { eq } from "drizzle-orm";

const ACTOR = "pilot-prep (public sources, owner directive)";
const URL_ = "https://iscreamstudio.com/mibblemeadow/";
const FACTS: Array<[string, string]> = [
  ["product_name", "Mibble Meadow"],
  ["product_type", "Mobile puzzle game"],
  ["tagline", "Cozy Animal Puzzles"],
  ["description", "Place one resident per meadow, row, and column — they never touch, even at the corners."],
  ["publisher", "iScream Studio"],
  ["website_url", URL_],
  ["release_status", "Private phone test build, not publicly released; an iPhone version is coming later."],
];

async function main() {
  const db = requireStudioDb();
  let product = (await listProducts(INTERNAL_SCOPE, db)).find((p) => p.slug === "mibblemeadow");
  if (!product) product = await createProduct(INTERNAL_SCOPE, ACTOR, { name: "Mibble Meadow", kind: "mobile_game", slug: "mibblemeadow", publicUrl: URL_, ownerKind: "internal" }, db);
  const have = new Set((await listFacts(INTERNAL_SCOPE, product.id, db)).map((f) => f.factValue));
  for (const [key, value] of FACTS) {
    if (have.has(value)) continue;
    const row = await addFact(INTERNAL_SCOPE, ACTOR, product.id, { factKey: key, factValue: value, sourceKind: "public_page", sourceUrl: URL_ }, db);
    await verifyFact(INTERNAL_SCOPE, ACTOR, product.id, row.id, db);
  }
  const assets = await db.select().from(ms.msAssets).where(eq(ms.msAssets.productId, product.id));
  if (!assets.some((a) => a.kind === "logo")) {
    const iconUrl = URL_ + "assets/mibblemeadow-icon.png";
    const img = await fetchPublicImage(iconUrl);
    const a = await storeImageAsset(INTERNAL_SCOPE, ACTOR, product.id, { bytes: img.bytes, originalName: "mibblemeadow-icon.png", kind: "logo", provenance: "public_fetch", sourceUrl: iconUrl }, db);
    await approveAsset(INTERNAL_SCOPE, ACTOR, product.id, a.id, "The game's own icon from its tester page, used under the owner's directive. Review before any public use.", db);
  }
  console.log(`Mibble Meadow ready in the Studio (${product.id}); facts ${(await listFacts(INTERNAL_SCOPE, product.id, db)).length}`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => closeStudioDb());
