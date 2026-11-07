import "./setup";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { signedNotifyHeaders, verifyNotifySignature } from "../publishing/review-notify";
import { buildReviewEmail, embedFor, OWNER_REVIEW_EMAIL, reviewUploadChecks, type ReviewState } from "../publishing/video-review";
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
  test("the owner email carries every required field, the review link and both actions, and is addressed to the owner only", () => {
    const m = buildReviewEmail(state);
    for (const need of [state.productName, state.title, state.watchUrl, "33.1 seconds", state.ctaUrl, "Start free", state.description.split("\n")[0], state.intendedUse, "action=approve", "action=changes", "UNLISTED"]) assert.ok(m.text.includes(need) || m.html.includes(need), `missing ${need}`);
    assert.match(OWNER_REVIEW_EMAIL, /@gravyblock\.com$/);
    assert.ok(!m.html.includes(OWNER_REVIEW_EMAIL) && !m.text.includes(OWNER_REVIEW_EMAIL), "the owner address is never inside the message");
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
