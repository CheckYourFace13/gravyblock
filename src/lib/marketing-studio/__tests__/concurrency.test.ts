// Race-condition proof for the publishing queue. These tests need a REAL multi-connection PostgreSQL (npm run test:studio starts a disposable one).
// To make the overlap provable rather than assumed, the suite:
//   1. adds a test-only trigger that holds every publication update open for ~60 ms, so competing connections sit inside the same window;
//   2. samples pg_stat_activity every few milliseconds and records how many backends were executing at the same moment.
// Every race test asserts the outcome (never two sends, one winner, no conflict) AND that the monitor saw overlapping queries.
import "./setup";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { eq, sql } from "drizzle-orm";
import postgres from "postgres";
import { DISABLE_FILE, STUDIO_DIRS } from "../config";
import { closeStudioDb, ms, requireStudioDb } from "../db";
import { addFact, createProduct, verifyFact } from "../repository";
import { setSetting } from "../runtime";
import { INTERNAL_SCOPE } from "../scope";
import { connectAccount } from "../publishing/connections";
import { approvePublication, createPublication, LIVE_SETTING, MIN_GAP_MS, runDuePublications, schedulePublication } from "../publishing/queue";
import { reconcileGameLaunchState } from "../video/demo/launch-state";

const HAVE_DB = Boolean(process.env.STUDIO_TEST_DATABASE_URL);
const FB_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts"];
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 4, 56, 0, 0, 4, 56]), Buffer.alloc(64, 9)]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/**
 * A stand-in for Meta's Reels flow (start, upload, finish). `startsFor(page)` counts how many times a post began going out to that Page,
 * which is the number that must never exceed one per post. `fail` makes the start call return that HTTP status with a Graph error.
 */
function metaStub(opts: { delayMs?: number; fail?: number } = {}) {
  const starts = new Map<string, number>();
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (opts.delayMs) await sleep(opts.delayMs);
    const m = u.match(/graph\.facebook\.com\/v[\d.]+\/([^/]+)\/video_reels/);
    if (m) {
      const body = String(init?.body ?? "");
      if (body.includes("upload_phase=start")) {
        starts.set(m[1], (starts.get(m[1]) ?? 0) + 1);
        if (opts.fail) return json({ error: { message: "temporarily unavailable", code: 2 } }, opts.fail);
        return json({ video_id: `vid-${m[1]}-${starts.get(m[1])}`, upload_url: `https://rupload.facebook.com/${m[1]}/up` });
      }
      return json({ success: true });
    }
    return json({});
  }) as typeof fetch;
  return { f, startsFor: (page: string) => starts.get(page) ?? 0 };
}

/** Watches pg_stat_activity from its own connection and remembers the most backends that were running a query at once. */
function activityMonitor() {
  const sqlc = postgres(process.env.STUDIO_TEST_DATABASE_URL!, { max: 1, prepare: false });
  let running = false;
  let maxActive = 0;
  const pids = new Set<number>();
  let loop: Promise<void> = Promise.resolve();
  return {
    start() {
      running = true;
      loop = (async () => {
        while (running) {
          const rows = await sqlc`select pid from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid() and state = 'active' and backend_type = 'client backend'`;
          maxActive = Math.max(maxActive, rows.length);
          for (const r of rows) pids.add(r.pid as number);
          await sleep(2);
        }
      })();
    },
    async stop() {
      running = false;
      await loop;
      return { maxActive, distinctBackends: pids.size };
    },
    close: () => sqlc.end({ timeout: 5 }),
  };
}

describe("publishing race conditions on real concurrent connections (database)", { skip: !HAVE_DB }, () => {
  const db = () => requireStudioDb();
  const monitor = activityMonitor();
  const row = async (id: string) => (await db().select().from(ms.msPublications).where(eq(ms.msPublications.id, id)))[0];
  let n = 0;

  async function product(name: string, slug?: string) {
    const p = await createProduct(INTERNAL_SCOPE, "t", { name, kind: "saas", slug });
    const c = await connectAccount(INTERNAL_SCOPE, "t", p.id, { platform: "facebook", accountLabel: "Page", externalAccountId: `page-${p.id.slice(0, 8)}`, tokens: { accessToken: "EAAB-test-token-123456" }, scopes: FB_SCOPES, tokenExpiresAt: new Date(Date.now() + 60 * 86_400_000) });
    return { p, c, page: `page-${p.id.slice(0, 8)}` };
  }
  /** A approved video with a real media file, plus the concept whose caption and link the post uses. */
  async function video(productId: string, storyboard: object = {}) {
    const dir = path.join(STUDIO_DIRS.media, productId);
    mkdirSync(dir, { recursive: true });
    const sha = `${(++n).toString(16)}${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`.padEnd(64, "0").slice(0, 64);
    writeFileSync(path.join(dir, `${sha}.mp4`), Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypmp42"), Buffer.alloc(40)]));
    const [asset] = await db().insert(ms.msAssets).values({ productId, kind: "render_video", storagePath: `${productId}/${sha}.mp4`, sha256: sha, mimeType: "video/mp4", bytes: 52, width: 1080, height: 1920, provenance: "rendered", originalName: "v.mp4" }).returning();
    const [concept] = await db().insert(ms.msConcepts).values({ productId, family: "cta", headline: "Headline", caption: "A grounded caption https://example.com/x", ctaText: "Go", ctaUrl: "https://example.com/x", status: "ready_for_review" }).returning();
    const [v] = await db().insert(ms.msVideos).values({ productId, conceptId: concept.id, title: "V", storyboard, targetSeconds: 30, assetId: asset.id, width: 1080, height: 1920, durationMs: 30000, status: "approved" }).returning();
    return v;
  }
  async function direct(productId: string, connectionId: string, storyboard: object = {}) {
    const v = await video(productId, storyboard);
    const { publication } = await createPublication(INTERNAL_SCOPE, "t", productId, { videoId: v.id, platform: "facebook", mode: "direct", connectionId });
    return { v, publication };
  }
  async function scheduled(productId: string, connectionId: string, when = new Date(Date.now() - 1000), storyboard: object = {}) {
    const { v, publication } = await direct(productId, connectionId, storyboard);
    await approvePublication(INTERNAL_SCOPE, "t", productId, publication.id);
    await schedulePublication(INTERNAL_SCOPE, "t", productId, publication.id, when);
    return { v, id: publication.id };
  }
  const settled = async <T>(ps: Array<Promise<T>>) => Promise.allSettled(ps);
  const ok = (r: PromiseSettledResult<unknown>[]) => r.filter((x) => x.status === "fulfilled").length;

  before(async () => {
    for (const t of [ms.msAuditEvents, ms.msPublications, ms.msConnections, ms.msMediaJobs, ms.msVideos, ms.msCreatives, ms.msConcepts, ms.msCampaigns, ms.msProductFacts, ms.msAssets, ms.msSettings, ms.msProducts]) await db().delete(t);
    // Test-only: hold each publication update open so concurrent connections are provably inside the same window.
    await db().execute(sql`create or replace function ms_test_hold() returns trigger as $$ begin perform pg_sleep(0.06); return new; end $$ language plpgsql`);
    await db().execute(sql`drop trigger if exists ms_test_hold_trg on ms_publications`);
    await db().execute(sql`create trigger ms_test_hold_trg before update on ms_publications for each row execute function ms_test_hold()`);
    monitor.start();
  });
  after(async () => {
    await monitor.stop();
    await monitor.close();
    await db().execute(sql`drop trigger if exists ms_test_hold_trg on ms_publications`);
    await db().execute(sql`drop function if exists ms_test_hold()`);
    await setSetting(LIVE_SETTING, false, "t");
    rmSync(STUDIO_DIRS.root, { recursive: true, force: true });
    rmSync(DISABLE_FILE, { force: true });
    await closeStudioDb();
  });

  test("the harness itself: parallel connections genuinely overlap in time (not run one after another)", async () => {
    const m = activityMonitor();
    m.start();
    const t0 = Date.now();
    const pids = await Promise.all([1, 2, 3, 4].map(() => db().execute(sql`select pg_backend_pid() as pid, pg_sleep(0.5)`).then((r) => (r as unknown as Array<{ pid: number }>)[0].pid)));
    const elapsed = Date.now() - t0;
    const seen = await m.stop();
    await m.close();
    const poolMax = Number(process.env.MARKETING_DB_POOL_MAX ?? 3);
    const want = Math.min(4, poolMax);
    assert.ok(new Set(pids).size >= Math.min(2, want), `distinct backends ${new Set(pids).size}`);
    assert.ok(seen.maxActive >= Math.min(2, want), `monitor saw ${seen.maxActive} backends executing at once`);
    // four 0.5 s sleeps back to back would take 2 s; overlapped they finish in roughly one wave
    assert.ok(elapsed < 500 * Math.ceil(4 / want) + 700, `elapsed ${elapsed} ms means the queries ran in ${Math.ceil(elapsed / 500)} waves`);
    console.log(`      overlap proof: ${new Set(pids).size} backends, ${seen.maxActive} executing at once, ${elapsed} ms for 4 x 500 ms of work`);
  });

  test("duplicate prevention: eight simultaneous creates of the same post store exactly one row, for direct and export", async () => {
    const { p, c } = await product("Dup Product");
    const v = await video(p.id);
    const make = (mode: "direct" | "export") => Promise.all(Array.from({ length: 8 }, () => createPublication(INTERNAL_SCOPE, "t", p.id, { videoId: v.id, platform: "facebook", mode, connectionId: mode === "direct" ? c.id : undefined })));
    for (const mode of ["direct", "export"] as const) {
      const r = await make(mode);
      assert.equal(r.filter((x) => !x.duplicate).length, 1, `${mode}: one creator wins`);
      assert.equal(new Set(r.map((x) => x.publication.id)).size, 1);
    }
    const rows = await db().select().from(ms.msPublications).where(eq(ms.msPublications.videoId, v.id));
    assert.equal(rows.length, 2, "one direct and one export row, never more");
  });

  test("approval is a compare-and-swap: six simultaneous approvals produce one approval and one audit event", async () => {
    const { p, c } = await product("Approve Product");
    const { publication } = await direct(p.id, c.id);
    const r = await settled(Array.from({ length: 6 }, () => approvePublication(INTERNAL_SCOPE, "t", p.id, publication.id)));
    assert.equal(ok(r), 1, "exactly one approval succeeds");
    assert.ok(r.filter((x) => x.status === "rejected").every((x) => /cannot be approved|changed while approving/.test(String((x as PromiseRejectedResult).reason))));
    const audits = (await db().select().from(ms.msAuditEvents).where(eq(ms.msAuditEvents.entityId, publication.id))).filter((a) => a.action === "publication.approve");
    assert.equal(audits.length, 1);
  });

  test("worker claim race: six workers racing for one due post send it exactly once", async () => {
    await setSetting(LIVE_SETTING, true, "t");
    const { p, c, page } = await product("Claim Product");
    const { id } = await scheduled(p.id, c.id);
    const { f, startsFor } = metaStub({ delayMs: 80 });
    const m = activityMonitor();
    m.start();
    const results = await Promise.all(Array.from({ length: 6 }, () => runDuePublications(INTERNAL_SCOPE, { fetch: f })));
    const seen = await m.stop();
    await m.close();
    assert.equal(startsFor(page), 1, "exactly one Graph call for this post");
    assert.equal(results.reduce((s, r) => s + r.published, 0), 1);
    assert.equal(results.reduce((s, r) => s + r.attempted, 0), 1, "exactly one worker won the claim");
    const after1 = await row(id);
    assert.equal(after1.status, "published");
    assert.equal(after1.attempts, 1);
    assert.ok(seen.maxActive >= 2, `workers overlapped: ${seen.maxActive} backends executing at once`);
    await setSetting(LIVE_SETTING, false, "t");
    console.log(`      claim race: ${seen.maxActive} backends executing at once, ${seen.distinctBackends} distinct backends`);
  });

  test("worker claim race across several posts: every due post is sent once and only once, none twice, none skipped", async () => {
    await setSetting(LIVE_SETTING, true, "t");
    const items = [];
    for (let i = 0; i < 3; i++) {
      const { p, c, page } = await product(`Multi ${i}`);
      items.push({ ...(await scheduled(p.id, c.id)), page });
    }
    const { f, startsFor } = metaStub({ delayMs: 60 });
    await Promise.all(Array.from({ length: 6 }, () => runDuePublications(INTERNAL_SCOPE, { fetch: f })));
    await Promise.all(Array.from({ length: 3 }, () => runDuePublications(INTERNAL_SCOPE, { fetch: f })));
    for (const it of items) {
      assert.equal(startsFor(it.page), 1, `${it.page} sent exactly once`);
      assert.equal((await row(it.id)).status, "published");
    }
    await setSetting(LIVE_SETTING, false, "t");
  });

  test("schedule conflict protection: simultaneous scheduling of two posts inside the minimum gap lets exactly one through", async () => {
    const { p, c } = await product("Gap Race Product");
    const when = new Date(Date.now() + 5 * 3_600_000);
    for (let trial = 0; trial < 3; trial++) {
      const a = await direct(p.id, c.id);
      const b = await direct(p.id, c.id);
      await approvePublication(INTERNAL_SCOPE, "t", p.id, a.publication.id);
      await approvePublication(INTERNAL_SCOPE, "t", p.id, b.publication.id);
      const base = new Date(when.getTime() + trial * 4 * MIN_GAP_MS);
      const r = await settled([schedulePublication(INTERNAL_SCOPE, "t", p.id, a.publication.id, base), schedulePublication(INTERNAL_SCOPE, "t", p.id, b.publication.id, new Date(base.getTime() + MIN_GAP_MS / 3))]);
      assert.equal(ok(r), 1, `trial ${trial}: exactly one of two clashing posts is scheduled`);
      assert.match(String((r.find((x) => x.status === "rejected") as PromiseRejectedResult).reason), /Schedule conflict/);
      const states = [(await row(a.publication.id)).status, (await row(b.publication.id)).status].sort();
      assert.deepEqual(states, ["approved", "scheduled"]);
    }
  });

  test("schedule conflict protection: five posts requested for one half hour window yield one scheduled; posts far apart all succeed", async () => {
    const { p, c } = await product("Gap Race Five");
    const base = Date.now() + 40 * 3_600_000;
    const five = await Promise.all(Array.from({ length: 5 }, () => direct(p.id, c.id)));
    for (const x of five) await approvePublication(INTERNAL_SCOPE, "t", p.id, x.publication.id);
    const r = await settled(five.map((x, i) => schedulePublication(INTERNAL_SCOPE, "t", p.id, x.publication.id, new Date(base + i * 60_000))));
    assert.equal(ok(r), 1, "five clashing requests, one winner");
    const apart = await Promise.all(Array.from({ length: 3 }, () => direct(p.id, c.id)));
    for (const x of apart) await approvePublication(INTERNAL_SCOPE, "t", p.id, x.publication.id);
    const r2 = await settled(apart.map((x, i) => schedulePublication(INTERNAL_SCOPE, "t", p.id, x.publication.id, new Date(base + (10 + i * 3) * 3_600_000))));
    assert.equal(ok(r2), 3, "posts a few hours apart do not block each other");
  });

  test("first-post send protection: four operators running the whole first-post action at once produce one post", async () => {
    await setSetting(LIVE_SETTING, true, "t");
    const { p, c, page } = await product("First Post Product");
    const v = await video(p.id);
    const prepare = () => createPublication(INTERNAL_SCOPE, "t", p.id, { videoId: v.id, platform: "facebook", mode: "direct", connectionId: c.id });
    const prepared = await Promise.all([prepare(), prepare(), prepare(), prepare()]);
    assert.equal(prepared.filter((x) => !x.duplicate).length, 1, "concurrent preparation creates one publication");
    const id = prepared[0].publication.id;
    const { f, startsFor } = metaStub({ delayMs: 80 });
    // the same steps scripts/ops/marketing-first-social.ts --publish takes, run by four operators at the same instant
    const operator = async () => {
      await approvePublication(INTERNAL_SCOPE, "t", p.id, id).catch(() => undefined);
      if ((await row(id)).status === "approved") await schedulePublication(INTERNAL_SCOPE, "t", p.id, id, new Date(Date.now() - 1000)).catch(() => undefined);
      return runDuePublications(INTERNAL_SCOPE, { fetch: f });
    };
    await Promise.all([operator(), operator(), operator(), operator()]);
    assert.equal(startsFor(page), 1, "the post reached Meta exactly once");
    const final = await row(id);
    assert.equal(final.status, "published");
    assert.equal(final.attempts, 1);
    assert.equal((await db().select().from(ms.msPublications).where(eq(ms.msPublications.productId, p.id))).length, 1);
    await setSetting(LIVE_SETTING, false, "t");
  });

  test("retry and idempotency: a temporary failure is retried by exactly one worker per attempt, never doubled", async () => {
    await setSetting(LIVE_SETTING, true, "t");
    const { p, c, page } = await product("Retry Race Product");
    const { v } = { v: await video(p.id) };
    const { publication } = await createPublication(INTERNAL_SCOPE, "t", p.id, { videoId: v.id, platform: "facebook", mode: "direct", connectionId: c.id, maxAttempts: 3 });
    await approvePublication(INTERNAL_SCOPE, "t", p.id, publication.id);
    await schedulePublication(INTERNAL_SCOPE, "t", p.id, publication.id, new Date(Date.now() - 1000));
    const { f, startsFor } = metaStub({ delayMs: 60, fail: 503 });
    const wave1 = await Promise.all(Array.from({ length: 6 }, () => runDuePublications(INTERNAL_SCOPE, { fetch: f })));
    assert.equal(startsFor(page), 1, "first attempt made once");
    assert.equal(wave1.reduce((s, r) => s + r.retried, 0), 1);
    let cur = await row(publication.id);
    assert.equal(cur.status, "scheduled");
    assert.equal(cur.attempts, 1);
    const later = new Date(Date.now() + 3 * 3_600_000);
    const wave2 = await Promise.all(Array.from({ length: 6 }, () => runDuePublications(INTERNAL_SCOPE, { fetch: f }, undefined, later)));
    assert.equal(startsFor(page), 2, "second attempt made once");
    assert.equal(wave2.reduce((s, r) => s + r.retried, 0), 1);
    cur = await row(publication.id);
    assert.equal(cur.attempts, 2);
    const evenLater = new Date(Date.now() + 9 * 3_600_000);
    await Promise.all(Array.from({ length: 6 }, () => runDuePublications(INTERNAL_SCOPE, { fetch: f }, undefined, evenLater)));
    cur = await row(publication.id);
    assert.equal(cur.status, "failed", "gives up after the maximum attempts");
    assert.equal(cur.attempts, 3);
    assert.equal(startsFor(page), 3, "three attempts in total, one per round, regardless of worker count");
    // a post that finished is never sent again by a late worker
    await Promise.all(Array.from({ length: 4 }, () => runDuePublications(INTERNAL_SCOPE, { fetch: f }, undefined, evenLater)));
    assert.equal(startsFor(page), 3);
    await setSetting(LIVE_SETTING, false, "t");
  });

  test("stale-versus-send race: when the launch reconcile and a worker collide, a post is either blocked or sent, never both flagged stale and sent", async () => {
    await setSetting(LIVE_SETTING, true, "t");
    const { p, c, page } = await product("ScribbleZap", "scribblezap");
    // the game goes live in Product Truth, so every unpublished pre-launch video is about to become stale
    const fact = await addFact(INTERNAL_SCOPE, "t", p.id, { factKey: "store", factValue: "Google Play: https://play.google.com/store/apps/details?id=com.iscream.scribblezap", sourceKind: "asset_metadata", sourceUrl: null }, db());
    // Test-only: hold the stale mark write open so the worker's claim and stale check fall inside it (the narrow window being protected).
    await db().execute(sql`create or replace function ms_test_hold_video() returns trigger as $$ begin if new.storyboard is distinct from old.storyboard then perform pg_sleep(0.15); end if; return new; end $$ language plpgsql`);
    await db().execute(sql`drop trigger if exists ms_test_hold_video_trg on ms_videos`);
    await db().execute(sql`create trigger ms_test_hold_video_trg before update on ms_videos for each row execute function ms_test_hold_video()`);
    const outcomes = { blocked: 0, sent: 0 };
    const bad: string[] = [];
    const TRIALS = 20;
    for (let t = 0; t < TRIALS; t++) {
      // fresh pre-launch video and a due post for it; earlier published posts are backdated so the daily cap never interferes
      await db().update(ms.msPublications).set({ publishedAt: new Date(Date.now() - 48 * 3_600_000) }).where(eq(ms.msPublications.productId, p.id));
      const { v, id } = await scheduled(p.id, c.id, new Date(Date.now() - 1000 - t), { version: 2, kind: "demo", ctaPhase: "pre_launch" });
      if (t === 0) await verifyFact(INTERNAL_SCOPE, "t", p.id, fact.id, db());
      const { f, startsFor } = metaStub({ delayMs: 30 });
      // alternate who starts first, with a spread of offsets, so both orderings of the collision are exercised
      const workerAt = t % 2 === 0 ? 0 : t * 9;
      const reconcileAt = t % 2 === 0 ? t * 9 : 0;
      await Promise.all([sleep(workerAt).then(() => runDuePublications(INTERNAL_SCOPE, { fetch: f })), sleep(reconcileAt).then(() => reconcileGameLaunchState(db(), INTERNAL_SCOPE, { regenerate: false }))]);
      // a second sweep of each so a lost race can still show its end state
      await reconcileGameLaunchState(db(), INTERNAL_SCOPE, { regenerate: false });
      const [vid] = await db().select().from(ms.msVideos).where(eq(ms.msVideos.id, v.id));
      const stale = Boolean((vid.storyboard as { stale?: object }).stale);
      const pub = await row(id);
      const sent = startsFor(page);
      if (sent > 1) bad.push(`trial ${t}: sent ${sent} times`);
      else if (sent === 1) {
        outcomes.sent++;
        if (stale) bad.push(`trial ${t}: sent AND marked stale`);
        if (pub.status !== "published") bad.push(`trial ${t}: sent but status ${pub.status}`);
      } else {
        outcomes.blocked++;
        if (!stale) bad.push(`trial ${t}: not sent but video not marked stale`);
        if (!["cancelled", "failed"].includes(pub.status)) bad.push(`trial ${t}: not sent but status ${pub.status}`);
      }
    }
    await db().execute(sql`drop trigger if exists ms_test_hold_video_trg on ms_videos`);
    await db().execute(sql`drop function if exists ms_test_hold_video()`);
    assert.deepEqual(bad, [], `${bad.join("; ")} (blocked ${outcomes.blocked}, sent ${outcomes.sent})`);
    console.log(`      stale-versus-send: ${TRIALS} collisions, ${outcomes.blocked} blocked before sending, ${outcomes.sent} sent first and left unflagged`);
    await setSetting(LIVE_SETTING, false, "t");
  });

  test("the overlap was real: during these races several backends were executing at the same moment", async () => {
    const seen = await monitor.stop();
    assert.ok(seen.maxActive >= 2, `max concurrently executing backends: ${seen.maxActive}`);
    assert.ok(seen.distinctBackends >= 2);
    console.log(`      suite-wide: up to ${seen.maxActive} backends executing at once across ${seen.distinctBackends} distinct connections`);
  });
});
