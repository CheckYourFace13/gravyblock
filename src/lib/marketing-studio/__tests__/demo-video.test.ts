// Pure tests run anywhere. Database tests need a scratch database:
//   STUDIO_TEST_DATABASE_URL=postgresql://.../gb_studio_test MARKETING_DB_POOL_MAX=1 npx tsx --test --test-concurrency=1 src/lib/marketing-studio/__tests__/demo-video.test.ts
import "./setup";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { closeStudioDb, ms, requireStudioDb } from "../db";
import { addFact, createProduct, verifyFact } from "../repository";
import { reconcileGameLaunchState } from "../video/demo/launch-state";
import { specForLaunchState } from "../video/demo/launch";
import { assertCreativeFresh } from "../video/stale";
import { INTERNAL_SCOPE } from "../scope";
import { createDemoVideo } from "../video/demo/queue";
import { approveVideoExpansion, freezeVideoGeneration, unfreezeVideoGeneration } from "../video/freeze";
import { DEMO_SPECS, demoSpecFor } from "../video/demo/specs";
import { DK_CLAIMS, DK_NARRATION, DK_ON_SCREEN } from "../video/demo/drinkknird";
import { SZ_CLAIMS, SZ_CTA, SZ_NARRATION, SZ_ON_SCREEN } from "../video/demo/scribblezap";
import { MB_CLAIMS, MB_CTA, MB_NARRATION, MB_ON_SCREEN } from "../video/demo/mibble";
import { MB_WINDOWS } from "../video/demo/mibble-capture";
import { checkGameLanguage, gameCtaPhase, NOT_YET_DOWNLOADABLE, storeDestination } from "../video/demo/language-qa";
import { activeCaptureFps, SZ_WINDOWS } from "../video/demo/scribblezap-capture";
import { createVideoFromProduct } from "../video/queue";
import { captionWordsFor, groupCaptions, parseSpoken, placeLines, synthMusic, trimSilence, wordTimings, writeWav } from "../video/demo/audio";
import { BANNED, frameDiffs, longestStill } from "../video/demo/qa";
import { buildTimeline, CLAIMS, DEMO_FACTS, layoutLines, NARRATION, ON_SCREEN } from "../video/demo/rentalnoodle";
import { buildStageHtml } from "../video/demo/stage";
import { TRANSITION_MS, type Manifest, type PlateManifest, type Rect } from "../video/demo/types";

const rect = (x: number, y: number, w: number, h: number): Rect => [x, y, w, h];
function plate(id: string, h: number, states: string[], rects: Record<string, Rect>, text = ""): PlateManifest {
  return { id, url: `https://rentalnoodle.com/${id}`, title: id, capturedAt: "2026-11-03T00:00:00.000Z", text, w: 390, h, states: Object.fromEntries(states.map((s) => [s, { file: `${id}-${s}.jpg`, label: s }])), rects };
}
const MANIFEST: Manifest = {
  capturedAt: "2026-11-03T00:00:00.000Z",
  viewport: { w: 390, h: 844, dpr: 3 },
  logo: "logo.png",
  plates: {
    tools: plate("tools", 844, ["s0"], {}),
    prorate: plate("prorate", 844, ["s0", "t2", "t21", "t215", "t2150", "d20"], { rent: rect(24, 365, 164, 42), startDay: rect(201, 446, 164, 42), result: rect(24, 588, 342, 67), title: rect(24, 192, 342, 36) }),
    rentinc: plate("rentinc", 844, ["s0", "p8", "r1850"], { rent: rect(24, 321, 164, 42), pct: rect(24, 402, 164, 42), result: rect(24, 463, 342, 45), title: rect(24, 192, 342, 36) }),
    manage: plate("manage", 1810, ["s0"], { heading: rect(24, 90, 342, 72), property: rect(24, 260, 342, 174), tenant: rect(24, 454, 342, 153), lease: rect(24, 627, 342, 174), rent: rect(24, 821, 342, 174), maintenance: rect(24, 1015, 342, 153), inspections: rect(24, 1188, 342, 174), documents: rect(24, 1382, 342, 174), finances: rect(24, 1576, 342, 174) }),
    pricing: plate("pricing", 644, ["s0"], { card: rect(25, 70, 340, 504), price: rect(50, 122, 290, 42), property: rect(50, 233, 290, 21), esign: rect(50, 316, 290, 42), maintenance: rect(50, 364, 290, 21), tenants: rect(50, 288, 290, 21) }),
    tenant: plate("tenant", 1829, ["s0"], { heading: rect(40, 80, 310, 60), lease: rect(40, 156, 310, 203), rent: rect(40, 379, 310, 181), pay: rect(40, 580, 310, 225), maintenance: rect(40, 825, 310, 181), message: rect(40, 1026, 310, 158), free: rect(40, 1695, 310, 74) }),
  },
};
/** Plausible spoken lengths (ms), close to what the real voice produced. */
const DUR: Record<string, number> = { L1: 2300, L2: 6900, L3: 3900, L4: 5400, L5: 3700, L6: 4200, L7: 2800 };

describe("script timing", () => {
  test("markers point at the next spoken word and are not spoken", () => {
    const p = parseSpoken("Type {rent}the rent and {dates}the dates.");
    assert.deepEqual(p.words, ["Type", "the", "rent", "and", "the", "dates."]);
    assert.equal(p.markers.rent, 1);
    assert.equal(p.markers.dates, 4);
  });
  test("word times fill the audio exactly, in order, with longer words taking longer", () => {
    const t = wordTimings(["I", "extraordinarily", "go."], 3000);
    assert.equal(t[0].from, 0);
    assert.ok(Math.abs(t[2].to - 3000) < 1e-6);
    for (let i = 1; i < t.length; i++) assert.ok(Math.abs(t[i].from - t[i - 1].to) < 1e-6);
    assert.ok(t[1].to - t[1].from > t[0].to - t[0].from);
  });
  test("caption groups hold at most three words, break at punctuation and never overlap", () => {
    const words = wordTimings("Skip the spreadsheet. Type the rent and the dates, and RentalNoodle shows the math.".split(" "), 7000);
    const g = groupCaptions(words, 1000);
    assert.ok(g.every((x) => x.words.length <= 4 && x.words.length >= 1));
    for (let i = 1; i < g.length; i++) assert.ok(g[i].from >= g[i - 1].to, "groups overlap");
    assert.equal(g.flatMap((x) => x.words.map((w) => w.text)).join(" "), words.map((w) => w.text).join(" "));
    assert.equal(g[0].from, 1000);
  });
  test("lines are placed in order with longer pauses between scenes than inside one", () => {
    const lt = layoutLines(DUR);
    for (let i = 1; i < NARRATION.length; i++) {
      const gap = lt[NARRATION[i].id].start - lt[NARRATION[i - 1].id].end;
      assert.equal(gap, NARRATION[i].sceneId === NARRATION[i - 1].sceneId ? 300 : NARRATION[i].sceneId === "end" ? 1350 : 450);
    }
    assert.throws(() => layoutLines({}), /no audio duration/);
  });
});

describe("the RentalNoodle timeline", () => {
  const lt = layoutLines(DUR);
  const built = buildTimeline(MANIFEST, lt);
  const { timeline } = built;

  test("is a 20 to 35 second video whose scenes overlap by exactly one transition", () => {
    assert.ok(timeline.durationMs >= 20_000 && timeline.durationMs <= 35_000, String(timeline.durationMs));
    const screens = timeline.scenes.filter((s) => s.kind === "screen");
    assert.deepEqual(screens.map((s) => s.id), ["prorate", "rentinc", "manage", "pricing", "tenant"]);
    for (let i = 1; i < timeline.scenes.length; i++) assert.equal(timeline.scenes[i - 1].end - timeline.scenes[i].start, TRANSITION_MS);
    assert.equal(timeline.scenes.at(-1)?.kind, "end");
    assert.equal(timeline.scenes.at(-1)?.end, timeline.durationMs);
  });

  test("every camera, cursor and focus key is ordered, in range, and uses states and rectangles that exist", () => {
    for (const s of timeline.scenes.filter((x) => x.kind === "screen")) {
      const p = MANIFEST.plates[s.plate!];
      const len = s.end - s.start;
      for (const keys of [s.camera ?? [], s.cursor ?? []]) for (let i = 1; i < keys.length; i++) assert.ok(keys[i].t > keys[i - 1].t, `${s.id}: keys out of order`);
      for (const k of s.cursor ?? []) assert.ok(k.t >= 0 && k.t <= len + 1, `${s.id}: cursor key outside the scene`);
      for (const c of s.camera ?? []) assert.ok(c.zoom >= 1 && c.zoom <= 1.12, `${s.id}: zoom ${c.zoom} would clip full-width content`);
      for (const st of s.states ?? []) assert.ok(p.states[st.state], `${s.id}: missing state ${st.state}`);
      for (const sp of s.spots ?? []) {
        assert.ok(sp.to > sp.from, `${s.id}: empty focus window`);
        assert.equal(sp.rect.length, 4);
        assert.ok(sp.rect[0] >= 0 && sp.rect[1] >= 0 && sp.rect[1] + sp.rect[3] <= p.h + 1, `${s.id}: focus rectangle outside the page`);
      }
      assert.ok(s.headline && s.headline.to > s.headline.from);
      assert.ok(s.headline.from < 200, "the hook headline must appear in the first moments of the scene");
    }
  });

  test("typing happens in the order the digits are typed, after the cursor tapped the field", () => {
    const pro = timeline.scenes.find((s) => s.id === "prorate")!;
    const typed = pro.states!.filter((x) => /^t\d+$/.test(x.state));
    assert.deepEqual(typed.map((x) => x.state), ["t2", "t21", "t215", "t2150"]);
    const tap = pro.cursor!.find((k) => k.tap)!;
    assert.ok(typed[0].at >= tap.t, "typing starts before the tap");
  });

  test("captions repeat the script word for word and each sits inside its spoken line", () => {
    NARRATION.forEach((l, k) => {
      const t = lt[l.id];
      const next = NARRATION[k + 1] ? lt[NARRATION[k + 1].id].start - 80 : t.end + 400;
      const groups = timeline.captions.filter((g) => g.from >= t.start - 80 && g.from < next);
      assert.equal(groups.flatMap((g) => g.words.map((w) => w.text)).join(" "), captionWordsFor(l).join(" "));
    });
    for (let i = 1; i < timeline.captions.length; i++) assert.ok(timeline.captions[i].from >= timeline.captions[i - 1].to - 40);
  });
});

describe("claims and wording", () => {
  test("every claim used by the script exists, has sources on known pages, and every on-screen text points at a claim", () => {
    const ids = new Set(CLAIMS.map((c) => c.id));
    for (const l of NARRATION) for (const c of l.claims) assert.ok(ids.has(c), `${l.id} cites unknown claim ${c}`);
    for (const o of ON_SCREEN) assert.ok(ids.has(o.claim), `on-screen "${o.text}" cites unknown claim`);
    for (const c of CLAIMS) {
      assert.ok(c.sources.length >= 1 && c.facts.length >= 1, c.id);
      for (const s of c.sources) assert.ok(MANIFEST.plates[s.plate], `${c.id} cites unknown page ${s.plate}`);
    }
  });
  test("every fact the video adds is a quote that a claim relies on", () => {
    for (const f of DEMO_FACTS) assert.ok(CLAIMS.some((c) => c.facts.some((frag) => f.value.toLowerCase().includes(frag.toLowerCase()))), `nothing relies on: ${f.value.slice(0, 50)}`);
    for (const f of DEMO_FACTS) assert.ok(MANIFEST.plates[f.plate], f.plate);
  });
  test("nothing spoken or shown makes a timing, savings, superlative or numeric promise", () => {
    const all = [...NARRATION.flatMap((l) => [l.spoken, l.caption ?? ""]), ...ON_SCREEN.map((o) => o.text)].join(" | ");
    assert.equal(BANNED.exec(all), null, String(BANNED.exec(all)));
    assert.ok(!/@/.test(all));
    for (const bad of ["in seconds", "best landlord", "save hours", "100%", "guaranteed", "only $12"]) assert.ok(BANNED.test(bad), bad);
  });
  test("only features the public pages describe appear: nothing about listings syndication, card payments or screening", () => {
    const all = NARRATION.map((l) => l.spoken).join(" ").toLowerCase();
    for (const w of ["syndicat", "screening", "credit", "autopay", "contractor", "dispatch"]) assert.ok(!all.includes(w), w);
    for (const w of [/cards?/, /ach/]) assert.ok(!w.test(all), String(w));
  });
});

describe("motion analysis, stage and audio helpers", () => {
  test("a still stretch is measured, and movement resets it", () => {
    const w = 4;
    const h = 4;
    const frames = 8;
    const buf = Buffer.alloc(w * h * frames);
    buf.fill(100, 0, w * h * 3); // frames 0..2 identical
    buf.fill(180, w * h * 3, w * h * 4); // jump at frame 3
    buf.fill(180, w * h * 4, w * h * 8); // then still again for four frames
    const d = frameDiffs(buf, w, h, frames);
    assert.equal(d.length, frames - 1);
    assert.ok(d[2] > 50 && d[0] === 0);
    assert.equal(longestStill(d, 10, 0.06), 0.4);
  });
  test("the highlighted caption word cannot grow into the space after it", () => {
    const html = buildStageHtml(buildTimeline(MANIFEST, layoutLines(DUR)).timeline);
    const m = /style\.transform=a\?'scale\(([0-9.]+)\)'/.exec(html);
    assert.ok(m, "active-word scale not found");
    assert.ok(Number(m[1]) <= 1.03, `active word scaled ${m[1]}x would eat the gap before the next word`);
    assert.match(html, /\.cw\{[^}]*white-space:pre[^}]*margin-right/);
    assert.match(html, /\.hw\{[^}]*white-space:pre/);
  });
  test("the stage page is safe to embed and exposes the seek function", () => {
    const html = buildStageHtml({ ...built().timeline, scenes: built().timeline.scenes.map((s) => (s.headline ? { ...s, headline: { ...s.headline, text: "</script><b>x" } } : s)) });
    assert.ok(html.includes("window.__seek"));
    assert.ok(!html.includes("</script><b>x"), "a closing script tag in text must be escaped");
    assert.ok(!/\$\{/.test(html), "unreplaced template placeholder");
    function built() {
      return buildTimeline(MANIFEST, layoutLines(DUR));
    }
  });
  test("music is original, deterministic, stereo and fades", () => {
    const [a, b] = synthMusic(2, 8000);
    const [a2] = synthMusic(2, 8000);
    assert.equal(a.length, 16000);
    assert.equal(b.length, 16000);
    assert.deepEqual(a.slice(0, 500), a2.slice(0, 500));
    assert.ok(Math.max(...a.map(Math.abs)) > 0.05 && Math.max(...a.map(Math.abs)) <= 1);
    assert.ok(Math.abs(a[a.length - 1]) < 0.01, "the track must fade out");
  });
  test("voice lines are trimmed of silence and placed at their start times", () => {
    const rate = 1000;
    const s = new Float32Array(rate * 2);
    for (let i = 500; i < 1500; i++) s[i] = 0.5;
    const t = trimSilence(s, rate);
    assert.ok(t.length < s.length && t.length >= 1000);
    const track = placeLines([{ samples: t, rate, startMs: 1000 }], 4000, rate);
    assert.equal(track.length, 4000);
    assert.equal(track[0], 0);
    assert.ok(track[1100] > 0);
  });
  test("a wav file has a valid header", async () => {
    const f = `${process.env.MARKETING_STORAGE_ROOT}-wavtest.wav`;
    await writeWav(f, [new Float32Array(10)], 8000);
    const b = await (await import("node:fs/promises")).readFile(f);
    assert.equal(b.toString("ascii", 0, 4), "RIFF");
    assert.equal(b.readUInt32LE(24), 8000);
    await (await import("node:fs/promises")).rm(f);
  });
});

const HAVE_DB = Boolean(process.env.STUDIO_TEST_DATABASE_URL);
describe("video freeze and the single demo (database)", { skip: !HAVE_DB }, () => {
  let noodle = "";
  let other = "";
  before(async () => {
    const db = requireStudioDb();
    for (const t of [ms.msAuditEvents, ms.msPublications, ms.msConnections, ms.msMediaJobs, ms.msVideos, ms.msCreatives, ms.msConcepts, ms.msCampaigns, ms.msProductFacts, ms.msAssets, ms.msSettings, ms.msProducts]) await db.delete(t);
    noodle = (await createProduct(INTERNAL_SCOPE, "t", { name: "RentalNoodle", kind: "saas" })).id;
    other = (await createProduct(INTERNAL_SCOPE, "t", { name: "DrinkKnird", kind: "website" })).id;
    await db.insert(ms.msVideos).values({ productId: noodle, title: "old slideshow", storyboard: { version: 1, scenes: [] }, targetSeconds: 30, status: "ready_for_review" });
  });
  after(async () => {
    await closeStudioDb();
  });

  test("while frozen no slideshow video can be created, with a clear reason", async () => {
    await freezeVideoGeneration("t", "waiting for the RentalNoodle pilot to be approved");
    await assert.rejects(createVideoFromProduct(INTERNAL_SCOPE, "t", noodle, 30), /frozen: waiting for the RentalNoodle pilot/);
    await assert.rejects(createVideoFromProduct(INTERNAL_SCOPE, "t", other, 15), /frozen/);
  });

  test("the reference demo replaces the slideshow, queues one render and publishes nothing; other products wait for the expansion gate", async () => {
    const db = requireStudioDb();
    await assert.rejects(createDemoVideo(INTERNAL_SCOPE, "t", other), /frozen|expansion is not approved/);
    const row = await createDemoVideo(INTERNAL_SCOPE, "t", noodle);
    assert.equal(row.status, "queued");
    assert.equal((row.storyboard as { kind: string }).kind, "demo");
    const videos = await db.select().from(ms.msVideos).where(eq(ms.msVideos.productId, noodle));
    assert.equal(videos.find((v) => v.title === "old slideshow")?.status, "superseded");
    const jobs = await db.select().from(ms.msMediaJobs);
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].kind, "render_demo_video");
    assert.equal(jobs[0].weight, "heavy");
    assert.equal((await db.select().from(ms.msPublications)).length, 0);
    assert.equal((await db.select().from(ms.msConnections)).length, 0);
  });

  test("a second demo is refused until the first is decided, and allowed again after a rejection", async () => {
    const db = requireStudioDb();
    await assert.rejects(createDemoVideo(INTERNAL_SCOPE, "t", noodle), /already a demo video/);
    await db.update(ms.msVideos).set({ status: "rejected" }).where(eq(ms.msVideos.productId, noodle));
    const again = await createDemoVideo(INTERNAL_SCOPE, "t", noodle);
    assert.equal(again.status, "queued");
    // The pilot is rendered in its own bounded scope, so its record can be created without putting a (memory-capped) worker job on the queue.
    await db.update(ms.msVideos).set({ status: "rejected" }).where(eq(ms.msVideos.id, again.id));
    const jobsBefore = (await db.select().from(ms.msMediaJobs)).length;
    const recordOnly = await createDemoVideo(INTERNAL_SCOPE, "t", noodle, db, { queue: false });
    assert.equal(recordOnly.status, "queued");
    assert.equal((await db.select().from(ms.msMediaJobs)).length, jobsBefore, "record-only creation must not queue a worker job");
  });

  test("unfreezing is explicit and only then do slideshow videos work again", async () => {
    await unfreezeVideoGeneration("t");
    // no verified facts exist in this scratch product, so the refusal now comes from missing Product Truth, not from the freeze
    await assert.rejects(createVideoFromProduct(INTERNAL_SCOPE, "t", other, 15), (e: Error) => !/frozen/.test(e.message));
  });

  test("after the expansion gate: the slideshow pipeline stays retired, a spec product gets one demo, a product without a spec stays TEASER_ONLY", async () => {
    const db = requireStudioDb();
    await assert.rejects(createDemoVideo(INTERNAL_SCOPE, "t", other, db, { queue: false }), /expansion is not approved/);
    await approveVideoExpansion("t", "rentalnoodle", "owner approved the reference");
    await assert.rejects(createVideoFromProduct(INTERNAL_SCOPE, "t", other, 15), /slideshow video pipeline is retired/);
    await assert.rejects(createVideoFromProduct(INTERNAL_SCOPE, "t", noodle, 30), /slideshow video pipeline is retired/);
    const dk = await createDemoVideo(INTERNAL_SCOPE, "t", other, db, { queue: false });
    assert.equal(dk.status, "queued");
    await assert.rejects(createDemoVideo(INTERNAL_SCOPE, "t", other, db, { queue: false }), /already a demo video/);
    const game = (await createProduct(INTERNAL_SCOPE, "t", { name: "Neon Warzone", kind: "mobile_game" })).id;
    await assert.rejects(createDemoVideo(INTERNAL_SCOPE, "t", game, db, { queue: false }), /TEASER_ONLY/);
    assert.equal((await db.select().from(ms.msPublications)).length, 0);
  });
});

describe("demo specs", () => {
  test("only products with real captured interaction have a spec", () => {
    assert.deepEqual(Object.keys(DEMO_SPECS).sort(), ["drinkknird", "mibblemeadow", "rentalnoodle", "scribblezap", "sendfable"]);
    assert.throws(() => demoSpecFor("neonwarzone"), /TEASER_ONLY/);
  });
  test("DrinkKnird: every line has a claim, every claim has sources, every on-screen text has a claim, no unsupported wording", () => {
    const ids = new Set(DK_CLAIMS.map((c) => c.id));
    for (const l of DK_NARRATION) assert.ok(l.claims.length && l.claims.every((c) => ids.has(c)), l.id);
    for (const c of DK_CLAIMS) assert.ok(c.facts.length && c.sources.length, c.id);
    for (const o of DK_ON_SCREEN) assert.ok(ids.has(o.claim), o.text);
    const text = [...DK_NARRATION.map((l) => l.spoken + " " + (l.caption ?? "")), ...DK_ON_SCREEN.map((o) => o.text)].join(" | ");
    assert.equal(BANNED.test(text), false, "banned wording");
    assert.match(DK_NARRATION.at(-1)!.caption ?? "", /DrinkKnird.com/);
  });
});

describe("ScribbleZap gameplay video", () => {
  test("every line has a claim, every claim a public-page source, every on-screen text a claim, no unsupported wording, honest call to action", () => {
    const ids = new Set(SZ_CLAIMS.map((c) => c.id));
    for (const l of SZ_NARRATION) assert.ok(l.claims.length && l.claims.every((c) => ids.has(c)), l.id);
    for (const c of SZ_CLAIMS) assert.ok(c.facts.length && c.sources.length && c.sources.every((s) => s.plate === "public" || s.plate === "play"), c.id);
    for (const o of SZ_ON_SCREEN) assert.ok(ids.has(o.claim), o.text);
    const text = [...SZ_NARRATION.map((l) => l.spoken + " " + (l.caption ?? "")), ...SZ_ON_SCREEN.map((o) => o.text)].join(" | ");
    assert.equal(BANNED.test(text), false, "banned wording");
    assert.doesNotMatch(text, NOT_YET_DOWNLOADABLE, "the game is not on a store yet: no download wording, and no coming soon");
  });
  test("footage windows are inside the recording, do not overlap, and smoothness is measured on active seconds only", () => {
    const sorted = [...SZ_WINDOWS].sort((a, b) => a.fromSec - b.fromSec);
    for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i].fromSec >= sorted[i - 1].toSec, "windows overlap, which would show the same footage twice");
    const frames = Array.from({ length: 300 }, (_, k) => ({ t: 1000 + k / 50, f: "x" })).concat(Array.from({ length: 10 }, (_, k) => ({ t: 1006 + k, f: "y" })));
    assert.ok(Math.abs(activeCaptureFps(frames, 0, 6) - 50) <= 1, "fifty frames per second while the game moves");
    assert.equal(activeCaptureFps(frames, 6, 16), 0, "idle seconds are not counted as smoothness");
  });
});

describe("game creative language QA (fun first, features second)", () => {
  const lang = (spoken: string[], headlines: string[], cta = "Follow iScream Studio") => checkGameLanguage({ spoken, headlines, cta: { text: cta } });
  test("the current ScribbleZap script passes every language check", () => {
    const checks = lang(SZ_NARRATION.map((l) => l.spoken.replace(/\{[a-z0-9]+\}/gi, "")), SZ_ON_SCREEN.map((o) => o.text), SZ_CTA.text);
    const failed = checks.filter((c) => !c.ok);
    assert.deepEqual(failed, [], failed.map((c) => c.detail).join("; "));
  });
  test("a feature-list product-demo script is rejected on several counts", () => {
    const bad = lang(
      ["ScribbleZap is a mobile puzzle game from iScream Studio, with hazards, drawing tools, and daily challenges.", "Our platform features a seamless interface that allows you to cut lines across the board and fill the page until you reach the target percentage.", "Download it now from Google Play, coming soon."],
      ["A draw-and-fill puzzle game from iScream Studio with many features"],
      "Coming soon",
    );
    const failed = checks_ids(bad);
    for (const id of ["lang_no_download_wording", "lang_not_corporate", "lang_short_and_punchy", "lang_not_a_feature_list", "lang_headlines_short", "lang_cta_invites"]) assert.ok(failed.includes(id), `${id} should fail`);
  });
  test("a low-energy, repetitive script is rejected", () => {
    const bad = lang(["Cut the board.", "Cut the board.", "Cut the board.", "Cut the board and cut the board again."], ["Cut"]);
    const failed = checks_ids(bad);
    assert.ok(failed.includes("lang_energy") && failed.includes("lang_not_repetitive"), failed.join(","));
  });
  test("install wording is allowed once a verified store listing is live, and the phase is detected from verified facts only", () => {
    const live = checkGameLanguage({ spoken: ["One cut. Big payoff.", "Think you can beat it? Get it on Google Play."], headlines: ["Play now"], cta: { text: "Get it on Google Play" }, storeLive: true });
    assert.equal(live.some((c) => c.id === "lang_no_download_wording"), false);
    assert.equal(gameCtaPhase([{ value: "https://play.google.com/store/apps/details?id=x", verified: false }]), "pre_launch");
    assert.equal(gameCtaPhase([{ value: "https://play.google.com/store/apps/details?id=x", verified: true }]), "store_live");
  });
});
function checks_ids(c: Array<{ id: string; ok: boolean }>) {
  return c.filter((x) => !x.ok).map((x) => x.id);
}

describe("Mibble Meadow trailer", () => {
  test("script passes the fun-first language QA, every line has a claim and every claim a source, and nothing implies a download", () => {
    const failed = checkGameLanguage({ spoken: MB_NARRATION.map((l) => l.spoken), headlines: MB_ON_SCREEN.map((o) => o.text), cta: { text: MB_CTA.text } }).filter((c) => !c.ok);
    assert.deepEqual(failed, [], failed.map((c) => c.detail).join("; "));
    const ids = new Set(MB_CLAIMS.map((c) => c.id));
    for (const l of MB_NARRATION) assert.ok(l.claims.length && l.claims.every((c) => ids.has(c)), l.id);
    for (const c of MB_CLAIMS) assert.ok(c.facts.length && c.sources.length && c.sources.every((x) => x.plate === "public" || x.plate === "play"), c.id);
    for (const o of MB_ON_SCREEN) assert.ok(ids.has(o.claim), o.text);
    assert.doesNotMatch([...MB_NARRATION.map((l) => l.spoken + " " + (l.caption ?? "")), ...MB_ON_SCREEN.map((o) => o.text), MB_CTA.text].join(" | "), NOT_YET_DOWNLOADABLE);
  });
  test("footage windows do not overlap or repeat, and are long enough for a two to three second beat", () => {
    const sorted = [...MB_WINDOWS].sort((a, b) => a.from - b.from);
    for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i].from >= sorted[i - 1].to, "windows overlap");
    for (const w of MB_WINDOWS) assert.ok(w.to - w.from >= 80, w.scene);
  });
});

describe("game CTA follows Product Truth automatically", () => {
  const PLAY = { value: "Google Play: https://play.google.com/store/apps/details?id=com.iscream.scribblezap", verified: true };
  test("a verified listing URL makes the game live; unverified, coming-soon or non-store facts never do", () => {
    assert.equal(storeDestination([PLAY])?.store, "google_play");
    assert.equal(storeDestination([{ ...PLAY, verified: false }]), null);
    assert.equal(storeDestination([{ value: "Google Play is Coming Soon https://play.google.com/store/apps/details?id=x", verified: true }]), null);
    assert.equal(storeDestination([{ value: "https://example.com/play.google.com/store/apps/x", verified: true }]), null);
    assert.equal(storeDestination([{ value: "http://play.google.com/store/apps/details?id=x", verified: true }]), null);
    assert.equal(storeDestination([PLAY, { value: "https://apps.apple.com/us/app/x/id1", verified: true }])?.store, "google_play");
    assert.equal(storeDestination([{ value: "https://apps.apple.com/us/app/x/id1", verified: true }])?.store, "app_store");
  });
  for (const slug of ["scribblezap", "mibblemeadow"]) {
    test(`${slug}: pre-launch spec is untouched, the live spec switches CTA, closing line, end card and claims, and passes the language QA`, () => {
      const base = demoSpecFor(slug);
      assert.equal(specForLaunchState(base, []), base);
      assert.equal(specForLaunchState(base, [{ value: "Google Play — Coming Soon", verified: true }]), base);
      const live = specForLaunchState(base, [PLAY]);
      assert.equal(live.cta.text, "Get it on Google Play");
      assert.ok(live.cta.url.startsWith("https://play.google.com/store/apps/"));
      assert.equal(live.narration.length, base.narration.length);
      assert.match(live.narration.at(-1)!.caption!, /Google Play/);
      assert.deepEqual(live.narration.at(-1)!.claims, ["c-store"]);
      assert.ok(live.onScreen.filter((o) => o.kind === "cta").every((o) => o.claim === "c-store"));
      assert.ok(!live.facts.some((f) => /coming soon/i.test(f.value)) && !live.claims.some((c) => c.facts.some((f) => /coming soon/i.test(f))));
      const failed = checkGameLanguage({ spoken: live.narration.map((l) => l.spoken), headlines: live.onScreen.map((o) => o.text), cta: { text: live.cta.text }, storeLive: true }).filter((c) => !c.ok);
      assert.deepEqual(failed, [], failed.map((c) => c.detail).join("; "));
      // the pre-launch wording check would (rightly) reject the same script
      const pre = checkGameLanguage({ spoken: live.narration.map((l) => l.spoken), headlines: [], cta: { text: live.cta.text } });
      assert.ok(pre.some((c) => c.id === "lang_no_download_wording" && !c.ok));
      // a non-game spec never changes
      assert.equal(specForLaunchState(demoSpecFor("rentalnoodle"), [PLAY]), demoSpecFor("rentalnoodle"));
    });
  }
});

describe("launch transition: stale creative (database)", { skip: !HAVE_DB }, () => {
  let sz = "";
  const ids: Record<string, string> = {};
  before(async () => {
    const db = requireStudioDb();
    for (const t of [ms.msAuditEvents, ms.msPublications, ms.msConnections, ms.msMediaJobs, ms.msVideos, ms.msCreatives, ms.msConcepts, ms.msCampaigns, ms.msProductFacts, ms.msAssets, ms.msSettings, ms.msProducts]) await db.delete(t);
    sz = (await createProduct(INTERNAL_SCOPE, "t", { name: "ScribbleZap", kind: "mobile_game" })).id;
    const sb = (extra: object) => ({ version: 2, kind: "demo", ...extra });
    const mk = async (key: string, status: string, storyboard: object) => {
      ids[key] = (await db.insert(ms.msVideos).values({ productId: sz, title: key, storyboard, targetSeconds: 30, status }).returning())[0].id;
    };
    await mk("old", "approved", sb({ ctaPhase: "pre_launch" }));
    await mk("public", "approved", sb({}));
    await mk("rejected", "rejected", sb({}));
    const pub = (key: string, videoId: string, status: string) => db.insert(ms.msPublications).values({ productId: sz, videoId, assetId: crypto.randomUUID(), platform: "facebook", status, caption: "c", dedupeKey: `${key}|${Math.random()}` });
    await pub("a", ids.old, "approved");
    await pub("b", ids.old, "approval_required");
    await pub("c", ids.public, "published");
    await pub("d", ids.public, "approved");
  });
  after(async () => {
    await closeStudioDb();
  });

  test("nothing happens while the game has no verified store listing", async () => {
    const r = (await reconcileGameLaunchState(requireStudioDb())).find((x) => x.slug === "scribblezap")!;
    assert.equal(r.phase, "pre_launch");
    assert.deepEqual(r.stale, []);
  });

  test("once live: unpublished pre-launch video flagged stale, unsent posts cancelled, replacement queued; public history untouched; idempotent", async () => {
    const db = requireStudioDb();
    await approveVideoExpansion("t", "rentalnoodle", "owner approved the reference");
    const f = await addFact(INTERNAL_SCOPE, "t", sz, { factKey: "store", factValue: "Google Play: https://play.google.com/store/apps/details?id=com.iscream.scribblezap", sourceKind: "asset_metadata", sourceUrl: null }, db);
    await verifyFact(INTERNAL_SCOPE, "t", sz, f.id, db);
    const r = (await reconcileGameLaunchState(db)).find((x) => x.slug === "scribblezap")!;
    assert.equal(r.phase, "store_live");
    assert.deepEqual(r.stale, [ids.old]);
    assert.equal(r.cancelled, 2);
    assert.ok(r.replacement);
    assert.ok(r.skipped.some((s) => s.includes(ids.public)));
    const [old] = await db.select().from(ms.msVideos).where(eq(ms.msVideos.id, ids.old));
    assert.equal(old.status, "superseded");
    assert.ok((old.storyboard as { stale?: object }).stale);
    const [pubVid] = await db.select().from(ms.msVideos).where(eq(ms.msVideos.id, ids.public));
    assert.equal(pubVid.status, "approved");
    assert.equal((pubVid.storyboard as { stale?: object }).stale, undefined);
    const pubs = await db.select().from(ms.msPublications);
    assert.deepEqual(pubs.filter((p) => p.videoId === ids.public).map((p) => p.status).sort(), ["approved", "published"]);
    assert.ok(pubs.filter((p) => p.videoId === ids.old).every((p) => p.status === "cancelled"));
    const [fresh] = await db.select().from(ms.msVideos).where(eq(ms.msVideos.id, r.replacement!));
    assert.equal(fresh.status, "queued");
    const again = (await reconcileGameLaunchState(db)).find((x) => x.slug === "scribblezap")!;
    assert.deepEqual(again.stale, []);
    assert.equal(again.replacement, null);
  });

  test("stale creative cannot be prepared or approved", async () => {
    const db = requireStudioDb();
    await assert.rejects(assertCreativeFresh(db, ids.old), /stale/);
    await assertCreativeFresh(db, ids.public);
  });
});
