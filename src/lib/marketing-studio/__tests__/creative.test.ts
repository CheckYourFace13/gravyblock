// Run: MARKETING_CHROMIUM_PATH=<chromium> npx tsx --test src/lib/marketing-studio/__tests__/creative.test.ts
// Rendering tests run only when a browser is available; FFmpeg tests only when ffmpeg is on the PATH.
import "./setup";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import sharp from "sharp";
import { buildConceptSpecs, firstSentence, shortDescription, splitTitleDetail } from "../creative/copy";
import { sourceFor } from "../creative/context";
import { dhash, hamming, runCreativeQa, traceText, type QaInput } from "../creative/qa";
import { launchBrowser, renderCreative } from "../creative/render";
import { buildCreative, type CreativeInput, type Img } from "../creative/templates";
import { contrastPairs, SIZE_KEYS, SIZES, themeFor } from "../creative/theme";
import { BodyTooLargeError, readBodyLimited, sameOrigin } from "../http";
import { buildAss, sceneStarts, wrapCaption } from "../video/assemble";
import { validateStoryboard, storyboardSeconds, type Storyboard } from "../video/types";
import { buildStoryboard } from "../video/queue";
import { fetchDataForSeoReviews } from "../../reviews/dataforseo-fetcher";

type Fact = Parameters<typeof buildConceptSpecs>[0][number];
let n = 0;
const fact = (factKey: string, factValue: string, over: Partial<Fact> = {}): Fact => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, productId: "p", factKey, factValue, sourceKind: "public_page", sourceUrl: null, contentHash: String(n),
  status: "current", verifiedBy: "t", verifiedAt: new Date(), expiresAt: null, createdAt: new Date(), ...over,
});
const FACTS: Fact[] = [
  fact("product_name", "RentalNoodle"),
  fact("tagline", "Manage every rental from one simple place."),
  fact("description", "Keep your properties, tenants, leases, rent, maintenance, inspections, documents, and finances connected in one landlord-friendly platform."),
  fact("feature", "Maintenance: Tenant requests with photos, status updates, and a history."),
  fact("feature", "Inspections: Move-in and move-out condition records, photos, and deposit worksheets."),
  fact("feature", "Finances: Income and expense tracking, summaries, and Schedule E preparation exports."),
  fact("feature", "Properties & tenants: One record per rental, with address, tenant, lease terms, and history."),
  fact("feature", "Lease execution: Build or upload a lease, invite signers, and keep completed documents."),
  fact("plan", "Free: $0/mo, 1 property, basics"),
  fact("plan", "Landlord Pro: $12/mo, Up to 5 properties"),
  fact("pricing_note", "Start free. Upgrade when you need more properties or tools."),
  fact("cta", "Start Managing Free"),
  fact("cta_url", "https://rentalnoodle.com/sign-up"),
  fact("website_url", "https://rentalnoodle.com/"),
];

describe("concept and copy generation", () => {
  test("only verified facts are used and every concept traces to facts", () => {
    const specs = buildConceptSpecs([...FACTS, fact("feature", "Invented: Not verified at all", { verifiedAt: null })], { hasScreenshot: true, limit: 8 });
    assert.ok(specs.length >= 5);
    for (const s of specs) {
      assert.ok(s.factIds.length >= 2);
      for (const id of s.factIds) assert.ok(FACTS.some((f) => f.id === id), "unverified or unknown fact referenced");
      for (const text of [s.headline, s.subhead].filter((x): x is string => Boolean(x))) {
        const src = sourceFor(text, "RentalNoodle", FACTS, s.factIds);
        assert.ok(src.kind !== "fact" || src.factId !== "unmatched", `not grounded: ${text}`);
      }
    }
    assert.ok(!JSON.stringify(specs).includes("Not verified at all"));
  });
  test("different families come out, and optional ones need their facts", () => {
    const fams = buildConceptSpecs(FACTS, { hasScreenshot: true, limit: 12 }).map((s) => s.family);
    for (const f of ["product_benefit", "feature_highlight", "screenshot_showcase", "comparison", "cta"]) assert.ok(fams.includes(f as never), f);
    const without = buildConceptSpecs(FACTS, { hasScreenshot: false, limit: 12 }).map((s) => s.family);
    assert.ok(!without.includes("screenshot_showcase"), "no screenshot approved, no showcase");
    assert.ok(!without.includes("announcement") && !without.includes("educational_tip"), "no release status or tips, none invented");
  });
  test("no product name means no concepts", () => assert.equal(buildConceptSpecs(FACTS.filter((f) => f.factKey !== "product_name"), { hasScreenshot: false }).length, 0));
  test("text helpers never add words or ellipses", () => {
    assert.deepEqual(splitTitleDetail("Maintenance: Tenant requests."), ["Maintenance", "Tenant requests."]);
    assert.deepEqual(splitTitleDetail("No colon here"), ["No colon here", null]);
    assert.equal(firstSentence("One. Two."), "One.");
    const long = "First sentence here. " + "Second sentence is rather long and goes on. ".repeat(10);
    assert.equal(shortDescription(long, 70), "First sentence here. Second sentence is rather long and goes on.");
    assert.equal(shortDescription(long, 30), "First sentence here.");
    assert.ok(!shortDescription(long, 70).includes("..."));
  });
});

describe("themes", () => {
  test("every product type and any brand color yields text contrast of at least 4.5:1", () => {
    const colors = ["#ff0000", "#ffee00", "#00ffff", "#808080", "#123456", "#ffffff", "#000000", "#b45309", "#ec4899", "#22c55e", "#777777", "#fbbf24"];
    for (const kind of ["website", "saas", "mobile_app", "web_game", "mobile_game"] as const) {
      for (const c of colors) {
        for (const p of contrastPairs(themeFor(kind, c))) {
          const ratio = (() => { const L = (h: string) => { const v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((x) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }).reduce((a, x, i) => a + x * [0.2126, 0.7152, 0.0722][i], 0); }; const [hi, lo] = [L(p.fg), L(p.bg)].sort((a, b) => b - a); return (hi + 0.05) / (lo + 0.05); })();
          assert.ok(ratio >= p.min - 0.001, `${kind} ${c} ${p.role} ${ratio.toFixed(2)}`);
        }
      }
    }
  });
  test("product types get different looks", () => {
    assert.notEqual(themeFor("website").layout, themeFor("saas").layout);
    assert.notEqual(themeFor("saas").layout, themeFor("mobile_game").layout);
    assert.notEqual(themeFor("website").headingFont, themeFor("mobile_game").headingFont);
  });
});

describe("text traceability", () => {
  const qa = { facts: FACTS.map((f) => ({ id: f.id, key: f.factKey, value: f.factValue, verified: Boolean(f.verifiedAt) })), productName: "RentalNoodle", ctaFactValues: ["Start Managing Free"], ctaUrl: "https://rentalnoodle.com/sign-up" };
  const factId = FACTS[1].id;
  test("accepts fact segments, product name, labels, cta, url and neutral phrases", () => {
    for (const [text, src] of [
      ["Manage every rental from one simple place.", { kind: "fact", factId }],
      ["RentalNoodle", { kind: "product" }], ["Feature", { kind: "label" }], ["Start Managing Free", { kind: "cta" }],
      ["rentalnoodle.com/sign-up", { kind: "url" }], ["Meet RentalNoodle", { kind: "neutral" }],
    ] as const) assert.equal(traceText({ role: "x", text, src: src as never, minPx: 24 }, qa).ok, true, text);
  });
  test("rejects invented text, wrong sources and unverified facts", () => {
    assert.equal(traceText({ role: "x", text: "The #1 rated landlord software", src: { kind: "fact", factId }, minPx: 24 }, qa).ok, false);
    assert.equal(traceText({ role: "x", text: "Save 50% today", src: { kind: "cta" }, minPx: 24 }, qa).ok, false);
    assert.equal(traceText({ role: "x", text: "Anything", src: { kind: "fact", factId: "unmatched" }, minPx: 24 }, qa).ok, false);
    const unverified = { ...qa, facts: qa.facts.map((f) => (f.id === factId ? { ...f, verified: false } : f)) };
    assert.equal(traceText({ role: "x", text: "Manage every rental from one simple place.", src: { kind: "fact", factId }, minPx: 24 }, unverified).ok, false);
  });
});

describe("image hashing", () => {
  test("identical images collide and different images do not", async () => {
    const a = await sharp({ create: { width: 200, height: 200, channels: 3, background: "#ff0000" } }).composite([{ input: await sharp({ create: { width: 100, height: 100, channels: 3, background: "#ffffff" } }).png().toBuffer(), left: 20, top: 20 }]).png().toBuffer();
    const b = await sharp({ create: { width: 200, height: 200, channels: 3, background: "#ff0000" } }).composite([{ input: await sharp({ create: { width: 100, height: 100, channels: 3, background: "#ffffff" } }).png().toBuffer(), left: 90, top: 90 }]).png().toBuffer();
    assert.equal(hamming(await dhash(a), await dhash(a)), 0);
    assert.ok(hamming(await dhash(a), await dhash(b)) > 3);
  });
});

const HAVE_BROWSER = Boolean(process.env.MARKETING_CHROMIUM_PATH);
describe("rendered creative QA", { skip: !HAVE_BROWSER }, () => {
  const theme = themeFor("saas", "#2563eb");
  const sq = (c: string): Promise<Img> => sharp({ create: { width: 256, height: 256, channels: 3, background: c } }).png().toBuffer().then((b) => ({ dataUri: `data:image/png;base64,${b.toString("base64")}`, w: 256, h: 256, assetId: "logo-1", alt: "logo" }));
  const qaFacts = FACTS.map((f) => ({ id: f.id, key: f.factKey, value: f.factValue, verified: Boolean(f.verifiedAt) }));
  const src = (t: string) => sourceFor(t, "RentalNoodle", FACTS);

  async function run(over: Partial<CreativeInput> = {}, qaOver: Partial<QaInput> = {}, size: keyof typeof SIZES = "square") {
    const handle = await launchBrowser();
    try {
      const input: CreativeInput = {
        family: "product_benefit", size, theme, productName: "RentalNoodle",
        headline: { text: "Manage every rental from one simple place.", src: src("Manage every rental from one simple place.") },
        subhead: { text: "Keep your properties, tenants, leases, rent, maintenance, inspections, documents, and finances connected in one landlord-friendly platform.", src: src("Keep your properties, tenants, leases, rent, maintenance, inspections, documents, and finances connected in one landlord-friendly platform.") },
        cta: { text: "Start Managing Free", url: "https://rentalnoodle.com/sign-up" }, logo: await sq("#2563eb"), ...over,
      };
      const built = buildCreative(input);
      const { png, measure } = await renderCreative(handle.browser, built, size);
      return runCreativeQa({
        png, width: SIZES[size].w, height: SIZES[size].h, measure, built, theme, productName: "RentalNoodle", facts: qaFacts, prohibited: ["tax filing"], ctaFactValues: ["Start Managing Free"],
        ctaUrl: "https://rentalnoodle.com/sign-up", allowedUrlHosts: ["rentalnoodle.com"], urlStatus: 200, requiredAssets: [{ id: "logo-1", approved: true, present: true }], conceptId: "c1", otherHashes: [], ...qaOver,
      });
    } finally {
      await handle.close();
    }
  }
  const failedIds = (r: Awaited<ReturnType<typeof run>>) => r.checks.filter((c) => !c.ok && c.severity === "fail").map((c) => c.id);

  test("a grounded creative passes every check at every size", async () => {
    for (const size of SIZE_KEYS) {
      const r = await run({}, {}, size);
      assert.deepEqual(failedIds(r), [], `${size}: ${JSON.stringify(r.checks.filter((c) => !c.ok))}`);
      assert.equal(r.passed, true);
    }
  });
  test("unsupported claim text fails", async () => assert.ok(failedIds(await run({ headline: { text: "The #1 rated landlord software", src: src("The #1 rated landlord software") } })).includes("claims_grounded_in_product_truth")));
  test("a prohibited claim fails", async () => {
    const f = fact("feature", "Tax filing: We file your taxes for you.");
    const r = await run({ headline: { text: "Tax filing", src: { kind: "fact", factId: f.id } } }, { prohibited: ["tax filing"], facts: [...qaFacts, { id: f.id, key: f.factKey, value: f.factValue, verified: true }] });
    assert.ok(failedIds(r).includes("no_prohibited_claims"));
  });
  test("placeholder text fails", async () => assert.ok(failedIds(await run({ headline: { text: "Lorem ipsum dolor sit amet", src: src("Lorem ipsum dolor sit amet") } })).includes("no_placeholder_text")));
  test("text that cannot fit even at the minimum size fails", async () => assert.ok(failedIds(await run({ headline: { text: "word ".repeat(220).trim(), src: src("word") } })).includes("text_fits")));
  test("wrong image dimensions fail", async () => {
    const r = await run({}, { width: 1080, height: 1350 });
    assert.ok(failedIds(r).includes("dimensions"));
  });
  test("a corrupt PNG fails integrity", async () => assert.ok(failedIds(await run({}, { png: Buffer.from("not a png") })).includes("file_integrity")));
  test("a missing or unapproved asset fails", async () => assert.ok(failedIds(await run({}, { requiredAssets: [{ id: "logo-1", approved: false, present: true }] })).includes("assets_present_and_approved")));
  test("a CTA on an unapproved host or a dead URL fails", async () => {
    assert.ok(failedIds(await run({}, { allowedUrlHosts: ["example.org"] })).includes("cta_url_valid"));
    assert.ok(failedIds(await run({}, { urlStatus: 404 })).includes("cta_url_live"));
  });
  test("an obvious duplicate of another concept fails, but the same template with different words does not", async () => {
    const first = await run();
    const r = await run({}, { otherHashes: [{ conceptId: "other", dhash: first.dhash, textSig: first.textSig }] });
    assert.ok(failedIds(r).includes("not_a_duplicate"));
    const different = await run({}, { otherHashes: [{ conceptId: "other", dhash: first.dhash, textSig: "completely different wording about something else entirely" }] });
    assert.ok(!failedIds(different).includes("not_a_duplicate"));
  });
  test("logos keep their aspect ratio", async () => {
    const wide: Img = { ...(await sq("#2563eb")), w: 512, h: 128 };
    const wideBuf = await sharp({ create: { width: 512, height: 128, channels: 3, background: "#2563eb" } }).png().toBuffer();
    wide.dataUri = `data:image/png;base64,${wideBuf.toString("base64")}`;
    const r = await run({ logo: wide });
    assert.ok(!failedIds(r).includes("logo_not_distorted"));
  });
});

describe("video storyboards, captions and limits", () => {
  const ctx = (extra: Fact[] = []) => ({ facts: [...FACTS, ...extra], screenshotAssets: [{ id: "11111111-1111-4111-8111-111111111111" }, { id: "22222222-2222-4222-8222-222222222222" }, { id: "33333333-3333-4333-8333-333333333333" }], logoAsset: undefined }) as never;
  test("storyboards for 15, 30 and 60 seconds hit their target and validate", () => {
    for (const t of [15, 30, 60]) {
      const sb = buildStoryboard(ctx(), t);
      assert.deepEqual(validateStoryboard(sb), []);
      assert.ok(Math.abs(storyboardSeconds(sb) - t) < 0.15, `${t}: ${storyboardSeconds(sb)}`);
      assert.equal(sb.scenes[0].type, "card");
      assert.equal((sb.scenes.at(-1) as { family: string }).family, "cta");
    }
  });
  test("a video needs a CTA fact and real visual assets", () => {
    assert.throws(() => buildStoryboard({ ...(ctx() as object), facts: FACTS.filter((f) => f.factKey !== "cta") } as never, 15), /call to action/);
    assert.throws(() => buildStoryboard({ ...(ctx() as object), screenshotAssets: [], logoAsset: undefined } as never, 15), /screenshot or logo/);
  });
  test("validation rejects bad storyboards", () => {
    const base = buildStoryboard(ctx(), 15);
    assert.ok(validateStoryboard({ ...base, scenes: base.scenes.slice(0, 1) }).length > 0);
    assert.ok(validateStoryboard({ ...base, scenes: [...base.scenes.slice(0, -1)] }).some((e) => /call to action/.test(e)));
    assert.ok(validateStoryboard({ ...base, scenes: base.scenes.map((s) => ({ ...s, seconds: 30 })) }).length > 0);
  });
  test("captions wrap inside the safe area or are refused", () => {
    assert.ok(wrapCaption("Tenant requests with photos, status updates, and a history.")!.every((l) => l.length <= 26));
    assert.equal(wrapCaption("Supercalifragilisticexpialidocious word"), null);
    assert.equal(wrapCaption("word ".repeat(60)), null);
  });
  test("burned captions sit above the bottom 360px and carry no markup injection", () => {
    const ass = buildAss([{ start: 1, end: 3, lines: ["Hello {\\an8}world"], sceneIndex: 1 }]);
    assert.match(ass, /MarginV|,360,/);
    assert.ok(!ass.includes("{\\an8}"));
    assert.match(ass, /PlayResX: 1080/);
    assert.match(ass, /PlayResY: 1920/);
  });
  test("scene start times account for transition overlap", () => {
    const sb: Storyboard = { version: 1, transition: "fade", scenes: [{ type: "card", seconds: 4, family: "product_benefit", headline: "a" }, { type: "card", seconds: 4, family: "cta", headline: "b" }] };
    assert.deepEqual(sceneStarts(sb), [0, 3.5]);
  });
});

describe("upload body bound and origin check", () => {
  test("a body over the limit is refused without reading all of it", async () => {
    const big = new Request("http://x/upload", { method: "POST", body: new Uint8Array(2000) });
    await assert.rejects(readBodyLimited(big, 1000), BodyTooLargeError);
    const declared = new Request("http://x/upload", { method: "POST", headers: { "content-length": "5000" }, body: "x" });
    await assert.rejects(readBodyLimited(declared, 1000), BodyTooLargeError);
    assert.equal((await readBodyLimited(new Request("http://x/upload", { method: "POST", body: new Uint8Array(500) }), 1000)).length, 500);
  });
  test("cross-site origins are refused", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://gravyblock.com";
    assert.equal(sameOrigin(new Request("https://gravyblock.com/x", { headers: { origin: "https://gravyblock.com" } })), true);
    assert.equal(sameOrigin(new Request("https://gravyblock.com/x", { headers: { origin: "https://evil.example" } })), false);
    assert.equal(sameOrigin(new Request("https://gravyblock.com/x")), true);
  });
});

describe("DataForSEO unsupported platforms", () => {
  test("facebook and trustpilot are classified unsupported and never call the network", async () => {
    process.env.DATAFORSEO_LOGIN = "x";
    process.env.DATAFORSEO_PASSWORD = "y";
    const realFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => { calls++; throw new Error("network must not be used"); }) as typeof fetch;
    try {
      for (const platform of ["facebook", "trustpilot", "tripadvisor", "google"] as const) assert.deepEqual(await fetchDataForSeoReviews({ businessName: "x", locationName: "y", platform }), []);
      assert.equal(calls, 0);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

const HAVE_FFMPEG = spawnSync("ffmpeg", ["-version"]).status === 0;
describe("video assembly and QA with real FFmpeg", { skip: !HAVE_FFMPEG }, () => {
  test("assembles a captioned 2-scene video that passes QA, and QA catches broken output", async () => {
    const { assemble } = await import("../video/assemble");
    const { runVideoQa } = await import("../video/qa");
    const dir = mkdtempSync(path.join(os.tmpdir(), "ms-video-"));
    try {
      const card = (c: string) => sharp({ create: { width: 1080, height: 1920, channels: 3, background: c } }).composite([{ input: Buffer.from(`<svg width="1080" height="1920"><rect x="100" y="800" width="880" height="200" fill="#ffffff"/></svg>`), top: 0, left: 0 }]).png().toBuffer();
      const img = await sharp({ create: { width: 1400, height: 900, channels: 3, background: "#3366aa" } }).composite([{ input: Buffer.from(`<svg width="1400" height="900"><circle cx="700" cy="450" r="300" fill="#ffcc00"/></svg>`), top: 0, left: 0 }]).png().toBuffer();
      const sb: Storyboard = { version: 1, transition: "fade", scenes: [{ type: "card", seconds: 3, family: "product_benefit", headline: "A" }, { type: "image", seconds: 3, assetId: "11111111-1111-4111-8111-111111111111", motion: "zoom_in", caption: "Tenant requests with photos" }, { type: "card", seconds: 3, family: "cta", headline: "B" }] };
      const out = path.join(dir, "out.mp4");
      const { seconds } = await assemble({ dir, storyboard: sb, cards: new Map([[0, await card("#224466")], [2, await card("#664422")]]), images: new Map([[1, img]]), captions: [{ start: 3, end: 5, lines: wrapCaption("Tenant requests with photos")!, sceneIndex: 1 }], audioFile: null, outFile: out, timeoutMs: 120_000 });
      assert.ok(Math.abs(seconds - 8) < 0.05, `seconds ${seconds}`);
      const base = { file: out, expectedSeconds: 8, expectAudio: false, cardResults: [{ index: 0, passed: true, failed: [], isCta: false }, { index: 2, passed: true, failed: [], isCta: true }], captions: [{ text: "Tenant requests with photos", wrapped: true, traced: true, prohibited: false }], media: [{ id: "a", present: true, approved: true }] };
      const ok = await runVideoQa(base);
      assert.deepEqual(ok.checks.filter((c) => !c.ok && c.severity === "fail"), [], JSON.stringify(ok.checks.filter((c) => !c.ok)));
      assert.equal((await runVideoQa({ ...base, expectedSeconds: 20 })).passed, false, "wrong duration");
      assert.equal((await runVideoQa({ ...base, maxBytes: 1000 })).passed, false, "too large");
      assert.equal((await runVideoQa({ ...base, expectAudio: true })).passed, false, "audio expected but missing");
      assert.equal((await runVideoQa({ ...base, captions: [{ text: "x", wrapped: true, traced: false, prohibited: false }] })).passed, false, "untraced caption");
      assert.equal((await runVideoQa({ ...base, cardResults: [{ index: 2, passed: false, failed: ["contrast"], isCta: true }] })).passed, false, "CTA card failed");
      assert.equal((await runVideoQa({ ...base, media: [{ id: "x", present: false, approved: false }] })).passed, false, "missing media");
      assert.equal((await runVideoQa({ ...base, file: path.join(dir, "nope.mp4") })).passed, false, "unplayable");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("template rules found in the pilot run", () => {
  test("the landscape showcase drops its supporting line instead of overflowing", () => {
    const base = { family: "screenshot_showcase" as const, theme: themeFor("saas", "#2563eb"), productName: "P", headline: { text: "Headline", src: { kind: "product" as const } }, subhead: { text: "A long supporting line", src: { kind: "product" as const } } };
    assert.equal(buildCreative({ ...base, size: "landscape" }).textBlocks.some((b) => b.role === "subhead"), false);
    assert.equal(buildCreative({ ...base, size: "square" }).textBlocks.some((b) => b.role === "subhead"), true);
  });
});
