// Live product tours for GravyBlock's own videos: real interactions (no cap of two), and hard visual QA against black, blank and failed pages.
import "./setup";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { GRAVYBLOCK_EXPLAINERS } from "../gravyblock-explainers";
import { conceptFromExplainer } from "../video/concepts/explainer";
import { buildTourTimeline, layoutConcept } from "../video/concepts/build";
import { judgePicture } from "../video/concepts/tour";
import { judgeScreen, type ScreenFrame } from "../video/screen-qa";
import { PLATE_CSS_W, type Manifest, type PlateManifest, type Rect } from "../video/demo/types";

const light: ScreenFrame = { luma: 200, stdev: 40, darkShare: 0.05 };
const black: ScreenFrame = { luma: 8, stdev: 3, darkShare: 1 };
const emptyDark: ScreenFrame = { luma: 30, stdev: 14, darkShare: 0.93 };
const flat: ScreenFrame = { luma: 240, stdev: 2, darkShare: 0 };
const seq = (f: ScreenFrame, n: number) => Array.from({ length: n }, () => f);

describe("hard visual QA on the finished video", () => {
  test("a real, light page all the way through passes", () => assert.equal(judgeScreen(seq(light, 100), 5).ok, true));
  test("a black stretch beyond a short transition fails, a short one does not", () => {
    assert.equal(judgeScreen([...seq(light, 20), ...seq(black, 2), ...seq(light, 20)], 5).ok, true, "0.4s of black is a transition");
    const v = judgeScreen([...seq(light, 20), ...seq(black, 3), ...seq(light, 20)], 5);
    assert.equal(v.ok, false, "0.6s of black is not");
    assert.match(v.reasons.join(" "), /black/);
  });
  test("an empty dark window (the old animated cards) fails even though a few words are in it", () => {
    const v = judgeScreen([...seq(light, 5), ...seq(emptyDark, 12), ...seq(light, 5)], 5);
    assert.equal(v.ok, false);
    assert.match(v.reasons.join(" "), /empty dark space/);
  });
  test("a blank flat colour fails", () => assert.equal(judgeScreen(seq(flat, 12), 5).ok, false));
});

describe("a captured picture is judged before it is used", () => {
  const good = { meanLuma: 190, stdev: 50, textChars: 400, status: 200, title: "GravyBlock", heading: "Local SEO that does the work for you." };
  test("a normal page passes", () => assert.equal(judgePicture(good), null));
  test("failed load, error page, black, blank and an empty page are all refused", () => {
    assert.match(judgePicture({ ...good, status: 500 }) ?? "", /failed to load/);
    assert.match(judgePicture({ ...good, heading: "404" }) ?? "", /error page/);
    assert.match(judgePicture({ ...good, meanLuma: 12 }) ?? "", /black/);
    assert.match(judgePicture({ ...good, stdev: 3 }) ?? "", /blank/);
    assert.match(judgePicture({ ...good, textChars: 10 }) ?? "", /almost no text/);
  });
});

describe("GravyBlock live tours", () => {
  const tours = GRAVYBLOCK_EXPLAINERS.map((e) => ({ e, c: conceptFromExplainer(e.def) })).filter((x) => x.c.tour);
  test("all five concepts are live tours of the real site (Marketing Studio narrates only what the real pages show)", () => {
    assert.equal(tours.length, 5);
  });
  test("every scene opens a real page, has more than two real interactions in total, and every step names what must be on screen", () => {
    for (const { c } of tours) {
      let acted = 0;
      for (const s of c.tour!.scenes) {
        assert.equal(s.steps[0].do, "open");
        assert.ok(s.steps.length >= 4, `${c.specId}: a scene has several real steps, not two`);
        for (const st of s.steps) {
          assert.ok(st.shows.length >= 8, "each step states the text that proves the real UI is showing");
          if (st.do !== "open") assert.ok([0, 1, 2].includes(st.node));
          if (st.do === "click" || st.do === "type" || st.do === "submit") acted++;
        }
      }
      assert.ok(acted >= 1, `${c.specId}: a control is clicked or typed into`);
    }
    assert.ok(tours.some(({ c }) => c.tour!.scenes.some((s) => s.steps.filter((x) => x.do !== "open").length > 2)), "more than two interactions in one scene is allowed and used");
  });
  test("the timeline places every interaction while its line is spoken, the first within 3 seconds, with the real pages as the screen", () => {
    const { c } = tours[0];
    const plates: Record<string, PlateManifest> = {};
    c.tour!.scenes.forEach((sc, i) => {
      const states: PlateManifest["states"] = {};
      const rects: Record<string, Rect> = {};
      sc.steps.forEach((_, k) => {
        const key = k === 0 ? "s0" : `t${k}`;
        states[key] = { file: `${key}.jpg`, label: key, visible: "real page" };
        rects[`f${k}`] = [20, 300 + k * 10, 300, 40];
        rects[`r${k}`] = [20, 300 + k * 10, 300, 80];
      });
      plates[`x${i + 1}`] = { id: `x${i + 1}`, url: "https://gravyblock.com/", title: "GravyBlock", capturedAt: "now", text: "real page", w: PLATE_CSS_W, h: 1000, states, rects };
    });
    const manifest: Manifest = { capturedAt: "now", viewport: { w: 390, h: 844, dpr: 3 }, plates, logo: "logo.png" };
    const dur = Object.fromEntries(c.narration.map((l) => [l.id, 2600]));
    const lt = layoutConcept(c)(dur);
    const built = buildTourTimeline(c)(manifest, lt);
    const screens = built.timeline.scenes.filter((s) => s.kind === "screen");
    assert.equal(screens.length, c.tour!.scenes.length);
    for (const [i, s] of screens.entries()) {
      assert.equal(s.states!.length, c.tour!.scenes[i].steps.length, "one state per step, however many the narration has time for");
      for (const st of s.states!.slice(1)) assert.ok(st.at >= 0 && s.start + st.at < s.end, "every interaction happens while its scene is on screen");
    }
    const firstChange = screens[0].start + screens[0].states![1].at;
    assert.ok(firstChange <= 3000, `the first real action is at ${firstChange}ms`);
    assert.equal(built.timeline.scenes.at(-1)!.kind, "end", "the call to action closes the video");
  });
});
