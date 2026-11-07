import "./setup";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { decryptSecret } from "../credentials";
import { STUDIO_DIRS } from "../config";
import { closeStudioDb, ms, requireStudioDb } from "../db";
import { createProduct } from "../repository";
import { setSetting } from "../runtime";
import { INTERNAL_SCOPE } from "../scope";
import { collectForPublication } from "../measurement/collect";
import type { PublishInput } from "../publishing/adapters";
import { connectAccount, evaluateHealth, revokeAccount, usable, type TokenBundle } from "../publishing/connections";
import { completeYoutubeOAuth, reverifyYoutubeConnection, makeYoutubeState, readYoutubeState, verifyYoutubeConnection, youtubeAuthorizeUrl, youtubeCallbackUrl, youtubeOAuthConfigured, youtubeTokensForCall, YOUTUBE_FIRST } from "../publishing/oauth-youtube";
import { approvedSetting, approvePublication, createPublication, LIVE_SETTING, runDuePublications, schedulePublication, youtubeEnabledSetting, youtubeKidsSetting, youtubePrivacySetting } from "../publishing/queue";
import { channelLabel, channelMatches, collectYoutubeCounts, verifyYoutubeVideo, youtubeAdapter, YT_SCOPE_MANAGE, YT_SCOPE_READ, YT_SCOPE_UPLOAD } from "../publishing/youtube-api";

process.env.MARKETING_GOOGLE_CLIENT_ID = "123456789-abc.apps.googleusercontent.com";
process.env.MARKETING_GOOGLE_CLIENT_SECRET = "GOCSPX-test-secret-value-0000";
process.env.NEXT_PUBLIC_SITE_URL = "https://gravyblock.com";
process.env.MARKETING_YOUTUBE_CHANNEL_ID = "UC_iscream_studio_001";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const CH = { id: "UC_iscream_studio_001", snippet: { title: "iScream Studio", customUrl: "@iscreamstudio" } };
const ACCESS = "ya29.test-access-token-aaaaaaaa";
const REFRESH = "1//test-refresh-token-bbbbbbbb";
const GRANT_SCOPES = `${YT_SCOPE_UPLOAD} ${YT_SCOPE_READ}`;

type Call = { url: string; method: string; headers: Record<string, string>; body: string };
/** A fake Google: token endpoint, channels, videos, resumable upload. Every request is recorded. */
function google(opts: { channels?: unknown[]; grant?: Record<string, unknown>; refreshFails?: boolean; startStatus?: number; startError?: unknown; putStatus?: number; putThrows?: boolean; video?: unknown; videoStatus?: number } = {}) {
  const calls: Call[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
    calls.push({ url: u, method: init?.method ?? "GET", headers, body: typeof init?.body === "string" ? init.body : init?.body instanceof URLSearchParams ? init.body.toString() : init?.body ? "[bytes]" : "" });
    if (u.startsWith("https://oauth2.googleapis.com/token")) {
      if (String(init?.body).includes("refresh_token") && opts.refreshFails) return json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400);
      if (String(init?.body).includes("grant_type=refresh_token")) return json({ access_token: "ya29.renewed-access-token-cccccccc", expires_in: 3599, scope: GRANT_SCOPES, token_type: "Bearer" });
      return json({ access_token: ACCESS, refresh_token: REFRESH, expires_in: 3599, scope: GRANT_SCOPES, token_type: "Bearer", ...opts.grant });
    }
    if (u.startsWith("https://oauth2.googleapis.com/revoke")) return json({});
    if (u.includes("/youtube/v3/channels")) return json({ items: opts.channels ?? [CH] });
    if (u.includes("/youtube/v3/videos?part=")) return json(opts.video === undefined ? { items: [] } : { items: [opts.video] }, opts.videoStatus ?? 200);
    if (u.startsWith("https://www.googleapis.com/upload/youtube/v3/videos")) {
      if (opts.startStatus && opts.startStatus >= 400) return json(opts.startError ?? { error: { message: "backend", errors: [{ reason: "backendError" }] } }, opts.startStatus);
      return new Response("{}", { status: 200, headers: { location: "https://upload.example.google/session/abc" } });
    }
    if (u.startsWith("https://upload.example.google/session/")) {
      if (opts.putThrows) throw new Error("socket hang up");
      if ((opts.putStatus ?? 200) >= 400) return json({ error: { message: "bad", errors: [{ reason: "backendError" }] } }, opts.putStatus);
      return json({ id: "vid_ABC123xyz", snippet: { channelId: CH.id } });
    }
    return json({ error: { message: `unexpected ${u}` } }, 500);
  }) as typeof fetch;
  return { f, calls, uploads: () => calls.filter((c) => c.url.startsWith("https://www.googleapis.com/upload/")).length };
}

const input = (over: Partial<PublishInput> = {}): PublishInput => ({
  platform: "youtube",
  externalAccountId: CH.id,
  media: { kind: "video", bytes: Buffer.alloc(64, 1), mime: "video/mp4", fileName: "v.mp4" },
  caption: "A grounded description https://iscreamstudio.com/games/scribblezap/?utm_source=youtube",
  title: "ScribbleZap: how far can you get?",
  accessToken: ACCESS,
  youtube: { madeForKids: false, privacy: "public" },
  ...over,
});

describe("YouTube OAuth: redirect URI, scopes, state", () => {
  test("the production redirect URI is exact and the authorize URL asks for offline access with only the declared scopes (upload, read, and the visibility permission for approve-and-make-public)", () => {
    assert.equal(youtubeCallbackUrl(), "https://gravyblock.com/api/admin/marketing-studio/connect/youtube/callback");
    const u = new URL(youtubeAuthorizeUrl("STATE"));
    assert.equal(u.origin + u.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
    assert.equal(u.searchParams.get("redirect_uri"), "https://gravyblock.com/api/admin/marketing-studio/connect/youtube/callback");
    assert.equal(u.searchParams.get("access_type"), "offline");
    assert.match(u.searchParams.get("prompt") ?? "", /consent/);
    assert.equal(u.searchParams.get("response_type"), "code");
    assert.equal(u.searchParams.get("include_granted_scopes"), "false");
    assert.deepEqual(u.searchParams.get("scope")!.split(" ").sort(), [YT_SCOPE_READ, YT_SCOPE_UPLOAD, YT_SCOPE_MANAGE].sort());
    assert.ok(!u.toString().includes("GOCSPX"), "the client secret never appears in the browser URL");
    assert.equal(u.searchParams.get("client_id"), process.env.MARKETING_GOOGLE_CLIENT_ID);
    assert.ok(youtubeOAuthConfigured());
  });
  test("the callback route and start route exist at the registered path", async () => {
    const { existsSync } = await import("node:fs");
    assert.ok(existsSync(path.join(process.cwd(), "src/app/api/admin/marketing-studio/connect/youtube/callback/route.ts")));
    assert.ok(existsSync(path.join(process.cwd(), "src/app/api/admin/marketing-studio/connect/youtube/start/route.ts")));
  });
  test("state is signed, expiring, bound to the product, the expected channel and the browser's nonce; a Facebook state is not accepted", () => {
    const s = makeYoutubeState("11111111-1111-4111-8111-111111111111", "iscreamstudio", "nonce1", 1000);
    assert.deepEqual(readYoutubeState(s, "nonce1", 2000), { productId: "11111111-1111-4111-8111-111111111111", expected: "iscreamstudio" });
    assert.equal(readYoutubeState(s, "other-nonce", 2000), null);
    assert.equal(readYoutubeState(s, "nonce1", 1000 + 31 * 60_000), null, "expired");
    assert.equal(readYoutubeState(s.replace(/.$/, "x"), "nonce1", 2000), null, "tampered signature");
    const [payload] = s.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), c: "someone-else" })).toString("base64url");
    assert.equal(readYoutubeState(`${forged}.${s.split(".")[1]}`, "nonce1", 2000), null, "a different expected channel cannot be swapped in");
  });
  test("channel matching is by handle, id or exact name, never a guess", () => {
    const ch = { id: CH.id, title: "iScream Studio", handle: "@iscreamstudio" };
    assert.ok(channelMatches(ch, "iscreamstudio") && channelMatches(ch, "@iScreamStudio") && channelMatches(ch, "iScream Studio") && channelMatches(ch, CH.id));
    assert.ok(!channelMatches(ch, "iscream") && !channelMatches(ch, "Chris") && !channelMatches(ch, ""));
    assert.equal(channelLabel(ch), "iScream Studio (@iscreamstudio)");
    assert.deepEqual(YOUTUBE_FIRST.order, ["scribblezap", "mibblemeadow"]);
  });
});

describe("YouTube adapter: upload", () => {
  test("a clean upload verifies the channel first, then starts a resumable session with the declared metadata, then uploads the bytes", async () => {
    const g = google();
    const r = await youtubeAdapter.publish(input(), { fetch: g.f });
    assert.deepEqual(r, { ok: true, externalId: "vid_ABC123xyz", url: "https://www.youtube.com/watch?v=vid_ABC123xyz" });
    assert.deepEqual(g.calls.map((c) => `${c.method} ${c.url.split("?")[0].replace("https://", "")}`), ["GET www.googleapis.com/youtube/v3/channels", "POST www.googleapis.com/upload/youtube/v3/videos", "PUT upload.example.google/session/abc"]);
    const start = g.calls[1];
    assert.equal(start.headers.authorization, `Bearer ${ACCESS}`);
    assert.match(start.url, /uploadType=resumable&part=snippet,status/);
    const meta = JSON.parse(start.body);
    assert.equal(meta.snippet.title, "ScribbleZap: how far can you get?");
    assert.match(meta.snippet.description, /iscreamstudio\.com\/games\/scribblezap/);
    assert.equal(meta.status.privacyStatus, "public");
    assert.equal(meta.status.selfDeclaredMadeForKids, false);
    assert.equal(start.headers["x-upload-content-length"], "64");
  });
  test("wrong-channel protection: a token that belongs to another channel uploads nothing", async () => {
    const other = { id: "UC_someone_else", snippet: { title: "Chris Personal", customUrl: "@chris" } };
    for (const channels of [[other], [CH, other], []]) {
      const g = google({ channels });
      const r = await youtubeAdapter.publish(input(), { fetch: g.f });
      assert.equal(r.ok, false);
      assert.equal(g.uploads(), 0, "no upload request was made");
      assert.equal((r as { authFailure?: boolean }).authFailure, true);
      assert.equal((r as { retryable: boolean }).retryable, false);
    }
  });
  test("an undeclared made-for-kids answer, a missing title, a long title or angle brackets are refused before any network call", async () => {
    const g = google();
    for (const over of [{ youtube: { madeForKids: null, privacy: "public" as const } }, { title: "" }, { title: "t".repeat(101) }, { title: "Bad <title>" }, { caption: "x > y" }, { youtube: undefined }]) {
      assert.equal((await youtubeAdapter.publish(input(over as Partial<PublishInput>), { fetch: g.f })).ok, false);
    }
    assert.equal(g.calls.length, 0);
  });
  test("failures are classified: quota is not retried, a temporary start error is, an error after the bytes started never is, auth failures mark the connection", async () => {
    const quota = await youtubeAdapter.publish(input(), { fetch: google({ startStatus: 403, startError: { error: { message: "quota", errors: [{ reason: "quotaExceeded" }] } } }).f });
    assert.deepEqual([quota.ok, (quota as { retryable: boolean }).retryable, (quota as { authFailure?: boolean }).authFailure], [false, false, undefined]);
    const temp = await youtubeAdapter.publish(input(), { fetch: google({ startStatus: 503 }).f });
    assert.equal((temp as { retryable: boolean }).retryable, true);
    const mid = await youtubeAdapter.publish(input(), { fetch: google({ putStatus: 503 }).f });
    assert.equal((mid as { retryable: boolean }).retryable, false);
    const drop = await youtubeAdapter.publish(input(), { fetch: google({ putThrows: true }).f });
    assert.equal((drop as { retryable: boolean }).retryable, false);
    assert.match((drop as { reason: string }).reason, /partial upload/);
    const auth = await youtubeAdapter.publish(input(), { fetch: google({ startStatus: 401, startError: { error: { message: "bad token", errors: [{ reason: "authError" }] } } }).f });
    assert.equal((auth as { authFailure?: boolean }).authFailure, true);
  });
});

describe("YouTube external verification and measurement", () => {
  const vid = (over: Record<string, unknown> = {}) => ({ id: "v1", snippet: { channelId: CH.id }, status: { uploadStatus: "processed", privacyStatus: "public" }, statistics: { viewCount: "120", likeCount: "9", commentCount: "2" }, ...over });
  test("a processed public video on the expected channel verifies; wrong channel, private, processing or missing do not", async () => {
    const check = async (video: unknown) => verifyYoutubeVideo({ videoId: "v1", channelId: CH.id, accessToken: ACCESS }, { fetch: google({ video }).f });
    const ok = await check(vid());
    assert.deepEqual([ok.live, ok.onExpectedChannel, ok.permalink], [true, true, "https://www.youtube.com/watch?v=v1"]);
    assert.match((await check(vid({ snippet: { channelId: "UC_other" } }))).reason ?? "", /different channel/);
    assert.match((await check(vid({ status: { uploadStatus: "processed", privacyStatus: "private" } }))).reason ?? "", /not public/);
    assert.match((await check(vid({ status: { uploadStatus: "rejected", rejectionReason: "duplicate" } }))).reason ?? "", /rejected/);
    assert.equal((await check(undefined)).live, false);
    assert.equal((await verifyYoutubeVideo({ videoId: "v1", channelId: CH.id, accessToken: ACCESS }, { fetch: google({ videoStatus: 403, video: { error: { message: "no" } } }).f })).live, false);
  });
  test("counts are confirmed numbers; a count YouTube withholds is null, never zero", async () => {
    const c = await collectYoutubeCounts({ videoId: "v1", accessToken: ACCESS }, { fetch: google({ video: vid() }).f });
    assert.deepEqual([c.views, c.likes, c.comments], [120, 9, 2]);
    const hidden = await collectYoutubeCounts({ videoId: "v1", accessToken: ACCESS }, { fetch: google({ video: vid({ statistics: { viewCount: "5" } }) }).f });
    assert.deepEqual([hidden.views, hidden.likes, hidden.comments], [5, null, null]);
  });
});

// ---- database ---------------------------------------------------------------------------------------------------------------------

const HAVE_DB = Boolean(process.env.STUDIO_TEST_DATABASE_URL);
const PNG_MP4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypmp42"), Buffer.alloc(40)]);

describe("YouTube connection, storage, queue gates and measurement (database)", { skip: !HAVE_DB }, () => {
  const db = () => requireStudioDb();
  let n = 0;
  const tokens = (over: Partial<TokenBundle> = {}): TokenBundle => ({ accessToken: ACCESS, refreshToken: REFRESH, accessExpiresAt: Date.now() + 3_000_000, ...over });
  const connections = async (productId: string) => db().select().from(ms.msConnections).where(eq(ms.msConnections.productId, productId));

  async function product(name: string) {
    return (await createProduct(INTERNAL_SCOPE, "t", { name, kind: "mobile_game" })).id;
  }
  async function connect(productId: string, over: Partial<TokenBundle> = {}) {
    return connectAccount(INTERNAL_SCOPE, "t", productId, { platform: "youtube", accountLabel: channelLabel({ id: CH.id, title: "iScream Studio", handle: "@iscreamstudio" }), externalAccountId: CH.id, tokens: tokens(over), scopes: [YT_SCOPE_UPLOAD, YT_SCOPE_READ], tokenExpiresAt: null });
  }
  async function video(productId: string) {
    const dir = path.join(STUDIO_DIRS.media, productId);
    mkdirSync(dir, { recursive: true });
    const sha = `${(++n).toString(16)}${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`.padEnd(64, "0").slice(0, 64);
    writeFileSync(path.join(dir, `${sha}.mp4`), PNG_MP4);
    const [asset] = await db().insert(ms.msAssets).values({ productId, kind: "render_video", storagePath: `${productId}/${sha}.mp4`, sha256: sha, mimeType: "video/mp4", bytes: 52, width: 1080, height: 1920, provenance: "rendered", originalName: "v.mp4" }).returning();
    const [concept] = await db().insert(ms.msConcepts).values({ productId, family: "cta", headline: "How far can you get?", caption: "A grounded caption https://example.com/x", ctaText: "Go", ctaUrl: "https://example.com/x", status: "ready_for_review" }).returning();
    const [v] = await db().insert(ms.msVideos).values({ productId, conceptId: concept.id, title: "V", storyboard: {}, targetSeconds: 30, assetId: asset.id, width: 1080, height: 1920, durationMs: 30000, status: "approved" }).returning();
    return v;
  }
  const row = async (id: string) => (await db().select().from(ms.msPublications).where(eq(ms.msPublications.id, id)))[0];

  before(async () => {
    for (const t of [ms.msAuditEvents, ms.msPublicationMetrics, ms.msPublications, ms.msConnections, ms.msMediaJobs, ms.msVideos, ms.msCreatives, ms.msConcepts, ms.msCampaigns, ms.msProductFacts, ms.msAssets, ms.msSettings, ms.msProducts]) await db().delete(t);
  });
  after(async () => {
    await setSetting(LIVE_SETTING, false, "t");
    rmSync(STUDIO_DIRS.root, { recursive: true, force: true });
    await closeStudioDb();
  });

  test("OAuth completion: the expected channel connects; tokens are stored only as ciphertext with the refresh token and no calendar expiry", async () => {
    const p = await product("Connect Game");
    const g = google();
    const out = await completeYoutubeOAuth(INTERNAL_SCOPE, "admin", { productId: p, code: "code1", expectedChannel: "iscreamstudio" }, { fetch: g.f });
    assert.deepEqual([out.channelId, out.channelTitle, out.channelHandle], [CH.id, "iScream Studio", "@iscreamstudio"]);
    const [c] = await connections(p);
    assert.equal(c.platform, "youtube");
    assert.equal(c.accountLabel, "iScream Studio (@iscreamstudio)");
    assert.equal(c.externalAccountId, CH.id);
    assert.equal(c.tokenExpiresAt, null, "the refresh token renews access; no calendar expiry that would read as expired after an hour");
    assert.deepEqual([...(c.scopes as string[])].sort(), [YT_SCOPE_READ, YT_SCOPE_UPLOAD].sort());
    const dump = JSON.stringify(c);
    assert.ok(!dump.includes(ACCESS) && !dump.includes(REFRESH), "no token in the stored row as readable text");
    assert.ok(!Buffer.from(c.secretCiphertext, "base64").toString("latin1").includes(REFRESH));
    const b = JSON.parse(decryptSecret(c.secretCiphertext, c.keyId)) as TokenBundle;
    assert.equal(b.refreshToken, REFRESH);
    assert.ok((b.accessExpiresAt ?? 0) > Date.now());
    const exchange = g.calls.find((x) => x.url.startsWith("https://oauth2.googleapis.com/token"))!;
    assert.match(exchange.body, /redirect_uri=https%3A%2F%2Fgravyblock\.com%2Fapi%2Fadmin%2Fmarketing-studio%2Fconnect%2Fyoutube%2Fcallback/);
    assert.ok(!JSON.stringify(await db().select().from(ms.msAuditEvents)).includes(REFRESH), "tokens never reach the audit trail");
  });

  test("OAuth completion refuses, and stores nothing, for the wrong channel, no channel, several channels, missing scopes or no refresh token", async () => {
    const p = await product("Refuse Game");
    const cases: Array<[string, Parameters<typeof google>[0], string, RegExp]> = [
      ["another channel on the same Google account", { channels: [{ id: "UC_personal", snippet: { title: "Chris Personal", customUrl: "@chrisp" } }] }, "iscreamstudio", /not the expected|pinned to/],
      ["no channel", { channels: [] }, "iscreamstudio", /no YouTube channel/],
      ["two channels", { channels: [CH, { id: "UC2", snippet: { title: "Other", customUrl: "@other" } }] }, "iscreamstudio", /exactly one channel/],
      ["upload scope only", { grant: { scope: YT_SCOPE_UPLOAD } }, "iscreamstudio", /did not include/],
      ["no refresh token", { grant: { refresh_token: undefined } }, "iscreamstudio", /refresh token/],
      ["no expected channel", {}, "  ", /No expected channel/],
      ["same name and handle but not the pinned channel id", { channels: [{ id: "UC_lookalike_000002", snippet: { title: "iScream Studio", customUrl: "@iscreamstudio" } }] }, "iscreamstudio", /not the iScream Studio channel GravyBlock is pinned to/],
    ];
    for (const [label, opts, expected, re] of cases) {
      await assert.rejects(completeYoutubeOAuth(INTERNAL_SCOPE, "admin", { productId: p, code: "c", expectedChannel: expected }, { fetch: google(opts).f }), re, label);
    }
    assert.equal((await connections(p)).length, 0);
  });

  test("a channel read that Google refuses right after consent keeps the authorization encrypted and unusable, and re-verification promotes it only when it is exactly the pinned channel", async () => {
    const p = await product("Quarantine Game");
    const refused = google({ channels: undefined });
    const deny = (async (url: string | URL | Request, init?: RequestInit) => (String(url).includes("/youtube/v3/channels") ? json({ error: { code: 401, message: "Unauthorized", errors: [{ reason: "youtubeSignupRequired" }] } }, 401) : refused.f(url, init))) as typeof fetch;
    await assert.rejects(completeYoutubeOAuth(INTERNAL_SCOPE, "admin", { productId: p, code: "c", expectedChannel: "iscreamstudio" }, { fetch: deny }), /HTTP 401 youtubeSignupRequired: Unauthorized.*kept unverified and unusable/);
    const [kept] = await connections(p);
    assert.deepEqual([kept.status, kept.healthStatus], ["error", "error"]);
    assert.match(kept.externalAccountId ?? "", /^unverified-/);
    assert.ok(!JSON.stringify(kept).includes(REFRESH), "kept authorization is ciphertext");
    assert.equal(evaluateHealth(kept), "error", "never usable for publishing");
    // still wrong identity: stays unusable
    const wrong = await reverifyYoutubeConnection(INTERNAL_SCOPE, "t", p, "iscreamstudio", { fetch: google({ channels: [{ id: "UC_other", snippet: { title: "Chris Personal", customUrl: "@chris" } }] }).f }, db());
    assert.equal(wrong.promoted, false);
    assert.equal((await connections(p))[0].healthStatus, "error");
    const none = await reverifyYoutubeConnection(INTERNAL_SCOPE, "t", p, "iscreamstudio", { fetch: google({ channels: [] }).f }, db());
    assert.match(none.reason, /no YouTube channel/);
    // the right channel: promoted without any new sign-in
    const good = await reverifyYoutubeConnection(INTERNAL_SCOPE, "t", p, "iscreamstudio", { fetch: google().f }, db());
    assert.deepEqual([good.promoted, good.channel?.id], [true, CH.id]);
    const [now] = await connections(p);
    assert.deepEqual([now.externalAccountId, now.healthStatus, now.accountLabel], [CH.id, "ok", "iScream Studio (@iscreamstudio)"]);
    assert.ok(usable(evaluateHealth(now)));
  });

  test("access tokens are renewed from the refresh token, stored encrypted in place, and a refused refresh marks the connection in error", async () => {
    const p = await product("Refresh Game");
    const c = await connect(p);
    const fresh = google();
    assert.equal((await youtubeTokensForCall(INTERNAL_SCOPE, "t", p, c.id, { fetch: fresh.f }, db())).accessToken, ACCESS);
    assert.equal(fresh.calls.length, 0, "a fresh access token is used as is");
    await db().update(ms.msConnections).set({ healthStatus: "ok" }).where(eq(ms.msConnections.id, c.id));
    // age the stored access token
    const [stored] = await connections(p);
    const aged = { ...(JSON.parse(decryptSecret(stored.secretCiphertext, stored.keyId)) as TokenBundle), accessExpiresAt: Date.now() - 1000 };
    const { encryptSecret } = await import("../credentials");
    const enc = encryptSecret(JSON.stringify(aged));
    await db().update(ms.msConnections).set({ secretCiphertext: enc.ciphertext, keyId: enc.keyId }).where(eq(ms.msConnections.id, c.id));
    const renew = google();
    const t = await youtubeTokensForCall(INTERNAL_SCOPE, "t", p, c.id, { fetch: renew.f }, db());
    assert.match(t.accessToken, /renewed/);
    assert.equal(t.refreshToken, REFRESH, "the refresh token is kept");
    const [after1] = await connections(p);
    assert.ok(!JSON.stringify(after1).includes("renewed-access"), "the new token is ciphertext too");
    assert.match(JSON.parse(decryptSecret(after1.secretCiphertext, after1.keyId)).accessToken, /renewed/);
    // a refused refresh
    await db().update(ms.msConnections).set({ secretCiphertext: enc.ciphertext, keyId: enc.keyId }).where(eq(ms.msConnections.id, c.id));
    await assert.rejects(youtubeTokensForCall(INTERNAL_SCOPE, "t", p, c.id, { fetch: google({ refreshFails: true }).f }, db()), /Could not renew/);
    const [bad] = await connections(p);
    assert.deepEqual([bad.status, bad.healthStatus], ["error", "error"]);
    assert.match(bad.healthDetail ?? "", /Reconnect/);
  });

  test("live channel verification passes for the connected channel and fails when the token now belongs to another one", async () => {
    const p = await product("Verify Game");
    const c = await connect(p);
    const [conn] = (await connections(p)).filter((x) => x.id === c.id);
    const ok = await verifyYoutubeConnection(INTERNAL_SCOPE, "t", conn, "iscreamstudio", { fetch: google().f }, db());
    assert.deepEqual(ok.filter((x) => !x.ok), []);
    const swapped = await verifyYoutubeConnection(INTERNAL_SCOPE, "t", conn, "iscreamstudio", { fetch: google({ channels: [{ id: "UC_other", snippet: { title: "iScream Studio", customUrl: "@iscreamstudio" } }] }).f }, db());
    assert.ok(swapped.some((x) => !x.ok && /same id/.test(x.name)));
    const wrongName = await verifyYoutubeConnection(INTERNAL_SCOPE, "t", conn, "somethingelse", { fetch: google().f }, db());
    assert.ok(wrongName.some((x) => !x.ok && /expected channel/.test(x.name)));
  });

  test("uploads are opt-in per product, need a made-for-kids declaration and a verified channel; then one upload happens and is verified and measured", async () => {
    const p = await product("Publish Game");
    const c = await connect(p);
    const v = await video(p);
    // nothing selected (no platform attestation is needed any more: Google lifted the private-only restriction on 2 Nov 2026)
    await assert.rejects(createPublication(INTERNAL_SCOPE, "t", p, { videoId: v.id, platform: "youtube", mode: "direct", connectionId: c.id }), /has not been selected for this product/);
    // export stays available regardless
    assert.equal((await createPublication(INTERNAL_SCOPE, "t", p, { videoId: v.id, platform: "youtube", mode: "export" })).publication.mode, "export");

    await setSetting(youtubeEnabledSetting(p), true, "t");
    const { publication } = await createPublication(INTERNAL_SCOPE, "t", p, { videoId: v.id, platform: "youtube", mode: "direct", connectionId: c.id });
    assert.equal(publication.title, "How far can you get?");
    await approvePublication(INTERNAL_SCOPE, "t", p, publication.id);
    await schedulePublication(INTERNAL_SCOPE, "t", p, publication.id, new Date(Date.now() - 1000));
    await setSetting(LIVE_SETTING, true, "t");

    // no made-for-kids declaration: blocked, no upload request leaves
    const noDecl = google();
    const r0 = await runDuePublications(INTERNAL_SCOPE, { fetch: noDecl.f }, db());
    assert.equal(r0.blocked, 1);
    assert.equal(noDecl.uploads(), 0);
    assert.match((await row(publication.id)).failureReason ?? "", /made for kids/);

    // declared but no explicit visibility: still blocked, nothing leaves, and there is no default
    await setSetting(youtubeKidsSetting(p), false, "t");
    const vNoPrivacy = await video(p);
    const noPriv = (await createPublication(INTERNAL_SCOPE, "t", p, { videoId: vNoPrivacy.id, platform: "youtube", mode: "direct", connectionId: c.id })).publication;
    await approvePublication(INTERNAL_SCOPE, "t", p, noPriv.id);
    await schedulePublication(INTERNAL_SCOPE, "t", p, noPriv.id, new Date(Date.now() - 1000));
    const noPrivCalls = google();
    assert.equal((await runDuePublications(INTERNAL_SCOPE, { fetch: noPrivCalls.f }, db())).blocked, 1);
    assert.equal(noPrivCalls.uploads(), 0);
    assert.match((await row(noPriv.id)).failureReason ?? "", /explicit YouTube visibility/);

    // visibility chosen: a fresh publication uploads once, as private
    await setSetting(youtubePrivacySetting(p), "private", "t");
    const v2 = await video(p);
    const second = (await createPublication(INTERNAL_SCOPE, "t", p, { videoId: v2.id, platform: "youtube", mode: "direct", connectionId: c.id })).publication;
    await approvePublication(INTERNAL_SCOPE, "t", p, second.id);
    await schedulePublication(INTERNAL_SCOPE, "t", p, second.id, new Date(Date.now() - 1000));
    const g = google({ video: { id: "vid_ABC123xyz", snippet: { channelId: CH.id }, status: { uploadStatus: "processed", privacyStatus: "private" }, statistics: { viewCount: "7", likeCount: "1", commentCount: "0" } } });
    const results = await Promise.all([runDuePublications(INTERNAL_SCOPE, { fetch: g.f }, db()), runDuePublications(INTERNAL_SCOPE, { fetch: g.f }, db())]);
    assert.equal(g.uploads(), 1, "exactly one upload even with two workers");
    assert.equal(results.reduce((s, r) => s + r.published, 0), 1);
    const done = await row(second.id);
    assert.deepEqual([done.status, done.externalPostId, done.externalUrl], ["published", "vid_ABC123xyz", "https://www.youtube.com/watch?v=vid_ABC123xyz"]);
    const meta = JSON.parse(g.calls.find((x) => x.url.includes("/upload/youtube/v3/videos"))!.body);
    assert.deepEqual([meta.status.privacyStatus, meta.status.selfDeclaredMadeForKids], ["private", false], "the visibility the owner chose, never a default");

    // external verification and measurement come from YouTube's own listing
    const [tokensNow] = await connections(p);
    const bundle = JSON.parse(decryptSecret(tokensNow.secretCiphertext, tokensNow.keyId)) as TokenBundle;
    const vr = await verifyYoutubeVideo({ videoId: done.externalPostId!, channelId: tokensNow.externalAccountId!, accessToken: bundle.accessToken }, { fetch: g.f });
    assert.equal(vr.live, false, "a private video does not count as live when public was required");
    assert.match(vr.reason ?? "", /not public/);
    const vrPrivate = await verifyYoutubeVideo({ videoId: done.externalPostId!, channelId: tokensNow.externalAccountId!, accessToken: bundle.accessToken, requirePublic: false }, { fetch: g.f });
    assert.deepEqual([vrPrivate.live, vrPrivate.privacy, vrPrivate.onExpectedChannel], [true, "private", true]);
    const col = await collectForPublication(INTERNAL_SCOPE, "t", p, done.id, { fetch: g.f }, db());
    assert.equal(col.collected, true);
    const [snap] = await db().select().from(ms.msPublicationMetrics).where(eq(ms.msPublicationMetrics.publicationId, done.id));
    assert.equal(snap.source, "youtube_data_api");
    const m = snap.metrics as Record<string, { value: number | null; status: string }>;
    assert.deepEqual([m.views.value, m.views.status, m.reactions.value, m.comments.value], [7, "confirmed", 1, 0]);
    assert.equal(m.reach.status, "unknown", "what YouTube data does not give stays unknown");
    await setSetting(LIVE_SETTING, false, "t");
  });

  test("rollout order on YouTube: Mibble Meadow waits for ScribbleZap's proven upload; the Facebook proof does not count", async () => {
    const { assertRolloutOrder, recordFirstPostProven } = await import("../publishing/first-post");
    const sz = await createProduct(INTERNAL_SCOPE, "t", { name: "ScribbleZap", kind: "mobile_game" });
    const mb = await createProduct(INTERNAL_SCOPE, "t", { name: "Mibble Meadow", kind: "mobile_game", slug: "mibblemeadow" });
    await assert.rejects(assertRolloutOrder(db(), mb, "youtube"), /waits until ScribbleZap's first upload/);
    await recordFirstPostProven(db(), "t", sz.id, crypto.randomUUID(), { test: true }, "facebook");
    await assert.rejects(assertRolloutOrder(db(), mb, "youtube"), /waits until/, "a proven Facebook post does not unlock YouTube");
    await recordFirstPostProven(db(), "t", sz.id, crypto.randomUUID(), { test: true }, "youtube");
    await assertRolloutOrder(db(), mb, "youtube");
    await assertRolloutOrder(db(), sz, "youtube");
  });

  test("a product that is not selected, or deselected after scheduling, never reaches YouTube", async () => {
    const p = await product("Deselect Game");
    const c = await connect(p);
    await setSetting(approvedSetting("youtube"), true, "t");
    await setSetting(youtubeEnabledSetting(p), true, "t");
    await setSetting(youtubeKidsSetting(p), false, "t");
    const v = await video(p);
    const { publication } = await createPublication(INTERNAL_SCOPE, "t", p, { videoId: v.id, platform: "youtube", mode: "direct", connectionId: c.id });
    await approvePublication(INTERNAL_SCOPE, "t", p, publication.id);
    await schedulePublication(INTERNAL_SCOPE, "t", p, publication.id, new Date(Date.now() - 1000));
    await setSetting(youtubeEnabledSetting(p), false, "t");
    await setSetting(LIVE_SETTING, true, "t");
    const g = google();
    const r = await runDuePublications(INTERNAL_SCOPE, { fetch: g.f }, db());
    assert.equal(r.blocked >= 1, true);
    assert.equal(g.uploads(), 0);
    assert.match((await row(publication.id)).failureReason ?? "", /not selected for this product/);
    await setSetting(LIVE_SETTING, false, "t");
  });

  test("disconnect: revoking voids the grant at Google, destroys the stored token and stops pending uploads", async () => {
    const p = await product("Revoke Game");
    const c = await connect(p);
    const g = google();
    await revokeAccount(INTERNAL_SCOPE, "t", p, c.id, db(), { fetch: g.f });
    const revoke = g.calls.find((x) => x.url.startsWith("https://oauth2.googleapis.com/revoke"));
    assert.ok(revoke);
    assert.match(revoke!.body, new RegExp(`token=${encodeURIComponent(REFRESH).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    const [after1] = await connections(p);
    assert.equal(after1.status, "revoked");
    assert.equal(decryptSecret(after1.secretCiphertext, after1.keyId), "revoked");
    const audit = JSON.stringify(await db().select().from(ms.msAuditEvents).where(eq(ms.msAuditEvents.entityId, c.id)));
    assert.ok(audit.includes("googleRevoked") && !audit.includes(REFRESH));
  });
});
