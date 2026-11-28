import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLaunchPlan, searchStage } from "../research";
import { pickTop } from "../prompt";
import { packParts, PART_LIMIT_CHARS } from "../weekly-audit";

test("search stage: unavailable Google data is never treated as zero, and the stage moves on its own as data accumulates", () => {
  const off = searchStage(false, null);
  assert.equal(off.stage, "launch");
  assert.match(off.reason, /unavailable \(not zero\)/);
  assert.equal(searchStage(true, 120).stage, "launch");
  assert.equal(searchStage(true, 1200).stage, "early data");
  assert.equal(searchStage(true, 5000).stage, "established");
});

test("launch plan: existing pages are used before new ones, at most two new pages first, and the 90-day plan is concrete", () => {
  const plan = buildLaunchPlan({
    stage: "launch", reason: "new", conversion: "joining the beta", gscConnected: false, valuableSections: ["/tools", "/alternatives", "/features"],
    clusters: [
      { label: "toggl alternative", queries: ["toggl alternative", "toggl alternative free"], intent: "transactional", score: 4, level: "strong", ourPage: { url: "https://hourlantern.com/alternatives/toggl", covers: true }, competitorPages: [] },
      { label: "freelance hourly rate calculator", queries: ["freelance hourly rate calculator", "hourly rate calculator freelance"], intent: "transactional", score: 3.5, level: "strong", ourPage: null, competitorPages: [] },
      { label: "time tracking without screenshots", queries: ["time tracking without screenshots", "time tracker no screenshots"], intent: "informational", score: 2.5, level: "moderate", ourPage: null, competitorPages: [] },
      { label: "billable hours tracker", queries: ["billable hours tracker", "billable hours tracker app"], intent: "transactional", score: 2, level: "moderate", ourPage: null, competitorPages: [] },
    ],
  });
  assert.equal(plan.clusters[0]!.action, "make the existing page plainly answer it");
  assert.equal(plan.clusters[1]!.section, "/tools");
  assert.match(plan.plan90[0]!.steps[0]!, /Verify the domain in Google Search Console/);
  assert.match(plan.plan90[1]!.steps[0]!, /at most two original pages/);
  assert.ok(!plan.plan90[1]!.steps[0]!.includes("billable hours tracker"));
  assert.ok(plan.internalLinks[0]!.includes("/alternatives/toggl"));
});

test("pickTop keeps variety but never leaves slots empty when only one kind exists", () => {
  const list = [1, 2, 3, 4].map((n) => ({ kind: "new_demand", priority: n }));
  assert.equal(pickTop(list, 5).length, 3);
  const mixed = [...list, { kind: "topic_ranking", priority: 0.5 }];
  assert.deepEqual(pickTop(mixed, 5).map((x) => x.kind).sort(), ["new_demand", "new_demand", "topic_ranking"]);
});

test("13 or more sites: every site lands in exactly one part under the size limit; the number of parts adjusts", () => {
  const blocks = Array.from({ length: 13 }, (_, i) => "x".repeat(20_000 + i * 500));
  const parts = packParts(blocks);
  assert.deepEqual(parts.flat().sort((a, b) => a - b), [...Array(13).keys()]);
  assert.ok(parts.length >= 5);
  for (const p of parts) assert.ok(p.reduce((n, i) => n + blocks[i]!.length, 0) <= PART_LIMIT_CHARS || p.length === 1);
});

import { intentOf } from "../deep";
import { matchCompetitorUrls } from "../competitors";

test("billable hours is not a right-now local search; alternatives and trackers are close to sign-up", () => {
  assert.equal(intentOf("billable hours tracker"), "transactional");
  assert.equal(intentOf("how to track billable hours"), "informational");
  assert.equal(intentOf("clockify alternatives"), "transactional");
  assert.equal(intentOf("happy hours near me"), "local");
  assert.equal(intentOf("bar hours today"), "local");
});

test("other-language competitor pages are not offered as comparisons for an English search", () => {
  const m = matchCompetitorUrls(new Map([["getharvest.com", ["https://www.getharvest.com/pt/time-tracking/billable-hours-tracker", "https://www.getharvest.com/time-tracking/billable-hours-tracker"]]]), ["billable", "hour", "tracker"]);
  assert.equal(m[0]!.url, "https://www.getharvest.com/time-tracking/billable-hours-tracker");
});
