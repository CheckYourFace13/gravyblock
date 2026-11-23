import assert from "node:assert/strict";
import { test } from "node:test";
import { inferVertical, isRealCompetitor } from "../vertical";
import { firstPartyDrift } from "@/lib/citations/engine";

test("a brewery is searched as a brewery, not as a generic local business", () => {
  assert.equal(inferVertical(["bar", "restaurant", "food", "point_of_interest", "establishment"], "93 Octane Brewery - Elmhurst"), "brewery");
  assert.equal(inferVertical(["dentist", "health"], "Bright Smile"), "healthcare");
  assert.equal(inferVertical(["plumber"], "Acme Plumbing"), "home_services");
  assert.equal(inferVertical(["point_of_interest"], "Something Unclear"), "other");
});

test("competitors exclude moved or closed places, the town itself, and results from another town", () => {
  const est = ["establishment", "point_of_interest"];
  assert.equal(isRealCompetitor({ displayName: "Brewpoint Craft Elmhurst", formattedAddress: "1 Main St, Elmhurst, IL", types: est }, "Elmhurst IL"), true);
  assert.equal(isRealCompetitor({ displayName: "The Uptown Shop now moved to Western Springs, IL", formattedAddress: "Western Springs, IL", types: est }, "Elmhurst IL"), false);
  assert.equal(isRealCompetitor({ displayName: "Elmhurst", formattedAddress: "Elmhurst, IL, USA", types: ["locality", "political"] }, "Elmhurst IL"), false);
  assert.equal(isRealCompetitor({ displayName: "Far Away Brewing", formattedAddress: "9 Oak Ave, Naperville, IL", types: est }, "Elmhurst IL"), false);
  // a street-address hint cannot be compared with a town, so the town check is skipped rather than excluding everyone
  assert.equal(isRealCompetitor({ displayName: "Near Brewing", formattedAddress: "2 Elm St, Elmhurst, IL", types: est }, "171 N Addison Ave, Elmhurst"), true);
});

const truth = (facts: Array<{ key: string; value: string; sourceSystem: string }>) => ({ facts }) as never;

test("a multi-location business is not flagged for listing several addresses; a real mismatch still is", () => {
  const multi = truth([
    { key: "address", value: "100 Main St, Chicago, IL", sourceSystem: "website" },
    { key: "address", value: "200 Oak Ave, Evanston, IL", sourceSystem: "website" },
    { key: "address", value: "200 Oak Ave, Evanston, IL", sourceSystem: "google_places" },
  ]);
  assert.deepEqual(firstPartyDrift(multi), []);
  const wrong = truth([
    { key: "address", value: "100 Main St, Chicago, IL", sourceSystem: "website" },
    { key: "address", value: "200 Oak Ave, Evanston, IL", sourceSystem: "website" },
    { key: "address", value: "999 Elsewhere Rd, Joliet, IL", sourceSystem: "google_places" },
  ]);
  assert.equal(firstPartyDrift(wrong).length, 1);
  const single = truth([
    { key: "address", value: "100 Main St, Chicago, IL", sourceSystem: "website" },
    { key: "address", value: "55 Other Rd, Chicago, IL", sourceSystem: "google_places" },
  ]);
  assert.equal(firstPartyDrift(single).length, 1);
});
