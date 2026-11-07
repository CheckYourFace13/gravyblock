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
import { getReview, listReviews, requestChanges, reviewKey } from "../../src/lib/marketing-studio/publishing/video-review";
import { prepareUnlistedReview } from "../../src/lib/marketing-studio/publishing/review-upload";
import { openReview, submitChanges } from "../../src/lib/marketing-studio/publishing/review-flow";
import { signReviewToken } from "../../src/lib/marketing-studio/publishing/review-token";
import { listJobs, queueReplacement, requeueReplacement } from "../../src/lib/marketing-studio/publishing/review-replacement";

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
  const queueFor = arg("--queue-replacement");
  if (queueFor) {
    // A change request that was stored before the replacement queue existed: queue its replacement from the stored note, unchanged.
    const cur = await getReview(db, queueFor);
    if (!cur || cur.status !== "changes_requested" || !cur.changesNote) throw new Error("That review has no stored change request to replace");
    const job = await queueReplacement(db, "review-operator", cur);
    console.log(`replacement job for ${cur.productName}: ${job.status}
owner note (exact): ${job.note}`);
    return;
  }
  const retry = arg("--retry-replacement");
  if (retry) {
    // After a blocked or exhausted request was fixed (for example the script was edited by hand): put the same request back in the worker's queue.
    const j = await requeueReplacement(db, retry);
    console.log(`replacement job for ${j.productName} queued again (generation ${j.generation})`);
    return;
  }
  const simulate = arg("--simulate-owner-request");
  if (simulate) {
    // Runs the owner's request-changes click through the real code (token, page transaction, protected submit, queue) with a test note. Publishes nothing.
    const key = process.env.MARKETING_SECRET_KEY;
    const note = arg("--note");
    if (!key || !note) throw new Error("--simulate-owner-request needs --note and the Studio secret");
    const token = signReviewToken(simulate, "changes", key);
    const opened = await openReview(db, token, key);
    if (opened.kind !== "changes_form") throw new Error(`The review is not waiting for a decision (${opened.kind})`);
    const out = await submitChanges(db, { token, txn: opened.txn, note }, key);
    if (!out.ok) throw new Error(out.message);
    console.log(`request stored (status ${out.state.status}); the worker job is queued and the Marketing Studio worker will pick it up by itself`);
    return;
  }
  const setUnlisted = arg("--set-unlisted");
  if (setUnlisted) {
    // Puts a video back to UNLISTED on the owner's written instruction, on the SAME video, and reopens its review.
    const cur = await getReview(db, setUnlisted);
    if (!cur) throw new Error("No such review");
    const c1 = await youtubeConnectionFor(db, cur.productId);
    if (!c1) throw new Error("No healthy YouTube connection");
    const t1 = await youtubeTokensForCall(INTERNAL_SCOPE, ACTOR, c1.productId, c1.id, { fetch }, db);
    const res = await setYoutubeVisibility({ videoId: cur.videoId, accessToken: t1.accessToken, privacy: "unlisted" }, { fetch });
    if (!res.ok) throw new Error(`Could not change visibility: ${res.reason}`);
    const live = await fetchYoutubeLiveMetadata({ videoId: cur.videoId, accessToken: t1.accessToken }, { fetch });
    console.log(`video ${cur.videoId} visibility now ${live.privacy}`);
    if (live.privacy !== "unlisted") throw new Error("YouTube does not show it as unlisted yet");
    const { approvedAt: _a, publicAt: _p, ...rest } = cur;
    void _a;
    void _p;
    await setSetting(reviewKey(setUnlisted), { ...rest, status: "unlisted_live", events: [...(cur.events ?? []), { at: new Date().toISOString(), event: "REVERTED_TO_UNLISTED", detail: "owner instruction: keep unlisted awaiting review" }] }, "review-operator", db);
    console.log("review reopened: unlisted_live");
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
    visibility: args.includes("--publish-approved") ? "public" : "unlisted",
    upload: args.includes("--upload-unlisted") || args.includes("--publish-approved"),
    log: (m) => console.log(m),
  });
  if (!out.ok) {
    console.log(`BLOCKED: ${out.blocked}. Nothing was made public.`);
    process.exitCode = 6;
    return;
  }
  if (!args.includes("--upload-unlisted") && !args.includes("--publish-approved")) console.log("PREPARED: nothing was sent. Add --upload-unlisted to upload it as UNLISTED for owner review.");
  else if (args.includes("--publish-approved")) console.log(`PUBLISHED (owner-approved video): https://www.youtube.com/watch?v=${out.videoId}`);
  else console.log(`UNLISTED REVIEW READY: https://www.youtube.com/watch?v=${out.videoId}\nNothing is public. The owner decides from the review email.`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => closeStudioDb());
