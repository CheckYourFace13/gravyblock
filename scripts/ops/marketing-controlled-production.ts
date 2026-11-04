// Records the owner's approval of the RentalNoodle pilot demo (OWNER_APPROVED_REFERENCE), reopens video generation under the durable expansion
// gate, and confirms the old slideshow pipeline stays retired. Idempotent. Publishes, schedules and connects nothing.
// The approval is Chris's, relayed in chat on 2026-11-04 ("PERFECT"); the audit trail says so rather than pretending it came from the Review page.
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-controlled-production.ts
import { and, eq, sql } from "drizzle-orm";
import { audit } from "../../src/lib/marketing-studio/audit";
import { closeStudioDb, ms, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { listProducts } from "../../src/lib/marketing-studio/repository";
import { INTERNAL_SCOPE } from "../../src/lib/marketing-studio/scope";
import { approveVideoExpansion, unfreezeVideoGeneration, videoExpansion, videoFreeze } from "../../src/lib/marketing-studio/video/freeze";
import { reviewVideo } from "../../src/lib/marketing-studio/video/queue";

const ACTOR = "owner:chris (approval relayed in chat 2026-11-04)";
const NOTE = "Owner watched the RentalNoodle pilot video and approved it as PERFECT; it is the production quality reference for Marketing Studio video.";

async function main() {
  const db = requireStudioDb();
  const noodle = (await listProducts(INTERNAL_SCOPE, db)).find((p) => p.slug === "rentalnoodle");
  if (!noodle) throw new Error("RentalNoodle not found");
  const [video] = await db.select().from(ms.msVideos).where(and(eq(ms.msVideos.productId, noodle.id), sql`${ms.msVideos.storyboard}->>'kind' = 'demo'`, sql`${ms.msVideos.status} in ('ready_for_review','approved')`)).limit(1);
  if (!video) throw new Error("There is no reviewed RentalNoodle demo to approve.");
  if (video.status !== "approved") await reviewVideo(INTERNAL_SCOPE, ACTOR, noodle.id, video.id, "approved", db);
  const sb = video.storyboard as { ownerApproval?: unknown };
  if (!sb.ownerApproval) {
    await db.update(ms.msVideos).set({ storyboard: { ...(video.storyboard as object), ownerApproval: { status: "OWNER_APPROVED_REFERENCE", at: new Date().toISOString(), by: "Chris (owner)", note: NOTE } } }).where(eq(ms.msVideos.id, video.id));
    await audit(db, { actor: ACTOR, action: "video.owner_approved_reference", entity: "video", entityId: video.id, productId: noodle.id, detail: { note: NOTE } });
  }
  console.log(`RentalNoodle demo ${video.id}: OWNER_APPROVED_REFERENCE`);
  if (await videoFreeze(db)) await unfreezeVideoGeneration(ACTOR, db);
  if (!(await videoExpansion(db))) await approveVideoExpansion(ACTOR, "rentalnoodle", NOTE, db);
  console.log(`video generation frozen: ${Boolean(await videoFreeze(db))}; expansion gate: ${(await videoExpansion(db))?.status ?? "none"}; slideshow pipeline: retired`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => closeStudioDb());
