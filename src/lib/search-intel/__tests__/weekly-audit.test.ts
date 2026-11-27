import { test } from "node:test";
import assert from "node:assert/strict";
import { auditBucket, auditPhase, chicagoInstant, chicagoParts, nextAuditSend } from "../weekly-audit";

test("Friday 06:00 Chicago is 12:00 UTC in winter and 11:00 UTC in summer (daylight saving handled)", () => {
  assert.equal(chicagoInstant("2026-12-04", 6, 0).toISOString(), "2026-12-04T12:00:00.000Z");
  assert.equal(chicagoInstant("2027-06-04", 6, 0).toISOString(), "2027-06-04T11:00:00.000Z");
  assert.equal(chicagoInstant("2027-03-12", 6, 0).toISOString(), "2027-03-12T12:00:00.000Z"); // before the change on March 14
  assert.equal(chicagoInstant("2027-03-19", 6, 0).toISOString(), "2027-03-19T11:00:00.000Z"); // first Friday after it
  assert.equal(chicagoInstant("2027-11-05", 6, 0).toISOString(), "2027-11-05T11:00:00.000Z"); // still daylight time
  assert.equal(chicagoInstant("2027-11-12", 6, 0).toISOString(), "2027-11-12T12:00:00.000Z"); // after the November change
});

test("phases: refresh 05:00 to 05:59, send 06:00 to 11:59, otherwise idle, Fridays only", () => {
  assert.equal(auditPhase(new Date("2026-12-04T11:30:00Z")), "refresh");
  assert.equal(auditPhase(new Date("2026-12-04T11:59:59Z")), "refresh");
  assert.equal(auditPhase(new Date("2026-12-04T12:00:00Z")), "send");
  assert.equal(auditPhase(new Date("2026-12-04T17:59:00Z")), "send");
  assert.equal(auditPhase(new Date("2026-12-04T18:00:00Z")), "idle");
  assert.equal(auditPhase(new Date("2026-12-03T12:00:00Z")), "idle");
  assert.equal(chicagoParts(new Date("2026-12-04T12:00:00Z")).weekday, "Fri");
});

test("the next send after a Friday morning send is the following Friday at 06:00 Chicago", () => {
  assert.equal(nextAuditSend(new Date("2026-11-27T16:50:00Z")).toISOString(), "2026-12-04T12:00:00.000Z");
  assert.equal(nextAuditSend(new Date("2026-12-04T11:59:00Z")).toISOString(), "2026-12-04T12:00:00.000Z");
});

const rec = (over: Record<string, unknown> = {}) => ({ status: "new", occurrence: 1, firstSeenAt: new Date("2026-11-30T00:00:00Z"), reopenedAt: null, copiedAt: null, ...over }) as Parameters<typeof auditBucket>[0];
const prevAudit = new Date("2026-11-27T12:00:00Z");

test("only items that began since the previous audit are NEW; earlier unopened ones are STILL OPEN", () => {
  assert.equal(auditBucket(rec(), false, prevAudit), "NEW");
  assert.equal(auditBucket(rec({ firstSeenAt: new Date("2026-11-20T00:00:00Z") }), false, prevAudit), "STILL OPEN");
  assert.equal(auditBucket(rec({ firstSeenAt: new Date("2026-11-20T00:00:00Z") }), false, null), "NEW"); // first audit ever
  assert.equal(auditBucket(rec({ occurrence: 2, reopenedAt: new Date("2026-12-01T00:00:00Z") }), false, prevAudit), "REOPENED");
});

test("handed off (sent or copied), opened, in progress, completed, verified, and dismissed hidden", () => {
  assert.equal(auditBucket(rec(), true, prevAudit), "HANDED OFF");
  assert.equal(auditBucket(rec({ copiedAt: new Date() }), false, prevAudit), "HANDED OFF");
  assert.equal(auditBucket(rec({ status: "opened", firstSeenAt: new Date("2026-11-20T00:00:00Z") }), false, prevAudit), "OPENED");
  assert.equal(auditBucket(rec({ status: "in_progress" }), true, prevAudit), "IN PROGRESS");
  assert.equal(auditBucket(rec({ status: "completed" }), true, prevAudit), "COMPLETED");
  assert.equal(auditBucket(rec({ status: "verified" }), true, prevAudit), "VERIFIED");
  assert.equal(auditBucket(rec({ status: "dismissed" }), true, prevAudit), null);
});

import { packParts } from "../weekly-audit";
test("the audit is packed into a few parts under the size limit, never splitting a site", () => {
  const blocks = Array.from({ length: 12 }, (_, i) => "x".repeat(i === 3 ? 25_000 : 12_000));
  const parts = packParts(blocks, 60_000);
  assert.ok(parts.length >= 3 && parts.length <= 4);
  assert.deepEqual(parts.flat(), blocks.map((_, i) => i));
  for (const p of parts) assert.ok(p.reduce((s, i) => s + blocks[i]!.length, 0) <= 60_000 || p.length === 1);
});

import { relativize, siteBase } from "../weekly-audit";
test("the site's own URLs become paths; other domains are untouched", () => {
  assert.equal(siteBase("https://www.boatingchicago.com/"), "https://boatingchicago.com");
  const t = relativize("See https://boatingchicago.com/marinas and https://www.boatingchicago.com/ and http://boatingchicago.com, not https://boatingchicago.com.evil.io/x or https://rival.com/boatingchicago.com", "https://boatingchicago.com");
  assert.equal(t, "See /marinas and / and /, not https://boatingchicago.com.evil.io/x or https://rival.com/boatingchicago.com");
});
