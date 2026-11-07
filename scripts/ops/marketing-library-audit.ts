// Read-only inventory of every Marketing Studio video per product: status, QA, approval, publication, review state, YouTube link. Changes nothing.
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-library-audit.ts
import { eq } from "drizzle-orm";
import { closeStudioDb, ms, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { listReviews } from "../../src/lib/marketing-studio/publishing/video-review";
import { listProducts } from "../../src/lib/marketing-studio/repository";
import { INTERNAL_SCOPE } from "../../src/lib/marketing-studio/scope";
import type { DemoRecord } from "../../src/lib/marketing-studio/video/demo/types";

async function main() {
  const db = requireStudioDb();
  const products = await listProducts(INTERNAL_SCOPE, db);
  const reviews = await listReviews(db);
  const pubs = await db.select().from(ms.msPublications);
  for (const p of products) {
    const vids = await db.select().from(ms.msVideos).where(eq(ms.msVideos.productId, p.id));
    console.log(`\n== ${p.name} (${p.slug}, ${p.kind}) ${p.publicUrl ?? ""}  videos: ${vids.length}`);
    for (const v of vids.sort((a, b) => +a.createdAt - +b.createdAt)) {
      const sb = v.storyboard as Partial<DemoRecord> & { kind?: string };
      const vp = pubs.filter((x) => x.videoId === v.id);
      const rv = vp.map((x) => reviews.find((r) => r.publicationId === x.id)).filter(Boolean);
      const qa = v.qa as { passed?: boolean } | null;
      console.log(`  ${v.id.slice(0, 8)} ${sb.kind ?? "slideshow"} status=${v.status} qa=${qa?.passed ?? "-"} dur=${v.durationMs ? Math.round(v.durationMs / 1000) + "s" : "-"} title="${(v.title ?? "").slice(0, 70)}"`);
      if (sb.transcript?.length) console.log(`     hook: "${sb.transcript[0].caption || sb.transcript[0].text}"  scenes: ${(sb.scenes ?? []).map((s) => s.id).join(">")}  cta: ${sb.cta?.text ?? "-"} -> ${sb.cta?.url ?? "-"}`);
      for (const x of vp) console.log(`     pub ${x.id.slice(0, 8)} ${x.platform} ${x.status} ${x.externalUrl ?? ""} review=${rv.find((r) => r?.publicationId === x.id)?.status ?? "-"}`);
    }
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => closeStudioDb());
