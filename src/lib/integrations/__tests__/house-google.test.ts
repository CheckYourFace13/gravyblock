import assert from "node:assert/strict";
import { test } from "node:test";
import { matchSearchConsoleProperty } from "../house-google";

test("a domain property wins, then https prefixes; a property for another site never matches", () => {
  assert.equal(matchSearchConsoleProperty("micstage.com", ["https://micstage.com/", "sc-domain:micstage.com"]), "sc-domain:micstage.com");
  assert.equal(matchSearchConsoleProperty("micstage.com", ["https://www.micstage.com/"]), "https://www.micstage.com/");
  assert.equal(matchSearchConsoleProperty("micstage.com", ["sc-domain:micstage.org", "https://other.com/"]), null);
  assert.equal(matchSearchConsoleProperty("micstage.com", []), null);
});
