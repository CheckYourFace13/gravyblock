// Scale architecture (owner directive 2026-11-10): five-video portfolio target, plan add-ons, fair scheduling, game mode, voices, hosting decisions.
// The scheduling test needs a scratch database (STUDIO_TEST_DATABASE_URL) and is skipped without one; the rest are pure.
import "./setup";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { computeAllowance, PLAN_ENTITLEMENTS } from "../entitlements";
import { checkDistinct } from "../library";
import { PLAN_PRODUCTS, PLANNED, toEntry } from "../library-plan";
import { OWNED_TARGET, slotEntry, targetProgress, TARGET_EXEMPT } from "../portfolio-target";
import { decidePlayback, hostedPlayback, mediaStoreConfig, objectKeyFor } from "../publishing/hosting";
import { gameClipPasses, gameFunChecks, gameRepeats, pickHighlights, type GameClip, type GameMoment } from "../video/game/engine";
import { OFFERED_VOICES, pickVoice, TONES, validateVoiceSetting } from "../video/voices";
import { JOB_PRIORITY } from "../runtime";

const DAY = 86_400_000;
const thu = Date.UTC(2026, 10, 12, 12); // Thursday 2026-11-12

describe("plan cadence and add-on capacity", () => {
  const weekly = { ...PLAN_ENTITLEMENTS.growth };
  const monthly = { ...PLAN_ENTITLEMENTS.starter };
  test("1 a month and 1 a week plans are supported, with the usage fields a customer needs", () => {
    const m = computeAllowance(monthly, [], thu);
    assert.equal(m.base, 1);
    assert.equal(m.period, "month");
    assert.equal(m.allowance, 1);
    assert.equal(m.remaining, 1);
    const w = computeAllowance(weekly, [{ at: thu - DAY, kind: "new" }, { at: thu - DAY * 0.5, kind: "replacement" }], thu);
    assert.equal(w.period, "week");
    assert.equal(w.generated, 1);
    assert.equal(w.replacements, 1);
    assert.equal(w.remaining, 0);
    assert.ok(w.nextEligibleAt, "next eligible date is reported");
  });
  test("paid add-ons raise the total, keep base and add-on visible, and are consumed in order", () => {
    const plus2 = { ...weekly, addOn: { perPeriod: 2 } };
    const a = computeAllowance(plus2, [{ at: thu - 3 * DAY, kind: "new" }], thu);
    assert.equal(a.base, 1);
    assert.equal(a.addOnPerPeriod, 2);
    assert.equal(a.allowance, 3);
    assert.equal(a.remaining, 2);
    assert.ok(a.eligible, "extra capacity shortens the spacing so the second video is not held for five days");
    const credits = computeAllowance({ ...monthly, addOn: { credits: 5, creditsUsed: 2 } }, [], thu);
    assert.equal(credits.creditsRemaining, 3);
    assert.equal(credits.allowance, 4);
  });
  test("a replacement never uses allowance, and extra capacity does not lift the quota ceiling", () => {
    const events = [{ at: thu - DAY, kind: "new" as const }, ...Array.from({ length: 6 }, (_, i) => ({ at: thu - DAY + i * 1000, kind: "replacement" as const }))];
    assert.equal(computeAllowance(weekly, events, thu).generated, 1);
    const full = computeAllowance({ ...weekly, addOn: { perPeriod: 1 } }, [{ at: thu - 3 * DAY, kind: "new" }, { at: thu - 2 * DAY, kind: "new" }], thu);
    assert.equal(full.remaining, 0);
    assert.equal(full.eligible, false);
  });
});

describe("five distinct videos per owned product", () => {
  test("the target is five and the open slots are different from each other and from the original three", () => {
    assert.equal(OWNED_TARGET, 5);
    for (const p of PLAN_PRODUCTS.filter((x) => !TARGET_EXEMPT.has(x.slug))) {
      const base = PLANNED.filter((x) => x.slug === p.slug).map(toEntry);
      const four = slotEntry(p, 4);
      const five = slotEntry(p, 5);
      assert.ok(checkDistinct(four, base).ok, `${p.slug} slot 4 repeats an original angle`);
      assert.ok(checkDistinct(five, [...base, four]).ok, `${p.slug} slot 5 repeats an earlier angle`);
      assert.equal(four.status, "planned");
      assert.ok(four.slot && !four.specId && !four.yt, "a slot is a purpose, never a script");
    }
  });
  test("existing approved and public videos count toward the five, and no filler is made to reach it", () => {
    const p = targetProgress([{ status: "public", position: 1 }, { status: "approved", position: 2 }, { status: "unlisted_review", position: 3 }, { status: "planned", position: 4, slot: true }, { status: "blocked", position: 5, slot: true }]);
    assert.deepEqual({ done: p.done, making: p.making, missing: p.missing }, { done: 3, making: 0, missing: 2 });
  });
});

describe("fair scheduling classes", () => {
  test("requested changes and corrections run before approved publications, then normal work, then paid extra capacity", () => {
    assert.ok(JOB_PRIORITY.remediation < JOB_PRIORITY.publication && JOB_PRIORITY.publication < JOB_PRIORITY.normal && JOB_PRIORITY.normal < JOB_PRIORITY.burst);
  });
});

const db = process.env.STUDIO_TEST_DATABASE_URL ? true : false;
describe("tenant fairness (scratch database)", { skip: !db }, () => {
  test("a customer with many queued videos cannot starve one with a single video, and only one heavy job runs", async () => {
    const { closeStudioDb, requireStudioDb } = await import("../db");
    const { createProduct } = await import("../repository");
    const { INTERNAL_SCOPE } = await import("../scope");
    const { claimNext, enqueue } = await import("../runtime");
    const d = requireStudioDb();
    const mk = (n: string) => createProduct(INTERNAL_SCOPE, "test", { name: `${n} ${Date.now()}`, kind: "website", publicUrl: null, ownerKind: "internal", businessId: null });
    const big = await mk("Big");
    const small = await mk("Small");
    const tag = `fair-${Date.now()}`;
    for (let i = 0; i < 3; i++) await enqueue({ kind: "library_video", weight: "heavy", priority: JOB_PRIORITY.normal, productId: big.id, dedupeKey: `${tag}-big-${i}`, input: { specId: `x:${i}` } }, d);
    await enqueue({ kind: "library_video", weight: "heavy", priority: JOB_PRIORITY.normal, productId: small.id, dedupeKey: `${tag}-small`, input: { specId: "y:0" } }, d);
    const first = await claimNext("test-worker", { allowHeavy: true }, d);
    assert.ok(first && first.productId === big.id, "the oldest job goes first when nobody has been served");
    await d.execute((await import("drizzle-orm")).sql`update ms_media_jobs set status='done', finished_at=now() where id=${first!.id}`);
    const second = await claimNext("test-worker", { allowHeavy: true }, d);
    assert.equal(second?.productId, small.id, "the other tenant is served next although the big tenant has more waiting");
    const none = await claimNext("test-worker", { allowHeavy: false }, d);
    assert.equal(none, null, "no second heavy job is claimed while heavy work is not allowed");
    await closeStudioDb();
  });
});

const moment = (startMs: number, endMs: number, kind: GameMoment["kind"], level: string, mechanic?: string, intensity = 0.8, source: GameMoment["source"] = "real_capture"): GameMoment => ({ startMs, endMs, kind, level, mechanic, intensity, source });
const good = (): GameClip => ({
  game: "scribblezap",
  format: "challenge",
  durationMs: 12_000,
  audio: "challenge_text",
  narrationWords: 0,
  vertical: true,
  moments: [moment(0, 1500, "input", "L1", "draw"), moment(1500, 4000, "animation", "L1", "draw"), moment(4000, 6000, "input", "L1", "draw"), moment(6000, 8000, "close_call", "L1", "draw", 1), moment(8000, 10000, "reward", "L1", "draw")],
});
describe("game video mode: fun first, real gameplay only", () => {
  test("a clip that opens on gameplay, shows cause and effect and a close call passes", () => {
    assert.ok(gameClipPasses(good()), JSON.stringify(gameFunChecks(good()).filter((c) => !c.ok)));
  });
  test("a menu, settings or instructions opening fails, however good the rest is", () => {
    const c = good();
    c.moments.unshift(moment(0, 2500, "menu", "menu"));
    c.moments.forEach((m, i) => i > 0 && ((m.startMs += 2500), (m.endMs += 2500)));
    assert.ok(!gameClipPasses(c));
    assert.equal(gameFunChecks(c).find((x) => x.id === "gameplay_first")?.ok, false);
  });
  test("fabricated gameplay is refused", () => {
    const c = good();
    c.moments[2] = { ...c.moments[2], source: "synthetic" };
    assert.equal(gameFunChecks(c).find((x) => x.id === "real_gameplay")?.ok, false);
  });
  test("long narration is not forced on a game clip", () => {
    const c = { ...good(), audio: "short_energetic_narration" as const, narrationWords: 90 };
    assert.equal(gameFunChecks(c).find((x) => x.id === "audio_choice")?.ok, false);
  });
  test("highlights skip dead time and never pick non-real capture", () => {
    const picks = pickHighlights([moment(0, 3000, "idle", "L1"), moment(3000, 5000, "close_call", "L1", "draw"), moment(5000, 7000, "reward", "L1", "draw", 0.9, "synthetic"), moment(7000, 9000, "win", "L2", "draw")], "challenge");
    assert.deepEqual(picks.map((m) => m.kind), ["close_call", "win"]);
  });
  test("two videos of one game may not repeat a format or the same levels and mechanics", () => {
    const a = good();
    const b = { ...good(), format: "mechanic_spotlight" as const };
    assert.equal(gameRepeats([a, b]).length, 1, "same level and mechanic");
    const c = { ...good(), format: "progression" as const, moments: good().moments.map((m) => ({ ...m, level: "L9", mechanic: "swipe" })) };
    assert.equal(gameRepeats([a, c]).length, 0);
  });
});

describe("free voices", () => {
  test("a curated, previewable set is offered, and choices are validated rather than silently replaced", () => {
    assert.equal(OFFERED_VOICES.length, 8);
    assert.ok(OFFERED_VOICES.every((v) => v && v.id && v.grade));
    assert.equal(validateVoiceSetting({ voice: "af_heart", tone: "upbeat" }).ok, true);
    assert.equal(validateVoiceSetting({ voice: "am_adam" }).ok, false, "a low-grade voice is not offered");
    assert.equal(validateVoiceSetting({ voice: "af_heart", variation: "alternate" }).ok, false, "alternate narrators must be named");
    assert.ok(Object.keys(TONES).length >= 6);
  });
  test("the brand narrator never changes unless the customer allowed it", () => {
    const fixed = validateVoiceSetting({ voice: "af_bella", tone: "conversational" });
    assert.ok(fixed.ok);
    if (fixed.ok) for (let i = 0; i < 8; i++) assert.deepEqual(pickVoice(fixed.value, i), { voice: "af_bella", speed: 1 });
    const alt = validateVoiceSetting({ voice: "af_bella", variation: "alternate", alternates: ["bm_george"] });
    assert.ok(alt.ok);
    if (alt.ok) assert.deepEqual([0, 1, 2].map((i) => pickVoice(alt.value, i).voice), ["af_bella", "af_bella", "bm_george"]);
  });
  test("pronunciation overrides are kept", () => {
    const r = validateVoiceSetting({ voice: "af_heart", pronunciations: { Knird: "nerd", "": "x" } });
    assert.ok(r.ok && r.value.pronunciations?.Knird === "nerd" && !("" in (r.value.pronunciations ?? {})));
  });
});

describe("where a customer's video plays", () => {
  test("a customer is never sent to the owner's channel; without YouTube it is GravyBlock-hosted, and without storage it says so", () => {
    assert.equal(decidePlayback({ ownerKind: "customer", ownConnectionId: "c1", storeConfigured: false }).kind, "own_youtube");
    const none = decidePlayback({ ownerKind: "customer", ownConnectionId: null, storeConfigured: false });
    assert.equal(none.kind, "gravyblock_hosted");
    assert.ok(none.kind === "gravyblock_hosted" && !none.ready && /NEEDS_MEDIA_STORAGE_SETUP/.test(none.note));
    assert.equal(decidePlayback({ ownerKind: "internal", ownConnectionId: "o1", storeConfigured: false }).kind, "owner_portfolio_youtube");
  });
  test("object keys are tenant-prefixed, embeds are built from the CDN, and storage config lists what is missing", () => {
    assert.ok(objectKeyFor("p1", "v1", "tok").startsWith("t/p1/"));
    const h = hostedPlayback("https://cdn.example.test/", "t/p1/v1/tok.mp4", 'My "video"');
    assert.ok(h.embedCode.includes("https://cdn.example.test/t/p1/v1/tok.mp4") && !h.embedCode.includes('"video"'));
    const m = mediaStoreConfig({});
    assert.ok(!m.configured && m.missing.length === 6);
  });
});
