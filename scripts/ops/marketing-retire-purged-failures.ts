// One-time cleanup: publications that failed with "ENOENT" because their video file was retired by the retention policy.
// They cannot be sent (the file is gone) and the video is a superseded version, so they are cancelled with the reason recorded, never re-uploaded.
//   tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-retire-purged-failures.ts [--apply]
import { and, eq, like } from "drizzle-orm";
import { audit } from "../../src/lib/marketing-studio/audit";
import { closeStudioDb, ms, requireStudioDb } from "../../src/lib/marketing-studio/db";

async function main() {
  const db = requireStudioDb();
  const apply = process.argv.includes("--apply");
  const rows = await db
    .select({ id: ms.msPublications.id, productId: ms.msPublications.productId, title: ms.msPublications.title, path: ms.msAssets.storagePath })
    .from(ms.msPublications)
    .innerJoin(ms.msAssets, eq(ms.msAssets.id, ms.msPublications.assetId))
    .where(and(eq(ms.msPublications.status, "failed"), like(ms.msPublications.failureReason, "ENOENT%")));
  const targets = rows.filter((r) => r.path.startsWith("purged/"));
  console.log(`${targets.length} failed publication(s) whose file was retired${apply ? "" : " (dry run, pass --apply)"}`);
  for (const t of targets) {
    console.log(` - ${t.id} ${t.title}`);
    if (!apply) continue;
    await db.update(ms.msPublications).set({ status: "cancelled", failureReason: "Cancelled: the video file was retired by the storage retention policy and the video is a superseded version; it is not re-uploaded.", updatedAt: new Date() }).where(eq(ms.msPublications.id, t.id));
    await audit(db, { actor: "owner-approved-cleanup", action: "publication.cancelled", entity: "publication", entityId: t.id, productId: t.productId, detail: { reason: "asset purged, superseded video" } });
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.stack : e); process.exitCode = 1; }).finally(() => closeStudioDb());
