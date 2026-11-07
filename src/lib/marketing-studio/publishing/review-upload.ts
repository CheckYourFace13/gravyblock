/**
 * Steps 2 to 7 of the review flow for one product: make sure the shared channel connection is usable, apply the owner's declarations, take the
 * QA-passed demo video, prepare the publication (owner copy, tracked link), run the checklist, upload it as UNLISTED, verify it live, store the review and
 * embed details and email the owner. Shared by the operator CLI and the replacement worker. It never makes anything public.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { ms, type StudioDb } from "../db";
import { collectForPublication } from "../measurement/collect";
import { INTERNAL_SCOPE } from "../scope";
import { getSetting, setSetting } from "../runtime";
import { listProducts } from "../repository";
import type { DemoRecord } from "../video/demo/types";
import { reviewVideo } from "../video/queue";
import { effectiveSpecHash } from "../video/demo/overrides";
import { staleMarkFor } from "../video/stale";
import { verifyYoutubeConnection, YOUTUBE_FIRST, youtubeTokensForCall } from "./oauth-youtube";
import { approvePublication, createPublication, LIVE_SETTING, runDuePublications, schedulePublication, setPublicationCopy, youtubeEnabledSetting, youtubeKidsSetting, youtubePrivacySetting } from "./queue";
import { requestOwnerEmail } from "./review-notify";
import { getReview, recordUnlistedReview, reviewUploadChecks, type Check } from "./video-review";
import { verifyYoutubeVideo } from "./youtube-api";
import { connectionAllowedFor, shareYoutubeConnection, youtubeConnectionFor } from "./youtube-share";

const ACTOR = "video-review-operator";

export type UploadOptions = {
  slug: string;
  shareFrom?: string;
  madeForKids?: "yes" | "no";
  title?: string;
  description?: string;
  intended?: string;
  placement?: string;
  /** Which video of the product's library this is, for the review email. */
  library?: { position: number; of: number; roleLabel: string };
  /** Only this video (a replacement); otherwise the latest QA-passed demo. */
  videoRowId?: string;
  /** Actually upload. Without it only the checks run. */
  upload: boolean;
  log?: (m: string) => void;
};
export type UploadOutcome = { ok: boolean; blocked?: string; publicationId?: string; videoId?: string; emailed?: boolean; checks?: Check[] };

export async function prepareUnlistedReview(db: StudioDb, o: UploadOptions): Promise<UploadOutcome> {
  const log = o.log ?? (() => {});
  const products = await listProducts(INTERNAL_SCOPE, db);
  const product = products.find((p) => p.slug === o.slug);
  if (!product) throw new Error(`${o.slug} is not a Studio product`);
  const productHost = product.publicUrl ? new URL(product.publicUrl).host.replace(/^www\./, "") : null;

  let conn = await youtubeConnectionFor(db, product.id);
  if (!conn && o.shareFrom) {
    const src = products.find((p) => p.slug === o.shareFrom);
    const srcConn = src ? await youtubeConnectionFor(db, src.id) : null;
    if (!srcConn) throw new Error(`${o.shareFrom} has no healthy YouTube connection to share`);
    await shareYoutubeConnection(db, ACTOR, srcConn.id, product.id);
    conn = await youtubeConnectionFor(db, product.id);
    log(`shared the existing iScream Studio YouTube channel (${srcConn.accountLabel}) with ${product.name}; no tokens were copied`);
  }
  if (!conn) throw new Error(`${product.name} has no usable YouTube connection.`);
  log(`connection: ${conn.accountLabel}, channel id ${conn.externalAccountId}`);
  const own = await verifyYoutubeConnection(INTERNAL_SCOPE, ACTOR, conn, YOUTUBE_FIRST.expectedHandle, { fetch }, db);
  own.forEach((c) => log(`  ${c.ok ? "PASS" : "FAIL"}  ${c.name}: ${c.detail}`));
  if (own.some((c) => !c.ok)) throw new Error("The channel is not verified as the iScream Studio channel. Nothing was prepared.");

  if (o.madeForKids) await setSetting(youtubeKidsSetting(product.id), o.madeForKids === "yes", "owner-directive", db);
  await setSetting(youtubeEnabledSetting(product.id), true, "owner-directive", db);
  await setSetting(youtubePrivacySetting(product.id), "unlisted", "owner-directive", db);
  const kids = await getSetting<boolean | null>(youtubeKidsSetting(product.id), null, db);

  const wanted = o.videoRowId
    ? await db.select().from(ms.msVideos).where(and(eq(ms.msVideos.id, o.videoRowId), eq(ms.msVideos.productId, product.id))).limit(1)
    : await db.select().from(ms.msVideos).where(and(eq(ms.msVideos.productId, product.id), sql`${ms.msVideos.storyboard}->>'kind' = 'demo'`, sql`${ms.msVideos.status} in ('ready_for_review','approved')`)).orderBy(desc(ms.msVideos.createdAt)).limit(1);
  const video = wanted[0];
  if (!video) throw new Error(`${product.name} has no QA-passed demo video waiting`);
  const record = video.storyboard as DemoRecord;
  if (video.status === "ready_for_review") {
    // The owner directed the unlisted review upload; this approval lets the file go to YouTube as UNLISTED only. Public still needs the owner's own approval.
    await reviewVideo(INTERNAL_SCOPE, "owner-directed-unlisted-review", product.id, video.id, "approved", db);
    log("video approved for the UNLISTED review upload (owner directive); it is not public");
  }

  const { publication, duplicate } = await createPublication(INTERNAL_SCOPE, ACTOR, product.id, { videoId: video.id, platform: "youtube", mode: "direct", connectionId: conn.id }, db);
  if (o.title && o.description && publication.status !== "published") Object.assign(publication, await setPublicationCopy(INTERNAL_SCOPE, ACTOR, product.id, publication.id, { title: o.title, description: o.description.replace(/\\n/g, "\n") }, db));
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
  const resumed = publication.status === "published" && Boolean(publication.externalPostId);
  if (resumed) log("this video was already uploaded by an earlier attempt: resuming at verification");
  if (resumed) checks.length = 0;
  log("\nPRE-UPLOAD CHECKLIST");
  checks.forEach((c) => log(`  ${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.detail ? `: ${c.detail}` : ""}`));
  log(`\nTITLE: ${publication.title}\nDESCRIPTION:\n${publication.caption}\nVISIBILITY: unlisted   MADE FOR KIDS: ${kids}\npublication ${publication.id} (${publication.status})${duplicate ? " [existing]" : ""}`);
  if (checks.some((c) => !c.ok)) return { ok: false, blocked: "a pre-upload check failed", checks };
  if (!o.upload) return { ok: true, checks, publicationId: publication.id };

  if (!resumed && publication.status === "approval_required") await approvePublication(INTERNAL_SCOPE, ACTOR, product.id, publication.id, db);
  const row = (await db.select().from(ms.msPublications).where(eq(ms.msPublications.id, publication.id)))[0];
  if (!resumed && row.status === "approved") await schedulePublication(INTERNAL_SCOPE, ACTOR, product.id, publication.id, new Date(Date.now() - 1000), db);
  const wasLive = await getSetting<boolean>(LIVE_SETTING, false, db);
  if (!resumed) {
    try {
      await setSetting(LIVE_SETTING, true, ACTOR, db);
      log(`run: ${JSON.stringify(await runDuePublications(INTERNAL_SCOPE, undefined, db))}`);
    } finally {
      await setSetting(LIVE_SETTING, wasLive, ACTOR, db);
    }
  }
  const after = (await db.select().from(ms.msPublications).where(eq(ms.msPublications.id, publication.id)))[0];
  log(`status: ${after.status}${after.failureReason ? ` (${after.failureReason})` : ""}`);
  if (after.status !== "published" || !after.externalPostId) return { ok: false, blocked: `upload did not complete: ${after.failureReason ?? after.status}`, checks };

  const t = await youtubeTokensForCall(INTERNAL_SCOPE, ACTOR, conn.productId, conn.id, { fetch }, db);
  const v = await verifyYoutubeVideo({ videoId: after.externalPostId, channelId: conn.externalAccountId ?? "", accessToken: t.accessToken, requirePublic: false }, { fetch });
  log(`live check: channel match ${v.onExpectedChannel}, upload ${v.uploadStatus}, visibility ${v.privacy}${v.permalink ? `, ${v.permalink}` : ""}${v.reason ? ` (${v.reason})` : ""}`);
  if (!v.live || v.privacy !== "unlisted") return { ok: false, blocked: "not verified as unlisted on the expected channel; no email sent", publicationId: after.id, videoId: after.externalPostId, checks };
  const col = await collectForPublication(INTERNAL_SCOPE, ACTOR, product.id, after.id, undefined, db);
  log(`measurement: ${col.collected ? "first snapshot stored" : `not yet (${col.reason})`}`);

  const already = await getReview(db, after.id);
  if (already?.emailedAt) {
    log("the review was already recorded and emailed by an earlier attempt");
    return { ok: true, publicationId: after.id, videoId: after.externalPostId, emailed: true, checks };
  }
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
    intendedUse: o.intended ?? "Organic YouTube Short, a website embed and a future paid video asset.",
    specHash: await effectiveSpecHash(db, product.id, o.slug),
    ...(o.library ? { library: o.library } : {}),
  }, o.placement ?? "Near the top of the product's home page.");
  log("review state and website embed details stored");
  const mail = await requestOwnerEmail(after.id);
  log(`owner email: ${JSON.stringify(mail)}`);
  return { ok: true, publicationId: after.id, videoId: after.externalPostId, emailed: mail.sent, checks };
}
