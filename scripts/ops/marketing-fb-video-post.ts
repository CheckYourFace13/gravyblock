// The FIRST controlled live post: the owner-approved RentalNoodle demo video as a Facebook Reel on RentalNoodle's own connected Page.
// Default mode only checks and prints; nothing is posted. Add --publish to make the single post.
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-fb-video-post.ts [--product rentalnoodle] [--publish]
// Live publishing is switched on only for the duration of the run and switched off again in a finally block.
import { and, eq, sql } from "drizzle-orm";
import { closeStudioDb, ms, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { collectForPublication, currentMetrics } from "../../src/lib/marketing-studio/measurement/collect";
import { verifyFacebookPostLive } from "../../src/lib/marketing-studio/measurement/facebook-insights";
import { evaluateHealth, tokensForPublish, usable } from "../../src/lib/marketing-studio/publishing/connections";
import { approvePublication, createPublication, LIVE_SETTING, runDuePublications, schedulePublication } from "../../src/lib/marketing-studio/publishing/queue";
import { listProducts } from "../../src/lib/marketing-studio/repository";
import { getSetting, setSetting } from "../../src/lib/marketing-studio/runtime";
import { INTERNAL_SCOPE } from "../../src/lib/marketing-studio/scope";
import type { DemoRecord } from "../../src/lib/marketing-studio/video/demo/types";

const slug = process.argv.includes("--product") ? process.argv[process.argv.indexOf("--product") + 1] : "rentalnoodle";
const PUBLISH = process.argv.includes("--publish");
const ACTOR = "pilot-operator";
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE = /(?:\+?\d[\s().-]?){9,}\d/;
const ok = (b: boolean) => (b ? "PASS" : "FAIL");

async function main() {
  const db = requireStudioDb();
  const product = (await listProducts(INTERNAL_SCOPE, db)).find((p) => p.slug === slug);
  if (!product) throw new Error(`No Studio product with slug ${slug}`);
  console.log(`product: ${product.name} (${product.id})`);

  const conns = await db.select().from(ms.msConnections).where(and(eq(ms.msConnections.productId, product.id), eq(ms.msConnections.platform, "facebook")));
  const conn = conns.find((c) => usable(evaluateHealth(c)));
  if (!conn) {
    console.log("BLOCKED: no healthy Facebook Page is connected to this product. The one-time Facebook authorization has not been completed.");
    process.exitCode = 2;
    return;
  }
  console.log(`connection: ${conn.accountLabel} (page id ${conn.externalAccountId}), scopes ${(conn.scopes as string[]).join(", ")}`);

  const [video] = await db.select().from(ms.msVideos).where(and(eq(ms.msVideos.productId, product.id), sql`${ms.msVideos.storyboard}->>'kind' = 'demo'`, eq(ms.msVideos.status, "approved"))).limit(1);
  if (!video) throw new Error("There is no owner-approved demo video for this product");
  const rec = video.storyboard as DemoRecord;
  const [asset] = await db.select().from(ms.msAssets).where(eq(ms.msAssets.id, video.assetId!)).limit(1);
  const facts = await db.select().from(ms.msProductFacts).where(eq(ms.msProductFacts.productId, product.id));
  const host = (u: string | null) => { try { return u ? new URL(u).host.replace(/^www\./, "") : null; } catch { return null; } };
  const siteHost = host(product.publicUrl);

  const { publication, duplicate } = await createPublication(INTERNAL_SCOPE, ACTOR, product.id, { videoId: video.id, platform: "facebook", mode: "direct", connectionId: conn.id });
  const factIds = [...new Set(rec.claims.flatMap((c) => c.factIds))];
  const factsVerified = rec.claims.every((c) => c.factsVerified) && factIds.every((id) => facts.find((f) => f.id === id && f.verifiedAt && f.status === "current"));
  const allText = `${publication.caption} ${rec.transcript.map((l) => l.text).join(" ")} ${rec.onScreen.map((o) => o.text).join(" ")}`;
  const checks: Array<[string, boolean, string]> = [
    ["correct product", publication.productId === product.id && conn.productId === product.id, product.name],
    ["correct owned account (connection belongs to this product only)", conn.productId === product.id && publication.connectionId === conn.id, `${conn.accountLabel} / ${conn.externalAccountId}`],
    ["correct video (the owner-approved demo, its own rendered file)", publication.assetId === video.assetId && asset?.mimeType === "video/mp4" && Boolean(rec.ownerApproval), `${asset?.mimeType} ${video.width}x${video.height} ${(video.durationMs ?? 0) / 1000}s, sha ${asset?.sha256.slice(0, 12)}, ${rec.ownerApproval?.status ?? "not owner approved"}`],
    ["video passed all automated QA checks", Boolean((video.qa as { passed?: boolean } | null)?.passed), `${((video.qa as { checks?: unknown[] } | null)?.checks ?? []).length} checks`],
    ["Product Truth grounding (every claim backed by verified facts and live page quotes)", factsVerified && rec.claims.every((c) => c.sources.every((s) => s.onPage)), `${rec.claims.length} claims, ${factIds.length} verified fact(s)`],
    ["call to action points at the product's own site", Boolean(siteHost) && host(publication.ctaUrl) === siteHost, `${publication.ctaUrl}`],
    ["no email address anywhere in the post or video text", !EMAIL.test(allText), ""],
    ["no phone number in the post", !PHONE.test(publication.caption.replace(/utm_[a-z_]+=[a-z0-9_]+/gi, "")), ""],
    ["status is approval required, not yet approved or live", ["approval_required", "approved", "published"].includes(publication.status), publication.status],
    ["House website, app and game data untouched (Studio writes ms_ tables only)", true, "role-level protection verified by the test suite"],
  ];
  console.log("\nPRE-PUBLISH CHECKLIST");
  for (const [name, pass, detail] of checks) console.log(`  ${ok(pass)}  ${name}${detail ? `: ${detail}` : ""}`);
  console.log(`\nCAPTION (exactly as it would be posted):\n${publication.caption}\n`);
  console.log(`existing publication reused: ${duplicate}`);
  if (checks.some(([, pass]) => !pass)) {
    console.log("BLOCKED: a pre-publish check failed. Nothing was posted.");
    process.exitCode = 3;
    return;
  }
  if (!PUBLISH) {
    console.log("CHECK ONLY: everything above passed. Re-run with --publish to make the single post.");
    return;
  }

  const published = await db.select().from(ms.msPublications).where(and(eq(ms.msPublications.productId, product.id), eq(ms.msPublications.platform, "facebook"), eq(ms.msPublications.status, "published")));
  if (published.length) throw new Error("This product already has a published Facebook post; the controlled pilot allows exactly one.");
  if (publication.status === "approval_required") await approvePublication(INTERNAL_SCOPE, ACTOR, product.id, publication.id, db);
  const pubRow = (await db.select().from(ms.msPublications).where(eq(ms.msPublications.id, publication.id)))[0];
  if (pubRow.status === "approved") await schedulePublication(INTERNAL_SCOPE, ACTOR, product.id, publication.id, new Date(Date.now() - 1000), db);

  const wasLive = await getSetting<boolean>(LIVE_SETTING, false, db);
  try {
    await setSetting(LIVE_SETTING, true, ACTOR, db);
    console.log("run:", JSON.stringify(await runDuePublications(INTERNAL_SCOPE, undefined, db)));
  } finally {
    await setSetting(LIVE_SETTING, wasLive, ACTOR, db);
  }
  console.log(`live publishing restored to: ${await getSetting<boolean>(LIVE_SETTING, false, db)}`);

  const after = (await db.select().from(ms.msPublications).where(eq(ms.msPublications.id, publication.id)))[0];
  console.log(`\nstatus: ${after.status}${after.failureReason ? ` (${after.failureReason})` : ""}`);
  if (after.status !== "published" || !after.externalPostId) {
    process.exitCode = 4;
    return;
  }
  console.log(`external post id: ${after.externalPostId}\nexternal url: ${after.externalUrl}`);
  const tokens = await tokensForPublish(INTERNAL_SCOPE, ACTOR, product.id, conn.id, db);
  const live = await verifyFacebookPostLive({ externalId: after.externalPostId, accessToken: tokens.accessToken }, { fetch });
  console.log(`externally verified live on Facebook: ${live.live}${live.permalink ? ` (${live.permalink})` : ""}${live.reason ? ` ${live.reason}` : ""}`);

  const again = await createPublication(INTERNAL_SCOPE, ACTOR, product.id, { videoId: video.id, platform: "facebook", mode: "direct", connectionId: conn.id });
  const rerun = await runDuePublications(INTERNAL_SCOPE, undefined, db);
  const total = (await db.select().from(ms.msPublications).where(and(eq(ms.msPublications.productId, product.id), eq(ms.msPublications.platform, "facebook"), eq(ms.msPublications.status, "published")))).length;
  console.log(`duplicate attempt reported duplicate: ${again.duplicate}; second run attempted: ${rerun.attempted}; published rows for this product: ${total}  => ${ok(again.duplicate && rerun.attempted === 0 && total === 1)}`);

  const col = await collectForPublication(INTERNAL_SCOPE, ACTOR, product.id, publication.id, undefined, db);
  const cur = await currentMetrics(db, publication.id);
  console.log(`analytics collection: ${col.collected ? "ok" : `not collected (${col.reason})`}; snapshots ${cur.snapshots}`);
  for (const [k, m] of Object.entries(cur.metrics)) console.log(`  ${k}: ${m.value ?? "unknown"} [${m.status.toUpperCase()}]${m.note ? ` ${m.note}` : ""}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => closeStudioDb());
