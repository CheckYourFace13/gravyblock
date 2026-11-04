// Pure tests run anywhere. Database tests need a scratch database (name contains "test"):
//   STUDIO_TEST_DATABASE_URL=postgresql://.../gb_studio_test MARKETING_DB_POOL_MAX=1 npx tsx --test --test-concurrency=1 src/lib/marketing-studio/__tests__/review.test.ts
import "./setup";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { STUDIO_DIRS } from "../config";
import { reviewCreative } from "../creative/copy";
import { closeStudioDb, ms, requireStudioDb } from "../db";
import { createProduct } from "../repository";
import { INTERNAL_SCOPE } from "../scope";
import { matchFacts, pickRepresentatives, summarizeQa, loadReview, type FactRef, type ReviewCreative } from "../review";
import { buildReviewBundle, renderIndexHtml } from "../review-bundle";
import { reviewVideo } from "../video/queue";

const qa = (passed: boolean) => ({ passed, checks: 3, failed: passed ? [] : [{ id: "contrast", detail: "too low", severity: "fail" }] });
const cr = (over: Partial<ReviewCreative>): ReviewCreative => ({
  creativeId: Math.random().toString(16).slice(2),
  assetId: "a",
  conceptId: "c1",
  family: "product_benefit",
  campaign: null,
  headline: `Headline ${Math.random().toString(16).slice(2)}`,
  subhead: null,
  caption: "C",
  ctaText: null,
  ctaUrl: null,
  sizeKey: "square",
  width: 1080,
  height: 1080,
  aspect: "1:1",
  status: "ready_for_review",
  qa: qa(true),
  facts: [],
  ...over,
});

describe("review selection (pure)", () => {
  test("one image per concept, preferring square, and different angles come first", () => {
    const items = [
      cr({ conceptId: "a", family: "feature_highlight", sizeKey: "story", width: 1080, height: 1920 }),
      cr({ conceptId: "a", family: "feature_highlight", sizeKey: "square" }),
      cr({ conceptId: "b", family: "feature_highlight" }),
      cr({ conceptId: "c", family: "product_benefit" }),
      cr({ conceptId: "d", family: "announcement" }),
      cr({ conceptId: "e", family: "feature_highlight" }),
    ];
    const picked = pickRepresentatives(items, 4);
    assert.equal(picked.length, 4);
    assert.equal(new Set(picked.map((p) => p.conceptId)).size, 4);
    assert.ok(picked.every((p) => p.sizeKey === "square"));
    assert.deepEqual(new Set(picked.slice(0, 3).map((p) => p.family)), new Set(["feature_highlight", "product_benefit", "announcement"]));
  });
  test("failed QA, rejected, and image-less creatives are never representative", () => {
    const picked = pickRepresentatives([cr({ conceptId: "a", qa: qa(false) }), cr({ conceptId: "b", status: "rejected" }), cr({ conceptId: "c", assetId: null }), cr({ conceptId: "d", status: "qa_failed" }), cr({ conceptId: "e" })]);
    assert.deepEqual(picked.map((p) => p.conceptId), ["e"]);
  });
  test("QA summary counts failures and treats warnings as non-blocking", () => {
    assert.equal(summarizeQa({ passed: true, checks: [{ id: "a", ok: true }, { id: "b", ok: false, severity: "warn", detail: "meh" }] }).passed, true);
    assert.equal(summarizeQa({ passed: true, checks: [{ id: "a", ok: false, severity: "fail", detail: "bad" }] }).passed, false);
    assert.equal(summarizeQa(null).passed, false);
  });
  test("video text is matched to the facts it came from, and unrelated facts are not", () => {
    const facts: FactRef[] = [
      { id: "1", key: "tagline", value: "Rent anything, anywhere.", sourceKind: "public_page", sourceUrl: "https://x.com", verified: true },
      { id: "2", key: "feature", value: "Unrelated pricing thing", sourceKind: "public_page", sourceUrl: null, verified: true },
    ];
    assert.deepEqual(matchFacts(["Rent anything anywhere"], facts).map((f) => f.id), ["1"]);
  });
  test("bundle index escapes text and says nothing was published", () => {
    const html = renderIndexHtml([{ product: { productId: "p", slug: "x", name: "<b>X</b>", kind: "saas", representatives: [], all: [], totalCreatives: 0, video: null, videoNote: null, otherVideos: 0 }, images: [{ c: cr({ headline: '<script>alert("x")</script>', caption: "a & b" }), file: "x-01.png" }], video: null }], new Date("2026-11-03T00:00:00Z"));
    assert.ok(!html.includes("<script>alert"));
    assert.ok(html.includes("&lt;script&gt;"));
    assert.ok(html.includes("a &amp; b"));
    assert.match(html, /Nothing here has been published/);
    assert.match(html, /noindex/);
  });
});

const HAVE_DB = Boolean(process.env.STUDIO_TEST_DATABASE_URL);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 4, 56, 0, 0, 4, 56]), Buffer.alloc(64, 9)]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypmp42"), Buffer.alloc(40)]);

describe("owner review (database)", { skip: !HAVE_DB }, () => {
  const ids: Record<string, { productId: string; creatives: string[]; video: string }> = {};
  const SLUGS = [["DrinkKnird", "website"], ["RentalNoodle", "saas"], ["ScribbleZap", "mobile_game"]] as const;

  before(async () => {
    const db = requireStudioDb();
    for (const t of [ms.msAuditEvents, ms.msPublicationMetrics, ms.msPublications, ms.msConnections, ms.msVideos, ms.msCreatives, ms.msConcepts, ms.msCampaigns, ms.msProductFacts, ms.msAssets, ms.msSettings, ms.msProducts]) await db.delete(t);
    let n = 0;
    for (const [name, kind] of SLUGS) {
      const p = await createProduct(INTERNAL_SCOPE, "t", { name, kind });
      const dir = path.join(STUDIO_DIRS.media, p.id);
      mkdirSync(dir, { recursive: true });
      const put = async (ext: string, bytes: Buffer, mime: string, kindName: string, original: string, w: number, h: number) => {
        const sha = `${(++n).toString(16)}${Math.random().toString(16).slice(2)}`.padEnd(64, "0").slice(0, 64);
        writeFileSync(path.join(dir, `${sha}.${ext}`), bytes);
        const [a] = await db.insert(ms.msAssets).values({ productId: p.id, kind: kindName, storagePath: `${p.id}/${sha}.${ext}`, sha256: sha, mimeType: mime, bytes: bytes.length, width: w, height: h, provenance: kindName === "screenshot" ? "owner_upload" : "rendered", originalName: original }).returning();
        return a;
      };
      const [fact] = await db.insert(ms.msProductFacts).values({ productId: p.id, factKey: "tagline", factValue: `${name} makes this simple.`, sourceKind: "public_page", sourceUrl: `https://${name.toLowerCase()}.com`, contentHash: `h${n}`, status: "current", verifiedBy: "t", verifiedAt: new Date() }).returning();
      const [camp] = await db.insert(ms.msCampaigns).values({ productId: p.id, name: "Pilot launch", objective: "awareness" }).returning();
      const creatives: string[] = [];
      const families = ["feature_highlight", "product_benefit", "announcement", "cta", "feature_highlight"];
      for (const [i, family] of families.entries()) {
        const [concept] = await db.insert(ms.msConcepts).values({ productId: p.id, campaignId: camp.id, family, headline: `${name} headline ${i}`, caption: `${name} caption ${i}`, ctaText: "Learn more", ctaUrl: `https://${name.toLowerCase()}.com/`, factIds: [fact.id], status: "ready_for_review" }).returning();
        for (const size of ["square", "story"] as const) {
          const a = await put("png", PNG, "image/png", "render_image", `${name}-${i}-${size}.png`, 1080, size === "square" ? 1080 : 1920);
          const [c] = await db.insert(ms.msCreatives).values({ productId: p.id, conceptId: concept.id, assetId: a.id, sizeKey: size, width: 1080, height: size === "square" ? 1080 : 1920, templateFamily: "x", templateVersion: "t", status: "ready_for_review", qa: { passed: i !== 4, checks: [{ id: "c", ok: i !== 4, severity: "fail", detail: "x" }] } }).returning();
          creatives.push(c.id);
        }
      }
      const shot = await put("png", PNG, "image/png", "screenshot", `${name}-shot.png`, 1080, 1080);
      const v = await put("mp4", MP4, "video/mp4", "render_video", `${name}.mp4`, 1080, 1920);
      const demoRecord = {
        version: 2,
        kind: "demo",
        classification: "PRODUCT_DEMO",
        title: "RentalNoodle demo",
        durationMs: 29000,
        transcript: [{ id: "L1", sceneId: "s1", text: "Prorating rent for a mid-month move-in?", caption: "Prorating rent for a mid-month move-in?", startMs: 300, endMs: 2500 }],
        scenes: [{ id: "s1", kind: "screen", startMs: 0, endMs: 3000, purpose: "Hook", motion: ["cursor", "typing", "camera"], headline: "Mid-month move-in?", sourceVisual: { plate: "prorate", url: "https://rentalnoodle.com/tools/prorated-rent", capturedAt: "2026-11-03T00:00:00.000Z", states: ["Calculator as it loads"], note: "Real states of the calculator" } }],
        claims: [{ id: "c1", text: "RentalNoodle has a prorated rent calculator.", sceneId: "s1", factIds: ["f1"], factsVerified: true, sources: [{ url: "https://rentalnoodle.com/tools", capturedAt: "2026-11-03T00:00:00.000Z", quote: "Mid-month move-in/out", onPage: true }] }],
        onScreen: [{ sceneId: "s1", kind: "headline", text: "Mid-month move-in?", claim: "c1" }],
        cta: { text: "Start Managing Free", url: "https://rentalnoodle.com/sign-up" },
        audio: { voiceover: { engine: "Kokoro-82M", model: "m", voice: "af_heart", license: "Apache-2.0", cost: "$0", speed: 1 }, music: { source: "generated", license: "original", cost: "$0" } },
        capturedAt: "2026-11-03T00:00:00.000Z",
      };
      const isDemo = name === "RentalNoodle";
      const [video] = await db.insert(ms.msVideos).values({
        productId: p.id,
        title: `${name} video`,
        storyboard: isDemo ? demoRecord : { version: 1, classification: name === "ScribbleZap" ? "TEASER_ONLY" : "SLIDESHOW_NOT_PRODUCTION_READY", transition: "fade", scenes: [{ type: "card", seconds: 4, family: "product_benefit", headline: `${name} makes this simple.`, subhead: "A verified sentence." }, { type: "image", seconds: 4, assetId: shot.id, motion: "zoom_in", caption: "Real screen" }, { type: "card", seconds: 4, family: "cta", headline: "Try it", cta: { text: "Learn more", url: `https://${name.toLowerCase()}.com/` } }] },
        targetSeconds: 15,
        assetId: v.id,
        width: 1080,
        height: 1920,
        durationMs: isDemo ? 29000 : 15000,
        status: isDemo ? "ready_for_review" : "rejected",
        qa: { passed: true, checks: [{ id: "cta_readable", ok: true, severity: "fail", detail: "ok" }] },
      }).returning();
      ids[name] = { productId: p.id, creatives, video: video.id };
    }
  });
  after(async () => {
    rmSync(STUDIO_DIRS.root, { recursive: true, force: true });
    await closeStudioDb();
  });

  test("loads all three pilots with 4 representative images, the video, QA and provenance", async () => {
    const review = await loadReview(INTERNAL_SCOPE);
    assert.deepEqual(review.map((p) => p.slug), ["drinkknird", "rentalnoodle", "scribblezap"]);
    for (const p of review) {
      assert.equal(p.representatives.length, 4);
      assert.equal(p.totalCreatives, 10);
      assert.ok(p.representatives.every((c) => c.qa.passed && c.assetId && c.facts.length === 1 && c.facts[0].verified && c.campaign === "Pilot launch" && c.sizeKey === "square" && c.aspect === "1:1"));
      if (p.slug === "rentalnoodle") {
        assert.ok(p.video && p.video.assetId && p.video.durationSec === 29 && p.video.qa.passed);
        assert.equal(p.video.demo?.kind, "demo");
        assert.equal(p.video.demo?.transcript.length, 1);
        assert.equal(p.video.demo?.claims[0].sources[0].onPage, true);
        assert.equal(p.video.demo?.cta.text, "Start Managing Free");
        assert.ok(p.video.qaChecks.length >= 1);
        assert.equal(p.videoNote, null);
      } else {
        // a slideshow the owner rejected is history: no player, an explanation instead
        assert.equal(p.video, null);
        assert.match(p.videoNote ?? "", /rejected as not production-ready/);
        assert.match(p.videoNote ?? "", p.slug === "scribblezap" ? /TEASER ONLY/ : /SLIDESHOW NOT PRODUCTION READY/);
        assert.match(p.videoNote ?? "", /not production-ready/);
      }
    }
  });

  test("approve, reject and regenerate later only change the review status and never create publications", async () => {
    const { productId, creatives } = ids.DrinkKnird;
    const db = requireStudioDb();
    const cid = creatives[0];
    await reviewCreative(INTERNAL_SCOPE, "t", productId, cid, "approved");
    await reviewCreative(INTERNAL_SCOPE, "t", productId, cid, "regenerate_later");
    assert.equal((await db.select().from(ms.msCreatives).where(eq(ms.msCreatives.id, cid)))[0].status, "regenerate_later");
    await reviewCreative(INTERNAL_SCOPE, "t", productId, cid, "rejected");
    await reviewCreative(INTERNAL_SCOPE, "t", productId, cid, "approved");
    assert.equal((await db.select().from(ms.msCreatives).where(eq(ms.msCreatives.id, cid)))[0].status, "approved");
    assert.equal((await db.select().from(ms.msPublications)).length, 0);
    assert.equal((await db.select().from(ms.msMediaJobs)).length, 0);
    assert.equal((await db.select().from(ms.msConnections)).length, 0);
  });

  test("a creative that failed QA can never be approved, even after being rejected", async () => {
    const { productId } = ids.DrinkKnird;
    const db = requireStudioDb();
    const [bad] = await db.select().from(ms.msCreatives).where(eq(ms.msCreatives.productId, productId)).then((rows) => rows.filter((r) => !(r.qa as { passed: boolean }).passed));
    await reviewCreative(INTERNAL_SCOPE, "t", productId, bad.id, "rejected");
    await assert.rejects(reviewCreative(INTERNAL_SCOPE, "t", productId, bad.id, "approved"), /passed QA/);
  });

  test("a video can be approved or sent back, and approval publishes nothing", async () => {
    const { productId, video } = ids.RentalNoodle;
    const db = requireStudioDb();
    await reviewVideo(INTERNAL_SCOPE, "t", productId, video, "approved");
    assert.equal((await db.select().from(ms.msVideos).where(eq(ms.msVideos.id, video)))[0].status, "approved");
    await reviewVideo(INTERNAL_SCOPE, "t", productId, video, "regenerate_later");
    assert.equal((await db.select().from(ms.msVideos).where(eq(ms.msVideos.id, video)))[0].status, "regenerate_later");
    assert.equal((await db.select().from(ms.msPublications)).length, 0);
  });

  test("another scope cannot review these products", async () => {
    await assert.rejects(reviewCreative({ kind: "customer", organizationId: "00000000-0000-4000-8000-000000000001" }, "t", ids.ScribbleZap.productId, ids.ScribbleZap.creatives[0], "approved"));
  });

  test("the bundle holds 12 images, the demo video and an index with captions, CTAs, transcript and claim sources", async () => {
    // Put the video back in review so all three pilot videos are present.
    await reviewVideo(INTERNAL_SCOPE, "t", ids.RentalNoodle.productId, ids.RentalNoodle.video, "approved");
    const b = await buildReviewBundle(INTERNAL_SCOPE);
    assert.equal(b.images, 12);
    assert.equal(b.videos, 1);
    assert.equal(b.files.length, 14);
    assert.ok(b.files.includes("index.html"));
    assert.ok(b.files.every((f) => /^[A-Za-z0-9._-]+$/.test(f)));
    assert.match(b.fileName, /^marketing-studio-review-\d{4}-\d{2}-\d{2}\.zip$/);
    const text = b.zip.toString("latin1");
    assert.ok(text.includes("rentalnoodle-pilot-video.mp4"));
    assert.ok(!text.includes("drinkknird-pilot-video.mp4"), "a rejected slideshow must not be in the bundle");
    assert.ok(text.includes("Prorating rent for a mid-month move-in?"));
    assert.ok(text.includes("READY_FOR_OWNER_REVIEW") || text.includes("APPROVED"), "the demo's review state must be shown");
    assert.ok(text.includes("Mid-month move-in/out"));
    assert.ok(text.includes("DrinkKnird caption"));
    assert.ok(text.includes("Learn more"));
    assert.ok(text.includes("https://drinkknird.com"));
    assert.ok(text.includes("Nothing here has been published"));
    assert.equal(b.zip.readUInt32LE(0), 0x04034b50);
  });
});
