import "./setup";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { eq, like } from "drizzle-orm";
import { closeStudioDb, ms, requireStudioDb } from "../db";
import { createProduct } from "../repository";
import { INTERNAL_SCOPE } from "../scope";
import { connectAccount } from "../publishing/connections";
import { isReviewedVideo, openReview, submitApproval, submitChanges } from "../publishing/review-flow";
import { listJobs, runReplacementJob, type ReplacementDeps } from "../publishing/review-replacement";
import { claimNext, reapExpired } from "../runtime";
import { signReviewToken, TOKEN_TTL_MS } from "../publishing/review-token";
import { getReview, recordUnlistedReview, trackEvent } from "../publishing/video-review";
import { YT_SCOPE_MANAGE, YT_SCOPE_READ, YT_SCOPE_UPLOAD } from "../publishing/youtube-api";

const HAVE_DB = Boolean(process.env.STUDIO_TEST_DATABASE_URL);
const KEY = "review-flow-test-key";
const CHANNEL = "UC_review_flow_channel";
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

/** A fake YouTube that keeps one video's visibility and counts every change made to it. */
function fakeYoutube(videoId: string, channel: string, startPrivacy = "unlisted") {
  const state = { privacy: startPrivacy, puts: 0, uploads: 0 };
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/upload/")) {
      state.uploads++;
      return json({});
    }
    if (u.includes("/youtube/v3/videos?part=status&id=")) return json({ items: [{ status: { embeddable: true, license: "youtube", publicStatsViewable: true, selfDeclaredMadeForKids: false } }] });
    if (u.includes("/youtube/v3/videos?part=status") && init?.method === "PUT") {
      state.puts++;
      state.privacy = (JSON.parse(String(init.body)) as { status: { privacyStatus: string } }).status.privacyStatus;
      return json({ id: videoId, status: { privacyStatus: state.privacy } });
    }
    if (u.includes("/youtube/v3/videos?part=snippet")) return json({ items: [{ id: videoId, snippet: { channelId: channel, title: "t" }, status: { uploadStatus: "processed", privacyStatus: state.privacy }, statistics: { viewCount: "3" } }] });
    return json({ error: { message: `unexpected ${u}` } }, 500);
  }) as typeof fetch;
  return { state, deps: { fetch: f } };
}

describe("owner review flow: one click, scanner safe, replacement loop (database)", { skip: !HAVE_DB }, () => {
  const db = () => requireStudioDb();
  let productId = "";
  let n = 0;

  /** A published, unlisted review video with its connection, publication and review state. */
  async function reviewed(name: string) {
    const videoId = `vid${String(++n).padStart(8, "0")}`.slice(0, 11);
    const conn = await connectAccount(INTERNAL_SCOPE, "t", productId, { platform: "youtube", accountLabel: "iScream Studio (@iscreamstudio)", externalAccountId: `${CHANNEL}${n}`, tokens: { accessToken: "ya29.fake-access-token", refreshToken: "1//fake", accessExpiresAt: Date.now() + 3_000_000 }, scopes: [YT_SCOPE_UPLOAD, YT_SCOPE_READ, YT_SCOPE_MANAGE], tokenExpiresAt: null });
    const [pub] = await db()
      .insert(ms.msPublications)
      .values({ productId, assetId: randomUUID(), connectionId: conn.id, platform: "youtube", mode: "direct", status: "published", title: name, caption: `${name} https://example.com/go?utm_source=youtube`, ctaUrl: "https://example.com/go?utm_source=youtube", dedupeKey: `${randomUUID()}`, externalPostId: videoId, publishedAt: new Date() })
      .returning();
    const review = await recordUnlistedReview(db(), "t", { publicationId: pub.id, productId, productName: "Review Product", videoRowId: randomUUID(), videoId, title: name, description: pub.caption, durationSec: 30, ctaText: "Go", ctaUrl: "https://example.com/go?utm_source=youtube", intendedUse: "test", specHash: "hash-1" }, "home page");
    // the connection's channel id is part of the live check, so the fake video reports the same channel
    return { videoId, pub, review, channel: `${CHANNEL}${n}` };
  }

  before(async () => {
    for (const t of [ms.msAuditEvents, ms.msPublicationMetrics, ms.msPublications, ms.msConnections, ms.msSettings, ms.msProducts]) await db().delete(t);
    productId = (await createProduct(INTERNAL_SCOPE, "t", { name: "Review Product", kind: "website", publicUrl: "https://example.com/" })).id;
  });
  after(async () => {
    await closeStudioDb();
  });

  test("a scanner that only opens the approve link (GET) cannot publish: nothing changes and no YouTube change is made", async () => {
    const r = await reviewed("Scanner video");
    const yt = fakeYoutube(r.videoId, r.channel);
    const token = signReviewToken(r.pub.id, "approve", KEY);
    const opened = await openReview(db(), token, KEY);
    assert.equal(opened.kind, "approve_ready");
    await openReview(db(), token, KEY); // a second scan changes nothing either
    assert.equal(yt.state.privacy, "unlisted");
    assert.equal(yt.state.puts, 0);
    assert.equal((await getReview(db(), r.pub.id))?.status, "unlisted_live");
    assert.ok((await getReview(db(), r.pub.id))?.events?.some((e) => e.event === "VIEWED"), "the link being opened is recorded, as a view and never as a decision");
  });

  test("the POST needs the transaction the opened page was given: a missing, foreign or reused transaction publishes nothing", async () => {
    const r = await reviewed("Txn video");
    const other = await reviewed("Other video");
    const yt = fakeYoutube(r.videoId, r.channel);
    const token = signReviewToken(r.pub.id, "approve", KEY);
    assert.equal((await submitApproval(db(), yt.deps, { token, txn: "x".repeat(24) }, KEY)).ok, false);
    const otherOpen = await openReview(db(), signReviewToken(other.pub.id, "approve", KEY), KEY);
    assert.ok(otherOpen.kind === "approve_ready");
    const foreign = await submitApproval(db(), yt.deps, { token, txn: otherOpen.kind === "approve_ready" ? otherOpen.txn : "" }, KEY);
    assert.equal(foreign.ok, false, "a transaction opened for another video is refused");
    assert.equal(yt.state.puts, 0);
  });

  test("one click publishes the SAME video once; repeating it is harmless and changes nothing more", async () => {
    const r = await reviewed("One click video");
    const yt = fakeYoutube(r.videoId, r.channel);
    const token = signReviewToken(r.pub.id, "approve", KEY);
    const opened = await openReview(db(), token, KEY);
    assert.ok(opened.kind === "approve_ready");
    const txn = opened.kind === "approve_ready" ? opened.txn : "";
    const first = await submitApproval(db(), yt.deps, { token, txn }, KEY);
    assert.ok(first.ok, JSON.stringify(first));
    assert.equal(yt.state.privacy, "public");
    assert.equal(yt.state.puts, 1);
    assert.equal(yt.state.uploads, 0, "nothing was uploaded: the same video changed visibility");
    if (first.ok) {
      assert.equal(first.view.videoId, r.videoId);
      assert.equal(first.view.visibility, "Public");
      assert.equal(first.view.sameVideoRetained, true);
    }
    const state = await getReview(db(), r.pub.id);
    assert.equal(state?.status, "approved_public");
    assert.equal(state?.videoId, r.videoId);
    assert.deepEqual(
      state?.events?.map((e) => e.event).filter((e) => e === "APPROVED" || e === "PUBLIC"),
      ["APPROVED", "PUBLIC"],
    );
    // a repeated click (same transaction, then a brand new one) is idempotent
    assert.ok((await submitApproval(db(), yt.deps, { token, txn }, KEY)).ok);
    const again = await openReview(db(), token, KEY);
    assert.equal(again.kind, "approved", "reopening the link shows the finished result, not another approval");
    assert.equal(yt.state.puts, 1, "no second visibility change");
    // no duplicate publication, and the publication still points at the same video
    const pubs = await db().select().from(ms.msPublications).where(eq(ms.msPublications.externalPostId, r.videoId));
    assert.equal(pubs.length, 1);
  });

  test("an expired, tampered or wrong-decision token fails safely", async () => {
    const r = await reviewed("Expiry video");
    const yt = fakeYoutube(r.videoId, r.channel);
    const old = signReviewToken(r.pub.id, "approve", KEY, Date.now() - TOKEN_TTL_MS - 1000);
    assert.equal((await openReview(db(), old, KEY)).kind, "expired");
    const expired = await submitApproval(db(), yt.deps, { token: old, txn: "y".repeat(24) }, KEY);
    assert.equal(expired.ok, false);
    assert.equal(!expired.ok && expired.status, 410);
    const good = signReviewToken(r.pub.id, "approve", KEY);
    assert.equal((await openReview(db(), `${good}x`, KEY)).kind, "invalid");
    const changesToken = signReviewToken(r.pub.id, "changes", KEY);
    const wrong = await submitApproval(db(), yt.deps, { token: changesToken, txn: "z".repeat(24) }, KEY);
    assert.equal(wrong.ok, false, "a request-changes link can never approve");
    assert.equal(yt.state.puts, 0);
  });

  test("request changes stores the exact note, keeps the flawed video unlisted and queues the replacement automatically", async () => {
    const r = await reviewed("Changes video");
    const yt = fakeYoutube(r.videoId, r.channel);
    const token = signReviewToken(r.pub.id, "changes", KEY);
    const opened = await openReview(db(), token, KEY);
    assert.equal(opened.kind, "changes_form");
    const txn = opened.kind === "changes_form" ? opened.txn : "";
    assert.equal((await submitChanges(db(), { token, txn, note: "   " }, KEY)).ok, false, "a blind request is refused: the note is required");
    const note = "The voice says the name wrong. It must say Send Fable.";
    const done = await submitChanges(db(), { token, txn, note }, KEY);
    assert.ok(done.ok);
    const state = await getReview(db(), r.pub.id);
    assert.equal(state?.status, "changes_requested");
    assert.equal(state?.changesNote, note, "the exact owner note is stored");
    assert.equal(yt.state.privacy, "unlisted");
    assert.equal(yt.state.puts, 0);
    const job = (await listJobs(db())).find((j) => j.id === r.pub.id);
    assert.equal(job?.status, "queued");
    assert.equal(job?.note, note);
    assert.ok(state?.events?.some((e) => e.event === "CHANGES_REQUESTED"));
    // a changes-requested version cannot be approved
    assert.equal((await openReview(db(), signReviewToken(r.pub.id, "approve", KEY), KEY)).kind, "stale");
  });

  /** Submits a request-changes note the way the email link does, and returns the job record. */
  async function requestChange(r: Awaited<ReturnType<typeof reviewed>>, note: string) {
    const token = signReviewToken(r.pub.id, "changes", KEY);
    const opened = await openReview(db(), token, KEY);
    const txn = opened.kind === "changes_form" ? opened.txn : "";
    const out = await submitChanges(db(), { token, txn, note }, KEY);
    assert.ok(out.ok, JSON.stringify(out));
    return { token, txn, job: (await listJobs(db())).find((j) => j.id === r.pub.id)! };
  }
  const queued = async (pubId: string) => db().select().from(ms.msMediaJobs).where(like(ms.msMediaJobs.dedupeKey, `review_replacement:${pubId}:%`));

  test("submitting a change request enqueues exactly one worker job at once; resubmitting cannot create a second replacement", async () => {
    const r = await reviewed("Queue video");
    const { token, txn } = await requestChange(r, "The voice is slightly too fast.");
    const rows = await queued(r.pub.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].kind, "review_replacement");
    assert.equal(rows[0].weight, "heavy", "a render is a heavy job: the worker's resource governor and one-heavy-at-a-time rule apply");
    assert.equal(rows[0].status, "queued");
    // the same form posted again (double click, back button, retry) and a reopened link leave one job
    await submitChanges(db(), { token, txn, note: "The voice is slightly too fast." }, KEY);
    const again = await openReview(db(), token, KEY);
    assert.equal(again.kind, "changes_received");
    assert.equal((await queued(r.pub.id)).length, 1);
    assert.equal((await listJobs(db())).filter((j) => j.id === r.pub.id).length, 1);
  });

  test("queued work is durable: a job whose worker died is requeued with its attempts kept", async () => {
    const r = await reviewed("Durable video");
    await requestChange(r, "The voice is slightly too fast.");
    // the worker claims it (the same update claimNext performs), then dies without finishing: its lease runs out
    const [mine] = await queued(r.pub.id);
    await db().update(ms.msMediaJobs).set({ status: "running", lockedBy: "worker-that-will-die", lockedUntil: new Date(Date.now() - 60_000), attempts: 1 }).where(eq(ms.msMediaJobs.id, mine.id));
    assert.ok((await reapExpired(db())) >= 1);
    const [row] = await db().select().from(ms.msMediaJobs).where(eq(ms.msMediaJobs.id, mine.id));
    assert.equal(row.status, "queued", "after a restart the work is still there");
    assert.equal(row.attempts, 1, "and the attempt count survives");
    assert.ok(await claimNext("replacement-worker", { allowHeavy: true }, db()), "and the worker can claim queued heavy work again");
    assert.equal((await queued(r.pub.id)).length, 1);
  });

  const fakeDeps = (over: Partial<ReplacementDeps> = {}) => {
    const calls = { renders: 0, uploads: 0 };
    const deps: ReplacementDeps = {
      currentSpecHash: () => "hash-2",
      slugFor: async () => "review-product",
      render: async () => (calls.renders++, { ok: true as const, videoRowId: randomUUID() }),
      upload: async () => {
        calls.uploads++;
        const fresh = await reviewed("Replacement video");
        return { publicationId: fresh.pub.id, videoId: fresh.videoId, emailed: true };
      },
      ...over,
    };
    return { deps, calls };
  };

  test("the replacement renders, uploads a NEW unlisted video, leaves the old one superseded and unlisted, and reports the new review email", async () => {
    const r = await reviewed("Replace video");
    const { job } = await requestChange(r, "The voice is slightly too fast.");
    const yt = fakeYoutube(r.videoId, r.channel);
    const { deps, calls } = fakeDeps();
    const out = await runReplacementJob(db(), job, (await getReview(db(), r.pub.id))!, deps, { final: false });
    assert.equal(out.job.status, "done");
    assert.deepEqual([calls.renders, calls.uploads], [1, 1]);
    assert.ok(out.job.newVideoId && out.job.newVideoId !== r.videoId, "a different YouTube video");
    assert.match(out.job.detail ?? "", /review email sent/i);
    assert.equal(yt.state.privacy, "unlisted", "the flawed version was never made public");
    assert.equal(yt.state.puts, 0);
    const events = (await getReview(db(), r.pub.id))?.events?.map((e) => e.event) ?? [];
    assert.ok(events.includes("CHANGES_REQUESTED") && events.includes("REPLACEMENT_RENDERING") && events.includes("REPLACEMENT_READY"));
    // running it again changes nothing
    const again = await runReplacementJob(db(), out.job, (await getReview(db(), r.pub.id))!, deps, { final: false });
    assert.equal(again.job.status, "done");
    assert.equal(calls.renders, 1);
  });

  test("a change that alters nothing is not rendered again: it ends as NEEDS ATTENTION and nothing is uploaded", async () => {
    const r = await reviewed("Unchanged video");
    const { job } = await requestChange(r, "The voice is slightly too fast.");
    const { deps, calls } = fakeDeps({ currentSpecHash: () => "hash-1" });
    const out = await runReplacementJob(db(), job, (await getReview(db(), r.pub.id))!, deps, { final: false });
    assert.equal(out.job.status, "needs_attention");
    assert.deepEqual([calls.renders, calls.uploads], [0, 0]);
  });

  test("failures retry safely, then surface as NEEDS ATTENTION only when no attempts remain; QA must pass before any upload", async () => {
    const r = await reviewed("Failing video");
    const { job } = await requestChange(r, "The voice is slightly too fast.");
    let uploaded = 0;
    const failing = fakeDeps({ render: async () => ({ ok: false as const, reason: "QA did not pass: motion" }), upload: async () => (uploaded++, { publicationId: "", videoId: "", emailed: false }) }).deps;
    const first = await runReplacementJob(db(), job, (await getReview(db(), r.pub.id))!, failing, { final: false });
    assert.equal(first.retry, true);
    assert.equal(first.job.status, "queued", "back in the queue for the next attempt");
    const last = await runReplacementJob(db(), first.job, (await getReview(db(), r.pub.id))!, failing, { final: true });
    assert.equal(last.retry, false);
    assert.equal(last.job.status, "needs_attention");
    assert.equal(uploaded, 0, "a video that did not pass QA is never uploaded");
    assert.ok((await getReview(db(), r.pub.id))?.events?.some((e) => e.event === "FAILED"));
    assert.equal((await getReview(db(), r.pub.id))?.status, "changes_requested", "the reviewed video is untouched");
  });

  test("the thumbnail is only ever served for a video that has a review", async () => {
    const r = await reviewed("Thumb video");
    assert.equal(await isReviewedVideo(db(), r.videoId), true);
    assert.equal(await isReviewedVideo(db(), "notAreview1"), false);
    await trackEvent(db(), "t", r.pub.id, "EMAIL_SENT");
  });
});
