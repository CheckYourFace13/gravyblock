import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyWidgetKinds } from "../embed-briefs";

const bc = ["https://x.com/weather", "https://x.com/tools/float-plan", "https://x.com/tools/trip-checklist", ...Array.from({ length: 12 }, (_, i) => `https://x.com/boat-launches/l${i}`), "https://x.com/about"];

test("finds the three widget kinds a boating site already supports", () => {
  const k = classifyWidgetKinds(bc).map((x) => x.kind).sort();
  assert.deepEqual(k, ["checklist_or_calculator", "directory_listing_card", "live_conditions"]);
});

test("a handful of directory pages is not enough to propose a listing card", () => {
  const few = ["https://x.com/places/a", "https://x.com/places/b", "https://x.com/about"];
  assert.equal(classifyWidgetKinds(few).length, 0);
});

test("a site with no tools gets no proposals", () => {
  assert.equal(classifyWidgetKinds(["https://x.com/", "https://x.com/about", "https://x.com/blog/post"]).length, 0);
});
