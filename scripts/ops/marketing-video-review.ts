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
import { listReviews, requestChanges } from "../../src/lib/marketing-studio/publishing/video-review";
import { prepareUnlistedReview } from "../../src/lib/marketing-studio/publishing/review-upload";
import { listJobs, queueReplacement } from "../../src/lib/marketing-studio/publishing/review-replacement";

import { evaluateHealth } from "../../src/lib/marketing-studio/publishing/connections";
import { fetchYoutubeLiveMetadata, setYoutubeVisibility, verifyYoutubeVideo } from "../../src/lib/marketing-studio/publishing/youtube-api";
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

async function main() {
  const db = requireStudioDb();
  if (args.includes("--status")) {
    for (const r of await listReviews(db)) console.log(`${r.productName}: ${r.status}  ${r.watchUrl}  publication ${r.publicationId}  emailed ${r.emailedAt ?? "no"}${r.publicAt ? `  public ${r.publicAt}` : ""}\n    history: ${(r.events ?? []).map((e) => e.event).join(" > ") || "(none)"}${r.changesNote ? `\n    owner note: ${r.changesNote}` : ""}`);
    for (const j of await listJobs(db)) console.log(`replacement job for ${j.id.slice(0, 8)} (${j.productName}): ${j.status}${j.detail ? `  ${j.detail}` : ""}${j.newVideoId ? `  new video ${j.newVideoId}` : ""}`);
    return;
  }
  const testVis = arg("--test-visibility");
  if (testVis) {
    // Proves the visibility permission WITHOUT changing anything: the video is sent back its own current visibility, then re-read to confirm it did not move.
    const p0 = (await listProducts(INTERNAL_SCOPE, db)).find((p) => p.slug === testVis);
    if (!p0) throw new Error(`${testVis} is not a Studio product`);
    const rev = (await listReviews(db)).filter((r) => r.productId === p0.id && r.status !== "superseded").at(-1);
    if (!rev) throw new Error("No review video for that product");
    const c0 = await youtubeConnectionFor(db, p0.id);
    if (!c0) throw new Error("No healthy YouTube connection");
    const scopes = ((c0.scopes as string[]) ?? []).map((x) => x.split("/").pop());
    console.log(`connection ${c0.id} (${c0.accountLabel}) health ${evaluateHealth(c0)}; stored permissions: ${scopes.join(", ")}`);
    const t0 = await youtubeTokensForCall(INTERNAL_SCOPE, ACTOR, c0.productId, c0.id, { fetch }, db);
    console.log("refresh token works: an access token was issued");
    const before = await fetchYoutubeLiveMetadata({ videoId: rev.videoId, accessToken: t0.accessToken }, { fetch });
    if (!before.exists || !before.privacy) throw new Error(`Could not read the video: ${before.reason ?? "unknown"}`);
    const r0 = await setYoutubeVisibility({ videoId: rev.videoId, accessToken: t0.accessToken, privacy: before.privacy as "public" | "unlisted" | "private" }, { fetch });
    const after = await fetchYoutubeLiveMetadata({ videoId: rev.videoId, accessToken: t0.accessToken }, { fetch });
    console.log(`visibility-change capability: ${r0.ok ? "PASS" : `FAIL (${r0.reason}${r0.needsScope ? "; the channel still needs the visibility permission" : ""})`}`);
    console.log(`video ${rev.videoId} visibility before ${before.privacy}, after ${after.privacy}: ${before.privacy === after.privacy ? "unchanged" : "CHANGED"}`);
    if (!r0.ok || before.privacy !== after.privacy) process.exitCode = 11;
    return;
  }
  const collect = arg("--collect");
  if (collect) {
    const [pub] = await db.select().from(ms.msPublications).where(eq(ms.msPublications.id, collect)).limit(1);
    if (!pub) throw new Error("No such publication");
    const col = await collectForPublication(INTERNAL_SCOPE, ACTOR, pub.productId, pub.id, undefined, db);
    console.log(col.collected ? "measurement snapshot stored" : `not collected: ${col.reason}`);
    return;
  }
  const record = arg("--record-changes");
  if (record) {
    // The owner gave this instruction in chat and the email click did not store it: record it exactly as given, keep the video unlisted and queue the replacement.
    const note = arg("--note");
    if (!note) throw new Error("--record-changes needs --note \"the owner's exact instruction\"");
    const next = await requestChanges("owner-chat-instruction", record, note, db);
    const job = await queueReplacement(db, "owner-chat-instruction", next);
    console.log(`changes recorded for ${next.productName}: status ${next.status}; replacement job ${job.status}`);
    return;
  }
  const resend = arg("--resend-email");
  if (resend) {
    console.log("owner email:", JSON.stringify(await requestOwnerEmail(resend)));
    return;
  }
  const slug = args[0];
  if (!slug || slug.startsWith("--")) throw new Error("usage: marketing-video-review.ts <slug> ... (see the header of this file)");
  const kids = arg("--made-for-kids");
  if (kids !== null && kids !== "yes" && kids !== "no") throw new Error("--made-for-kids needs yes or no");
  const out = await prepareUnlistedReview(db, {
    slug,
    shareFrom: arg("--share-from") ?? undefined,
    madeForKids: (kids as "yes" | "no" | null) ?? undefined,
    title: arg("--title") ?? undefined,
    description: arg("--description") ?? undefined,
    intended: arg("--intended") ?? undefined,
    placement: arg("--placement") ?? undefined,
    videoRowId: arg("--video") ?? undefined,
    upload: args.includes("--upload-unlisted"),
    log: (m) => console.log(m),
  });
  if (!out.ok) {
    console.log(`BLOCKED: ${out.blocked}. Nothing was made public.`);
    process.exitCode = 6;
    return;
  }
  if (!args.includes("--upload-unlisted")) console.log("PREPARED: nothing was sent. Add --upload-unlisted to upload it as UNLISTED for owner review.");
  else console.log(`UNLISTED REVIEW READY: https://www.youtube.com/watch?v=${out.videoId}\nNothing is public. The owner decides from the review email.`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => closeStudioDb());
