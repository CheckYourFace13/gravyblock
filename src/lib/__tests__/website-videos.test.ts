import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SLOT_PLACEMENT, WEBSITE_VIDEOS, WEBSITE_VIDEO_SLOTS } from "../website-videos";

describe("website video slots", () => {
  it("every slot has a placement and an entry", () => {
    for (const s of WEBSITE_VIDEO_SLOTS) {
      expect(SLOT_PLACEMENT[s]).toBeTruthy();
      expect(s in WEBSITE_VIDEOS).toBe(true);
    }
  });
  it("every configured asset exists in public/ (a typo would ship a broken player)", () => {
    for (const v of Object.values(WEBSITE_VIDEOS)) {
      if (!v) continue;
      for (const f of [v.src, v.poster, v.captions]) expect(existsSync(path.join(process.cwd(), "public", f)), f).toBe(true);
      expect(v.seconds).toBeGreaterThan(0);
    }
  });
});
