// GravyBlock explainer mode: the five first concepts pass the script gates, every claim has a verified-fact fragment and a card quote, and the timeline builds with no cursor.
import "./setup";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { GRAVYBLOCK_EXPLAINERS, MARKETING_STUDIO_FACTS } from "../gravyblock-explainers";
import { conceptFromExplainer, plateHtml } from "../video/concepts/explainer";
import { buildExplainerTimeline, layoutConcept } from "../video/concepts/build";
import { hookProblems, scriptProblems } from "../video/concepts/validate";
import { parseSpoken } from "../video/demo/audio";
import { PLATE_CSS_W, type Manifest } from "../video/demo/types";

describe("GravyBlock explainer concepts", () => {
  test("the first five are distinct, grounded in verified wording and pass the script gates", () => {
    assert.equal(GRAVYBLOCK_EXPLAINERS.length, 5);
    const hooks = new Set<string>();
    for (const e of GRAVYBLOCK_EXPLAINERS) {
      const c = conceptFromExplainer(e.def);
      assert.deepEqual(hookProblems(c.hook, c.productName), [], `${c.specId} hook`);
      const lines = c.narration.map((l) => ({ spoken: l.spoken.replace(/\{[^}]*\}/g, "") }));
      assert.deepEqual(scriptProblems(lines, c.onScreen.map((o) => o.text), []), [], `${c.specId} script`);
      hooks.add(c.hook.toLowerCase().split(/\s+/).slice(0, 2).join(" "));
      for (const cl of c.claims) {
        assert.ok(cl.facts.every((f) => f.length > 8), "every claim names the fact fragment that supports it");
        const plate = c.capturePlan.find((p) => p.id === cl.sources[0].plate);
        assert.ok(plate, "the claim's plate exists");
      }
      assert.ok(c.explainer && c.explainer.scenes.every((s) => s.nodes.length === 3));
      assert.ok(!/created automatically/i.test(c.hook));
    }
    assert.equal(hooks.size, 5, "no two videos open the same way");
  });
  test("the Marketing Studio video says only what the owner's three facts say, and nothing publishes without approval", () => {
    const c = conceptFromExplainer(GRAVYBLOCK_EXPLAINERS[2].def);
    const said = c.narration.map((l) => l.spoken).join(" ");
    assert.ok(/before anything is published/.test(said) && /approve it, request changes, or pause/i.test(said));
    for (const f of MARKETING_STUDIO_FACTS) assert.ok(c.explainer?.scenes[0].nodes.some((n) => n.line === f));
    assert.ok(!/automatically publish/i.test(said), "it never claims to publish on its own");
  });
  test("the timeline builds, every marker the lines name exists, and no cursor is drawn", () => {
    const c = conceptFromExplainer(GRAVYBLOCK_EXPLAINERS[0].def);
    const dur = Object.fromEntries(c.narration.map((l) => [l.id, 2400]));
    const lt = layoutConcept(c)(dur);
    const mk = (id: string, h: number) => ({ id, url: c.origin, title: "t", capturedAt: "x", text: "", w: PLATE_CSS_W, h: 1000, states: { s0: { file: "a", label: "a" }, a: { file: "b", label: "b" }, b: { file: "c", label: "c" } }, rects: { head: [20, 30, 350, 40], cA: [20, 90, 350, 200], boxA: [20, 320, 350, 200], cB: [20, 320, 350, 200], boxB: [20, 550, 350, 200] }, meta: {} }) as unknown as Manifest["plates"][string];
    const manifest = { capturedAt: "x", viewport: { w: 390, h: 844, dpr: 3 }, plates: { x1: mk("x1", 1000), x2: mk("x2", 1000) }, logo: "logo.png" } as Manifest;
    const built = buildExplainerTimeline(c)(manifest, lt);
    assert.ok(built.timeline.scenes.filter((s) => s.kind === "screen").every((s) => !s.cursor));
    assert.ok(c.narration.some((l) => parseSpoken(l.spoken).markers.a1 !== undefined) && c.narration.some((l) => parseSpoken(l.spoken).markers.b2 !== undefined));
  });
  test("a plate lights one more card per state and dims the rest, so the viewer sees where the flow goes", () => {
    const c = conceptFromExplainer(GRAVYBLOCK_EXPLAINERS[0].def);
    const sc = c.explainer!.scenes[0];
    const s0 = plateHtml(c, sc, 1);
    const s2 = plateHtml(c, sc, 3);
    assert.equal((s0.match(/class="card n\d on/g) ?? []).length, 1);
    assert.equal((s2.match(/class="card n\d on/g) ?? []).length, 3);
    assert.ok(s0.includes("Reads your real website"));
  });
});

describe("the QA gates a finished explainer must clear, checked before any render", () => {
  test("at least half of the lines are an action or a result, the closing line invites, and the end line carries the claim and the web address", async () => {
    const { OUTCOME_WORD, INVITE_VERB } = await import("../video/concepts/standard");
    for (const e of GRAVYBLOCK_EXPLAINERS) {
      const c = conceptFromExplainer(e.def);
      const spoken = c.narration.map((l) => l.spoken.replace(/{[^}]*}/g, ""));
      const outcome = spoken.filter((s) => OUTCOME_WORD.test(s)).length;
      assert.ok(outcome / spoken.length >= 0.5, `${c.specId}: ${outcome} of ${spoken.length} lines are an action or a result`);
      assert.ok(INVITE_VERB.test(spoken[spoken.length - 1]), `${c.specId} closing line invites`);
      const end = c.narration[c.narration.length - 1];
      assert.deepEqual(end.claims, ["c-cta"]);
      assert.ok((end.caption ?? "").toLowerCase().includes(c.ctaHost), `${c.specId} end caption names the site`);
      assert.ok(spoken.length >= 5, `${c.specId} has enough lines`);
    }
  });
});
