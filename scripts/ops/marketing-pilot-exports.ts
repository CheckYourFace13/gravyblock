// Builds REAL export bundles from the DrinkKnird pilot media for the platforms that stay export-only (Instagram, YouTube, TikTok) and
// writes them to a directory so they can be integrity-checked. Nothing is posted anywhere, no connection is used.
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-pilot-exports.ts /tmp/ms-exports
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { closeStudioDb, ms, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { approvePublication, createPublication, exportPublication } from "../../src/lib/marketing-studio/publishing/queue";
import { listProducts } from "../../src/lib/marketing-studio/repository";
import { INTERNAL_SCOPE } from "../../src/lib/marketing-studio/scope";

const ACTOR = "pilot-operator";
const outDir = process.argv[2] ?? "/tmp/ms-exports";
const clean = (qa: unknown) => Boolean((qa as { passed?: boolean } | null)?.passed) && !((qa as { checks?: Array<{ ok: boolean }> } | null)?.checks ?? []).some((c) => !c.ok);

async function main() {
  const db = requireStudioDb();
  const product = (await listProducts(INTERNAL_SCOPE, db)).find((p) => p.slug === "drinkknird");
  if (!product) throw new Error("DrinkKnird not found");
  const [creative] = (await db.select().from(ms.msCreatives).where(and(eq(ms.msCreatives.productId, product.id), eq(ms.msCreatives.sizeKey, "square")))).filter((c) => c.status === "approved" && clean(c.qa));
  const [video] = (await db.select().from(ms.msVideos).where(eq(ms.msVideos.productId, product.id))).filter((v) => v.status === "approved");
  // Exports only ever use work the owner has approved in the Review screen. This script never approves anything itself.
  if (!creative || !video) throw new Error("Nothing to export yet: approve one QA-clean square creative and one video in Marketing Studio > Review first");
  mkdirSync(outDir, { recursive: true });
  const plan: Array<[string, { creativeId?: string; videoId?: string }]> = [["instagram", { creativeId: creative.id }], ["youtube", { videoId: video.id }], ["tiktok", { videoId: video.id }]];
  for (const [platform, ref] of plan) {
    const { publication } = await createPublication(INTERNAL_SCOPE, ACTOR, product.id, { ...ref, platform, mode: "export" });
    if (publication.status === "approval_required") await approvePublication(INTERNAL_SCOPE, ACTOR, product.id, publication.id, db);
    const bundle = await exportPublication(INTERNAL_SCOPE, ACTOR, product.id, publication.id, db);
    const file = path.join(outDir, bundle.fileName);
    writeFileSync(file, bundle.zip);
    console.log(`${platform}: ${bundle.fileName} ${bundle.zip.length} bytes`);
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => closeStudioDb());
