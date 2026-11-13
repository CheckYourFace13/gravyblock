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
import { cleanTarget, defaultTarget, getTarget, isGame, setTarget, statsFrom, targetStats } from "../video-target";

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

  test("a game with no automatic real-gameplay capture makes nothing and says why", async () => {
    await db().delete(ms.msMediaJobs);
    const mibble = (await createProduct(INTERNAL_SCOPE, "t", { name: "Mibble Meadow", kind: "mobile_game", publicUrl: "https://iscreamstudio.com/mibblemeadow/" })).id;
    const m = await product(mibble);
    const out = await gameTick(db(), m, { force: true, review: [], activeJobs: 0 });
    assert.match(out, /NEEDS CAPTURE/);
    assert.equal((await db().select().from(ms.msMediaJobs)).length, 0, "no gameplay is ever faked");
  });
});
