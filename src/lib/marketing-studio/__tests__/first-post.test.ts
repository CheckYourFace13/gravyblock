import "./setup";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { closeStudioDb, ms, requireStudioDb } from "../db";
import { FIRST_SOCIAL, prePublishChecks, recordFirstPostProven, verifyPageOwnership } from "../publishing/first-post";
import { createPublication } from "../publishing/queue";
import { createProduct } from "../repository";
import { INTERNAL_SCOPE } from "../scope";
import type { DemoRecord } from "../video/demo/types";

const SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "read_insights"];
const json = (b: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(b), { status }));

describe("iScream Studio Page ownership check", () => {
  const conn = { externalAccountId: "123", accountLabel: "iScream Studio", scopes: SCOPES };
  test("a verified Page with every permission passes; nothing is sent", async () => {
    const calls: string[] = [];
    const checks = await verifyPageOwnership(conn, "tok", {
      fetch: ((u: string, i?: RequestInit) => {
        calls.push(`${i?.method} ${u.split("?")[0]}`);
        return json({ id: "123", name: "iScream Studio", category: "Software" });
      }) as never,
    });
    assert.deepEqual(checks.filter((c) => !c.ok), []);
    assert.ok(calls.length > 0 && calls.every((c) => c.startsWith("GET ")));
  });
  test("a personal profile (no Page category), a different name, missing permissions or a Meta error all fail", async () => {
    const f = (b: unknown, s = 200) => ({ fetch: (() => json(b, s)) as never });
    assert.ok((await verifyPageOwnership(conn, "t", f({ id: "123", name: "iScream Studio" }))).some((c) => c.name.includes("not a personal profile") && !c.ok));
    assert.ok((await verifyPageOwnership(conn, "t", f({ id: "123", name: "Someone Else", category: "x" }))).some((c) => !c.ok));
    assert.ok((await verifyPageOwnership({ ...conn, accountLabel: "Chris Personal" }, "t", f({ id: "123", name: "iScream Studio", category: "x" }))).some((c) => !c.ok));
    assert.ok((await verifyPageOwnership({ ...conn, scopes: ["pages_show_list"] }, "t", f({ id: "123", name: "iScream Studio", category: "x" }))).some((c) => c.name.includes("permissions") && !c.ok));
    assert.ok((await verifyPageOwnership(conn, "t", f({ error: { message: "nope" } }, 400))).some((c) => !c.ok));
  });
});

const record = (over: Partial<DemoRecord> = {}): DemoRecord => ({
  version: 2,
  kind: "demo",
  classification: "PRODUCT_DEMO",
  title: "t",
  durationMs: 20000,
  transcript: [{ id: "L1", sceneId: "a", text: "One cut. Big payoff.", caption: "One cut. Big payoff.", startMs: 0, endMs: 1000 }],
  scenes: [],
  claims: [{ id: "c", text: "x", sceneId: "a", factIds: ["f1"], factsVerified: true, sources: [{ url: "u", capturedAt: "t", quote: "q", onPage: true }] }],
  onScreen: [],
  cta: { text: "Follow iScream Studio", url: "https://iscreamstudio.com/games/scribblezap/" },
  ctaPhase: "pre_launch",
  audio: {} as never,
  capturedAt: "t",
  ...over,
});
const base = () => ({
  productSlug: "scribblezap",
  productId: "p",
  publication: { productId: "p", caption: "One cut. Big payoff. Follow iScream Studio: https://iscreamstudio.com/games/scribblezap/?utm_source=facebook", ctaUrl: "https://iscreamstudio.com/games/scribblezap/?utm_source=facebook", status: "approval_required", connectionId: "c1", assetId: "a" },
  connection: { id: "c1", productId: "p" },
  video: { assetId: "a", status: "approved", qaPassed: true, stale: false, record: record() },
  facts: [{ id: "f1", value: "x", verified: true }],
  alreadyPublishedForProduct: 0,
});
const failed = (i: ReturnType<typeof base>) => prePublishChecks(i).filter((c) => !c.ok).map((c) => c.name);

describe("pre-publish checklist for the first post", () => {
  test("a clean ScribbleZap post passes every check", () => assert.deepEqual(failed(base()), []));
  test("each unsafe condition is caught", () => {
    const b = base();
    assert.ok(failed({ ...b, video: { ...b.video, status: "ready_for_review" } }).length);
    assert.ok(failed({ ...b, video: { ...b.video, stale: true } }).length);
    assert.ok(failed({ ...b, publication: { ...b.publication, caption: b.publication.caption + " mail chris@gmail.com" } }).length);
    assert.ok(failed({ ...b, publication: { ...b.publication, caption: b.publication.caption + " call 555 123 4567" } }).length);
    assert.ok(failed({ ...b, publication: { ...b.publication, ctaUrl: "https://evil.example/x" } }).length);
    assert.ok(failed({ ...b, publication: { ...b.publication, status: "published" } }).length);
    assert.ok(failed({ ...b, alreadyPublishedForProduct: 1 }).length);
    assert.ok(failed({ ...b, productSlug: "mibblemeadow" }).length, "Mibble cannot be the first candidate");
    assert.ok(failed({ ...b, publication: { ...b.publication, caption: "Coming soon! Download now" } }).length);
    assert.ok(failed({ ...b, connection: { id: "c1", productId: "other" } }).length);
    assert.ok(failed({ ...b, video: { ...b.video, record: record({ claims: [{ id: "c", text: "x", sceneId: "a", factIds: ["f1"], factsVerified: false, sources: [] }] }) } }).length);
  });
  test("once the game is live, a stale pre-launch CTA fails and the install CTA passes", () => {
    const b = base();
    const live = { ...b, facts: [...b.facts, { id: "s", value: "https://play.google.com/store/apps/details?id=x", verified: true }] };
    assert.ok(failed(live).length, "pre-launch creative is stale once live");
    const ok = {
      ...live,
      video: { ...b.video, record: record({ ctaPhase: "store_live", cta: { text: "Get it on Google Play", url: "https://play.google.com/store/apps/details?id=x" } }) },
      publication: { ...b.publication, ctaUrl: "https://play.google.com/store/apps/details?id=x" },
    };
    assert.deepEqual(failed(ok), []);
  });
});

const HAVE_DB = Boolean(process.env.STUDIO_TEST_DATABASE_URL);
describe("rollout order: Mibble Meadow waits for the proven ScribbleZap first post (database)", { skip: !HAVE_DB }, () => {
  let sz = "";
  let mb = "";
  before(async () => {
    const db = requireStudioDb();
    for (const t of [ms.msAuditEvents, ms.msPublications, ms.msConnections, ms.msMediaJobs, ms.msVideos, ms.msCreatives, ms.msConcepts, ms.msCampaigns, ms.msProductFacts, ms.msAssets, ms.msSettings, ms.msProducts]) await db.delete(t);
    sz = (await createProduct(INTERNAL_SCOPE, "t", { name: "ScribbleZap", kind: "mobile_game" })).id;
    mb = (await createProduct(INTERNAL_SCOPE, "t", { name: "Mibble Meadow", kind: "mobile_game", slug: "mibblemeadow" })).id;
  });
  after(async () => {
    await closeStudioDb();
  });
  test("a direct Mibble post is refused until the ScribbleZap loop is proven; exports and ScribbleZap are not blocked by it", async () => {
    const db = requireStudioDb();
    const wait = /waits until ScribbleZap/;
    await assert.rejects(createPublication(INTERNAL_SCOPE, "t", mb, { videoId: crypto.randomUUID(), platform: "facebook", mode: "direct" }), wait);
    await assert.rejects(createPublication(INTERNAL_SCOPE, "t", sz, { videoId: crypto.randomUUID(), platform: "facebook", mode: "direct" }), (e: Error) => !wait.test(e.message));
    await assert.rejects(createPublication(INTERNAL_SCOPE, "t", mb, { videoId: crypto.randomUUID(), platform: "facebook" }), (e: Error) => !wait.test(e.message));
    await recordFirstPostProven(db, "t", sz, crypto.randomUUID(), { test: true });
    await assert.rejects(createPublication(INTERNAL_SCOPE, "t", mb, { videoId: crypto.randomUUID(), platform: "facebook", mode: "direct" }), (e: Error) => !wait.test(e.message));
    assert.equal(FIRST_SOCIAL.order[0], "scribblezap");
  });
});
