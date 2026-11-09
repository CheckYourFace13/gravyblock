import "./setup";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { signedNotifyHeaders, verifyNotifySignature } from "../publishing/review-notify";
import { signReviewToken, TOKEN_TTL_MS, verifyReviewToken } from "../publishing/review-token";
import { buildReviewEmail, embedFor, ownerReviewEmail, reviewUploadChecks, type ReviewState } from "../publishing/video-review";
import { setYoutubeVisibility } from "../publishing/youtube-api";

const state: ReviewState = {
  status: "unlisted_live",
  publicationId: "11111111-2222-3333-4444-555555555555",
  productId: "p1",
  productName: "SendFable",
  videoRowId: "v1",
  videoId: "ABCdef12345",
  watchUrl: "https://www.youtube.com/watch?v=ABCdef12345",
  title: "SendFable: Email and Text Marketing Without the Headache",
  description: "Pick a goal.\n\nStart free: https://sendfable.com/signup?utm_source=youtube",
  durationSec: 33.07,
  ctaText: "Start free",
  ctaUrl: "https://sendfable.com/signup?utm_source=youtube",
  intendedUse: "Organic Short, website embed, future paid asset.",
  uploadedAt: "2026-11-08T00:00:00Z",
};

describe("video review workflow", () => {
  test("the owner email puts the video, the plain link and both decision buttons before any detail, and is addressed to the owner only", () => {
    const links = { approve: "https://gravyblock.com/video-review/APPROVE_TOKEN", changes: "https://gravyblock.com/video-review/CHANGES_TOKEN", pause: "https://gravyblock.com/video-review/PAUSE_TOKEN" };
    const m = buildReviewEmail(state, links);
    const at = (needle: string) => m.html.indexOf(needle);
    assert.ok(at("<img") > 0 && at(state.watchUrl) > 0 && at(links.approve) > 0 && at(links.changes) > 0 && at(links.pause) > at(links.changes), "Pause New Videos is the third control, right after Request Changes");
    assert.ok(!/href="[^"]*resume/i.test(m.html) && !m.html.includes("RESUME"), "an email never carries a resume link: resuming needs the GravyBlock login");
    assert.ok(at("<img") < at(links.approve) && at(links.approve) < at(links.changes), "thumbnail first, then approve, then request changes");
    for (const detail of ["Duration", "CTA destination", "Intended use", "Proposed public title", "Proposed public description"]) assert.ok(at(links.changes) < at(detail), `${detail} comes after the buttons`);
    assert.ok(m.html.includes("APPROVE &amp; MAKE PUBLIC") && m.html.includes("REQUEST CHANGES"));
    assert.ok(m.html.includes("/api/video-review/thumb/ABCdef12345?v=2"), "the thumbnail is a normal image on our own host, with a play button drawn in");
    assert.ok(!/<iframe|<video/i.test(m.html), "no player is embedded in email");
    assert.ok(m.html.indexOf(`href="${state.watchUrl}"`) < at(links.approve), "the thumbnail links to the unlisted video");
    // plain-text version keeps the same order
    const tx = (needle: string) => m.text.indexOf(needle);
    assert.ok(tx(state.watchUrl) < tx(links.approve) && tx(links.approve) < tx("Duration"));
    for (const need of [state.productName, state.title, "33.1 seconds", state.ctaUrl, state.intendedUse, state.description.split("\n")[0]]) assert.ok(m.text.includes(need), `missing ${need}`);
    assert.match(ownerReviewEmail(), /^[^@\s]+@[^@\s]+\.[a-z]+$/i);
    assert.ok(!m.html.includes(ownerReviewEmail()) && !m.text.includes(ownerReviewEmail()), "the owner address is never inside the message");
  });

  test("review tokens are bound to one publication and one decision, expire, and cannot be forged", () => {
    const key = "token-key";
    const now = 1_800_000_000_000;
    const a = signReviewToken("pub-1", "approve", key, now);
    const ok = verifyReviewToken(a, key, now + 1000);
    assert.ok(ok.ok && ok.claims.p === "pub-1" && ok.claims.a === "approve");
    const c = signReviewToken("pub-1", "changes", key, now);
    const cc = verifyReviewToken(c, key, now + 1000);
    assert.ok(cc.ok && cc.claims.a === "changes");
    assert.notEqual(a, signReviewToken("pub-1", "approve", key, now), "every token has its own id");
    assert.deepEqual(verifyReviewToken(a, key, now + TOKEN_TTL_MS + 1), { ok: false, reason: "expired" });
    assert.deepEqual(verifyReviewToken(a, "other-key", now + 1000), { ok: false, reason: "invalid" });
    assert.deepEqual(verifyReviewToken(`${a}x`, key, now + 1000), { ok: false, reason: "invalid" });
    const [payload, sig] = a.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), a: "changes" })).toString("base64url");
    assert.deepEqual(verifyReviewToken(`${forged}.${sig}`, key, now + 1000), { ok: false, reason: "invalid" }, "changing the decision breaks the signature");
    assert.deepEqual(verifyReviewToken("", key), { ok: false, reason: "invalid" });
    assert.deepEqual(verifyReviewToken(a, undefined), { ok: false, reason: "invalid" });
  });

  test("website embeds use the privacy-enhanced youtube-nocookie domain and escape the title", () => {
    const e = embedFor("ABCdef12345", 'A "quoted" <title>');
    assert.equal(e.embedUrl, "https://www.youtube-nocookie.com/embed/ABCdef12345");
    assert.ok(e.iframe.includes("youtube-nocookie.com") && !e.iframe.includes("<title>") && !e.iframe.includes('"quoted"'));
  });

  test("the notify signature is bound to the publication and expires; a wrong key, id or time is refused", () => {
    const key = "studio-secret";
    const now = 1_800_000_000_000;
    const h = signedNotifyHeaders(state.publicationId, key, now);
    assert.ok(verifyNotifySignature(state.publicationId, h["x-studio-ts"], h["x-studio-sig"], key, now + 1000));
    assert.ok(!verifyNotifySignature("another-publication-id-000000000000000", h["x-studio-ts"], h["x-studio-sig"], key, now + 1000));
    assert.ok(!verifyNotifySignature(state.publicationId, h["x-studio-ts"], h["x-studio-sig"], "other-key", now + 1000));
    assert.ok(!verifyNotifySignature(state.publicationId, h["x-studio-ts"], h["x-studio-sig"], key, now + 10 * 60_000));
    assert.ok(!verifyNotifySignature(state.publicationId, null, null, key, now));
    assert.ok(!verifyNotifySignature(state.publicationId, h["x-studio-ts"], h["x-studio-sig"], undefined, now));
  });

  test("changing to public updates the SAME video id and sends the current status back unchanged except visibility", async () => {
    const calls: Array<{ url: string; method: string; body?: unknown }> = [];
    const fake = (async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (init?.method === "PUT") return new Response(JSON.stringify({ id: "ABCdef12345", status: { privacyStatus: "public" } }), { status: 200 });
      return new Response(JSON.stringify({ items: [{ status: { embeddable: true, license: "youtube", publicStatsViewable: false, selfDeclaredMadeForKids: false } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await setYoutubeVisibility({ videoId: "ABCdef12345", accessToken: "t", privacy: "public" }, { fetch: fake });
    assert.deepEqual(r, { ok: true, privacy: "public" });
    const put = calls.find((c) => c.method === "PUT")!;
    assert.deepEqual(put.body, { id: "ABCdef12345", status: { privacyStatus: "public", embeddable: true, license: "youtube", publicStatsViewable: false, selfDeclaredMadeForKids: false } });
    assert.ok(!calls.some((c) => c.url.includes("upload")), "no upload endpoint is ever used to change visibility");
  });

  test("an insufficient-permission answer is reported as needing the visibility permission, never as success", async () => {
    const fake = (async (_u: string, init?: RequestInit) =>
      init?.method === "PUT"
        ? new Response(JSON.stringify({ error: { code: 403, message: "Request had insufficient authentication scopes.", errors: [{ reason: "insufficientPermissions" }] } }), { status: 403 })
        : new Response(JSON.stringify({ items: [{ status: {} }] }), { status: 200 })) as unknown as typeof fetch;
    const r = await setYoutubeVisibility({ videoId: "x", accessToken: "t", privacy: "public" }, { fetch: fake });
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.needsScope, true);
  });

  test("the upload checklist requires unlisted, a product-site link, and refuses a public or private review state, emails and personal names", () => {
    const base = {
      productId: "p1",
      productHost: "sendfable.com",
      publication: { productId: "p1", title: "SendFable: x", caption: "Start free: https://sendfable.com/signup?utm_source=youtube", ctaUrl: "https://sendfable.com/signup?utm_source=youtube", status: "approval_required", assetId: "a1" },
      video: { assetId: "a1", status: "approved", qaPassed: true, stale: false, record: { claims: [{ factIds: ["f1"], factsVerified: true, sources: [{ onPage: true }] }], transcript: [{ text: "hello" }], onScreen: [{ text: "Start free" }], cta: { text: "Start free" } } as never },
      facts: [{ id: "f1", verified: true }],
      connectionAllowed: true,
      privacy: "unlisted" as string | null,
      kids: false as boolean | null,
      otherYoutubePublications: 0,
    };
    assert.ok(reviewUploadChecks(base).every((c) => c.ok), JSON.stringify(reviewUploadChecks(base).filter((c) => !c.ok)));
    const failing = (patch: Partial<typeof base>) => reviewUploadChecks({ ...base, ...patch }).filter((c) => !c.ok).length > 0;
    assert.ok(failing({ privacy: "public" }));
    assert.ok(failing({ privacy: "private" }));
    assert.ok(failing({ kids: null }));
    assert.ok(failing({ publication: { ...base.publication, caption: "mail me a@b.com" } }));
    assert.ok(failing({ publication: { ...base.publication, ctaUrl: "https://elsewhere.example/x" } }));
    assert.ok(failing({ publication: { ...base.publication, title: "Chris shows SendFable" } }));
    assert.ok(failing({ otherYoutubePublications: 1 }));
  });
});
