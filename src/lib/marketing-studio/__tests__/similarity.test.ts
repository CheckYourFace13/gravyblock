// The creative history and similarity gate: a new video must be materially distinct from the product's earlier ones.
import "./setup";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { GRAVYBLOCK_EXPLAINERS } from "../gravyblock-explainers";
import { conceptFromExplainer } from "../video/concepts/explainer";
import { fingerprintOfConcept, similarityProblems, type CreativeFingerprint } from "../video/concepts/similarity";

const fps = GRAVYBLOCK_EXPLAINERS.map((e) => fingerprintOfConcept(conceptFromExplainer(e.def)));
const base: CreativeFingerprint = { specId: "a", hook: "Who has time to post every day?", problem: "posting takes daily effort", benefit: "posts go out on their own", lines: ["Who has time to post every day?", "Pick a topic once and the posts schedule themselves.", "Every post waits for your yes.", "Try the free plan today."], closing: "Try the free plan today.", cta: "Start free", visual: ["open:/", "click:topics", "type:topic", "scroll:schedule"], format: "live product tour" };

describe("similarity gate", () => {
  test("an identical or lightly reworded video is refused, a different one passes", () => {
    assert.deepEqual(similarityProblems({ ...base, specId: "b", lines: ["Who has time to post daily?", ...base.lines.slice(1)] }, [base]).length > 0, true, "same hook and wording");
    const reworded = { ...base, specId: "b", hook: "Who has the hours to post each day?", lines: ["Who has the hours to post each day?", "Choose a topic one time and posts schedule on their own.", "Each post waits for your approval.", "Try the free plan today."] };
    assert.ok(similarityProblems(reworded, [base]).length > 0, "synonym swaps are not a new concept");
    const fresh: CreativeFingerprint = { specId: "c", hook: "Your competitor answered that review in an hour.", problem: "reviews go unanswered", benefit: "replies are drafted for you", lines: ["Your competitor answered that review in an hour.", "Open the inbox and every review already has a reply waiting.", "Edit a word, or send it as it is.", "See your reviews at example dot com."], closing: "See your reviews at example dot com.", cta: "See my reviews", visual: ["open:/reviews", "click:first review", "scroll:reply draft", "click:send"], format: "live product tour" };
    assert.deepEqual(similarityProblems(fresh, [base]), []);
  });
  test("the same sequence of real interactions with new copy is refused", () => {
    const sameVisual = { ...base, specId: "d", hook: "Your followers are waiting for something new.", lines: ["Your followers are waiting for something new.", "Open the calendar and the week is already filled in.", "Move one card to change the day.", "Try the free plan today, no card."], closing: "Try the free plan today, no card.", cta: "Start free" };
    sameVisual.closing = "Open the calendar yourself.";
    assert.ok(similarityProblems(sameVisual, [base]).some((p) => /sequence shown on the real product/.test(p)));
  });
  test("a video is never compared with itself (a replacement of the same script)", () => assert.deepEqual(similarityProblems(base, [base]), []));
  test("GravyBlock's own five concepts are reported against each other", () => {
    const report = fps.map((f, i) => ({ id: f.specId, problems: similarityProblems(f, fps.slice(0, i)) }));
    for (const r of report) assert.deepEqual(r.problems, [], `${r.id}: ${r.problems.join(" | ")}`);
  });
});
