import { test } from "node:test";
import assert from "node:assert/strict";
import { applyApproval } from "../public";
import type { Claim } from "../model";

const c = (key: string, template: string, values: Record<string, string> = {}): Claim => ({ key, stage: "MEASURED", template, values });

test("approved claims refresh their numbers automatically", () => {
  const approved = [c("clicks", "Clicks now {n}.", { n: "10" })];
  const r = applyApproval(approved, [c("clicks", "Clicks now {n}.", { n: "25" })]);
  assert.equal(r.shown[0]!.text, "Clicks now 25.");
  assert.equal(r.pending, 0);
});

test("a claim whose wording changed is hidden, not shown stale or unreviewed", () => {
  const approved = [c("links", "No live link from another site has been verified yet.")];
  const r = applyApproval(approved, [c("links", "{links} live links from other sites have been independently found and verified.", { links: "1" })]);
  assert.equal(r.shown.length, 0);
  assert.equal(r.pending, 1);
});

test("a claim that was never approved never shows", () => {
  const r = applyApproval([c("start", "Started {d}.", { d: "x" })], [c("start", "Started {d}.", { d: "y" }), c("indexing", "New claim {n}", { n: "5" })]);
  assert.deepEqual(r.shown.map((s) => s.text), ["Started y."]);
  assert.equal(r.pending, 1);
});

test("with nothing approved nothing shows", () => {
  const r = applyApproval([], [c("clicks", "Clicks {n}", { n: "1" })]);
  assert.equal(r.shown.length, 0);
});
