// Pure tests run anywhere. Database tests need a scratch database:
//   STUDIO_TEST_DATABASE_URL=postgresql://.../gb_studio_test MARKETING_DB_POOL_MAX=1 npx tsx --test --test-concurrency=1 src/lib/marketing-studio/__tests__/demo-video.test.ts
import "./setup";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { closeStudioDb, ms, requireStudioDb } from "../db";
import { createProduct } from "../repository";
import { INTERNAL_SCOPE } from "../scope";
import { createDemoVideo } from "../video/demo/queue";
import { freezeVideoGeneration, unfreezeVideoGeneration } from "../video/freeze";
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

  test("the demo is limited to RentalNoodle, replaces the slideshow, queues one render and publishes nothing", async () => {
    const db = requireStudioDb();
    await assert.rejects(createDemoVideo(INTERNAL_SCOPE, "t", other), /limited to the RentalNoodle pilot/);
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
  });

  test("unfreezing is explicit and only then do slideshow videos work again", async () => {
    await unfreezeVideoGeneration("t");
    // no verified facts exist in this scratch product, so the refusal now comes from missing Product Truth, not from the freeze
    await assert.rejects(createVideoFromProduct(INTERNAL_SCOPE, "t", other, 15), (e: Error) => !/frozen/.test(e.message));
  });
});
