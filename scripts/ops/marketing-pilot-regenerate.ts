// Replaces the pilot creative set: marks the current concepts and videos of DrinkKnird, RentalNoodle and ScribbleZap as superseded (kept for history,
// hidden from review), generates the new concepts from verified Product Truth under the "Pilot launch" campaign, and queues the renders and one
// video per product. It never approves, schedules, connects or publishes anything. Everything comes back as ready_for_review or qa_failed.
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-pilot-regenerate.ts [--seconds 30]
import { and, eq, ne } from "drizzle-orm";
import { generateConcepts } from "../../src/lib/marketing-studio/creative/copy";
import { enqueueConceptRender } from "../../src/lib/marketing-studio/creative/queue";
import { closeStudioDb, ms, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { audit } from "../../src/lib/marketing-studio/audit";
import { listProducts } from "../../src/lib/marketing-studio/repository";
import { INTERNAL_SCOPE } from "../../src/lib/marketing-studio/scope";
import { createVideoFromProduct } from "../../src/lib/marketing-studio/video/queue";

const SLUGS = ["drinkknird", "rentalnoodle", "scribblezap"];
const ACTOR = "pilot-cleanup";

async function main() {
  const seconds = Number(process.argv[process.argv.indexOf("--seconds") + 1]) || 30;
  const db = requireStudioDb();
  const products = (await listProducts(INTERNAL_SCOPE, db)).filter((p) => SLUGS.includes(p.slug));
  for (const p of products) {
    const [camp] = await db.select().from(ms.msCampaigns).where(and(eq(ms.msCampaigns.productId, p.id), eq(ms.msCampaigns.name, "Pilot launch"))).limit(1);
    const oldConcepts = await db.select({ id: ms.msConcepts.id }).from(ms.msConcepts).where(and(eq(ms.msConcepts.productId, p.id), ne(ms.msConcepts.status, "superseded")));
    const oldVideos = await db.select({ id: ms.msVideos.id, status: ms.msVideos.status }).from(ms.msVideos).where(and(eq(ms.msVideos.productId, p.id), ne(ms.msVideos.status, "superseded")));
    const mark = async (concepts: string[], videos: Array<{ id: string; status: string }>, to: "superseded" | "restore") => {
      for (const id of concepts) await db.update(ms.msConcepts).set({ status: to === "superseded" ? "superseded" : "ready_for_review" }).where(eq(ms.msConcepts.id, id));
      for (const v of videos) await db.update(ms.msVideos).set({ status: to === "superseded" ? "superseded" : v.status }).where(eq(ms.msVideos.id, v.id));
    };
    await mark(oldConcepts.map((c) => c.id), oldVideos, "superseded");
    try {
      const created = await generateConcepts(INTERNAL_SCOPE, ACTOR, p.id, { campaignId: camp?.id ?? null, limit: 4 }, db);
      if (created.length === 0) throw new Error("no concepts were generated");
      for (const c of created) await enqueueConceptRender(INTERNAL_SCOPE, p.id, c.id, undefined, db);
      await createVideoFromProduct(INTERNAL_SCOPE, ACTOR, p.id, seconds, db);
      await audit(db, { actor: ACTOR, action: "pilot.regenerate", entity: "product", entityId: p.id, productId: p.id, detail: { superseded: oldConcepts.length, concepts: created.map((c) => c.headline), videoSeconds: seconds } });
      console.log(`${p.name}: superseded ${oldConcepts.length} concepts and ${oldVideos.length} videos; queued ${created.length} concepts and 1 video`);
      for (const c of created) console.log(`   ${c.family}: ${c.headline}`);
    } catch (e) {
      // Never leave a product without review material: put the previous set back.
      await mark(oldConcepts.map((c) => c.id), oldVideos, "restore");
      console.log(`${p.name}: FAILED, previous set restored: ${e instanceof Error ? e.message : e}`);
      process.exitCode = 1;
    }
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.stack : e);
    process.exitCode = 1;
  })
  .finally(() => closeStudioDb());
