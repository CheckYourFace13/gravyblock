// Starts the RentalNoodle pilot demo. In this order: (1) freeze all other video generation, (2) record the owner's verdict on the existing
// slideshow videos (rejected: not production-ready; ScribbleZap's icon-and-text video is classified TEASER_ONLY), (3) create exactly one demo record, rendered by marketing-rn-demo-run.ts.
// Approves, schedules, connects and publishes nothing. Unfreezing is a separate, deliberate step after the owner approves the demo.
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-rn-demo-start.ts
import { eq } from "drizzle-orm";
import { audit } from "../../src/lib/marketing-studio/audit";
import { closeStudioDb, ms, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { listProducts } from "../../src/lib/marketing-studio/repository";
import { INTERNAL_SCOPE } from "../../src/lib/marketing-studio/scope";
import { createDemoVideo } from "../../src/lib/marketing-studio/video/demo/queue";
import { freezeVideoGeneration } from "../../src/lib/marketing-studio/video/freeze";

const ACTOR = "pilot-cleanup";
const VERDICTS: Record<string, string> = { drinkknird: "SLIDESHOW_NOT_PRODUCTION_READY", scribblezap: "TEASER_ONLY" };

async function main() {
  const db = requireStudioDb();
  await freezeVideoGeneration(ACTOR, "no further videos until the owner has watched and approved the RentalNoodle pilot demo", db);
  console.log("video generation: FROZEN");
  const products = await listProducts(INTERNAL_SCOPE, db);
  for (const slug of Object.keys(VERDICTS)) {
    const p = products.find((x) => x.slug === slug);
    if (!p) continue;
    const videos = await db.select().from(ms.msVideos).where(eq(ms.msVideos.productId, p.id));
    for (const v of videos.filter((x) => x.status !== "superseded" && (x.storyboard as { kind?: string } | null)?.kind !== "demo")) {
      await db.update(ms.msVideos).set({ status: "rejected", storyboard: { ...(v.storyboard as object), classification: VERDICTS[slug] } }).where(eq(ms.msVideos.id, v.id));
      await audit(db, { actor: ACTOR, action: "video.rejected_not_production_ready", entity: "video", entityId: v.id, productId: p.id, detail: { classification: VERDICTS[slug] } });
      console.log(`${p.name}: slideshow video rejected (${VERDICTS[slug]})`);
    }
  }
  const noodle = products.find((x) => x.slug === "rentalnoodle");
  if (!noodle) throw new Error("RentalNoodle not found");
  // Record only: the render runs in its own bounded scope (marketing-rn-demo-run.ts), not in the memory-capped worker.
  const row = await createDemoVideo(INTERNAL_SCOPE, ACTOR, noodle.id, db, { queue: false });
  console.log(`RentalNoodle: demo video ${row.id} created (status ${row.status}); the old slideshow is superseded. Render it with marketing-rn-demo-run.ts.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => closeStudioDb());
