// Pure tests run anywhere. Database tests need a scratch database (name contains "test"):
//   STUDIO_TEST_DATABASE_URL=postgresql://.../gb_studio_test npx tsx --test src/lib/marketing-studio/__tests__/measurement.test.ts
import "./setup";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { STUDIO_DIRS } from "../config";
import { closeStudioDb, ms, requireStudioDb } from "../db";
import { createProduct } from "../repository";
import { setKillSwitch, setSetting } from "../runtime";
import { INTERNAL_SCOPE } from "../scope";
import { collectDueMetrics, collectForPublication, currentMetrics, recordAttributedActivity } from "../measurement/collect";
import { collectFacebookMetrics, verifyFacebookPostLive } from "../measurement/facebook-insights";
import { buildReport, engagementRate, MIN_SAMPLE, type Observation } from "../measurement/learning";
import { completeSet, confirmed, confirmedValue, mergeSets, unknown } from "../measurement/metrics";
import { applyUtmToCaption, foreignLinks, utmIdFor, withUtm } from "../measurement/utm";
import { connectAccount, revokeAccount } from "../publishing/connections";
import { authorizeUrl, completeFacebookOAuth, makeState, readState } from "../publishing/oauth-facebook";
import { approvePublication, createPublication, LIVE_SETTING, runDuePublications, schedulePublication } from "../publishing/queue";

const FB_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts"];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function stub(handler: (url: string, init?: RequestInit) => Response) {
  const calls: Array<{ url: string; method: string }> = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? "GET" });
    return handler(String(url), init);
  }) as typeof fetch;
  return { f, calls };
}

describe("UTM tagging", () => {
  const pid = "12345678-90ab-4cde-8f01-234567890abc";
  test("adds only coarse, non-personal labels and a short publication id", () => {
    const u = new URL(withUtm("https://drinkknird.com/menu", { platform: "facebook", campaign: "Pilot Launch!", family: "educational_tip", publicationId: pid }));
    assert.equal(u.searchParams.get("utm_source"), "facebook");
    assert.equal(u.searchParams.get("utm_medium"), "social");
    assert.equal(u.searchParams.get("utm_campaign"), "pilot_launch");
    assert.equal(u.searchParams.get("utm_content"), "educational_tip");
    assert.equal(u.searchParams.get("utm_id"), utmIdFor(pid));
    assert.ok(!u.search.includes("@") && !u.search.includes(pid));
  });
  test("never overwrites a link that already carries a campaign", () => {
    const own = "https://x.com/?utm_source=newsletter";
    assert.equal(withUtm(own, { platform: "facebook", campaign: null, family: null, publicationId: pid }), own);
  });
  test("caption gets the tagged link, other links are refused, no link is appended with a label", () => {
    const tagged = "https://x.com/?utm_source=facebook";
    assert.equal(applyUtmToCaption("Try it https://x.com/", "https://x.com/", tagged, "Go"), `Try it ${tagged}`);
    assert.equal(applyUtmToCaption("Try it", "https://x.com/", tagged, "Go"), `Try it\n\nGo: ${tagged}`);
    assert.deepEqual(foreignLinks("see https://evil.example/a and https://x.com/b", "x.com"), ["https://evil.example/a"]);
  });
});

describe("metric honesty", () => {
  test("a missing metric is unknown with value null, never zero", () => {
    const full = completeSet({ reactions: confirmed(4) });
    assert.equal(full.impressions.value, null);
    assert.equal(full.impressions.status, "unknown");
    assert.equal(confirmedValue(full, "impressions"), null);
    assert.equal(confirmedValue(full, "reactions"), 4);
  });
  test("estimated values are never returned as confirmed", () => {
    assert.equal(confirmedValue({ site_visits: { value: 9, status: "estimated" } }, "site_visits"), null);
  });
  test("merging keeps the newest confirmed value and never lets unknown hide a number", () => {
    const m = mergeSets([{ reactions: confirmed(1) }, { reactions: confirmed(5) }, { reactions: unknown("later call failed") }]);
    assert.equal(m.reactions.value, 5);
    assert.equal(m.reactions.status, "confirmed");
  });
});

describe("Facebook insights collector", () => {
  test("photo post: confirmed engagement, a refused metric becomes unknown and does not hide the others", async () => {
    const { f } = stub((url) => {
      if (url.includes("post_media_view")) return json({ data: [{ name: "post_media_view", values: [{ value: 120 }] }] });
      if (url.includes("post_total_media_view_unique")) return json({ error: { message: "(#100) metric not supported", code: 100 } }, 400);
      if (url.includes("post_clicks")) return json({ data: [{ name: "post_clicks", values: [{ value: 7 }] }] });
      return json({ reactions: { summary: { total_count: 9 } }, comments: { summary: { total_count: 2 } } });
    });
    const r = await collectFacebookMetrics({ externalId: "1_2", kind: "image", accessToken: "tok-123456789" }, { fetch: f });
    assert.equal(r.metrics.impressions?.value, 120);
    assert.equal(r.metrics.reactions?.value, 9);
    assert.equal(r.metrics.reach?.status, "unknown");
    assert.equal(r.metrics.reach?.value, null);
    assert.equal(r.metrics.shares?.status, "estimated");
    assert.equal(r.metrics.link_clicks?.status, "estimated", "all post clicks are not link clicks, so they are never confirmed link clicks");
    assert.equal(r.authFailure, false);
  });
  test("an invalid token is reported as an auth failure", async () => {
    const { f } = stub(() => json({ error: { message: "Invalid OAuth access token.", code: 190 } }, 400));
    const r = await collectFacebookMetrics({ externalId: "1_2", kind: "image", accessToken: "tok-123456789" }, { fetch: f });
    assert.equal(r.authFailure, true);
    assert.equal(r.metrics.reactions?.status, "unknown");
  });
  test("verify-live reads the post from Facebook", async () => {
    const ok = stub(() => json({ id: "1_2", permalink_url: "https://facebook.com/1_2" }));
    assert.deepEqual(await verifyFacebookPostLive({ externalId: "1_2", accessToken: "t" }, { fetch: ok.f }), { live: true, permalink: "https://facebook.com/1_2", reason: undefined });
    const gone = stub(() => json({ error: { message: "Unsupported get request", code: 100 } }, 400));
    assert.equal((await verifyFacebookPostLive({ externalId: "1_2", accessToken: "t" }, { fetch: gone.f })).live, false);
  });
});

describe("learning loop", () => {
  const mk = (over: Partial<Observation>): Observation => ({ publicationId: "p", productId: "x", productName: "A", platform: "facebook", hook: "educational_tip", format: "image", impressions: 100, views: null, engagement: 5, linkClicks: null, visitsEstimated: null, ...over });
  test("engagement rate needs confirmed numbers on both sides", () => {
    assert.equal(engagementRate(mk({ impressions: null, views: null })), null);
    assert.equal(engagementRate(mk({ engagement: null })), null);
    assert.equal(engagementRate(mk({})), 0.05);
  });
  test("too few measured posts: no winner is declared", () => {
    const r = buildReport([mk({}), mk({ hook: "cta", engagement: 30 })]);
    assert.ok(r.recommendations.every((x) => x.kind === "insufficient_evidence"));
  });
  test("a clear, sufficiently sampled difference becomes a winner that is labelled as correlation", () => {
    const obs = [
      ...Array.from({ length: MIN_SAMPLE }, () => mk({ hook: "educational_tip", engagement: 8 })),
      ...Array.from({ length: MIN_SAMPLE }, () => mk({ hook: "cta", engagement: 3 })),
    ];
    const hook = buildReport(obs).recommendations.find((x) => x.dimension === "hook")!;
    assert.equal(hook.kind, "winner");
    assert.match(hook.text, /educational_tip/);
    assert.match(hook.text, /not proof/);
  });
  test("a small difference is not a winner", () => {
    const obs = [...Array.from({ length: 3 }, () => mk({ hook: "a", engagement: 10 })), ...Array.from({ length: 3 }, () => mk({ hook: "b", engagement: 9 }))];
    assert.equal(buildReport(obs).recommendations.find((x) => x.dimension === "hook")!.kind, "no_clear_winner");
  });
  test("unknown traffic is stated as unknown and estimates never decide a result", () => {
    const r = buildReport([mk({})]);
    assert.ok(r.unknowns.some((u) => /UNKNOWN/.test(u)));
    const withEstimate = buildReport([mk({ visitsEstimated: 40 })]);
    assert.ok(withEstimate.unknowns.some((u) => /ESTIMATED/.test(u)));
  });
});

describe("Facebook OAuth", () => {
  before(() => {
    process.env.MARKETING_FB_APP_ID = "123456789";
    process.env.MARKETING_FB_APP_SECRET = "app-secret-value";
    process.env.NEXT_PUBLIC_SITE_URL = "https://gravyblock.com";
  });
  test("state is signed, product bound, nonce bound and expires", () => {
    const s = makeState("prod-1", "drinkknird", "nonce-a", 1000);
    assert.deepEqual(readState(s, "nonce-a", 1000 + 1000), { productId: "prod-1", handle: "drinkknird" });
    assert.equal(readState(s, "nonce-b", 2000), null);
    assert.equal(readState(s, "nonce-a", 1000 + 11 * 60_000), null);
    const [payload, mac] = s.split(".");
    const forged = Buffer.from(JSON.stringify({ p: "prod-2", h: null, n: "nonce-a", e: 9e15 })).toString("base64url");
    assert.equal(readState(`${forged}.${mac}`, "nonce-a", 2000), null);
    assert.equal(readState(`${payload}.`, "nonce-a", 2000), null);
  });
  test("the authorize URL asks only for the platform's allowed scopes and carries no secret", () => {
    const u = new URL(authorizeUrl("st"));
    assert.equal(u.host, "www.facebook.com");
    assert.deepEqual(u.searchParams.get("scope")!.split(","), ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "read_insights"]);
    assert.ok(!u.toString().includes("app-secret-value"));
  });
});

// ---- database tests ----------------------------------------------------------------------------------------------------------
const HAVE_DB = Boolean(process.env.STUDIO_TEST_DATABASE_URL);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 4, 56, 0, 0, 4, 56]), Buffer.alloc(64, 9)]);

describe("measurement and OAuth (database)", { skip: !HAVE_DB }, () => {
  let productId = "";
  let creativeId = "";
  let connId = "";
  let campaignId = "";
  const TOKEN = "EAAB-page-token-for-measurement-1";

  before(async () => {
    const db = requireStudioDb();
    for (const t of [ms.msAuditEvents, ms.msPublicationMetrics, ms.msPublications, ms.msConnections, ms.msVideos, ms.msCreatives, ms.msConcepts, ms.msCampaigns, ms.msAssets, ms.msSettings, ms.msProducts]) await db.delete(t);
    const p = await createProduct(INTERNAL_SCOPE, "t", { name: "Measure Product", kind: "saas" });
    productId = p.id;
    const dir = path.join(STUDIO_DIRS.media, p.id);
    mkdirSync(dir, { recursive: true });
    const sha = `${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`.padEnd(64, "0").slice(0, 64);
    writeFileSync(path.join(dir, `${sha}.png`), PNG);
    const [asset] = await db.insert(ms.msAssets).values({ productId, kind: "render_image", storagePath: `${p.id}/${sha}.png`, sha256: sha, mimeType: "image/png", bytes: PNG.length, width: 1080, height: 1080, provenance: "rendered", originalName: "c.png" }).returning();
    const [camp] = await db.insert(ms.msCampaigns).values({ productId, name: "Pilot Launch", objective: "awareness" }).returning();
    campaignId = camp.id;
    const [concept] = await db.insert(ms.msConcepts).values({ productId, campaignId, family: "educational_tip", headline: "H", caption: "A grounded caption", ctaText: "See more", ctaUrl: "https://example.com/menu", status: "approved" }).returning();
    const [creative] = await db.insert(ms.msCreatives).values({ productId, conceptId: concept.id, assetId: asset.id, sizeKey: "square", width: 1080, height: 1080, templateFamily: "x", templateVersion: "t", status: "approved" }).returning();
    creativeId = creative.id;
    const c = await connectAccount(INTERNAL_SCOPE, "t", productId, { platform: "facebook", accountLabel: "Page", externalAccountId: "page-1", tokens: { accessToken: TOKEN }, scopes: FB_SCOPES, tokenExpiresAt: null });
    connId = c.id;
  });
  after(async () => {
    rmSync(STUDIO_DIRS.root, { recursive: true, force: true });
    await closeStudioDb();
  });

  async function publishOne() {
    const { publication } = await createPublication(INTERNAL_SCOPE, "t", productId, { creativeId, platform: "facebook", mode: "direct", connectionId: connId });
    await approvePublication(INTERNAL_SCOPE, "t", productId, publication.id);
    await schedulePublication(INTERNAL_SCOPE, "t", productId, publication.id, new Date(Date.now() - 1000));
    await setSetting(LIVE_SETTING, true, "t");
    const posted = stub((url) => (url.includes("/photos") ? json({ id: "ph-1", post_id: "page-1_900" }) : json({})));
    await runDuePublications(INTERNAL_SCOPE, { fetch: posted.f });
    await setSetting(LIVE_SETTING, false, "t");
    return { id: publication.id, posted };
  }

  test("the caption carries the product's own link with campaign tags and the same tag is stored on the publication", async () => {
    const { publication } = await createPublication(INTERNAL_SCOPE, "t", productId, { creativeId, platform: "facebook", mode: "export" });
    assert.match(publication.caption, /utm_campaign=pilot_launch/);
    assert.match(publication.caption, /utm_id=ms_/);
    assert.equal(publication.ctaUrl && new URL(publication.ctaUrl).host, "example.com");
    assert.ok(!/@/.test(publication.caption), "no email address or handle in the caption");
  });

  test("a video without a concept gets its caption from its own storyboard text and still carries only the product's tagged link", async () => {
    const db = requireStudioDb();
    const dir = path.join(STUDIO_DIRS.media, productId);
    const sha = `${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`.padEnd(64, "1").slice(0, 64);
    writeFileSync(path.join(dir, `${sha}.mp4`), Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypmp42"), Buffer.alloc(40)]));
    const [vasset] = await db.insert(ms.msAssets).values({ productId, kind: "render_video", storagePath: `${productId}/${sha}.mp4`, sha256: sha, mimeType: "video/mp4", bytes: 52, width: 1080, height: 1920, provenance: "rendered", originalName: "v.mp4" }).returning();
    const [video] = await db.insert(ms.msVideos).values({ productId, title: "V", storyboard: { scenes: [{ type: "card", seconds: 5, headline: "A real headline", subhead: "A verified sentence about the product." }] }, targetSeconds: 15, assetId: vasset.id, width: 1080, height: 1920, durationMs: 15000, status: "approved" }).returning();
    const yt = await createPublication(INTERNAL_SCOPE, "t", productId, { videoId: video.id, platform: "youtube", mode: "export" });
    assert.match(yt.publication.caption, /A verified sentence about the product\./);
    assert.equal(yt.publication.title, "A real headline");
    assert.match(yt.publication.caption, /utm_source=youtube/);
    assert.equal(yt.publication.conceptId, null);
  });

  test("a caption linking anywhere but the product's own call to action is refused", async () => {
    await assert.rejects(createPublication(INTERNAL_SCOPE, "t", productId, { creativeId, platform: "tiktok", mode: "export", caption: "see https://evil.example/x" }), /does not accept images|links somewhere other/);
    await assert.rejects(createPublication(INTERNAL_SCOPE, "t", productId, { creativeId, platform: "facebook", mode: "export", caption: "see https://evil.example/x" }), /links somewhere other/);
  });

  test("collecting stores a snapshot with honest statuses and a second collection adds history, not duplicates of the post", async () => {
    const db = requireStudioDb();
    await db.delete(ms.msPublications);
    const { id, posted } = await publishOne();
    assert.equal(posted.calls.filter((c) => c.url.includes("/photos")).length, 1);
    const insight = stub((url) => {
      if (url.includes("post_media_view")) return json({ data: [{ values: [{ value: 55 }] }] });
      if (url.includes("insights")) return json({ error: { message: "not supported", code: 100 } }, 400);
      return json({ reactions: { summary: { total_count: 3 } }, comments: { summary: { total_count: 1 } }, shares: { count: 2 } });
    });
    const r = await collectForPublication(INTERNAL_SCOPE, "t", productId, id, { fetch: insight.f });
    assert.equal(r.collected, true);
    assert.ok(r.unknownMetrics.includes("reach") && r.unknownMetrics.includes("conversions"));
    const cur = await currentMetrics(db, id);
    assert.equal(cur.metrics.impressions.value, 55);
    assert.equal(cur.metrics.reactions.status, "confirmed");
    assert.equal(cur.metrics.reach.value, null);
    await collectForPublication(INTERNAL_SCOPE, "t", productId, id, { fetch: insight.f });
    assert.equal((await currentMetrics(db, id)).snapshots, 2);
    assert.equal(insight.calls.every((c) => c.method === "GET"), true, "collection is read-only toward Facebook");
  });

  test("attributed visits are stored as ESTIMATED and are marked as correlation", async () => {
    const db = requireStudioDb();
    const [pub] = await db.select().from(ms.msPublications).where(eq(ms.msPublications.status, "published"));
    await recordAttributedActivity(db, pub.id, productId, { visits: 12, conversions: 1, source: "first-party counter" });
    const cur = await currentMetrics(db, pub.id);
    assert.equal(cur.metrics.site_visits.status, "estimated");
    assert.match(cur.metrics.site_visits.note ?? "", /correlation/);
    assert.equal(confirmedValue(cur.metrics, "site_visits"), null);
  });

  test("due collection refreshes only stale posts, and does nothing when the studio is disabled", async () => {
    const db = requireStudioDb();
    const insight = stub(() => json({ reactions: { summary: { total_count: 3 } }, comments: { summary: { total_count: 1 } } }));
    const fresh = await collectDueMetrics(INTERNAL_SCOPE, { fetch: insight.f });
    assert.equal(fresh.checked, 0, "just collected, so not due");
    const later = await collectDueMetrics(INTERNAL_SCOPE, { fetch: insight.f }, db, new Date(Date.now() + 7 * 3_600_000));
    assert.equal(later.checked, 1);
    await setKillSwitch(true, "t");
    const off = await collectDueMetrics(INTERNAL_SCOPE, { fetch: insight.f }, db, new Date(Date.now() + 14 * 3_600_000));
    assert.match(off.skipped ?? "", /disabled/);
    await setKillSwitch(false, "t");
  });

  test("a revoked connection stops collection and nothing is called", async () => {
    const db = requireStudioDb();
    const [pub] = await db.select().from(ms.msPublications).where(eq(ms.msPublications.status, "published"));
    await revokeAccount(INTERNAL_SCOPE, "t", productId, connId);
    const never = stub(() => json({}));
    const r = await collectForPublication(INTERNAL_SCOPE, "t", productId, pub.id, { fetch: never.f });
    assert.equal(r.collected, false);
    assert.match(r.reason ?? "", /revoked/);
    assert.equal(never.calls.length, 0);
  });

  test("OAuth completion connects exactly the matching Page with a Page token and only allowed scopes, and the user token is never stored", async () => {
    const db = requireStudioDb();
    const p2 = await createProduct(INTERNAL_SCOPE, "t", { name: "OAuth Product", kind: "web_game" });
    const USER = "USER-LONG-LIVED-TOKEN-xyz", PAGE = "PAGE-TOKEN-abc-1234";
    const { f } = stub((url) => {
      if (url.includes("grant_type=fb_exchange_token")) return json({ access_token: USER });
      if (url.includes("/oauth/access_token")) return json({ access_token: "short-token-1234" });
      if (url.includes("/me/permissions")) return json({ data: [...FB_SCOPES, "read_insights", "email"].map((permission) => ({ permission, status: "granted" })) });
      return json({ data: [{ id: "other", name: "Other Page", username: "other", access_token: "x-other-token", tasks: ["CREATE_CONTENT"] }, { id: "pg-77", name: "Scribble Zap", username: "scribblezap", access_token: PAGE, tasks: ["CREATE_CONTENT", "MANAGE"] }] });
    });
    const out = await completeFacebookOAuth(INTERNAL_SCOPE, "t", { productId: p2.id, code: "code-1", expectedHandle: "scribblezap" }, { fetch: f }, db);
    assert.equal(out.pageId, "pg-77");
    assert.ok(!out.grantedScopes.includes("email"));
    const [row] = await db.select().from(ms.msConnections).where(eq(ms.msConnections.id, out.connectionId));
    const dump = JSON.stringify(row);
    assert.ok(!dump.includes(PAGE) && !dump.includes(USER), "tokens are stored encrypted only");
    const { tokensForPublish } = await import("../publishing/connections");
    assert.equal((await tokensForPublish(INTERNAL_SCOPE, "t", p2.id, out.connectionId, db)).accessToken, PAGE);
  });

  test("OAuth refuses to guess: no matching Page, a missing permission or a role that cannot post connects nothing", async () => {
    const db = requireStudioDb();
    const p3 = await createProduct(INTERNAL_SCOPE, "t", { name: "OAuth Refuse", kind: "saas" });
    const base = (perms: string[], pages: unknown[]) =>
      stub((url) => {
        if (url.includes("grant_type=fb_exchange_token")) return json({ access_token: "u-1234567" });
        if (url.includes("/oauth/access_token")) return json({ access_token: "s-1234567" });
        if (url.includes("/me/permissions")) return json({ data: perms.map((permission) => ({ permission, status: "granted" })) });
        return json({ data: pages });
      });
    const two = [{ id: "a", name: "A", username: "a", access_token: "tok-aaaaaaaa", tasks: ["CREATE_CONTENT"] }, { id: "b", name: "B", username: "b", access_token: "tok-bbbbbbbb", tasks: ["CREATE_CONTENT"] }];
    await assert.rejects(completeFacebookOAuth(INTERNAL_SCOPE, "t", { productId: p3.id, code: "c" }, { fetch: base(FB_SCOPES, two).f }, db), /exactly one Page/);
    await assert.rejects(completeFacebookOAuth(INTERNAL_SCOPE, "t", { productId: p3.id, code: "c", expectedHandle: "zzz" }, { fetch: base(FB_SCOPES, two).f }, db), /exactly one Page/);
    await assert.rejects(completeFacebookOAuth(INTERNAL_SCOPE, "t", { productId: p3.id, code: "c", expectedHandle: "a" }, { fetch: base(["pages_show_list"], two).f }, db), /did not include/);
    await assert.rejects(completeFacebookOAuth(INTERNAL_SCOPE, "t", { productId: p3.id, code: "c", expectedHandle: "a" }, { fetch: base(FB_SCOPES, [{ id: "a", name: "A", username: "a", access_token: "tok-aaaaaaaa", tasks: ["ANALYZE"] }]).f }, db), /cannot create content/);
    const rows = await db.select().from(ms.msConnections).where(eq(ms.msConnections.productId, p3.id));
    assert.equal(rows.length, 0);
  });
});
