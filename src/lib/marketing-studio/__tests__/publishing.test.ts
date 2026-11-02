// Needs a scratch database with the schema pushed (name must contain "test"):
//   STUDIO_TEST_DATABASE_URL=postgresql://.../gb_studio_test npx tsx --test src/lib/marketing-studio/__tests__/publishing.test.ts
import "./setup";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { decryptSecret } from "../credentials";
import { DISABLE_FILE, STUDIO_DIRS } from "../config";
import { closeStudioDb, ms, requireStudioDb } from "../db";
import { createProduct } from "../repository";
import { setKillSwitch, setSetting } from "../runtime";
import { customerScope, INTERNAL_SCOPE, StudioAccessError } from "../scope";
import { ADAPTERS } from "../publishing/adapters";
import { connectAccount, evaluateHealth, refreshConnectionHealth, revokeAccount, tokensForPublish } from "../publishing/connections";
import { crc32 } from "../publishing/export";
import { PLATFORM_SPECS, validateForPlatform } from "../publishing/platforms";
import { approvePublication, cancelPublication, createPublication, exportPublication, LIVE_SETTING, MIN_GAP_MS, runDuePublications, schedulePublication } from "../publishing/queue";

const FB_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts"];
const SECRET = "EAAB-super-secret-page-token-123456";

// ---- pure tests (no database) -------------------------------------------------------------------------------------------

describe("platform registry honesty", () => {
  test("only Facebook Pages claims direct posting without a platform approval; the others require one", () => {
    assert.equal(PLATFORM_SPECS.facebook.direct, "available_with_healthy_connection");
    for (const p of ["instagram", "youtube", "tiktok"] as const) assert.equal(PLATFORM_SPECS[p].direct, "requires_platform_approval", p);
  });
  test("every platform declares scopes, limits, approval notes and export notes", () => {
    for (const s of Object.values(PLATFORM_SPECS)) {
      assert.ok(s.auth.requiredScopes.length > 0 && s.auth.requiredScopes.every((x) => s.auth.allowedScopes.includes(x)), s.platform);
      assert.ok(s.rateLimit.ourCap24h > 0 && (s.rateLimit.max24h === null || s.rateLimit.ourCap24h <= s.rateLimit.max24h));
      assert.ok(s.approvalNote.length > 20 && s.exportNotes.length > 0 && s.accountRequirements.length > 0 && s.verify.length > 0);
    }
  });
  test("adapters for platforms without approval refuse and never touch the network", async () => {
    const realFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => { calls++; throw new Error("network must not be used"); }) as typeof fetch;
    try {
      for (const p of ["instagram", "youtube", "tiktok"] as const) {
        const r = await ADAPTERS[p].publish({ platform: p, externalAccountId: "x", media: { kind: "video", bytes: Buffer.from("x"), mime: "video/mp4", fileName: "a.mp4" }, caption: "c", accessToken: "t" }, { fetch: globalThis.fetch });
        assert.equal(r.ok, false);
        assert.ok(!r.ok && r.unsupported && /export/i.test(r.reason));
      }
      assert.equal(calls, 0);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("platform formatting rules", () => {
  const v = { kind: "video" as const, width: 1080, height: 1920, durationSec: 30 };
  const img = (w: number, h: number) => ({ kind: "image" as const, width: w, height: h });
  test("supported combinations pass", () => {
    assert.deepEqual(validateForPlatform("facebook", img(1080, 1080), { caption: "hello" }), []);
    assert.deepEqual(validateForPlatform("instagram", img(1080, 1350), { caption: "hello" }), []);
    assert.deepEqual(validateForPlatform("facebook", v, { caption: "hello" }), []);
    assert.deepEqual(validateForPlatform("youtube", v, { caption: "hello", title: "A title" }), []);
    assert.deepEqual(validateForPlatform("tiktok", v, { caption: "hello" }), []);
  });
  test("unsupported media, ratios, lengths and text are reported, not silently changed", () => {
    assert.ok(validateForPlatform("youtube", img(1080, 1080), { caption: "x", title: "t" }).some((p) => /does not accept images/.test(p)));
    assert.ok(validateForPlatform("tiktok", img(1080, 1080), { caption: "x" }).some((p) => /does not accept images/.test(p)));
    assert.ok(validateForPlatform("facebook", img(1920, 1080), { caption: "x" }).some((p) => /aspect ratio/.test(p)));
    assert.ok(validateForPlatform("youtube", { ...v, durationSec: 95 }, { caption: "x", title: "t" }).some((p) => /over the 60s/.test(p)));
    assert.ok(validateForPlatform("instagram", img(1080, 1080), { caption: "x".repeat(2300) }).some((p) => /2200/.test(p)));
    assert.ok(validateForPlatform("youtube", v, { caption: "x" }).some((p) => /needs a title/.test(p)));
    assert.ok(validateForPlatform("youtube", v, { caption: "x", title: "t".repeat(101) }).some((p) => /100/.test(p)));
    assert.ok(validateForPlatform("facebook", v, { caption: "" }).some((p) => /empty/.test(p)));
    assert.ok(validateForPlatform("facebook", v, { caption: "x", ctaUrl: "http://example.com" }).some((p) => /https/.test(p)));
  });
});

describe("connection health", () => {
  const base = { status: "connected", revokedAt: null, tokenExpiresAt: null as Date | null, healthStatus: "ok" };
  test("expired, expiring, revoked and error states", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    assert.equal(evaluateHealth(base, now), "ok");
    assert.equal(evaluateHealth({ ...base, tokenExpiresAt: new Date("2025-12-31T00:00:00Z") }, now), "expired");
    assert.equal(evaluateHealth({ ...base, tokenExpiresAt: new Date("2026-01-04T00:00:00Z") }, now), "expiring");
    assert.equal(evaluateHealth({ ...base, revokedAt: now }, now), "revoked");
    assert.equal(evaluateHealth({ ...base, status: "error" }, now), "error");
  });
});

describe("static isolation", () => {
  test("no import path from Marketing Studio to site writes, the old Facebook helper, the growth engine or outreach", () => {
    const r = spawnSync("node", ["scripts/ops/check-marketing-isolation.mjs"], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });
});

// ---- database tests -------------------------------------------------------------------------------------------------------

const HAVE_DB = Boolean(process.env.STUDIO_TEST_DATABASE_URL);
const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 4, 56, 0, 0, 4, 56]), Buffer.alloc(64, 9)]);

type Fetch = typeof fetch;
function stubFetch(handler: (url: string, init?: RequestInit) => Response) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  }) as Fetch;
  return { f, calls };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("publishing (database)", { skip: !HAVE_DB }, () => {
  const A = customerScope(ORG_A);
  const B = customerScope(ORG_B);
  let internalId = "";
  let aId = "";
  let creativeId = "";
  let videoId = "";
  let aCreativeId = "";
  let conn: { id: string } = { id: "" };

  async function mkProduct(scope: typeof A | typeof INTERNAL_SCOPE, name: string) {
    const db = requireStudioDb();
    const p = await createProduct(scope, "t", { name, kind: "saas" });
    const dir = path.join(STUDIO_DIRS.media, p.id);
    mkdirSync(dir, { recursive: true });
    const stem = `${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`.padEnd(63, "0").slice(0, 63);
    const sha = `${stem}a`;
    writeFileSync(path.join(dir, `${sha}.png`), PNG);
    const [asset] = await db.insert(ms.msAssets).values({ productId: p.id, kind: "render_image", storagePath: `${p.id}/${sha}.png`, sha256: sha, mimeType: "image/png", bytes: PNG.length, width: 1080, height: 1080, provenance: "rendered", originalName: "c.png" }).returning();
    const [concept] = await db.insert(ms.msConcepts).values({ productId: p.id, family: "cta", headline: "Headline", caption: "A grounded caption https://example.com/x", ctaText: "Go", ctaUrl: "https://example.com/x", status: "ready_for_review" }).returning();
    const [creative] = await db.insert(ms.msCreatives).values({ productId: p.id, conceptId: concept.id, assetId: asset.id, sizeKey: "square", width: 1080, height: 1080, templateFamily: "cta", templateVersion: "t", status: "approved" }).returning();
    const vsha = `${stem}b`;
    writeFileSync(path.join(dir, `${vsha}.mp4`), Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypmp42"), Buffer.alloc(40)]));
    const [vasset] = await db.insert(ms.msAssets).values({ productId: p.id, kind: "render_video", storagePath: `${p.id}/${vsha}.mp4`, sha256: vsha, mimeType: "video/mp4", bytes: 52, width: 1080, height: 1920, provenance: "rendered", originalName: "v.mp4" }).returning();
    const [video] = await db.insert(ms.msVideos).values({ productId: p.id, conceptId: concept.id, title: "V", storyboard: {}, targetSeconds: 30, assetId: vasset.id, width: 1080, height: 1920, durationMs: 30000, status: "approved" }).returning();
    return { product: p, creative, video, concept };
  }
  async function healthyFacebook(productId: string, accountId = "page-1", over: { tokenExpiresAt?: Date | null } = {}) {
    return connectAccount(INTERNAL_SCOPE, "t", productId, { platform: "facebook", accountLabel: "Page", externalAccountId: accountId, tokens: { accessToken: SECRET }, scopes: FB_SCOPES, tokenExpiresAt: over.tokenExpiresAt ?? new Date(Date.now() + 60 * 86_400_000) });
  }
  async function scheduledDirect(productId: string, creative: string, connectionId: string, when = new Date(Date.now() - 1000)) {
    const { publication } = await createPublication(INTERNAL_SCOPE, "t", productId, { creativeId: creative, platform: "facebook", mode: "direct", connectionId });
    await approvePublication(INTERNAL_SCOPE, "t", productId, publication.id);
    await schedulePublication(INTERNAL_SCOPE, "t", productId, publication.id, when);
    return publication.id;
  }
  const row = async (id: string) => (await requireStudioDb().select().from(ms.msPublications).where(eq(ms.msPublications.id, id)))[0];

  before(async () => {
    const db = requireStudioDb();
    for (const t of [ms.msAuditEvents, ms.msPublications, ms.msConnections, ms.msVideos, ms.msCreatives, ms.msConcepts, ms.msAssets, ms.msSettings, ms.msProducts]) await db.delete(t);
    const i = await mkProduct(INTERNAL_SCOPE, "Internal Pub");
    internalId = i.product.id;
    creativeId = i.creative.id;
    videoId = i.video.id;
    const a = await mkProduct(A, "Org A Pub");
    aId = a.product.id;
    aCreativeId = a.creative.id;
    conn = await healthyFacebook(internalId);
  });
  after(async () => {
    rmSync(STUDIO_DIRS.root, { recursive: true, force: true });
    await closeStudioDb();
  });

  test("a new publication is APPROVAL REQUIRED, never approved or scheduled by default", async () => {
    const { publication, duplicate } = await createPublication(INTERNAL_SCOPE, "t", internalId, { creativeId, platform: "instagram" });
    assert.equal(duplicate, false);
    assert.equal(publication.status, "approval_required");
    assert.equal(publication.mode, "export");
    assert.equal(publication.scheduledFor, null);
    assert.equal(publication.approvedBy, null);
  });

  test("only approved creatives and videos can be queued; unapproved ones are refused", async () => {
    const db = requireStudioDb();
    await db.update(ms.msCreatives).set({ status: "ready_for_review" }).where(eq(ms.msCreatives.id, creativeId));
    await assert.rejects(createPublication(INTERNAL_SCOPE, "t", internalId, { creativeId, platform: "facebook" }), /approved/);
    await db.update(ms.msCreatives).set({ status: "approved" }).where(eq(ms.msCreatives.id, creativeId));
  });

  test("unsupported-platform fallback: direct posting to YouTube, Instagram or TikTok is refused with an export instruction; export works", async () => {
    for (const platform of ["youtube", "instagram", "tiktok"]) {
      await assert.rejects(createPublication(INTERNAL_SCOPE, "t", internalId, { videoId, platform, mode: "direct", connectionId: conn.id }), /export|connection|Direct posting is not available/i);
    }
    const yt = await createPublication(INTERNAL_SCOPE, "t", internalId, { videoId, platform: "youtube", mode: "export" });
    assert.equal(yt.publication.mode, "export");
    assert.equal(yt.publication.title, "Headline");
    await assert.rejects(createPublication(INTERNAL_SCOPE, "t", internalId, { creativeId, platform: "youtube" }), /does not accept images/);
  });

  test("duplicate prevention: the same post is stored once, even when created concurrently", async () => {
    const [x, y, z] = await Promise.all([1, 2, 3].map(() => createPublication(INTERNAL_SCOPE, "t", internalId, { videoId, platform: "tiktok", mode: "export" })));
    assert.equal([x, y, z].filter((r) => !r.duplicate).length, 1);
    assert.equal(new Set([x, y, z].map((r) => r.publication.id)).size, 1);
  });

  test("approve then schedule; a second post inside the minimum gap is a schedule conflict", async () => {
    const db = requireStudioDb();
    const i2 = await mkProduct(INTERNAL_SCOPE, "Gap Product");
    const c = await healthyFacebook(i2.product.id, "gap-page");
    const when = new Date(Date.now() + 3 * 3_600_000);
    const first = await createPublication(INTERNAL_SCOPE, "t", i2.product.id, { creativeId: i2.creative.id, platform: "facebook", mode: "direct", connectionId: c.id });
    await assert.rejects(schedulePublication(INTERNAL_SCOPE, "t", i2.product.id, first.publication.id, when), /approved/);
    await approvePublication(INTERNAL_SCOPE, "t", i2.product.id, first.publication.id);
    await assert.rejects(approvePublication(INTERNAL_SCOPE, "t", i2.product.id, first.publication.id), /cannot be approved/);
    await schedulePublication(INTERNAL_SCOPE, "t", i2.product.id, first.publication.id, when);
    const [vAsset] = await db.select().from(ms.msVideos).where(eq(ms.msVideos.productId, i2.product.id));
    const second = await createPublication(INTERNAL_SCOPE, "t", i2.product.id, { videoId: vAsset.id, platform: "facebook", mode: "direct", connectionId: c.id });
    await approvePublication(INTERNAL_SCOPE, "t", i2.product.id, second.publication.id);
    await assert.rejects(schedulePublication(INTERNAL_SCOPE, "t", i2.product.id, second.publication.id, new Date(when.getTime() + MIN_GAP_MS / 2)), /Schedule conflict/);
    await schedulePublication(INTERNAL_SCOPE, "t", i2.product.id, second.publication.id, new Date(when.getTime() + MIN_GAP_MS * 2));
  });

  test("connections: only declared scopes, required scopes present, one per account, and nothing stored in plaintext", async () => {
    await assert.rejects(connectAccount(INTERNAL_SCOPE, "t", internalId, { platform: "facebook", accountLabel: "x", externalAccountId: "p2", tokens: { accessToken: SECRET }, scopes: [...FB_SCOPES, "ads_management"] }), /beyond what/);
    await assert.rejects(connectAccount(INTERNAL_SCOPE, "t", internalId, { platform: "facebook", accountLabel: "x", externalAccountId: "p3", tokens: { accessToken: SECRET }, scopes: ["pages_show_list"] }), /Missing required scopes/);
    await assert.rejects(healthyFacebook(internalId, "page-1"), /already connected/);
    const [raw] = await requireStudioDb().select().from(ms.msConnections).where(eq(ms.msConnections.id, conn.id));
    assert.ok(!JSON.stringify(raw).includes(SECRET));
    assert.ok(!Buffer.from(raw.secretCiphertext, "base64").toString("latin1").includes(SECRET));
    assert.equal(JSON.parse(decryptSecret(raw.secretCiphertext, raw.keyId)).accessToken, SECRET);
  });

  test("tenant and credential isolation: another tenant cannot connect, use or publish with this product's connection", async () => {
    await assert.rejects(connectAccount(B, "t", aId, { platform: "facebook", accountLabel: "x", externalAccountId: "z", tokens: { accessToken: SECRET }, scopes: FB_SCOPES }), StudioAccessError);
    await assert.rejects(createPublication(A, "t", aId, { creativeId: aCreativeId, platform: "facebook", mode: "direct", connectionId: conn.id }), StudioAccessError, "a connection of another product cannot be used");
    await assert.rejects(createPublication(B, "t", internalId, { creativeId, platform: "facebook" }), StudioAccessError);
    await assert.rejects(tokensForPublish(B, "t", internalId, conn.id), StudioAccessError);
    const { publication } = await createPublication(A, "t", aId, { creativeId: aCreativeId, platform: "facebook" });
    await assert.rejects(approvePublication(B, "t", aId, publication.id), StudioAccessError, "unauthorized approval");
    await assert.rejects(approvePublication(INTERNAL_SCOPE, "t", aId, publication.id), StudioAccessError, "internal scope does not see customer products");
    await assert.rejects(exportPublication(B, "t", aId, publication.id), StudioAccessError);
  });

  test("live publishing is OFF by default: nothing is sent and nothing changes", async () => {
    const id = await scheduledDirect(internalId, creativeId, conn.id);
    const { f, calls } = stubFetch(() => json({ id: "1" }));
    const r = await runDuePublications(INTERNAL_SCOPE, { fetch: f });
    assert.match(r.skipped ?? "", /live publishing is off/);
    assert.equal(calls.length, 0);
    assert.equal((await row(id)).status, "scheduled");
    await cancelPublication(INTERNAL_SCOPE, "t", internalId, id);
  });

  test("with live publishing on, an approved due Facebook post is sent exactly once, even with concurrent runners", async () => {
    await setSetting(LIVE_SETTING, true, "t");
    const id = await scheduledDirect(internalId, creativeId, conn.id);
    const { f, calls } = stubFetch(() => json({ id: "page-1_555", post_id: "page-1_555" }));
    const [r1, r2, r3] = await Promise.all([runDuePublications(INTERNAL_SCOPE, { fetch: f }), runDuePublications(INTERNAL_SCOPE, { fetch: f }), runDuePublications(INTERNAL_SCOPE, { fetch: f })]);
    assert.equal(calls.length, 1, "exactly one Graph call");
    assert.match(calls[0].url, /graph\.facebook\.com\/v[\d.]+\/page-1\/photos$/);
    assert.equal([r1, r2, r3].reduce((n, r) => n + r.published, 0), 1);
    const p = await row(id);
    assert.equal(p.status, "published");
    assert.equal(p.externalPostId, "page-1_555");
    assert.ok(p.publishedAt);
    await runDuePublications(INTERNAL_SCOPE, { fetch: f });
    assert.equal(calls.length, 1, "a published post is never sent again");
    const audits = JSON.stringify(await requireStudioDb().select().from(ms.msAuditEvents));
    assert.ok(!audits.includes(SECRET), "the token never appears in the audit trail");
    assert.ok(!JSON.stringify(p).includes(SECRET));
    await setSetting(LIVE_SETTING, false, "t");
  });

  test("retries: a temporary error reschedules with backoff and gives up after the maximum attempts", async () => {
    await setSetting(LIVE_SETTING, true, "t");
    const i3 = await mkProduct(INTERNAL_SCOPE, "Retry Product");
    const c = await healthyFacebook(i3.product.id, "retry-page");
    const { publication } = await createPublication(INTERNAL_SCOPE, "t", i3.product.id, { creativeId: i3.creative.id, platform: "facebook", mode: "direct", connectionId: c.id, maxAttempts: 2 });
    await approvePublication(INTERNAL_SCOPE, "t", i3.product.id, publication.id);
    await schedulePublication(INTERNAL_SCOPE, "t", i3.product.id, publication.id, new Date(Date.now() - 1000));
    const { f, calls } = stubFetch(() => json({ error: { message: "temporarily unavailable", code: 2 } }, 503));
    const r1 = await runDuePublications(INTERNAL_SCOPE, { fetch: f });
    assert.equal(r1.retried, 1);
    let p = await row(publication.id);
    assert.equal(p.status, "scheduled");
    assert.ok(p.nextAttemptAt && p.nextAttemptAt.getTime() > Date.now() + 60_000, "backed off");
    assert.match(p.failureReason ?? "", /temporary/i);
    assert.equal((await runDuePublications(INTERNAL_SCOPE, { fetch: f })).attempted, 0, "not retried before the backoff passes");
    const later = new Date(Date.now() + 3 * 3_600_000);
    const r2 = await runDuePublications(INTERNAL_SCOPE, { fetch: f }, undefined, later);
    assert.equal(r2.failed, 1);
    p = await row(publication.id);
    assert.equal(p.status, "failed");
    // Other scheduled posts from earlier tests also become due at the later time; count only this page's calls.
    assert.equal(calls.filter((c) => c.url.includes("/retry-page/")).length, 2);
    await setSetting(LIVE_SETTING, false, "t");
  });

  test("an expired token blocks sending, a rejected token marks the connection, neither is retried", async () => {
    await setSetting(LIVE_SETTING, true, "t");
    const db = requireStudioDb();
    const i4 = await mkProduct(INTERNAL_SCOPE, "Expiry Product");
    const c = await healthyFacebook(i4.product.id, "exp-page");
    const id = await scheduledDirect(i4.product.id, i4.creative.id, c.id);
    await db.update(ms.msConnections).set({ tokenExpiresAt: new Date(Date.now() - 1000) }).where(eq(ms.msConnections.id, c.id));
    assert.equal(await refreshConnectionHealth(INTERNAL_SCOPE, i4.product.id, c.id), "expired");
    const { f, calls } = stubFetch(() => json({}));
    const r = await runDuePublications(INTERNAL_SCOPE, { fetch: f });
    assert.equal(r.blocked, 1);
    assert.equal(calls.length, 0, "no call with an expired token");
    assert.match((await row(id)).failureReason ?? "", /expired/);
    await assert.rejects(createPublication(INTERNAL_SCOPE, "t", i4.product.id, { videoId: (await db.select().from(ms.msVideos).where(eq(ms.msVideos.productId, i4.product.id)))[0].id, platform: "facebook", mode: "direct", connectionId: c.id }), /expired/);

    const i5 = await mkProduct(INTERNAL_SCOPE, "Rejected Product");
    const c5 = await healthyFacebook(i5.product.id, "rej-page");
    const id5 = await scheduledDirect(i5.product.id, i5.creative.id, c5.id);
    const bad = stubFetch(() => json({ error: { message: "Error validating access token", code: 190 } }, 400));
    const r5 = await runDuePublications(INTERNAL_SCOPE, { fetch: bad.f });
    assert.equal(r5.failed, 1);
    assert.equal(bad.calls.length, 1);
    assert.equal((await row(id5)).status, "failed");
    const [cc] = await db.select().from(ms.msConnections).where(eq(ms.msConnections.id, c5.id));
    assert.equal(cc.healthStatus, "error");
    await setSetting(LIVE_SETTING, false, "t");
  });

  test("revocation destroys the stored token and stops pending publications", async () => {
    const db = requireStudioDb();
    const i6 = await mkProduct(INTERNAL_SCOPE, "Revoke Product");
    const c = await healthyFacebook(i6.product.id, "rev-page");
    const id = await scheduledDirect(i6.product.id, i6.creative.id, c.id, new Date(Date.now() + 5 * 3_600_000));
    const res = await revokeAccount(INTERNAL_SCOPE, "t", i6.product.id, c.id);
    assert.equal(res.cancelled, 1);
    assert.equal((await row(id)).status, "revoked");
    const [raw] = await db.select().from(ms.msConnections).where(eq(ms.msConnections.id, c.id));
    assert.equal(raw.status, "revoked");
    assert.equal(decryptSecret(raw.secretCiphertext, raw.keyId), "revoked", "the token was overwritten");
    assert.ok(raw.revokedAt);
    await assert.rejects(tokensForPublish(INTERNAL_SCOPE, "t", i6.product.id, c.id));
    await assert.rejects(createPublication(INTERNAL_SCOPE, "t", i6.product.id, { videoId: (await db.select().from(ms.msVideos).where(eq(ms.msVideos.productId, i6.product.id)))[0].id, platform: "facebook", mode: "direct", connectionId: c.id }), /revoked/);
    await assert.rejects(revokeAccount(B, "t", i6.product.id, c.id), StudioAccessError);
  });

  test("the daily cap and the kill switch stop sending", async () => {
    await setSetting(LIVE_SETTING, true, "t");
    const db = requireStudioDb();
    const i7 = await mkProduct(INTERNAL_SCOPE, "Cap Product");
    const c = await healthyFacebook(i7.product.id, "cap-page");
    for (let k = 0; k < PLATFORM_SPECS.facebook.rateLimit.ourCap24h; k++) {
      await db.insert(ms.msPublications).values({ productId: i7.product.id, assetId: i7.creative.assetId!, platform: "facebook", mode: "direct", status: "published", caption: "c", dedupeKey: `cap-${k}`, publishedAt: new Date() });
    }
    const id = await scheduledDirect(i7.product.id, i7.creative.id, c.id);
    const { f, calls } = stubFetch(() => json({ id: "1" }));
    assert.equal((await runDuePublications(INTERNAL_SCOPE, { fetch: f })).blocked, 1);
    assert.match((await row(id)).failureReason ?? "", /daily cap/);
    assert.equal(calls.length, 0);

    const i8 = await mkProduct(INTERNAL_SCOPE, "Kill Product");
    const c8 = await healthyFacebook(i8.product.id, "kill-page");
    const id8 = await scheduledDirect(i8.product.id, i8.creative.id, c8.id);
    await setKillSwitch(true, "t");
    assert.match((await runDuePublications(INTERNAL_SCOPE, { fetch: f })).skipped ?? "", /studio disabled/);
    mkdirSync(STUDIO_DIRS.root, { recursive: true });
    await setKillSwitch(false, "t");
    writeFileSync(DISABLE_FILE, "");
    assert.match((await runDuePublications(INTERNAL_SCOPE, { fetch: f })).skipped ?? "", /studio disabled/);
    rmSync(DISABLE_FILE);
    assert.equal(calls.length, 0);
    assert.equal((await row(id8)).status, "scheduled");
    await setSetting(LIVE_SETTING, false, "t");
  });

  test("export bundles are valid ZIP files with media, caption, CTA, notes and a manifest, and post nothing", async () => {
    const { publication } = await createPublication(INTERNAL_SCOPE, "t", internalId, { creativeId, platform: "facebook", mode: "export" });
    await assert.rejects(exportPublication(INTERNAL_SCOPE, "t", internalId, publication.id), /Approve/);
    await approvePublication(INTERNAL_SCOPE, "t", internalId, publication.id);
    const { f, calls } = stubFetch(() => json({}));
    const b = await exportPublication(INTERNAL_SCOPE, "t", internalId, publication.id);
    assert.match(b.fileName, /^[a-z0-9-]+\.zip$/);
    assert.equal((await row(publication.id)).status, "exported");
    // Parse the archive: every entry's CRC must match its stored bytes.
    const z = b.zip;
    const names: string[] = [];
    let off = 0;
    while (z.readUInt32LE(off) === 0x04034b50) {
      const size = z.readUInt32LE(off + 18);
      const nlen = z.readUInt16LE(off + 26);
      const name = z.toString("utf8", off + 30, off + 30 + nlen);
      const data = z.subarray(off + 30 + nlen, off + 30 + nlen + size);
      assert.equal(crc32(data), z.readUInt32LE(off + 14), `crc of ${name}`);
      names.push(name);
      if (name === "caption.txt") assert.match(data.toString(), /grounded caption/);
      if (name === "manifest.json") assert.equal(JSON.parse(data.toString()).platform, "facebook");
      if (name.startsWith("notes-")) assert.match(data.toString(), /Recommended aspect ratio: 1:1/);
      assert.ok(!data.toString("latin1").includes(SECRET));
      off += 30 + nlen + size;
    }
    assert.ok(names.some((n) => n.endsWith(".png")) && names.includes("caption.txt") && names.includes("cta.txt") && names.includes("manifest.json"));
    assert.equal(calls.length, 0);
    void f;
    const yt = await createPublication(INTERNAL_SCOPE, "t", internalId, { videoId, platform: "youtube", mode: "export" });
    await approvePublication(INTERNAL_SCOPE, "t", internalId, yt.publication.id);
    const vb = await exportPublication(INTERNAL_SCOPE, "t", internalId, yt.publication.id);
    assert.ok(vb.zip.includes(Buffer.from("title.txt")) && vb.zip.includes(Buffer.from(".mp4")));
  });

  test("the audit trail records the publishing lifecycle", async () => {
    const actions = new Set((await requireStudioDb().select().from(ms.msAuditEvents)).map((a) => a.action));
    for (const a of ["publication.create", "publication.approve", "publication.schedule", "publication.published", "publication.retry", "publication.failed", "publication.export", "connection.store", "connection.revoke", "connection.use"]) assert.ok(actions.has(a), a);
  });
});
