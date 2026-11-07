// Default review flow for a website or app marketing video: QA-passed video -> UNLISTED on the iScream Studio YouTube channel -> verified live ->
// owner emailed a review link. The owner approves (same video becomes public) or requests changes in the Studio review page. This script never
// makes anything public.
//   marketing-video-review.ts --status
//   marketing-video-review.ts <slug> --share-from <slug> --made-for-kids no --title "..." --description "..." [--placement "..."] [--intended "..."]   (checks only)
//   ... add --upload-unlisted to run the one upload, verify it, store the review and embed details, and email the owner
//   marketing-video-review.ts --resend-email <publicationId>
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-video-review.ts [...]
import { and, desc, eq, sql } from "drizzle-orm";
import { closeStudioDb, ms, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { collectForPublication } from "../../src/lib/marketing-studio/measurement/collect";
import { verifyYoutubeConnection, YOUTUBE_FIRST, youtubeTokensForCall } from "../../src/lib/marketing-studio/publishing/oauth-youtube";
import { approvePublication, createPublication, LIVE_SETTING, runDuePublications, schedulePublication, setPublicationCopy, youtubeEnabledSetting, youtubeKidsSetting, youtubePrivacySetting } from "../../src/lib/marketing-studio/publishing/queue";
import { requestOwnerEmail } from "../../src/lib/marketing-studio/publishing/review-notify";
import { listReviews, recordUnlistedReview, reviewUploadChecks, type Check } from "../../src/lib/marketing-studio/publishing/video-review";
import { verifyYoutubeVideo } from "../../src/lib/marketing-studio/publishing/youtube-api";
import { shareYoutubeConnection, youtubeConnectionFor, connectionAllowedFor } from "../../src/lib/marketing-studio/publishing/youtube-share";
import { listProducts } from "../../src/lib/marketing-studio/repository";
import { getSetting, setSetting } from "../../src/lib/marketing-studio/runtime";
import { INTERNAL_SCOPE } from "../../src/lib/marketing-studio/scope";
import type { DemoRecord } from "../../src/lib/marketing-studio/video/demo/types";
import { reviewVideo } from "../../src/lib/marketing-studio/video/queue";
import { staleMarkFor } from "../../src/lib/marketing-studio/video/stale";

const ACTOR = "video-review-operator";
const args = process.argv.slice(2);
const arg = (n: string) => (args.includes(n) ? (args[args.indexOf(n) + 1] ?? null) : null);
const show = (checks: Check[]) => checks.forEach((c) => console.log(`  ${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.detail ? `: ${c.detail}` : ""}`));

async function main() {
  const db = requireStudioDb();
  if (args.includes("--status")) {
    for (const r of await listReviews(db)) console.log(`${r.productName}: ${r.status}  ${r.watchUrl}  publication ${r.publicationId}  emailed ${r.emailedAt ?? "no"}${r.publicAt ? `  public ${r.publicAt}` : ""}`);
    return;
  }
  const resend = arg("--resend-email");
  if (resend) {
    console.log("owner email:", JSON.stringify(await requestOwnerEmail(resend)));
    return;
  }
  const slug = args[0];
  if (!slug || slug.startsWith("--")) throw new Error("usage: marketing-video-review.ts <slug> ... (see the header of this file)");
  const products = await listProducts(INTERNAL_SCOPE, db);
  const product = products.find((p) => p.slug === slug);
  if (!product) throw new Error(`${slug} is not a Studio product`);
  const productHost = product.publicUrl ? new URL(product.publicUrl).host.replace(/^www\./, "") : null;

  // 1. the shared iScream Studio channel connection (nothing is copied; the owner row stays the only holder of the tokens)
  let conn = await youtubeConnectionFor(db, product.id);
  const from = arg("--share-from");
  if (!conn && from) {
    const src = products.find((p) => p.slug === from);
    const srcConn = src ? await youtubeConnectionFor(db, src.id) : null;
    if (!srcConn) throw new Error(`${from} has no healthy YouTube connection to share`);
    await shareYoutubeConnection(db, ACTOR, srcConn.id, product.id);
    conn = await youtubeConnectionFor(db, product.id);
    console.log(`shared the existing iScream Studio YouTube channel (${srcConn.accountLabel}) with ${product.name}; no tokens were copied`);
  }
  if (!conn) throw new Error(`${product.name} has no usable YouTube connection. Share one with --share-from <slug>.`);
  console.log(`connection: ${conn.accountLabel}, channel id ${conn.externalAccountId}`);
  console.log("\nCHANNEL VERIFICATION (live, read-only)");
  const own = await verifyYoutubeConnection(INTERNAL_SCOPE, ACTOR, conn, YOUTUBE_FIRST.expectedHandle, { fetch }, db);
  own.forEach((c) => console.log(`  ${c.ok ? "PASS" : "FAIL"}  ${c.name}: ${c.detail}`));
  if (own.some((c) => !c.ok)) throw new Error("The channel is not verified as the iScream Studio channel. Nothing was prepared.");

  // 2. owner configuration: made-for-kids is the owner's declaration; review visibility is always unlisted
  const kidsArg = arg("--made-for-kids");
  if (kidsArg !== null) {
    if (kidsArg !== "yes" && kidsArg !== "no") throw new Error("--made-for-kids needs yes or no");
    await setSetting(youtubeKidsSetting(product.id), kidsArg === "yes", "owner-directive", db);
  }
  await setSetting(youtubeEnabledSetting(product.id), true, "owner-directive", db);
  await setSetting(youtubePrivacySetting(product.id), "unlisted", "owner-directive", db);
  const kids = await getSetting<boolean | null>(youtubeKidsSetting(product.id), null, db);

  // 3. the video: the latest QA-passed demo
  const [video] = await db.select().from(ms.msVideos).where(and(eq(ms.msVideos.productId, product.id), sql`${ms.msVideos.storyboard}->>'kind' = 'demo'`, sql`${ms.msVideos.status} in ('ready_for_review','approved')`)).orderBy(desc(ms.msVideos.createdAt)).limit(1);
  if (!video) throw new Error(`${product.name} has no QA-passed demo video waiting`);
  const record = video.storyboard as DemoRecord;
  if (video.status === "ready_for_review") {
    // The owner directed the unlisted review upload; this approval lets the file go to YouTube as UNLISTED only. Public still needs the owner's separate approval.
    await reviewVideo(INTERNAL_SCOPE, "owner-directed-unlisted-review", product.id, video.id, "approved", db);
    console.log("video approved for the UNLISTED review upload (owner directive); it is not public");
  }

  // 4. publication with the owner's copy and the tracked link
  const { publication, duplicate } = await createPublication(INTERNAL_SCOPE, ACTOR, product.id, { videoId: video.id, platform: "youtube", mode: "direct", connectionId: conn.id }, db);
  const title = arg("--title");
  const description = arg("--description");
  if (title && description && publication.status !== "published") Object.assign(publication, await setPublicationCopy(INTERNAL_SCOPE, ACTOR, product.id, publication.id, { title, description: description.replace(/\\n/g, "\n") }, db));
  const facts = (await db.select().from(ms.msProductFacts).where(eq(ms.msProductFacts.productId, product.id))).filter((f) => f.status === "current");
  const others = (await db.select({ id: ms.msPublications.id, status: ms.msPublications.status }).from(ms.msPublications).where(and(eq(ms.msPublications.videoId, video.id), eq(ms.msPublications.platform, "youtube")))).filter((x) => x.id !== publication.id && !["cancelled", "revoked", "failed"].includes(x.status));
  const checks = reviewUploadChecks({
    productId: product.id,
    productHost,
    publication,
    video: { assetId: video.assetId, status: video.status, qaPassed: Boolean((video.qa as { passed?: boolean } | null)?.passed), stale: Boolean(await staleMarkFor(db, video.id)), record },
    facts: facts.map((f) => ({ id: f.id, verified: Boolean(f.verifiedAt) })),
    connectionAllowed: await connectionAllowedFor(db, conn, product.id),
    privacy: await getSetting<string | null>(youtubePrivacySetting(product.id), null, db),
    kids,
    otherYoutubePublications: others.length,
  });
  console.log("\nPRE-UPLOAD CHECKLIST");
  show(checks);
  console.log(`\nTITLE: ${publication.title}\nDESCRIPTION:\n${publication.caption}\nVISIBILITY: unlisted   MADE FOR KIDS: ${kids}\npublication ${publication.id} (${publication.status})${duplicate ? " [existing]" : ""}`);
  if (checks.some((c) => !c.ok)) {
    process.exitCode = 6;
    console.log("BLOCKED: a check failed. Nothing was sent.");
    return;
  }
  if (!args.includes("--upload-unlisted")) {
    console.log("PREPARED: nothing was sent. Add --upload-unlisted to upload it as UNLISTED for owner review.");
    return;
  }

  // 5. the one upload, UNLISTED
  if (publication.status === "approval_required") await approvePublication(INTERNAL_SCOPE, ACTOR, product.id, publication.id, db);
  const row = (await db.select().from(ms.msPublications).where(eq(ms.msPublications.id, publication.id)))[0];
  if (row.status === "approved") await schedulePublication(INTERNAL_SCOPE, ACTOR, product.id, publication.id, new Date(Date.now() - 1000), db);
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
    process.exitCode = 8;
    return;
  }

  // 6. verify the live video: it must be on the expected channel, processed, and UNLISTED
  const t = await youtubeTokensForCall(INTERNAL_SCOPE, ACTOR, conn.productId, conn.id, { fetch }, db);
  const v = await verifyYoutubeVideo({ videoId: after.externalPostId, channelId: conn.externalAccountId ?? "", accessToken: t.accessToken, requirePublic: false }, { fetch });
  console.log(`live check: channel match ${v.onExpectedChannel}, upload ${v.uploadStatus}, visibility ${v.privacy}${v.permalink ? `, ${v.permalink}` : ""}${v.reason ? ` (${v.reason})` : ""}`);
  if (!v.live || v.privacy !== "unlisted") {
    console.log("NOT VERIFIED as unlisted on the expected channel. No email was sent.");
    process.exitCode = 9;
    return;
  }
  const col = await collectForPublication(INTERNAL_SCOPE, ACTOR, product.id, after.id, undefined, db);
  console.log(`measurement: ${col.collected ? "first snapshot stored" : `not yet (${col.reason})`}`);

  // 7. review state + website embed details, then the owner email
  await recordUnlistedReview(db, ACTOR, {
    publicationId: after.id,
    productId: product.id,
    productName: product.name,
    videoRowId: video.id,
    videoId: after.externalPostId,
    title: after.title ?? "",
    description: after.caption,
    durationSec: video.durationMs ? video.durationMs / 1000 : null,
    ctaText: record.cta.text,
    ctaUrl: after.ctaUrl ?? record.cta.url,
    intendedUse: arg("--intended") ?? "Organic YouTube Short, a website embed and a future paid video asset.",
  }, arg("--placement") ?? "Near the top of the product's home page.");
  console.log("review state and website embed details stored");
  console.log("owner email:", JSON.stringify(await requestOwnerEmail(after.id)));
  console.log(`UNLISTED REVIEW READY: ${v.permalink}\nNothing is public. The owner decides on the review page.`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => closeStudioDb());
