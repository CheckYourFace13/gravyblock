// Dedicated website video slots: every slot is described, and every configured asset really exists in public/ (a typo would ship a broken player).
import "./setup";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { SLOT_PLACEMENT, WEBSITE_VIDEOS, WEBSITE_VIDEO_SLOTS } from "../../website-videos";

describe("website video slots", () => {
  test("every slot has a placement and an entry", () => {
    for (const s of WEBSITE_VIDEO_SLOTS) {
      assert.ok(SLOT_PLACEMENT[s], s);
      assert.ok(s in WEBSITE_VIDEOS, s);
    }
  });
  test("every configured asset exists in public/", () => {
    for (const v of Object.values(WEBSITE_VIDEOS)) {
      if (!v) continue;
      for (const f of [v.src, v.poster, ...(v.captions ? [v.captions] : [])]) assert.ok(existsSync(path.join(process.cwd(), "public", f)), f);
      assert.ok(v.seconds > 0);
    }
  });
});
