import "./setup";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { applyLexicon, emptyOverrides, interpretChange, mergeOverrides, type IntentContext } from "../publishing/review-intent";

const ctx = (over: Partial<IntentContext> = {}): IntentContext => ({
  narration: [
    { spoken: "Staring at a blank email?", caption: undefined },
    { spoken: "Pick a goal, like {promo}promoting a sale, and SendFable suggests the template.", caption: "Pick a goal, like promoting a sale, and SendFable suggests the template." },
    { spoken: "Email and text, without the headache. Start free at sendfable dot com." },
  ],
  ctaText: "Get started",
  ctaUrl: "https://sendfable.com/signup?utm_source=youtube",
  productHost: "sendfable.com",
  facts: [
    { key: "cta", value: "Start free" },
    { key: "cta_url", value: "https://sendfable.com/signup" },
    { key: "cta_url", value: "https://sendfable.com/pricing" },
    { key: "tagline", value: "Email and text marketing without the marketing-software headache" },
  ],
  current: emptyOverrides(),
  ...over,
});

describe("owner change requests: interpreted automatically only when safe and specific", () => {
  test("a pronunciation request changes how the word is SAID, never how it is written", () => {
    const r = interpretChange("Pronunciation of SendFable is wrong", ctx());
    assert.ok(r.ok, JSON.stringify(r));
    if (!r.ok) return;
    assert.deepEqual(r.intents, [{ type: "lexicon", key: "sendfable", written: "SendFable", spoken: "Send Fable" }]);
    const ov = mergeOverrides(emptyOverrides(), r.intents, "Pronunciation of SendFable is wrong");
    assert.equal(applyLexicon("and SendFable suggests it, at sendfable dot com", ov.lexicon), "and Send Fable suggests it, at Send Fable dot com");
    assert.equal(applyLexicon("Send Fable already", ov.lexicon), "Send Fable already", "text that is already spaced is left alone");
    // applying the same request twice changes nothing more
    assert.deepEqual(mergeOverrides(ov, r.intents, "again").lexicon, ov.lexicon);
  });

  test("the owner's real note ('Pronunciation of Send Fable is incorrect') is understood, and a script that already says it that way needs no change", () => {
    const fixed = ctx({ narration: [{ spoken: "and Send Fable suggests it", caption: "and SendFable suggests it" }, { spoken: "at send fable dot com" }] });
    const r = interpretChange("Pronunciation of Send Fable is incorrect", fixed);
    assert.ok(!r.ok && r.kind === "no_change", JSON.stringify(r));
    const before = interpretChange("Pronunciation of Send Fable is incorrect", ctx());
    assert.ok(before.ok && before.intents[0].type === "lexicon");
  });

  test("a pronunciation request that is ambiguous or would change the words is blocked, not guessed", () => {
    const unknown = interpretChange("Pronunciation of Zorblatt is wrong", ctx());
    assert.ok(!unknown.ok && unknown.kind === "ambiguous");
    const different = interpretChange("SendFable pronunciation is wrong, it should say Sandfeeble", ctx());
    assert.ok(!different.ok && different.kind === "unsafe", "a different word is a content change, not a pronunciation");
    const noForm = interpretChange("The pronunciation of headache is wrong", ctx());
    assert.ok(!noForm.ok && noForm.kind === "ambiguous", "no spoken form was given and none can be derived");
  });

  test("the call to action can only become a phrase that Product Truth verifies", () => {
    const ok = interpretChange("CTA should say Start free", ctx());
    assert.ok(ok.ok && ok.intents[0].type === "cta_text" && ok.intents[0].text === "Start free");
    const unverified = interpretChange("The CTA should say Buy it now before it's gone", ctx());
    assert.ok(!unverified.ok && unverified.kind === "unsafe");
    const same = interpretChange("CTA should say Get started", ctx());
    assert.ok(!same.ok && same.kind === "no_change");
  });

  test("the destination can only become a verified Product Truth address on the product's own site", () => {
    assert.ok(interpretChange("Use the correct product page", ctx()).ok === false, "no address given");
    const good = interpretChange("Link to https://sendfable.com/pricing instead.", ctx());
    assert.ok(good.ok && good.intents[0].type === "cta_url");
    const elsewhere = interpretChange("Use https://example.com/offer as the page.", ctx());
    assert.ok(!elsewhere.ok && elsewhere.kind === "unsafe");
    const unverified = interpretChange("Use the page https://sendfable.com/secret-offer.", ctx());
    assert.ok(!unverified.ok && unverified.kind === "unsafe");
  });

  test("pace requests change the whole voice by a bounded amount; a single scene is blocked", () => {
    const slow = interpretChange("The voice is slightly too fast.", ctx());
    assert.ok(slow.ok && slow.intents[0].type === "pace" && Math.abs((slow.intents[0] as { factor: number }).factor - 0.96) < 1e-9);
    const fast = interpretChange("It is too slow, speed it up.", ctx());
    assert.ok(fast.ok && (fast.intents[0] as { factor: number }).factor > 1);
    const scene = interpretChange("This scene is too fast.", ctx());
    assert.ok(!scene.ok && scene.kind === "unsupported");
    let ov = emptyOverrides();
    for (let i = 0; i < 12; i++) ov = mergeOverrides(ov, [{ type: "pace", factor: 0.9, label: "x" }], "again");
    assert.ok(ov.paceFactor >= 0.85, "repeated requests cannot push the voice outside a natural range");
  });

  test("removing or rewriting sentences, new claims and anything vague are blocked, and a note is never partly applied", () => {
    for (const note of ["Remove that sentence.", "Delete the line about pricing", "Rewrite the second sentence", "Make it more exciting", "Add that it is the best email tool", "Show a different screen"]) {
      const r = interpretChange(note, ctx());
      assert.ok(!r.ok && (r.kind === "unsupported" || r.kind === "ambiguous"), `${note}: ${JSON.stringify(r)}`);
    }
    const mixed = interpretChange("The voice is slightly too fast. Remove the last sentence.", ctx());
    assert.ok(!mixed.ok, "one request that cannot be applied blocks the whole note, so nothing is half done");
    assert.ok(!interpretChange("   ", ctx()).ok);
  });

  test("the worker runs the replacement from the existing queue, with the governor's heavy-job limit and a worker memory limit that fits a render", () => {
    const worker = readFileSync(path.join(process.cwd(), "src", "worker", "marketing.ts"), "utf8");
    assert.match(worker, /case "review_replacement"/);
    assert.match(worker, /review_replacement: 45 \* 60_000/);
    const eco = readFileSync(path.join(process.cwd(), "ecosystem.config.js"), "utf8");
    const mem = /MemoryMax=(\d+)([MG])/.exec(eco);
    assert.ok(mem, "the worker has a memory ceiling");
    const mb = Number(mem![1]) * (mem![2] === "G" ? 1024 : 1);
    assert.ok(mb >= 1800, `the render needs about 1.5 GB; the worker's ceiling is ${mb} MB`);
  });
});
