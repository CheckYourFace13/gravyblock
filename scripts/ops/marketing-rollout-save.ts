// Persists the rollout order, social strategy and paid-acquisition roadmap (spend disabled) in ms_settings. Idempotent. Creates, connects, spends and publishes nothing.
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-rollout-save.ts
import { audit } from "../../src/lib/marketing-studio/audit";
import { closeStudioDb, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { ACQUISITION_QUEUE, GAME_ACQUISITION_PAUSE, GRAVYBLOCK_VIDEO_LIBRARY, ROLLOUT_PLAN, VIDEO_REVIEW_WORKFLOW } from "../../src/lib/marketing-studio/rollout";
import { setSetting } from "../../src/lib/marketing-studio/runtime";

const ACTOR = "owner:chris (directive relayed in chat 2026-11-07)";

async function main() {
  const db = requireStudioDb();
  await setSetting("rollout_plan", ROLLOUT_PLAN, ACTOR, db);
  await setSetting("paid_acquisition", { status: "roadmap_only", spendEnabled: false, totalApprovedBudgetCents: 0 }, ACTOR, db);
  await setSetting("acquisition_queue", { order: ACQUISITION_QUEUE, active: true, decidedAt: "2026-11-07" }, ACTOR, db);
  await setSetting(GAME_ACQUISITION_PAUSE.setting, true, ACTOR, db);
  await setSetting("video_review_workflow", VIDEO_REVIEW_WORKFLOW, ACTOR, db);
  await setSetting("video_library_gravyblock", GRAVYBLOCK_VIDEO_LIBRARY, ACTOR, db);
  await audit(db, { actor: ACTOR, action: "rollout.saved", entity: "setting", entityId: "rollout_plan", detail: { order: ROLLOUT_PLAN.order, paidSpendEnabled: false } });
  console.log(`rollout order saved (${ROLLOUT_PLAN.order.length} brands): ${ROLLOUT_PLAN.order.join(" > ")}\npaid acquisition: roadmap only, spend disabled, approved budget 0`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => closeStudioDb());
