// Productization: plan allowance, review email rules, logo fidelity hard gate, Brand Kit rules, GravyBlock topic library and its duplicate gate, attribution.
import "./setup";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { aspectProblems, canonicalizeLogo, comparePixels, logoIntegrityChecks, logoRuleViolations, sha256, type LogoProbe } from "../brand/logo-integrity";
import { PROHIBITED_ALTERATIONS } from "../brand/brand-kit";
import { ATTRIBUTION_LINE, attributionText, computeAllowance, PLAN_ENTITLEMENTS, periodStart, type VideoEvent } from "../entitlements";
import { gateTopics } from "../gravyblock-seed";
import { COVERED_BY_INITIAL_LIBRARY, placementsByPage, TOPICS } from "../gravyblock-topics";
import { checkDistinct } from "../library";
import { PLANNED, toEntry } from "../library-plan";
import { decidePlacement, placementTargetAllowed } from "../publishing/site-placement";
import { isPlausibleEmail, maskEmail, normalizeEmail } from "../publishing/review-contact";
import { buildStageHtml } from "../video/demo/stage";
import type { Timeline } from "../video/demo/types";

const D = 86_400_000;
const T = (s: string) => Date.parse(s);

describe("plan allowance", () => {
  const starter = PLAN_ENTITLEMENTS.starter;
  const now = T("2026-11-10T12:00:00Z");
  test("an empty month allows a video; once the allowance is used the next eligible date is the next period", () => {
    const a0 = computeAllowance(starter, [], now);
    assert.ok(a0.eligible && a0.remaining === 1 && a0.generated === 0);
    const used: VideoEvent[] = [{ at: T("2026-11-02T00:00:00Z"), kind: "new" }];
    const a1 = computeAllowance(starter, used, now);
    assert.ok(!a1.eligible && a1.remaining === 0);
    assert.equal(a1.nextEligibleAt, "2026-12-01T00:00:00.000Z");
  });
  test("a replacement for an existing video never uses the new-video allowance", () => {
    const ev: VideoEvent[] = [{ at: T("2026-11-02T00:00:00Z"), kind: "new" }, { at: T("2026-11-05T00:00:00Z"), kind: "replacement" }, { at: T("2026-11-06T00:00:00Z"), kind: "replacement" }];
    const a = computeAllowance(PLAN_ENTITLEMENTS.growth, ev, T("2026-11-06T12:00:00Z"));
    assert.equal(a.generated, 1);
    assert.equal(a.replacements, 2);
    const b = computeAllowance({ ...starter, videosPerPeriod: 2, minSpacingDays: 0 }, ev, now);
    assert.equal(b.remaining, 1, "two replacements plus one new video still leave one of two new videos");
  });
  test("minimum spacing blocks a second video even when allowance remains", () => {
    const ent = { ...PLAN_ENTITLEMENTS.pro, videosPerPeriod: 3, minSpacingDays: 2, carryOver: false };
    const wed = T("2026-11-11T12:00:00Z");
    const a = computeAllowance(ent, [{ at: wed - D, kind: "new" }], wed);
    assert.ok(!a.eligible && a.remaining === 2);
    assert.equal(a.nextEligibleAt, new Date(wed - D + 2 * D).toISOString());
    assert.ok(computeAllowance(ent, [{ at: wed - 3 * D, kind: "new" }], wed).eligible);
  });
  test("carry-over adds at most one period of unused allowance; no-carry plans do not", () => {
    const wk = T("2026-11-18T12:00:00Z");
    const carry = { ...PLAN_ENTITLEMENTS.pro, videosPerPeriod: 3, carryOver: true, minSpacingDays: 0 };
    assert.equal(computeAllowance(carry, [], wk).allowance, 6);
    assert.equal(computeAllowance({ ...carry, carryOver: false }, [], wk).allowance, 3);
    assert.equal(computeAllowance(carry, [{ at: T("2026-11-10T00:00:00Z"), kind: "new" }], wk).carried, 2);
  });
  test("the owner's own portfolio is uncapped, and a weekly period starts on Monday", () => {
    const a = computeAllowance(PLAN_ENTITLEMENTS.portfolio, Array.from({ length: 50 }, (_, i) => ({ at: now - i, kind: "new" as const })), now);
    assert.ok(a.eligible && a.allowance === null && a.remaining === null);
    assert.equal(new Date(periodStart("week", T("2026-11-12T10:00:00Z"))).getUTCDay(), 1);
  });
  test("an allowance is a ceiling: nothing is counted until a script exists, so no quota is spent on filler", () => {
    const thu = T("2026-11-12T12:00:00Z");
    const a = computeAllowance({ ...PLAN_ENTITLEMENTS.pro, videosPerPeriod: 4, carryOver: false }, [{ at: thu - 3 * D, kind: "new" }, { at: thu - 2 * D, kind: "new" }], thu);
    assert.equal(a.generated, 2);
    assert.equal(a.remaining, 2, "two strong videos exist, so two of four are used and the rest wait");
  });
});

describe("review email rules", () => {
  test("addresses are validated and normalized; the dashboard only ever sees a masked one", () => {
    assert.ok(isPlausibleEmail("Chris@IScreamStudio.com") && !isPlausibleEmail("not an email") && !isPlausibleEmail("a@b"));
    assert.equal(normalizeEmail("  A@B.com "), "a@b.com");
    assert.ok(!maskEmail("chris@iscreamstudio.com").includes("hris"));
  });
});

describe("logo fidelity hard gate", () => {
  const tl = { durationMs: 1000, scenes: [], plates: {}, captions: [], brand: { name: "X", accent: "#f97316", dark: "#111111", light: "#ffffff", logo: "logo.png", attribution: ATTRIBUTION_LINE } } as unknown as Timeline;
  test("the stage only scales and positions a logo", () => {
    assert.deepEqual(logoRuleViolations(buildStageHtml(tl)), []);
  });
  test("every kind of alteration is caught", () => {
    const wrap = (css: string) => `<style>${css}</style>`;
    for (const [css, what] of [
      [".elogo{border-radius:70px}", "radius"], [".blogo{border-radius:15px}", "radius"], [".elogo{box-shadow:0 30px 70px #000}", "shadow"], [".elogo{filter:grayscale(1)}", "filter"],
      [".elogo{width:300px;height:300px}", "stretch"], [".elogo{object-fit:cover}", "crop"], [".blogo{background:#fff}", "background"], [".elogo{transform:rotate(12deg)}", "rotation"],
      [".elogo{mix-blend-mode:multiply}", "blend"], [".elogo{opacity:.5}", "opacity"], [".elogo{clip-path:circle(50%)}", "clip"],
    ] as const) assert.ok(logoRuleViolations(wrap(css)).length > 0, `${what} must be rejected`);
    assert.ok(logoRuleViolations(`<script>o.elogo.style.transform='scale(1) rotate(4deg)';</script>`).length > 0);
    assert.ok(logoRuleViolations(`<script>o.elogo.style.filter='blur(2px)';</script>`).length > 0);
    assert.deepEqual(logoRuleViolations(wrap(".elogo{height:300px;width:auto;max-width:520px;object-fit:contain}")), []);
  });
  test("a changed shape, a rounded clip or a shadow in the live render fails the aspect check", () => {
    const canon = { width: 400, height: 200 };
    const ok: LogoProbe = { selector: ".elogo", naturalW: 400, naturalH: 200, boxW: 520, boxH: 260, objectFit: "contain", radius: "0px", shadow: "none", filter: "none", clip: "none", opacity: "1", transform: "none" };
    assert.deepEqual(aspectProblems(canon, [ok]), []);
    assert.ok(aspectProblems(canon, [{ ...ok, objectFit: "fill", boxW: 300, boxH: 300 }]).length > 0, "a stretched box");
    assert.ok(aspectProblems(canon, [{ ...ok, radius: "70px" }]).length > 0);
    assert.ok(aspectProblems(canon, [{ ...ok, shadow: "rgba(0,0,0,.3) 0 30px 70px" }]).length > 0);
    assert.ok(aspectProblems(canon, [{ ...ok, naturalW: 200, naturalH: 200 }]).length > 0, "a different picture than the source");
  });
  test("pixels: the source rescaled matches; a recolour or a stretch does not", async () => {
    const sharp = (await import("sharp")).default;
    const W = 120, H = 60;
    const raw = Buffer.alloc(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; const left = x < W / 2; raw[i] = left ? 220 : 20; raw[i + 1] = left ? 40 : 90; raw[i + 2] = left ? 40 : 200; raw[i + 3] = 255; }
    const src = await sharp(raw, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
    const faithful = await sharp(src).resize(480, 240).png().toBuffer();
    const good = await comparePixels(src, faithful, { w: 480, h: 240 }, { w: W, h: H });
    assert.ok(good.mean < 6 && good.strongShare < 0.01, `faithful scaling differs by ${good.mean}`);
    const recolored = await sharp(faithful).negate({ alpha: false }).png().toBuffer();
    const bad = await comparePixels(src, recolored, { w: 480, h: 240 }, { w: W, h: H });
    assert.ok(bad.mean > 14 || bad.strongShare > 0.04, "a recolour is a hard failure");
    const squashed = await sharp(src).resize(240, 240, { fit: "fill" }).png().toBuffer();
    const sq = await comparePixels(src, squashed, { w: 480, h: 240 }, { w: W, h: H });
    assert.ok(sq.mean > 14 || sq.strongShare > 0.04, "a stretched logo is a hard failure");
  });
  test("the QA checks are all hard failures, and no verified logo means NEEDS BRAND ASSET", async () => {
    const none = logoIntegrityChecks({ canonical: null, writtenBytes: null, stageHtml: "", probes: null, pixels: null });
    assert.ok(!none[0].ok && /NEEDS BRAND ASSET/.test(none[0].detail));
    const sharp = (await import("sharp")).default;
    const png = await sharp({ create: { width: 40, height: 20, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 1 } } }).png().toBuffer();
    const canon = await canonicalizeLogo({ id: "a".repeat(8), sha256: sha256(png), sourceUrl: "https://x.test/logo.png", originalName: "logo.png", provenance: "public_fetch", mimeType: "image/png", width: 40, height: 20 }, png);
    assert.equal(canon.width, 40);
    assert.equal(canon.background, "opaque");
    await assert.rejects(canonicalizeLogo({ id: "b", sha256: "0".repeat(64), sourceUrl: null, originalName: null, provenance: "x", mimeType: "image/png", width: 40, height: 20 }, png));
    const swapped = logoIntegrityChecks({ canonical: canon, writtenBytes: Buffer.from("different"), stageHtml: buildStageHtml({ durationMs: 1, scenes: [], plates: {}, captions: [], brand: { name: "X", accent: "#fff", dark: "#000", light: "#fff", logo: "logo.png" } } as unknown as Timeline), probes: [], pixels: null });
    assert.ok(swapped.every((c) => c.severity === "fail"));
    assert.ok(!swapped.find((c) => c.id === "logo_source")!.ok, "bytes that do not hash to the canonical asset are a substituted logo");
  });
  test("the Brand Kit carries the prohibited alterations with it", () => {
    for (const w of ["recolor", "redraw or regenerate with AI", "crop any part", "stretch or squash"]) assert.ok(PROHIBITED_ALTERATIONS.some((p) => p.includes(w)));
  });
});

describe("attribution", () => {
  test("configurable by mode: required and subtle say it, none does not, and the line never replaces the customer's name", () => {
    assert.equal(attributionText("required"), "Created automatically by GravyBlock Marketing Studio");
    assert.ok(attributionText("subtle")?.includes("GravyBlock"));
    assert.equal(attributionText("none"), null);
    const html = buildStageHtml({ durationMs: 1, scenes: [], plates: {}, captions: [], brand: { name: "Acme", accent: "#fff", dark: "#000", light: "#fff", logo: "logo.png", attribution: ATTRIBUTION_LINE } } as unknown as Timeline);
    assert.ok(html.includes(ATTRIBUTION_LINE) && /\.eattr\{[^}]*font-size:30px/.test(html), "small, below the call to action");
    assert.ok(!buildStageHtml({ durationMs: 1, scenes: [], plates: {}, captions: [], brand: { name: "Acme", accent: "#fff", dark: "#000", light: "#fff", logo: "logo.png", attribution: null } } as unknown as Timeline).includes(ATTRIBUTION_LINE));
  });
  test("plans differ: the low plan requires it, the top plan can remove it", () => {
    assert.equal(PLAN_ENTITLEMENTS.starter.attribution, "required");
    assert.equal(PLAN_ENTITLEMENTS.agency.attribution, "none");
  });
});

describe("GravyBlock topic library", () => {
  const base = PLANNED.filter((p) => p.slug === "gravyblock").map(toEntry);
  test("a large inventory (not three), every topic distinct from the initial library and from each other", () => {
    assert.ok(TOPICS.length >= 30, `${TOPICS.length} topics`);
    const { accepted, conflicts } = gateTopics(base);
    assert.deepEqual(conflicts, []);
    assert.equal(accepted.length, TOPICS.length);
    assert.equal(new Set(TOPICS.map((t) => t.key)).size, TOPICS.length);
    assert.equal(new Set(TOPICS.map((t) => t.hook.toLowerCase())).size, TOPICS.length);
  });
  test("the duplicate gate really rejects a repeat topic", () => {
    const first = gateTopics(base).accepted[0];
    const repeat = { ...first, id: "gravyblock-repeat", position: 99, title: "GravyBlock again" };
    assert.ok(!checkDistinct(repeat, [first]).ok, "the same hook, purpose and benefit under a new title is blocked");
    const different = { ...gateTopics(base).accepted[5], id: "gravyblock-other", position: 100 };
    assert.ok(checkDistinct(different, [first]).ok);
  });
  test("every topic has a call to action on gravyblock.com and a recommended page position; the initial three are accounted for", () => {
    for (const t of TOPICS) {
      assert.equal(new URL(t.ctaUrl).host, "gravyblock.com");
      assert.ok(t.placement.page.startsWith("/") && t.placement.slot.length > 3 && t.placement.why.length > 8);
    }
    const pages = Object.keys(placementsByPage());
    for (const p of ["/", "/pricing", "/faq", "/marketing-studio", "/results", "/onboarding", "/scan"]) assert.ok(pages.includes(p), `placement for ${p}`);
    assert.equal(COVERED_BY_INITIAL_LIBRARY.length, 3);
  });
});

describe("customer sites and channels", () => {
  test("House and internal products are never auto-placed, whatever a grant says", () => {
    for (const ownerKind of ["house", "internal"]) assert.equal(decidePlacement({ ownerKind, grant: { granted: true } }).mode, "recommend_only");
  });
  test("a customer is auto-placed only with a site-write grant, and only for the page kinds granted", () => {
    assert.equal(decidePlacement({ ownerKind: "customer", grant: null }).mode, "recommend_only");
    assert.equal(decidePlacement({ ownerKind: "customer", grant: { granted: false } }).mode, "recommend_only");
    assert.equal(decidePlacement({ ownerKind: "customer", grant: { granted: true, pages: ["faq"] }, pageType: "home" }).mode, "recommend_only");
    assert.equal(decidePlacement({ ownerKind: "customer", grant: { granted: true, pages: ["faq"] }, pageType: "faq" }).mode, "auto_place");
  });
  test("a customer's video can never target iScream's site or another customer's", () => {
    const own = { ownerKind: "customer", productHost: "acme-plumbing.com" };
    assert.ok(placementTargetAllowed(own, "https://acme-plumbing.com/faq").ok);
    assert.ok(placementTargetAllowed(own, "https://www.acme-plumbing.com/faq").ok);
    assert.ok(!placementTargetAllowed(own, "https://iscreamstudio.com/work").ok);
    assert.ok(!placementTargetAllowed(own, "https://other-customer.com/").ok);
    assert.ok(!placementTargetAllowed(own, "not a url").ok);
  });
});

const hasDb = Boolean(process.env.STUDIO_TEST_DATABASE_URL);
describe("review email and allowance on real records (scratch database)", { skip: !hasDb }, () => {
  test("a customer has no recipient until a new address is confirmed from the link sent to it; changing it leaves reviews alone", async () => {
    const { closeStudioDb, requireStudioDb } = await import("../db");
    const { createProduct } = await import("../repository");
    const { INTERNAL_SCOPE, customerScope } = await import("../scope");
    const { confirmEmailChange, requestEmailChange, reviewRecipient } = await import("../publishing/review-contact");
    const { allowanceFor } = await import("../entitlements");
    const d = requireStudioDb();
    const own = await createProduct(INTERNAL_SCOPE, "test", { name: `Own ${Date.now()}`, kind: "website", publicUrl: null, ownerKind: "internal", businessId: null });
    assert.equal(await reviewRecipient(d, own.id), "chris@iscreamstudio.com", "the owner's portfolio keeps the deployment default");
    const cust = await createProduct(customerScope("22222222-2222-4222-8222-222222222222"), "test", { name: `Cust ${Date.now()}`, kind: "website", publicUrl: null, ownerKind: "customer", businessId: null });
    assert.equal(await reviewRecipient(d, cust.id), null, "a customer is never emailed at the owner's address, and nothing is sent until they verify one");
    const req = await requestEmailChange(d, "test", cust.id, "Owner@Customer.example");
    assert.equal(await reviewRecipient(d, cust.id), null, "an unconfirmed address is not used");
    assert.deepEqual(await confirmEmailChange(d, `${cust.id}.wrong`), { ok: false, reason: "invalid" });
    const ok = await confirmEmailChange(d, req.token);
    assert.ok(ok.ok);
    assert.equal(await reviewRecipient(d, cust.id), "owner@customer.example");
    assert.deepEqual(await confirmEmailChange(d, req.token), { ok: false, reason: "invalid" }, "a used link never works twice");
    const second = await requestEmailChange(d, "test", cust.id, "new@customer.example");
    assert.equal(await reviewRecipient(d, cust.id), "owner@customer.example", "the previous verified address keeps working until the new one is confirmed");
    assert.deepEqual(await confirmEmailChange(d, second.token, Date.now() + 25 * 3_600_000), { ok: false, reason: "expired" });
    const a = await allowanceFor(d, cust);
    assert.equal(a.plan, "starter");
    assert.ok(a.eligible && a.generated === 0);
    assert.equal((await allowanceFor(d, own)).allowance, null);
    await closeStudioDb();
  });
});
