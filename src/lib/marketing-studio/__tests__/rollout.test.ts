import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { DEFERRED_ACCOUNTS, FIRST_SOCIAL_SETUP, PAID_ACQUISITION, ROLLOUT_ORDER, SOCIAL_STRATEGY } from "../rollout";

describe("rollout plan", () => {
  test("games first, then the owner's website and app order", () => {
    assert.deepEqual(ROLLOUT_ORDER.slice(0, 3), ["ScribbleZap", "Mibble Meadow", "SendFable"]);
    assert.equal(ROLLOUT_ORDER.length, 14);
    assert.equal(ROLLOUT_ORDER.at(-1), "iScream Studio");
    assert.equal(new Set(ROLLOUT_ORDER).size, ROLLOUT_ORDER.length);
  });
  test("the first social setup is the minimum three items and everything else is deferred", () => {
    assert.equal(FIRST_SOCIAL_SETUP.length, 3);
    assert.deepEqual([...DEFERRED_ACCOUNTS], ["Instagram", "TikTok", "YouTube", "Google Ads", "Meta Ads account"]);
  });
  test("one shared games identity, LinkedIn out of scope, paid spend disabled", () => {
    assert.equal(SOCIAL_STRATEGY.games.identity, "iScream Studio");
    assert.ok(!(SOCIAL_STRATEGY.games.platforms as readonly string[]).includes("linkedin"));
    assert.deepEqual(SOCIAL_STRATEGY.outOfScope, ["linkedin"]);
    assert.equal(PAID_ACQUISITION.spendEnabled, false);
  });
});
