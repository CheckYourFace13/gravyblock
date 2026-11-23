import assert from "node:assert/strict";
import { test } from "node:test";
import { directoryNotApplicable } from "../registry";

test("local-only directories do not apply to national or online businesses, but still apply to local and regional ones", () => {
  for (const id of ["yelp", "google_business_profile", "bing_places", "apple_business_connect", "bbb", "nextdoor"]) {
    assert.equal(directoryNotApplicable(id, "online"), true, id);
    assert.equal(directoryNotApplicable(id, "national"), true, id);
    assert.equal(directoryNotApplicable(id, "local"), false, id);
    assert.equal(directoryNotApplicable(id, "regional"), false, id);
  }
});

test("the Facebook Page and the first-party NAP check apply to every business", () => {
  for (const mode of ["local", "regional", "national", "online"]) {
    assert.equal(directoryNotApplicable("facebook_page", mode), false);
    assert.equal(directoryNotApplicable("own_site_vs_gbp", mode), false);
  }
});
