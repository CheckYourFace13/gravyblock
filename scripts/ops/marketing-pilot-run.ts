// Generates the review set for the three pilots through the REAL queue: concepts are created from verified Product Truth, then one
// heavy render job per concept is queued for the Studio worker (which renders all four sizes and runs QA). Nothing is published.
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-pilot-run.ts
import { desc, eq, inArray } from "drizzle-orm";
import { closeStudioDb, ms, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { generateConcepts } from "../../src/lib/marketing-studio/creative/copy";
import { enqueueConceptRender } from "../../src/lib/marketing-studio/creative/queue";
import { listProducts } from "../../src/lib/marketing-studio/repository";
import { INTERNAL_SCOPE } from "../../src/lib/marketing-studio/scope";

async function main() {
  const db = requireStudioDb();
  const products = (await listProducts(INTERNAL_SCOPE, db)).filter((p) => ["drinkknird", "rentalnoodle", "scribblezap"].includes(p.slug));
  const jobIds: string[] = [];
  for (const p of products) {
    const created = await generateConcepts(INTERNAL_SCOPE, "pilot-run", p.id, { limit: 4 }, db).catch((e) => {
      console.log(`${p.name}: ${e instanceof Error ? e.message : e}`);
      return [];
    });
    const all = await db.select().from(ms.msConcepts).where(eq(ms.msConcepts.productId, p.id));
    console.log(`${p.name}: ${created.length} new concept(s), ${all.length} total`);
    for (const c of all) {
      const j = await enqueueConceptRender(INTERNAL_SCOPE, p.id, c.id, undefined, db);
      if (j.id) jobIds.push(j.id);
      console.log(`  queued ${c.family}: "${c.headline.slice(0, 60)}"`);
    }
  }
  const deadline = Date.now() + 25 * 60_000;
  for (;;) {
    const rows = jobIds.length ? await db.select().from(ms.msMediaJobs).where(inArray(ms.msMediaJobs.id, jobIds)) : [];
    const open = rows.filter((r) => r.status === "queued" || r.status === "running").length;
    process.stdout.write(`\rjobs open: ${open}/${rows.length}   `);
    if (open === 0 || Date.now() > deadline) {
      console.log();
      for (const r of rows.filter((x) => x.status !== "done")) console.log(`  job ${r.kind} ${r.status}: ${r.error}`);
      break;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  for (const p of products) {
    const creatives = await db.select().from(ms.msCreatives).where(eq(ms.msCreatives.productId, p.id)).orderBy(desc(ms.msCreatives.createdAt));
    const ready = creatives.filter((c) => c.status === "ready_for_review").length;
    console.log(`\n${p.name}: ${creatives.length} creatives, ${ready} ready for review, ${creatives.length - ready} failed QA`);
    for (const c of creatives.filter((x) => x.status !== "ready_for_review")) {
      const fails = ((c.qa as { checks?: Array<{ ok: boolean; severity: string; id: string; detail: string }> } | null)?.checks ?? []).filter((x) => !x.ok && x.severity === "fail");
      console.log(`  ${c.templateFamily} ${c.sizeKey}: ${fails.map((f) => `${f.id}: ${f.detail}`).join(" | ")}`);
    }
  }
  await closeStudioDb();
}
void main();
