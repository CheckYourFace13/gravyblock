// YouTube for the shared iScream Studio channel. Three steps, each explicit, and the connection itself never uploads:
//   (default)   status: live channel verification and what is still missing (read-only, writes nothing)
//   --prepare   after the channel is connected: prepare the ONE controlled upload as "approval required" and run the checklist (sends nothing)
//   --publish --confirm-first-upload <slug>   the explicit controlled action: approve, schedule, upload that one video with live publishing on
//               only for the run, verify it on YouTube, start measurement, record the loop as proven
// ScribbleZap is first. Mibble Meadow is refused until ScribbleZap's upload is proven (uploaded, confirmed by YouTube, first measurement stored).
// Owner decisions are recorded as configuration only (nothing is sent):
//   ... marketing-youtube.ts --select scribblezap --made-for-kids no --privacy private
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-youtube.ts [...]
import { and, eq, like, sql } from "drizzle-orm";
import { closeStudioDb, ms, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { collectForPublication, currentMetrics } from "../../src/lib/marketing-studio/measurement/collect";
import { evaluateHealth, revokeAccount, usable } from "../../src/lib/marketing-studio/publishing/connections";
import { firstPostProven, prePublishChecks, recordFirstPostProven, type Check } from "../../src/lib/marketing-studio/publishing/first-post";
import { pinnedChannelId, reverifyYoutubeConnection, youtubeCallbackUrl, YOUTUBE_FIRST, youtubeOAuthConfigured, youtubeTokensForCall, verifyYoutubeConnection } from "../../src/lib/marketing-studio/publishing/oauth-youtube";
import { approvePublication, createPublication, LIVE_SETTING, runDuePublications, schedulePublication, setPublicationCopy, youtubeEnabledSetting, youtubeKidsSetting, youtubePrivacySetting } from "../../src/lib/marketing-studio/publishing/queue";
import { fetchYoutubeLiveMetadata, verifyYoutubeVideo, YT_SCOPES } from "../../src/lib/marketing-studio/publishing/youtube-api";
import { youtubeConnectionFor } from "../../src/lib/marketing-studio/publishing/youtube-share";
import { listReviews } from "../../src/lib/marketing-studio/publishing/video-review";
import { listProducts } from "../../src/lib/marketing-studio/repository";
import { getSetting, setSetting } from "../../src/lib/marketing-studio/runtime";
import { INTERNAL_SCOPE } from "../../src/lib/marketing-studio/scope";
import type { DemoRecord } from "../../src/lib/marketing-studio/video/demo/types";
import { staleMarkFor } from "../../src/lib/marketing-studio/video/stale";

const ACTOR = "youtube-operator";
const args = process.argv.slice(2);
const arg = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const PREPARE = args.includes("--prepare");
const PUBLISH = args.includes("--publish");
const CONFIRM = arg("--confirm-first-upload");
const show = (checks: Check[]) => checks.forEach((c) => console.log(`  ${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.detail ? `: ${c.detail}` : ""}`));

async function main() {
  const db = requireStudioDb();
  const products = await listProducts(INTERNAL_SCOPE, db);
  console.log(`Google OAuth client configured on the server: ${youtubeOAuthConfigured()}`);
  console.log(`redirect URI registered with Google must be exactly: ${youtubeCallbackUrl()}`);
  console.log(`scopes requested: ${YT_SCOPES.join(" ")}`);

  if (args.includes("--reverify")) {
    // Re-check an authorization that was kept unverified (channel read failed right after consent). No new sign-in needed. Nothing is uploaded.
    for (const slug of YOUTUBE_FIRST.order) {
      const p = products.find((x) => x.slug === slug);
      if (!p) continue;
      const r = await reverifyYoutubeConnection(INTERNAL_SCOPE, ACTOR, p.id, YOUTUBE_FIRST.expectedHandle, { fetch }, db);
      console.log(`${p.name}: ${r.promoted ? "VERIFIED and connected" : "not verified"}: ${r.reason}${r.channel ? ` [${r.channel.title} ${r.channel.handle ?? ""} ${r.channel.id}]` : ""}`);
    }
  }

  if (args.includes("--remove-unverified")) {
    // Revoke at Google and remove ONLY kept-unverified rows (never a connected one), then show what is left.
    const stale = await db.select().from(ms.msConnections).where(and(eq(ms.msConnections.platform, "youtube"), like(ms.msConnections.externalAccountId, "unverified-%")));
    for (const row of stale) {
      await revokeAccount(INTERNAL_SCOPE, ACTOR, row.productId, row.id, db, { fetch });
      const [after] = await db.select({ detail: ms.msAuditEvents.detail }).from(ms.msAuditEvents).where(and(eq(ms.msAuditEvents.entityId, row.id), eq(ms.msAuditEvents.action, "connection.revoke"))).limit(1);
      console.log(`revoked ${row.externalAccountId}; Google revoked: ${JSON.stringify((after?.detail as { googleRevoked?: boolean } | undefined)?.googleRevoked ?? null)}`);
      await db.delete(ms.msConnections).where(and(eq(ms.msConnections.id, row.id), like(ms.msConnections.externalAccountId, "unverified-%")));
      console.log(`removed row ${row.externalAccountId}`);
    }
    const left = await db.select({ label: ms.msConnections.accountLabel, ext: ms.msConnections.externalAccountId, status: ms.msConnections.status, health: ms.msConnections.healthStatus }).from(ms.msConnections).where(eq(ms.msConnections.platform, "youtube"));
    console.log(`YouTube connections now: ${left.length}`);
    left.forEach((c) => console.log(`  ${c.label} ${c.ext} status ${c.status} health ${c.health}`));
  }

  const auditSlug = arg("--audit-live");
  if (auditSlug) {
    // Read-only audit of an uploaded video: live YouTube metadata against what was approved, and what the application stored. Changes nothing.
    const p = products.find((x) => x.slug === auditSlug);
    if (!p) throw new Error(`No Studio product ${auditSlug}`);
    const all = await db.select().from(ms.msPublications).where(and(eq(ms.msPublications.productId, p.id), eq(ms.msPublications.platform, "youtube")));
    // A replacement keeps the flawed version on the channel as a superseded, unlisted video: only the current one is audited.
    const superseded = new Set((await listReviews(db)).filter((r) => r.status === "superseded").map((r) => r.publicationId));
    const pubs = all.filter((x) => !superseded.has(x.id) && x.status !== "cancelled");
    const pub = pubs.find((x) => x.status === "published");
    const expectPrivacy = arg("--expect-privacy") ?? "public";
    const checks: Check[] = [{ name: "exactly one current YouTube publication exists for this product", ok: pubs.length === 1, detail: `${pubs.length} current (${pubs.map((x) => `${x.id.slice(0, 8)} ${x.status}`).join(", ")}); ${all.length - pubs.length} superseded or cancelled` }];
    if (pub && pub.externalPostId) {
      const conn = await youtubeConnectionFor(db, p.id);
      if (!conn) throw new Error("No healthy YouTube connection to read with");
      const t = await youtubeTokensForCall(INTERNAL_SCOPE, ACTOR, conn.productId, conn.id, { fetch }, db);
      const live = await fetchYoutubeLiveMetadata({ videoId: pub.externalPostId, accessToken: t.accessToken }, { fetch });
      const cur = await currentMetrics(db, pub.id);
      const want = (pub.caption ?? "").trim();
      const kidsLive = live.selfDeclaredMadeForKids ?? live.madeForKids;
      checks.push(
        { name: "stored as published", ok: pub.status === "published", detail: pub.status },
        { name: "external video id stored", ok: Boolean(pub.externalPostId), detail: pub.externalPostId },
        { name: "external url stored", ok: Boolean(pub.externalUrl), detail: pub.externalUrl ?? "missing" },
        { name: "first measurement snapshot stored", ok: cur.snapshots >= 1, detail: `${cur.snapshots} snapshot(s)` },
        { name: "video exists on YouTube", ok: live.exists, detail: live.reason ?? "" },
        { name: "live title equals stored approved title", ok: live.title === pub.title, detail: JSON.stringify(live.title) },
        { name: "live description equals stored approved description", ok: (live.description ?? "").trim() === want, detail: `${(live.description ?? "").length} chars` },
        { name: "live description holds the tracked URL", ok: Boolean(pub.ctaUrl) && (live.description ?? "").includes(pub.ctaUrl ?? "\0"), detail: pub.ctaUrl ?? "" },
        { name: `visibility is ${expectPrivacy}`, ok: live.privacy === expectPrivacy, detail: live.privacy ?? "unknown" },
        { name: "made for kids is NO", ok: kidsLive === false, detail: `madeForKids ${live.madeForKids}, selfDeclared ${live.selfDeclaredMadeForKids}` },
        { name: "channel id is the pinned iScream Studio channel", ok: live.channelId === pinnedChannelId(), detail: live.channelId ?? "unknown" },
      );
      console.log(`\nLIVE TITLE: ${live.title}\nLIVE DESCRIPTION:\n${live.description}`);
    } else checks.push({ name: "a published publication with an external id exists", ok: false, detail: "none" });
    console.log("\nLIVE AUDIT (read-only)");
    show(checks);
    console.log(checks.every((c) => c.ok) ? "AUDIT PASSED" : "AUDIT FAILED");
    if (!checks.every((c) => c.ok)) process.exitCode = 10;
    return;
  }

  const select = arg("--select");
  if (select) {
    const p = products.find((x) => x.slug === select);
    if (!p) throw new Error(`No Studio product ${select}`);
    const kids = arg("--made-for-kids");
    const privacy = arg("--privacy");
    if (kids !== "yes" && kids !== "no") throw new Error("--select needs --made-for-kids yes|no (an explicit owner declaration)");
    if (privacy !== "private" && privacy !== "unlisted" && privacy !== "public") throw new Error("--select needs --privacy private|unlisted|public (there is no default)");
    await setSetting(youtubeEnabledSetting(p.id), true, "owner-cli", db);
    await setSetting(youtubeKidsSetting(p.id), kids === "yes", "owner-cli", db);
    await setSetting(youtubePrivacySetting(p.id), privacy, "owner-cli", db);
    console.log(`YouTube selected for ${p.name}; made for kids: ${kids}; visibility: ${privacy}. Nothing was uploaded.`);
  }

  let target: (typeof products)[number] | undefined;
  for (const slug of YOUTUBE_FIRST.order) {
    const p = products.find((x) => x.slug === slug);
    if (!p) {
      console.log(`\n${slug}: no Studio product`);
      continue;
    }
    const kids = await getSetting<boolean | null>(youtubeKidsSetting(p.id), null, db);
    const privacy = await getSetting<string | null>(youtubePrivacySetting(p.id), null, db);
    const proven = await firstPostProven(db, p.id, "youtube");
    console.log(`\n${p.name}: first YouTube upload proven ${proven}; selected ${await getSetting<boolean>(youtubeEnabledSetting(p.id), false, db)}; made-for-kids ${kids === null ? "NOT SET" : kids ? "yes" : "no"}; visibility ${privacy ?? "NOT SET"}`);
    if (!target && !proven) target = p;
  }
  if (!target) {
    console.log("\nBoth games have a proven first YouTube upload.");
    return;
  }
  console.log(`\nfirst-upload candidate: ${target.name}`);
  const conns = await db.select().from(ms.msConnections).where(and(eq(ms.msConnections.productId, target.id), eq(ms.msConnections.platform, "youtube")));
  const conn = conns.find((c) => usable(evaluateHealth(c)));
  if (!conn) {
    console.log(`BLOCKED (waiting on the owner): no healthy YouTube channel is connected to ${target.name}. Open the product page and press Connect with YouTube, channel "${YOUTUBE_FIRST.expectedHandle}".`);
    process.exitCode = 2;
    return;
  }
  console.log(`connected: ${conn.accountLabel}, channel id ${conn.externalAccountId}, health ${evaluateHealth(conn)}`);
  if (!youtubeOAuthConfigured()) {
    console.log("BLOCKED: the Google OAuth client is not configured on the server.");
    process.exitCode = 2;
    return;
  }
  console.log("\nCHANNEL VERIFICATION (live, read-only)");
  const own = await verifyYoutubeConnection(INTERNAL_SCOPE, ACTOR, conn, YOUTUBE_FIRST.expectedHandle, { fetch }, db);
  show(own);
  if (own.some((c) => !c.ok)) {
    console.log("BLOCKED: the connected channel is not verified as the iScream Studio channel. Nothing was prepared.");
    process.exitCode = 3;
    return;
  }
  if (!PREPARE && !PUBLISH) {
    console.log("STATUS ONLY: the channel is connected and verified. Re-run with --prepare to prepare the one upload (still sends nothing).");
    return;
  }

  const kids = await getSetting<boolean | null>(youtubeKidsSetting(target.id), null, db);
  const privacy = await getSetting<string | null>(youtubePrivacySetting(target.id), null, db);
  const gates: Check[] = [
    { name: "YouTube is selected for this product", ok: await getSetting<boolean>(youtubeEnabledSetting(target.id), false, db), detail: "" },
    { name: "made-for-kids declaration set by the owner", ok: typeof kids === "boolean", detail: kids === null ? "not set" : String(kids) },
    { name: "explicit visibility set by the owner", ok: privacy === "private" || privacy === "unlisted" || privacy === "public", detail: privacy ?? "not set" },
  ];
  console.log("\nOWNER GATES");
  show(gates);
  if (gates.some((c) => !c.ok)) {
    console.log("BLOCKED (waiting on the owner): a gate above is not set. Nothing was prepared.");
    process.exitCode = 4;
    return;
  }

  const [video] = await db.select().from(ms.msVideos).where(and(eq(ms.msVideos.productId, target.id), sql`${ms.msVideos.storyboard}->>'kind' = 'demo'`, eq(ms.msVideos.status, "approved"))).limit(1);
  if (!video) {
    console.log(`BLOCKED (waiting on the owner): ${target.name} has no owner-approved demo video. Approve it on the Review page.`);
    process.exitCode = 5;
    return;
  }
  const { publication, duplicate } = await createPublication(INTERNAL_SCOPE, ACTOR, target.id, { videoId: video.id, platform: "youtube", mode: "direct", connectionId: conn.id }, db);
  const newTitle = arg("--title");
  const newDescription = arg("--description");
  if (newTitle && newDescription && publication.status !== "published") {
    Object.assign(publication, await setPublicationCopy(INTERNAL_SCOPE, ACTOR, target.id, publication.id, { title: newTitle, description: newDescription.replace(/\\n/g, "\n") }, db));
    console.log("owner-written title and description applied (tracked link kept)");
  }
  const facts = (await db.select().from(ms.msProductFacts).where(eq(ms.msProductFacts.productId, target.id))).filter((f) => f.status === "current");
  const done = await db.select({ id: ms.msPublications.id }).from(ms.msPublications).where(and(eq(ms.msPublications.productId, target.id), eq(ms.msPublications.platform, "youtube"), eq(ms.msPublications.status, "published")));
  const checks = prePublishChecks({
    productSlug: target.slug,
    productId: target.id,
    publication,
    connection: conn,
    video: { assetId: video.assetId, status: video.status, qaPassed: Boolean((video.qa as { passed?: boolean } | null)?.passed), stale: Boolean(await staleMarkFor(db, video.id)), record: video.storyboard as DemoRecord },
    facts: facts.map((f) => ({ id: f.id, value: f.factValue, verified: Boolean(f.verifiedAt) })),
    alreadyPublishedForProduct: done.length,
  });
  console.log("\nPRE-UPLOAD CHECKLIST");
  show(checks);
  console.log(`\nTITLE: ${publication.title}\nDESCRIPTION (exactly as it would be uploaded):\n${publication.caption}\nVISIBILITY: ${privacy}   MADE FOR KIDS: ${kids}\n\nprepared publication: ${publication.id} (${publication.status})${duplicate ? " [existing]" : ""}`);
  if (checks.some((c) => !c.ok)) {
    console.log("BLOCKED: a pre-upload check failed. Nothing was sent.");
    process.exitCode = 6;
    return;
  }
  if (!PUBLISH) {
    console.log("PREPARED: everything passed and nothing was sent. The only way to upload is: --publish --confirm-first-upload " + target.slug);
    return;
  }
  if (CONFIRM !== target.slug) {
    console.log(`REFUSED: uploading needs the explicit controlled action: --publish --confirm-first-upload ${target.slug}`);
    process.exitCode = 7;
    return;
  }

  // The controlled action: approve, schedule, upload once with live publishing on only for the duration, then verify on YouTube and measure.
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
    process.exitCode = 8;
    return;
  }
  const t = await youtubeTokensForCall(INTERNAL_SCOPE, ACTOR, target.id, conn.id, { fetch }, db);
  const v = await verifyYoutubeVideo({ videoId: after.externalPostId, channelId: conn.externalAccountId ?? "", accessToken: t.accessToken, requirePublic: privacy === "public" }, { fetch });
  console.log(`externally verified on YouTube: ${v.live} (channel match ${v.onExpectedChannel}, upload ${v.uploadStatus}, visibility ${v.privacy})${v.permalink ? ` ${v.permalink}` : ""}${v.reason ? ` ${v.reason}` : ""}`);
  if (!v.live) {
    process.exitCode = 9;
    return;
  }
  const col = await collectForPublication(INTERNAL_SCOPE, ACTOR, target.id, after.id, undefined, db);
  const cur = await currentMetrics(db, after.id);
  console.log(`measurement started: ${col.collected ? "first snapshot stored" : `not yet (${col.reason})`}; snapshots ${cur.snapshots}`);
  for (const [k, m] of Object.entries(cur.metrics)) console.log(`  ${k}: ${m.value ?? "unknown"} [${m.status.toUpperCase()}]`);
  if (col.collected) {
    await recordFirstPostProven(db, ACTOR, target.id, after.id, { videoId: after.externalPostId, permalink: v.permalink, privacy: v.privacy }, "youtube");
    console.log(`YOUTUBE LOOP PROVEN for ${target.name}.${target.slug === YOUTUBE_FIRST.order[0] ? " Mibble Meadow may now be prepared." : ""}`);
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => closeStudioDb());
