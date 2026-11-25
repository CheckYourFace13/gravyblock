import { test } from "node:test";
import assert from "node:assert/strict";
import { neutralize, testSiteLabels } from "../neutral";

test("labels are stable, numbered and reveal nothing about the site", () => {
  const m = testSiteLabels(["League Pour", "Boating Chicago", "League Pour"]);
  assert.equal(m.get("Boating Chicago"), "Internal test site 1");
  assert.equal(m.get("League Pour"), "Internal test site 2");
});

test("names, domains and urls are scrubbed from stored text", () => {
  const out = neutralize("Link to Boating Chicago found at https://clubs.example.org/links pointing to boatingchicago.com", ["Boating Chicago"], "Internal test site 1");
  assert.doesNotMatch(out, /Boating|boatingchicago|example\.org|https?:/i);
  assert.match(out, /Internal test site 1/);
});
