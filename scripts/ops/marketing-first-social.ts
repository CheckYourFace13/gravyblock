// First controlled social post for the shared iScream Studio Page. Three steps, each explicit:
//   (default)   status: what is connected, what is missing, ownership and permission verification (read-only, writes nothing)
//   --prepare   after the Page is connected: verify it, prepare the ONE post as "approval required" and run the pre-publish checklist (sends nothing)
//   --publish --confirm-first-post <slug>   the explicit controlled action: approve, schedule and send that one post, verify it on Meta, start measurement
// ScribbleZap is first. Mibble Meadow is refused until ScribbleZap's first post is proven (published, confirmed live by Meta, first measurement stored).
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-first-social.ts [--prepare | --publish --confirm-first-post scribblezap]
import { and, eq, sql } from "drizzle-orm";
import { closeStudioDb, ms, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { collectForPublication, currentMetrics } from "../../src/lib/marketing-studio/measurement/collect";
import { verifyFacebookPostLive } from "../../src/lib/marketing-studio/measurement/facebook-insights";
import { evaluateHealth, tokensForPublish, usable } from "../../src/lib/marketing-studio/publishing/connections";
import { FIRST_SOCIAL, firstPostProven, prePublishChecks, recordFirstPostProven, verifyPageOwnership, type Check } from "../../src/lib/marketing-studio/publishing/first-post";
import { facebookOAuthConfigured } from "../../src/lib/marketing-studio/publishing/oauth-facebook";
import { approvePublication, createPublication, LIVE_SETTING, runDuePublications, schedulePublication } from "../../src/lib/marketing-studio/publishing/queue";
import { listProducts } from "../../src/lib/marketing-studio/repository";
import { getSetting, setSetting } from "../../src/lib/marketing-studio/runtime";
import { INTERNAL_SCOPE } from "../../src/lib/marketing-studio/scope";
import { staleMarkFor } from "../../src/lib/marketing-studio/video/stale";
import type { DemoRecord } from "../../src/lib/marketing-studio/video/demo/types";

const ACTOR = "first-post-operator";
const args = process.argv.slice(2);
const PREPARE = args.includes("--prepare");
const PUBLISH = args.includes("--publish");
const CONFIRM = args.includes("--confirm-first-post") ? args[args.indexOf("--confirm-first-post") + 1] : null;
const show = (checks: Check[]) => checks.forEach((c) => console.log(`  ${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.detail ? `: ${c.detail}` : ""}`));

async function main() {
  const db = requireStudioDb();
  const products = await listProducts(INTERNAL_SCOPE, db);
  let target: (typeof products)[number] | undefined;
  for (const slug of FIRST_SOCIAL.order) {
    const p = products.find((x) => x.slug === slug);
    if (!p) throw new Error(`No Studio product ${slug}`);
    if (!(await firstPostProven(db, p.id))) {
      target = p;
      break;
    }
  }
  if (!target) {
    console.log("Both games have a proven first post. Nothing left in the first-post order.");
    return;
  }
  console.log(`first-post candidate: ${target.name}${target.slug === FIRST_SOCIAL.order[1] ? " (ScribbleZap has proven the loop)" : " (first controlled candidate)"}`);
  console.log(`minimum structure needed: ${FIRST_SOCIAL.minimumStructure.join("; ")}`);
  console.log(`not needed yet: ${FIRST_SOCIAL.deferred.join(", ")}`);
  console.log(`Meta app configured on the server: ${facebookOAuthConfigured()}`);

  const conns = await db.select().from(ms.msConnections).where(and(eq(ms.msConnections.productId, target.id), eq(ms.msConnections.platform, "facebook")));
  const conn = conns.find((c) => usable(evaluateHealth(c)));
  if (!conn) {
    console.log(`BLOCKED (waiting on the owner): no healthy Facebook Page is connected to ${target.name}. Open the product page in the Studio and press Connect with Facebook, handle "${FIRST_SOCIAL.expectedHandle}".`);
    process.exitCode = 2;
    return;
  }
  const tokens = await tokensForPublish(INTERNAL_SCOPE, ACTOR, target.id, conn.id, db);
  console.log("\nOWNERSHIP AND PERMISSIONS");
  const own = await verifyPageOwnership(conn, tokens.accessToken, { fetch });
  show(own);
  if (own.some((c) => !c.ok)) {
    console.log("BLOCKED: the connected account is not verified as the iScream Studio Page. Nothing was prepared.");
    process.exitCode = 3;
    return;
  }
  const sent = (await db.select().from(ms.msPublications).where(and(eq(ms.msPublications.productId, target.id), eq(ms.msPublications.platform, "facebook"), eq(ms.msPublications.status, "published")))).at(0);
  if (sent?.externalPostId) {
    console.log("a post is already published for this product but the loop is not proven yet: verifying and measuring (nothing new is sent)");
    await finalize(db, target, sent, tokens.accessToken);
    return;
  }
  if (!PREPARE && !PUBLISH) {
    console.log("STATUS ONLY: the Page is connected and verified. Re-run with --prepare to prepare the one post (still sends nothing).");
    return;
  }

  const [video] = await db.select().from(ms.msVideos).where(and(eq(ms.msVideos.productId, target.id), sql`${ms.msVideos.storyboard}->>'kind' = 'demo'`, eq(ms.msVideos.status, "approved"))).limit(1);
  if (!video) {
    console.log(`BLOCKED (waiting on the owner): ${target.name} has no owner-approved demo video. Approve it on the Review page once the voice sounds right.`);
    process.exitCode = 4;
    return;
  }
  const { publication, duplicate } = await createPublication(INTERNAL_SCOPE, ACTOR, target.id, { videoId: video.id, platform: "facebook", mode: "direct", connectionId: conn.id }, db);
  const facts = (await db.select().from(ms.msProductFacts).where(eq(ms.msProductFacts.productId, target.id))).filter((f) => f.status === "current");
  const published = await db.select({ id: ms.msPublications.id }).from(ms.msPublications).where(and(eq(ms.msPublications.productId, target.id), eq(ms.msPublications.platform, "facebook"), eq(ms.msPublications.status, "published")));
  const checks = prePublishChecks({
    productSlug: target.slug,
    productId: target.id,
    publication,
    connection: conn,
    video: { assetId: video.assetId, status: video.status, qaPassed: Boolean((video.qa as { passed?: boolean } | null)?.passed), stale: Boolean(await staleMarkFor(db, video.id)), record: video.storyboard as DemoRecord },
    facts: facts.map((f) => ({ id: f.id, value: f.factValue, verified: Boolean(f.verifiedAt) })),
    alreadyPublishedForProduct: published.length,
  });
  console.log("\nPRE-PUBLISH CHECKLIST");
  show(checks);
  console.log(`\nCAPTION (exactly as it would be posted):\n${publication.caption}\n\nprepared publication: ${publication.id} (${publication.status})${duplicate ? " [existing]" : ""}`);
  if (checks.some((c) => !c.ok)) {
    console.log("BLOCKED: a pre-publish check failed. Nothing was sent.");
    process.exitCode = 5;
    return;
  }
  if (!PUBLISH) {
    console.log("PREPARED: everything passed and nothing was sent. The only way to send is: --publish --confirm-first-post " + target.slug);
    return;
  }
  if (CONFIRM !== target.slug) {
    console.log(`REFUSED: sending needs the explicit controlled action: --publish --confirm-first-post ${target.slug}`);
    process.exitCode = 6;
    return;
  }

  // The controlled action: approve, schedule, send once with live publishing on only for the duration, then verify and measure.
  if (publication.status === "approval_required") await approvePublication(INTERNAL_SCOPE, ACTOR, target.id, publication.id, db);
  const row = (await db.select().from(ms.msPublications).where(eq(ms.msPublications.id, publication.id)))[0];
  if (row.status === "approved") await schedulePublication(INTERNAL_SCOPE, ACTOR, target.id, publication.id, new Date(Date.now() - 1000), db);
  const wasLive = await getSetting<boolean>(LIVE_SETTING, false, db);
  try {
    await setSetting(LIVE_SETTING, true, ACTOR, db);
    console.log("run:", JSON.stringify(await runDuePublications(INTERNAL_SCOPE, undefined, db)));
  } finally {
    await setSetting(LIVE_SETTING, wasLive, ACTOR, db);
  }
  const after = (await db.select().from(ms.msPublications).where(eq(ms.msPublications.id, publication.id)))[0];
  console.log(`status: ${after.status}${after.failureReason ? ` (${after.failureReason})` : ""}`);
  if (after.status !== "published" || !after.externalPostId) {
    process.exitCode = 7;
    return;
  }
  await finalize(db, target, after, tokens.accessToken);
}

/** Verify the post on Meta, start measurement, and only then record the loop as proven. Safe to re-run for a post that is already published. */
async function finalize(db: ReturnType<typeof requireStudioDb>, target: { id: string; slug: string; name: string }, after: { id: string; externalPostId: string | null }, accessToken: string) {
  const live = await verifyFacebookPostLive({ externalId: after.externalPostId!, accessToken }, { fetch });
  console.log(`externally verified live on Meta: ${live.live}${live.permalink ? ` (${live.permalink})` : ""}${live.reason ? ` ${live.reason}` : ""}`);
  if (!live.live) {
    process.exitCode = 8;
    return;
  }
  const col = await collectForPublication(INTERNAL_SCOPE, ACTOR, target.id, after.id, undefined, db);
  const cur = await currentMetrics(db, after.id);
  console.log(`measurement started: ${col.collected ? "first snapshot stored" : `not yet (${col.reason})`}; snapshots ${cur.snapshots}`);
  for (const [k, m] of Object.entries(cur.metrics)) console.log(`  ${k}: ${m.value ?? "unknown"} [${m.status.toUpperCase()}]`);
  if (col.collected) {
    await recordFirstPostProven(db, ACTOR, target.id, after.id, { externalPostId: after.externalPostId!, permalink: live.permalink, snapshots: cur.snapshots });
    console.log(`LOOP PROVEN for ${target.name}.${target.slug === FIRST_SOCIAL.order[0] ? " Mibble Meadow may now be prepared." : ""}`);
  } else {
    console.log("The post is live but the first measurement is not stored yet; the loop is not marked proven. Re-run the status step later.");
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => closeStudioDb());
