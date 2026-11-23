import assert from "node:assert/strict";
import { test } from "node:test";
import { trafficExclusion } from "../internal-traffic";

const jar = (o: Record<string, string>) => ({ get: (n: string) => (o[n] !== undefined ? { value: o[n] } : undefined) });
const chrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

test("owner browsing, internal captures and automated clients are excluded; a normal browser is not", () => {
  assert.equal(trafficExclusion(jar({}), chrome), null);
  assert.equal(trafficExclusion(jar({ gb_internal: "1" }), chrome), "internal");
  assert.equal(trafficExclusion(jar({ gb_admin_session: "x" }), chrome), "internal");
  assert.equal(trafficExclusion(jar({}), "Mozilla/5.0 (compatible; Googlebot/2.1)"), "bot");
  assert.equal(trafficExclusion(jar({}), "Mozilla/5.0 HeadlessChrome/126.0"), "bot");
  assert.equal(trafficExclusion(jar({}), null), "bot");
});
