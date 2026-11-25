import { test } from "node:test";
import assert from "node:assert/strict";
import { pickAssetBySearch } from "../engine";

const a = { url: "https://example.com/guide/", title: "Guide" };
const b = { url: "https://example.com/tool", title: "Tool" };

test("prefers the candidate page with the most impressions in striking distance", () => {
  const pick = pickAssetBySearch([a, b], [
    { pageUrl: "https://example.com/guide?utm=x", impressions: 50, position: 12 },
    { pageUrl: "https://example.com/tool/", impressions: 900, position: 8 },
  ]);
  assert.equal(pick?.url, b.url);
});

test("ignores pages already at the top and pages too far down", () => {
  assert.equal(pickAssetBySearch([a], [{ pageUrl: a.url, impressions: 5000, position: 1.2 }]), null);
  assert.equal(pickAssetBySearch([a], [{ pageUrl: a.url, impressions: 5000, position: 70 }]), null);
});

test("returns null with no search data so the caller falls back", () => {
  assert.equal(pickAssetBySearch([a, b], []), null);
});
