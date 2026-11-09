// Autonomous operating model: status model, review controls, pause and resume rules, one-time declarations, tenant isolation.
// The database tests need a scratch database (STUDIO_TEST_DATABASE_URL, name containing "test") and are skipped without one; the rest are pure.
import "./setup";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { statusOf, type StatusFacts } from "../portfolio-loop";
import { signReviewToken, verifyReviewToken } from "../publishing/review-token";
import { buildReviewEmail, ownerReviewEmail, type ReviewState } from "../publishing/video-review";

const base: StatusFacts = { paused: false, needsOwner: null, review: [], activeJobs: 0, uploadLimited: false, waiting: false };

describe("status model", () => {
  test("each product has exactly one of the eight states, in the right order of precedence", () => {
    assert.equal(statusOf(base), "ACTIVE");
    assert.equal(statusOf({ ...base, activeJobs: 1 }), "RENDERING");
    assert.equal(statusOf({ ...base, review: [{ status: "unlisted_live" }] }), "WAITING_FOR_REVIEW");
    assert.equal(statusOf({ ...base, review: [{ status: "changes_requested" }] }), "CHANGES_REQUESTED");
    assert.equal(statusOf({ ...base, uploadLimited: true }), "WAITING_FOR_UPLOAD_LIMIT");
    assert.equal(statusOf({ ...base, waiting: true }), "WAITING_FOR_NEW_OPPORTUNITY");
    assert.equal(statusOf({ ...base, needsOwner: "declaration missing" }), "NEEDS_OWNER_ACTION");
    assert.equal(statusOf({ ...base, paused: true, needsOwner: "x", activeJobs: 2, review: [{ status: "unlisted_live" }] }), "PAUSED");
  });
  test("only NEEDS_OWNER_ACTION is an interruption: a waiting or rendering product never asks anything", () => {
    for (const f of [{ activeJobs: 1 }, { waiting: true }, { uploadLimited: true }, { review: [{ status: "unlisted_live" }] }] as Array<Partial<StatusFacts>>) assert.notEqual(statusOf({ ...base, ...f }), "NEEDS_OWNER_ACTION");
  });
});

describe("review email controls", () => {
  const state = { status: "unlisted_live", publicationId: "p", productId: "x", productName: "P", videoRowId: "v", videoId: "abc", watchUrl: "https://www.youtube.com/watch?v=abc", title: "T", description: "D", durationSec: 25, ctaText: "Go", ctaUrl: "https://x.test/", intendedUse: "u", uploadedAt: "2026-11-08" } as ReviewState;
  const links = { approve: "https://g/video-review/A", changes: "https://g/video-review/C", pause: "https://g/video-review/P" };
  test("three controls follow the video in order: approve, request changes, pause new videos, and there is no resume link", () => {
    const m = buildReviewEmail(state, links);
    const at = (s: string) => m.html.indexOf(s);
    assert.ok(at("<img") < at(links.approve) && at(links.approve) < at(links.changes) && at(links.changes) < at(links.pause));
    assert.ok(m.html.includes("PAUSE NEW VIDEOS") && m.text.includes("PAUSE NEW VIDEOS"));
    assert.ok(!/href="[^"]*resume/i.test(m.html) && !m.html.includes("RESUME"));
    assert.ok(!m.html.includes(ownerReviewEmail()) && !m.text.includes(ownerReviewEmail()));
  });
  test("a pause token is its own decision: it can never approve, and an approve token can never pause", () => {
    const key = "k".repeat(32);
    const pause = verifyReviewToken(signReviewToken("pub", "pause", key), key);
    assert.ok(pause.ok && pause.claims.a === "pause");
    const approve = verifyReviewToken(signReviewToken("pub", "approve", key), key);
    assert.ok(approve.ok && approve.claims.a === "approve");
  });
});

const db = process.env.STUDIO_TEST_DATABASE_URL ? true : false;
describe("pause, declarations and isolation (scratch database)", { skip: !db }, () => {
  test("pause stops new work and keeps state; resume is a separate act; a declaration is stored once and reused; customers never borrow the owner's channel", async () => {
    const { closeStudioDb, requireStudioDb } = await import("../db");
    const { createProduct } = await import("../repository");
    const { INTERNAL_SCOPE, customerScope } = await import("../scope");
    const { declareKids, getPolicy, isPaused, kidsFor, pauseProduct, resumeProduct } = await import("../publishing/video-policy");
    const { shareYoutubeConnection } = await import("../publishing/youtube-share");
    const d = requireStudioDb();
    const mine = await createProduct(INTERNAL_SCOPE, "test", { name: `Own ${Date.now()}`, kind: "website", publicUrl: null, ownerKind: "internal", businessId: null });
    assert.equal(await isPaused(d, mine.id), false);
    await pauseProduct(d, "test", mine.id);
    assert.equal(await isPaused(d, mine.id), true);
    assert.ok((await getPolicy(d, mine.id)).pausedAt);
    await resumeProduct(d, "test", mine.id);
    assert.equal(await isPaused(d, mine.id), false);
    assert.equal(await kidsFor(d, mine), null);
    await declareKids(d, "test", { productId: mine.id }, false);
    assert.equal(await kidsFor(d, mine), false);
    const org = "11111111-1111-4111-8111-111111111111";
    const theirs = await createProduct(customerScope(org), "test", { name: `Cust ${Date.now()}`, kind: "website", publicUrl: null, ownerKind: "customer", businessId: null });
    await declareKids(d, "test", "portfolio", false);
    assert.equal(await kidsFor(d, { id: theirs.id, ownerKind: "customer" }), null, "the owner's portfolio default is never applied to a customer");
    await assert.rejects(shareYoutubeConnection(d, "test", "00000000-0000-4000-8000-000000000000", theirs.id));
    await closeStudioDb();
  });
});
