// Prepares a SMALL pilot campaign per pilot product: three varied posts (educational, benefit or feature, one video), all from QA-clean
// work that traces to verified Product Truth. It creates a campaign row and links the chosen concepts so their links carry the
// campaign tag. It does NOT create publications, approve anything or post anything.
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-pilot-campaigns.ts
import { and, eq, inArray } from "drizzle-orm";
import { closeStudioDb, ms, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { listProducts } from "../../src/lib/marketing-studio/repository";
import { INTERNAL_SCOPE } from "../../src/lib/marketing-studio/scope";

const SLUGS = ["drinkknird", "rentalnoodle", "scribblezap"];
const NAME = "Pilot launch";
const cleanQa = (qa: unknown) => Boolean((qa as { passed?: boolean } | null)?.passed) && !((qa as { checks?: Array<{ ok: boolean }> } | null)?.checks ?? []).some((c) => !c.ok);

async function main() {
  const db = requireStudioDb();
  const products = await listProducts(INTERNAL_SCOPE, db);
  for (const slug of SLUGS) {
    const product = products.find((p) => p.slug === slug);
    if (!product) {
      console.log(`${slug}: not found`);
      continue;
    }
    const [concepts, creatives, videos, facts] = await Promise.all([
      db.select().from(ms.msConcepts).where(eq(ms.msConcepts.productId, product.id)),
      db.select().from(ms.msCreatives).where(and(eq(ms.msCreatives.productId, product.id), eq(ms.msCreatives.sizeKey, "square"))),
      db.select().from(ms.msVideos).where(eq(ms.msVideos.productId, product.id)),
      db.select().from(ms.msProductFacts).where(eq(ms.msProductFacts.productId, product.id)),
    ]);
    const verified = new Set(facts.filter((f) => f.verifiedAt && f.status === "current").map((f) => f.id));
    const eligible = (conceptId: string) => {
      const c = concepts.find((x) => x.id === conceptId);
      const ids = (c?.factIds as string[] | undefined) ?? [];
      return Boolean(c) && ids.length > 0 && ids.every((i) => verified.has(i));
    };
    const images = creatives.filter((c) => ["ready_for_review", "approved"].includes(c.status) && cleanQa(c.qa) && eligible(c.conceptId));
    const byFamily = (...fams: string[]) => images.find((c) => fams.includes(concepts.find((x) => x.id === c.conceptId)?.family ?? ""));
    const educational = byFamily("educational_tip");
    const benefit = byFamily("product_benefit", "feature_highlight") ?? images.find((c) => c.id !== educational?.id);
    const video = videos.find((v) => ["ready_for_review", "approved"].includes(v.status) && cleanQa({ passed: ((v.qa as { passed?: boolean } | null)?.passed ?? false), checks: ((v.qa as { checks?: Array<{ ok: boolean }> } | null)?.checks ?? []) }));

    const picks = [
      { role: "educational / value", conceptId: educational?.conceptId, ref: educational ? `creative ${educational.id}` : null },
      { role: "feature / product benefit", conceptId: benefit?.conceptId, ref: benefit ? `creative ${benefit.id}` : null },
      { role: "engaging video", conceptId: video?.conceptId ?? undefined, ref: video ? `video ${video.id}` : null },
    ];
    const plan = picks.map((p, i) => `${i + 1}. ${p.role}: ${p.ref ?? "NOT AVAILABLE"}`).join("\n");
    const notes = `Pilot plan, at most one post every 2 days (never a flood).\n${plan}\nEvery claim traces to verified Product Truth. Posting requires approval; nothing is scheduled by this plan.`;

    let [camp] = await db.select().from(ms.msCampaigns).where(and(eq(ms.msCampaigns.productId, product.id), eq(ms.msCampaigns.name, NAME))).limit(1);
    if (!camp) [camp] = await db.insert(ms.msCampaigns).values({ productId: product.id, name: NAME, objective: "Introduce the product with three varied, fact-grounded posts and measure what people respond to.", channels: ["facebook"], automationLevel: 1, status: "draft", notes, createdBy: "pilot-operator" }).returning();
    else await db.update(ms.msCampaigns).set({ notes, updatedAt: new Date() }).where(eq(ms.msCampaigns.id, camp.id));
    const linked = picks.map((p) => p.conceptId).filter((x): x is string => Boolean(x));
    if (linked.length) await db.update(ms.msConcepts).set({ campaignId: camp.id }).where(inArray(ms.msConcepts.id, linked));
    console.log(`\n${product.name}: campaign ${camp.id}\n${plan}`);
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => closeStudioDb());
