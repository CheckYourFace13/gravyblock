// Creates the one demo video record for a product (record only; it is rendered by marketing-demo-run.ts in its own bounded scope).
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-demo-start.ts <slug> [--replace]
// --replace supersedes a demo the owner has NOT approved (never an approved one) before creating a fresh record.
// Approves, schedules, connects and publishes nothing. Products without a demo spec are refused and stay TEASER_ONLY.
import { eq } from "drizzle-orm";
import { audit } from "../../src/lib/marketing-studio/audit";
import { closeStudioDb, ms, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { listProducts } from "../../src/lib/marketing-studio/repository";
import { INTERNAL_SCOPE } from "../../src/lib/marketing-studio/scope";
import { createDemoVideo } from "../../src/lib/marketing-studio/video/demo/queue";

const ACTOR = "controlled-production";

async function main() {
  const slug = process.argv[2];
  if (!slug || slug.startsWith("--")) throw new Error("usage: marketing-demo-start.ts <slug> [--replace]");
  const db = requireStudioDb();
  const product = (await listProducts(INTERNAL_SCOPE, db)).find((p) => p.slug === slug);
  if (!product) throw new Error(`${slug} is not a Studio product`);
  if (process.argv.includes("--replace")) {
    const demos = (await db.select().from(ms.msVideos).where(eq(ms.msVideos.productId, product.id))).filter((v) => (v.storyboard as { kind?: string } | null)?.kind === "demo" && v.status !== "superseded");
    if (demos.some((v) => v.status === "approved")) throw new Error("The demo is approved; it is not replaced.");
    for (const v of demos) {
      await db.update(ms.msVideos).set({ status: "superseded" }).where(eq(ms.msVideos.id, v.id));
      await audit(db, { actor: ACTOR, action: "video.demo_superseded_before_review", entity: "video", entityId: v.id, productId: product.id, detail: { was: v.status } });
      console.log(`${product.name}: previous unreviewed demo ${v.id} (${v.status}) superseded`);
    }
  }
  const row = await createDemoVideo(INTERNAL_SCOPE, ACTOR, product.id, db, { queue: false });
  console.log(`${product.name}: demo video ${row.id} created (status ${row.status}). Render it with marketing-demo-run.ts ${slug}.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => closeStudioDb());
