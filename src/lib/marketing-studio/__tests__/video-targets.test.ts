import "./setup";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { closeStudioDb, ms, requireStudioDb } from "../db";
import { getAngles } from "../library-store";
import { ensureOwnedSlots, slotEntry } from "../portfolio-target";
import { createProduct, listProducts } from "../repository";
import { INTERNAL_SCOPE } from "../scope";
import { ensureGameAngles, formatOfSpec, gameAngleEntries, gameSpecId, gameTick } from "../video/game/production";
import { momentsFor } from "../video/game/clip";
import { GAME_FORMATS, GAME_LIBRARY_ORDER, type GameMoment } from "../video/game/engine";
import { cleanMaxPending, cleanTarget, defaultMaxPending, defaultTarget, getMaxPending, getTarget, isGame, pendingCount, setMaxPending, setTarget, statsFrom, targetStats } from "../video-target";
import { statusOf, type StatusFacts } from "../portfolio-loop";
import { detectMibbleMoments, type MibbleEvent } from "../video/game/mibble";
import { gameFunChecks, type GameClip } from "../video/game/engine";
import { approveReview, reviewKey } from "../publishing/video-review";
import { GAME_ACQUISITION_PAUSE } from "../rollout";
import { ensureOwnedChannelShared, youtubeConnectionFor } from "../publishing/youtube-share";
import { connectAccount } from "../publishing/connections";
import { YT_SCOPE_MANAGE, YT_SCOPE_READ, YT_SCOPE_UPLOAD } from "../publishing/youtube-api";

const HAVE_DB = Boolean(process.env.STUDIO_TEST_DATABASE_URL);
const angle = (status: string) => ({ status }) as never;

describe("video targets (pure)", () => {
  test("a target is a whole number from 1 to 50; the presets are 1, 3, 5 and anything else is custom", () => {
    assert.equal(cleanTarget(5), 5);
    assert.equal(cleanTarget("3"), 3);
    assert.equal(cleanTarget(0), null);
    assert.equal(cleanTarget(51), null);
    assert.equal(cleanTarget(2.5), null);
    assert.equal(cleanTarget("abc"), null);
    assert.equal(cleanTarget(12), 12);
  });

  test("the owner's own products and games default to five; a customer has none until they set one", () => {
    assert.equal(defaultTarget({ ownerKind: "internal", slug: "scribblezap" }), 5);
    assert.equal(defaultTarget({ ownerKind: "house", slug: "micstage" }), 5);
    assert.equal(defaultTarget({ ownerKind: "customer", slug: "acme" }), null);
    assert.equal(defaultTarget({ ownerKind: "house", slug: "gravyblock" }), null, "GravyBlock has its own inventory");
    assert.ok(isGame({ kind: "mobile_game" }) && !isGame({ kind: "website" }));
  });

  test("progress counts approved, waiting and rendering videos; a correction never changes it", () => {
    const s = statsFrom([angle("public"), angle("approved"), angle("unlisted_review"), angle("planned"), angle("planned")], 1, 5);
    assert.deepEqual(s, { target: 5, approved: 2, waiting: 1, making: 1, remaining: 1 });
    // a video whose owner requested changes is still the same angle: it stays counted, so the remaining target does not grow
    assert.equal(statsFrom([angle("unlisted_review")], 0, 3).remaining, 2);
    assert.equal(statsFrom([angle("public"), angle("public"), angle("public")], 0, 3).remaining, 0);
    assert.equal(statsFrom([], 0, null).remaining, null);
    assert.equal(statsFrom([angle("in_production")], 0, 3).making, 1, "in production counts even before its job row is seen");
  });

  test("production does not stop at the first video waiting: it pauses only when as many as the owner allows are pending", () => {
    const base: StatusFacts = { paused: false, needsOwner: null, review: [], activeJobs: 0, uploadLimited: false, waiting: false, maxPending: 5 };
    const wait = (n: number, status = "unlisted_live") => Array.from({ length: n }, () => ({ status }));
    assert.equal(statusOf({ ...base, review: wait(1) }), "ACTIVE", "one waiting video does not stop the next");
    assert.equal(statusOf({ ...base, review: wait(4) }), "ACTIVE");
    assert.equal(statusOf({ ...base, review: wait(5) }), "WAITING_FOR_REVIEW", "the limit is reached");
    assert.equal(statusOf({ ...base, review: [...wait(4), { status: "changes_requested" }] }), "CHANGES_REQUESTED");
    assert.equal(statusOf({ ...base, review: wait(1), activeJobs: 1 }), "RENDERING", "one render at a time still shows as rendering");
    assert.equal(statusOf({ ...base, maxPending: undefined, review: wait(1) }), "WAITING_FOR_REVIEW", "with no setting the old one-at-a-time rule holds");
    assert.equal(pendingCount([{ status: "unlisted_live" }, { status: "changes_requested" }, { status: "approved_public" }]), 2);
  });

  test("maximum pending reviews: five for the owner's portfolio, the plan's cadence for a customer, always configurable", () => {
    assert.equal(defaultMaxPending({ ownerKind: "internal" }), 5);
    assert.equal(defaultMaxPending({ ownerKind: "house" }), 5);
    assert.equal(defaultMaxPending({ ownerKind: "customer" }), 1);
    assert.equal(cleanMaxPending(8, { ownerKind: "internal" }), 8);
    assert.equal(cleanMaxPending(8, { ownerKind: "customer" }), 3, "a customer cannot queue more than their plan's cap");
    assert.equal(cleanMaxPending(0, { ownerKind: "internal" }), null);
    assert.equal(cleanMaxPending(21, { ownerKind: "internal" }), null);
  });

  test("Mibble Meadow's real run becomes real moments, and several levels give every format what it needs", () => {
    const events: MibbleEvent[] = [{ frame: 235, kind: "home" }, { frame: 240, kind: "play" }];
    let f = 300;
    for (let lvl = 1; lvl <= 6; lvl++) {
      const n = lvl < 4 ? 4 : 5;
      events.push({ frame: f, kind: "level_loaded", level: lvl, size: n });
      if (lvl > 1) events.push({ frame: f + 20, kind: "marked_by_tap" });
      events.push({ frame: f + 40, kind: "marked_by_swipe" });
      for (let r = 0; r < n; r++) events.push({ frame: f + 60 + r * 16, kind: "placed", row: r, col: r });
      events.push({ frame: f + 60 + n * 16 + 10, kind: "level_complete", level: lvl });
      events.push({ frame: f + 60 + n * 16 + 90, kind: "next_level_click" });
      f += 260;
    }
    const m = detectMibbleMoments(events, f);
    assert.ok(m.every((x) => x.source === "real_capture" && x.endMs > x.startMs), "every moment is real captured time");
    assert.deepEqual([...new Set(m.map((x) => x.level))].sort(), ["L1", "L2", "L3", "L4", "L5", "L6"]);
    const kinds = new Set(m.map((x) => x.kind));
    for (const k of ["input", "stage_transition", "win", "reward", "unlock", "animation", "close_call", "menu"]) assert.ok(kinds.has(k as never), k);
    assert.equal(m.filter((x) => x.kind === "close_call").length, 6, "the last animal of each board is the tense moment");
    // a clip of one level's play has what the hook needs; a three-level clip has what progression needs
    const clipOf = (levels: string[], format: keyof typeof GAME_FORMATS): GameClip => {
      const inLevels = m.filter((x) => levels.includes(x.level) && !["menu", "instructions"].includes(x.kind));
      let t = 0;
      const moments = inLevels.map((x) => ({ ...x, startMs: t, endMs: (t += x.endMs - x.startMs) }));
      return { game: "mibblemeadow", format, moments, durationMs: t, audio: "gameplay_audio_music_captions", narrationWords: 0, vertical: GAME_FORMATS[format].vertical };
    };
    const hook = gameFunChecks({ ...clipOf(["L1"], "gameplay_hook"), durationMs: 9000 });
    assert.ok(hook.find((c) => c.id === "real_gameplay")?.ok && hook.find((c) => c.id === "required_moments")?.ok);
    assert.ok(gameFunChecks(clipOf(["L1"], "challenge")).find((c) => c.id === "required_moments")?.ok, "a challenge needs a close call: the last animal");
  });

  test("a bigger target opens more slots, each a different customer intent", () => {
    const a = slotEntry({ slug: "x", name: "X", home: "https://x.test" }, 7);
    const b = slotEntry({ slug: "x", name: "X", home: "https://x.test" }, 8);
    assert.ok(a.slot && b.slot && a.title !== b.title && a.id !== b.id);
  });
});

describe("game video engine: formats and footage (pure)", () => {
  test("every game format is a different kind of video, in the order they are made", () => {
    const entries = gameAngleEntries({ slug: "scribblezap", name: "ScribbleZap" }, "https://iscreamstudio.com/games/scribblezap/", true);
    assert.equal(entries.length, GAME_LIBRARY_ORDER.length);
    assert.equal(new Set(entries.map((e) => e.specId)).size, entries.length);
    assert.equal(new Set(entries.map((e) => e.title)).size, entries.length);
    assert.ok(entries.every((e) => e.status === "planned" && e.yt && e.yt.title.length <= 100 && formatOfSpec(e.specId as string)));
    assert.equal(formatOfSpec(gameSpecId("scribblezap", "challenge")), "challenge");
    assert.equal(formatOfSpec("scribblezap"), null);
    assert.ok(GAME_LIBRARY_ORDER.includes("gameplay_hook") && GAME_LIBRARY_ORDER.includes("challenge") && GAME_LIBRARY_ORDER.includes("progression") && GAME_LIBRARY_ORDER.includes("reward_unlock") && GAME_LIBRARY_ORDER.includes("mechanic_spotlight") && GAME_LIBRARY_ORDER.includes("variety_montage") && GAME_LIBRARY_ORDER.includes("short_form"));
  });

  test("a game clip has its own version fingerprint and needs no demo script", async () => {
    const { effectiveSpecHash } = await import("../video/demo/overrides");
    const one = await effectiveSpecHash(null as never, "p", "scribblezap:game-challenge");
    const two = await effectiveSpecHash(null as never, "p", "scribblezap:game-challenge");
    assert.ok(one.startsWith("game:scribblezap:game-challenge:") && one !== two, "every cut of footage is its own version");
  });

  test("a later clip avoids the levels earlier clips showed, when the footage still allows the format", () => {
    const m = (level: string, kind: GameMoment["kind"], at: number): GameMoment => ({ startMs: at, endMs: at + 1500, kind, level, mechanic: "cut", intensity: 0.8, source: "real_capture" });
    const moments = [m("L1", "input", 0), m("L1", "reward", 2000), m("L2", "input", 4000), m("L2", "reward", 6000), m("L3", "input", 8000), m("L3", "reward", 10000)];
    const next = momentsFor(moments, "gameplay_hook", new Set(["L1"]));
    assert.ok(!next.some((x) => x.level === "L1"), "the level already shown is set aside");
    const none = momentsFor(moments, "gameplay_hook", new Set(["L1", "L2", "L3"]));
    assert.equal(none.length, moments.length, "when every level was used the format can still be attempted, and the distinctness gate decides");
    assert.ok(GAME_FORMATS.gameplay_hook.firstActionMaxMs <= 800, "fun first: action within 800 ms");
  });
});

describe("game production and targets (database)", { skip: !HAVE_DB }, () => {
  const db = () => requireStudioDb();
  let gameId = "";
  let siteId = "";
  before(async () => {
    for (const t of [ms.msMediaJobs, ms.msSettings, ms.msProductFacts, ms.msProducts]) await db().delete(t);
    gameId = (await createProduct(INTERNAL_SCOPE, "t", { name: "ScribbleZap", kind: "mobile_game", publicUrl: "https://iscreamstudio.com/games/scribblezap/" })).id;
    siteId = (await createProduct(INTERNAL_SCOPE, "t", { name: "SomeSite", kind: "website", publicUrl: "https://example.test/" })).id;
  });
  after(async () => {
    await closeStudioDb();
  });
  const product = async (id: string) => ((await listProducts(INTERNAL_SCOPE, db())) as unknown as Array<{ id: string; slug: string; name: string; kind: string; ownerKind: string; publicUrl?: string }>).find((p) => p.id === id)!;

  test("the owner sets 1, 3, 5 or a custom target without anyone running a command, and it is remembered", async () => {
    const p = await product(siteId);
    assert.deepEqual(await getTarget(db(), p), { target: 5, explicit: false });
    assert.equal(await setTarget(db(), "owner", siteId, "3"), 3);
    assert.deepEqual(await getTarget(db(), p), { target: 3, explicit: true });
    assert.equal(await setTarget(db(), "owner", siteId, 12), 12);
    await assert.rejects(() => setTarget(db(), "owner", siteId, "0"));
    await assert.rejects(() => setTarget(db(), "owner", siteId, "lots"));
    assert.equal((await getTarget(db(), p)).target, 12);
  });

  test("a target above five opens further slots for a website", async () => {
    const p = await product(siteId);
    const { setSetting } = await import("../runtime");
    const { angleKey } = await import("../library");
    await setSetting(angleKey(p.slug), [slotEntry({ slug: p.slug, name: p.name, home: "https://example.test/" }, 4)], "t", db());
    const added = await ensureOwnedSlots(db(), "t", { slug: p.slug, name: p.name, home: "https://example.test/" }, 7);
    assert.equal(added, 3, "positions 5, 6 and 7 are opened up to the target");
    assert.deepEqual((await getAngles(db(), p.slug)).map((a) => a.position).sort((a, b) => a - b), [4, 5, 6, 7]);
  });

  test("a game gets one planned angle per format, and the tick queues them one at a time until the target is met", async () => {
    const g = await product(gameId);
    assert.equal(await ensureGameAngles(db(), g), GAME_LIBRARY_ORDER.length);
    assert.equal(await ensureGameAngles(db(), g), 0, "nothing is added twice");
    const first = await gameTick(db(), g, { force: false, review: [], activeJobs: 0 });
    assert.match(first, /queued the next game video \(gameplay_hook\)/);
    const again = await gameTick(db(), g, { force: false, review: [], activeJobs: 0 });
    assert.match(again, /already being made/, "one game video at a time");
    const waiting = await gameTick(db(), g, { force: false, review: [{ status: "unlisted_live" }], activeJobs: 0 });
    assert.match(waiting, /already being made|waiting for your review/);
    const jobs = await db().select().from(ms.msMediaJobs);
    assert.equal(jobs.filter((j) => j.kind === "game_video").length, 1);
    assert.equal((jobs[0].input as { specId: string }).specId, gameSpecId("scribblezap", "gameplay_hook"));
  });

  test("a game that already has its target of videos queues nothing more, and its stats say so", async () => {
    const g = await product(gameId);
    const { updateAngle } = await import("../library-store");
    await db().delete(ms.msMediaJobs);
    await setTarget(db(), "owner", gameId, 2);
    for (const format of ["gameplay_hook", "challenge"] as const) await updateAngle(db(), "t", g.slug, (e) => e.specId === gameSpecId(g.slug, format), { status: "unlisted_review" });
    const stats = await targetStats(db(), g);
    assert.deepEqual([stats.target, stats.waiting, stats.remaining], [2, 2, 0]);
    assert.match(await gameTick(db(), g, { force: false, review: [], activeJobs: 0 }), /target reached/);
    assert.equal((await db().select().from(ms.msMediaJobs)).length, 0);
    // Generate Next Video overrides the target (the one-review-at-a-time wait too)
    assert.match(await gameTick(db(), g, { force: true, review: [{ status: "unlisted_live" }], activeJobs: 0 }), /queued the next game video/);
  });

  test("a format blocked as too similar when nothing was ever delivered was blocked by a mistake: it is reopened and queued again", async () => {
    const g = await product(gameId);
    const { setSetting } = await import("../runtime");
    const { angleKey } = await import("../library");
    const { updateAngle } = await import("../library-store");
    await db().delete(ms.msMediaJobs);
    await setSetting(angleKey(g.slug), [], "t", db());
    await setTarget(db(), "owner", gameId, 5);
    await ensureGameAngles(db(), g);
    const spec = gameSpecId(g.slug, "gameplay_hook");
    await updateAngle(db(), "t", g.slug, (e) => e.specId === spec, { status: "blocked" });
    await setSetting(`video_game_block_${spec.replace(/[^a-z0-9]+/gi, "_")}`, { at: new Date().toISOString(), reason: "too similar to an earlier clip" }, "t", db());
    assert.ok((await gameTick(db(), g, { force: false, review: [], activeJobs: 0 })).includes("queued the next game video (gameplay_hook)"));
  });

  test("a game keeps producing while earlier clips wait for review, up to the owner's maximum pending", async () => {
    const g = await product(gameId);
    const { setSetting } = await import("../runtime");
    const { angleKey } = await import("../library");
    await db().delete(ms.msMediaJobs);
    await setSetting(angleKey(g.slug), [], "t", db());
    await setTarget(db(), "owner", gameId, 5);
    assert.equal((await getMaxPending(db(), g)).max, 5, "five for the owner's own game");
    await ensureGameAngles(db(), g);
    const waiting = (n: number) => Array.from({ length: n }, () => ({ status: "unlisted_live" }));
    assert.ok((await gameTick(db(), g, { force: false, review: waiting(3), activeJobs: 0 })).includes("queued the next game video"), "three waiting, the next one is still made");
    await db().delete(ms.msMediaJobs);
    assert.match(await gameTick(db(), g, { force: false, review: waiting(5), activeJobs: 0 }), /5 of 5 allowed/);
    assert.equal(await setMaxPending(db(), "owner", g, 2), 2);
    assert.match(await gameTick(db(), g, { force: false, review: waiting(2), activeJobs: 0 }), /2 of 2 allowed/, "configurable per product");
    await setMaxPending(db(), "owner", g, 5);
  });

  test("a game with no verified store listing can be CREATED and reviewed, but can never be made public", async () => {
    const mibble = (await createProduct(INTERNAL_SCOPE, "t", { name: "Mibble Gate", kind: "mobile_game", publicUrl: "https://iscreamstudio.com/mibblemeadow/" })).id;
    const m = await product(mibble);
    const { setSetting } = await import("../runtime");
    await setSetting(GAME_ACQUISITION_PAUSE.setting, true, "t", db());
    // creation: the tick queues real-gameplay work for a game with a capture (the pause never blocks making or reviewing a video)
    const out = await gameTick(db(), { ...m, slug: "scribblezap" }, { force: true, review: [], activeJobs: 0 });
    assert.ok(!/paused|store listing/i.test(out), "the store-listing pause does not stop creation: " + out);
    // publication: approving would make it public, and is refused while there is no verified listing; nothing is recorded
    const pubId = "11111111-1111-4111-8111-111111111111";
    await setSetting(reviewKey(pubId), { status: "unlisted_live", publicationId: pubId, productId: mibble, productName: "Mibble Gate", videoRowId: "v", videoId: "abcdefghijk", title: "t", description: "d", watchUrl: "u", uploadedAt: new Date().toISOString() }, "t", db());
    await assert.rejects(() => approveReview(INTERNAL_SCOPE, "owner", pubId, {} as never, db()), /cannot be made public yet/);
    const state = (await (await import("../publishing/video-review")).getReview(db(), pubId))!;
    assert.equal(state.status, "unlisted_live", "the video stays unlisted and the refusal changes nothing");
    await setSetting(GAME_ACQUISITION_PAUSE.setting, false, "t", db());
  });

  test("the owner's existing YouTube channel is shared with their other products (never copied, never with a customer)", async () => {
    const owner = (await createProduct(INTERNAL_SCOPE, "t", { name: "Channel Owner", kind: "mobile_game" })).id;
    const sibling = (await createProduct(INTERNAL_SCOPE, "t", { name: "Channel Sibling", kind: "mobile_game" })).id;
    await connectAccount(INTERNAL_SCOPE, "t", owner, { platform: "youtube", accountLabel: "iScream Studio (@iscreamstudio)", externalAccountId: "UC_share_test", tokens: { accessToken: "ya29.fake", refreshToken: "1//fake", accessExpiresAt: Date.now() + 3_000_000 }, scopes: [YT_SCOPE_UPLOAD, YT_SCOPE_READ, YT_SCOPE_MANAGE], tokenExpiresAt: null });
    assert.equal(await youtubeConnectionFor(db(), sibling), null, "no channel of its own");
    assert.equal(await ensureOwnedChannelShared(db(), "t", { id: sibling, ownerKind: "internal" }), true);
    const shared = await youtubeConnectionFor(db(), sibling);
    assert.ok(shared && shared.productId === owner, "it posts through the owner's channel; no new connection was made");
    assert.equal(await ensureOwnedChannelShared(db(), "t", { id: sibling, ownerKind: "customer" }), false, "a customer is never given the owner's channel");
  });

  test("a game with no automatic real-gameplay capture makes nothing and says why", async () => {
    await db().delete(ms.msMediaJobs);
    const mibble = (await createProduct(INTERNAL_SCOPE, "t", { name: "Mibble Meadow", kind: "mobile_game", publicUrl: "https://iscreamstudio.com/mibblemeadow/" })).id;
    const m = await product(mibble);
    const out = await gameTick(db(), m, { force: true, review: [], activeJobs: 0 });
    assert.match(out, /NEEDS CAPTURE/);
    assert.equal((await db().select().from(ms.msMediaJobs)).length, 0, "no gameplay is ever faked");
  });
});
