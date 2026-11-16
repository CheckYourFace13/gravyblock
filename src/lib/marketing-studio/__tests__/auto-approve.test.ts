// Owner-only auto-approve: default off, never for a customer, and only when every hard gate passes.
import "./setup";
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { closeStudioDb, requireStudioDb } from "../db";
import { autoApproveProblems, getAutoApprove, maybeAutoApprove, setAutoApprove, type GateInput } from "../publishing/auto-approve";

const demoChecks = ["real_product_screens", "visual_alignment", "no_black_screen", "no_blank_screen", "narration_audible", "claims_use_verified_facts", "quotes_on_live_pages", "distinct_from_history", "logo_source", "logo_pixels"].map((id) => ({ id, ok: true, severity: "fail" }));
const good = (over: Partial<GateInput> = {}): GateInput => ({ owned: true, qa: { passed: true, checks: demoChecks }, kind: "demo", slot: "faq-control", slotPage: { ok: true, ms: 400 }, reviewStatus: "unlisted_live", paused: false, ...over });

describe("auto-approve gates", () => {
  test("a video that passed everything is eligible", () => assert.deepEqual(autoApproveProblems(good()), []));
  test("a customer product is never eligible, whatever else is true", () => assert.match(autoApproveProblems(good({ owned: false }))[0], /customer/));
  test("every hard gate is required: a missing or failed one holds the video back", () => {
    for (const id of ["narration_audible", "no_black_screen", "visual_alignment", "distinct_from_history", "claims_use_verified_facts", "logo_pixels", "real_product_screens"]) {
      const checks = demoChecks.filter((c) => c.id !== id);
      if (id !== "logo_pixels") assert.ok(autoApproveProblems(good({ qa: { passed: true, checks } })).length > 0, `${id} missing`);
      assert.ok(autoApproveProblems(good({ qa: { passed: true, checks: demoChecks.map((c) => (c.id === id ? { ...c, ok: false } : c)) } })).length > 0, `${id} failed`);
    }
    assert.ok(autoApproveProblems(good({ qa: { passed: false, checks: demoChecks } })).length > 0);
  });
  test("placement and publication eligibility are gates too", () => {
    assert.ok(autoApproveProblems(good({ slotPage: { ok: false, ms: 100 } })).some((p) => /did not load/.test(p)));
    assert.ok(autoApproveProblems(good({ slotPage: { ok: true, ms: 9000 } })).some((p) => /slow/.test(p)));
    assert.ok(autoApproveProblems(good({ reviewStatus: "approved_public" })).length > 0);
    assert.ok(autoApproveProblems(good({ reviewStatus: "changes_requested" })).length > 0);
    assert.ok(autoApproveProblems(good({ paused: true })).length > 0);
  });
});

describe("auto-approve setting", () => {
  after(async () => closeStudioDb());
  test("default OFF; ON for an owned product; a customer product can neither store nor use it", async () => {
    const db = requireStudioDb();
    assert.equal(await getAutoApprove(db, { id: "00000000-0000-0000-0000-0000000000aa", ownerKind: "internal" }), false);
    await setAutoApprove(db, "t", { id: "00000000-0000-0000-0000-0000000000aa", ownerKind: "internal" }, true);
    assert.equal(await getAutoApprove(db, { id: "00000000-0000-0000-0000-0000000000aa", ownerKind: "internal" }), true);
    await assert.rejects(() => setAutoApprove(db, "t", { id: "00000000-0000-0000-0000-0000000000bb", ownerKind: "customer" }, true), /owner's own products only/);
    assert.equal(await getAutoApprove(db, { id: "00000000-0000-0000-0000-0000000000aa", ownerKind: "customer" }), false, "the same id as a customer product is never on");
    assert.equal((await maybeAutoApprove(db, "00000000-0000-0000-0000-0000000000cc")).approved, false);
  });
});
