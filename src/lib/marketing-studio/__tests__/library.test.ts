import "./setup";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { checkDistinct, consumes, hasVerifiedProductUrl, type AngleEntry } from "../library";
import { PLANNED, PLAN_PRODUCTS, REJECTED_CANDIDATES, toEntry } from "../library-plan";
import { withUtm } from "../measurement/utm";

const existing: AngleEntry = {
  id: "sendfable-overview-existing",
  slug: "sendfable",
  position: 1,
  role: "A",
  title: "SendFable overview",
  hook: "Staring at a blank email?",
  goal: "introduce SendFable to a small business that does not know what to write",
  audience: "small business owner",
  coreBenefit: "know what to write and send it without marketing-software headache",
  features: ["goal picker", "Scribe draft from website updates", "email builder phone preview", "Send Confidence", "Free plan"],
  scenes: ["goals", "scribe", "builder", "pricing", "end"],
  cta: { text: "Start free", url: "https://sendfable.com/signup" },
  status: "public",
  approval: "owner_approved",
  existing: true,
  funnel: "cold",
};

describe("video library: distinct angles only", () => {
  test("a cosmetic variant of an approved or public video is blocked, whatever the wording", () => {
    for (const c of REJECTED_CANDIDATES) {
      const lib = [{ ...existing, slug: c.slug }];
      void lib;
    }
    const sameHook = toEntry({ ...REJECTED_CANDIDATES[0] });
    assert.equal(checkDistinct(sameHook, [existing]).ok, false);
    const rewordedHook: AngleEntry = { ...existing, id: "x", role: "B", hook: "Staring at an empty email draft?", goal: "show the goal picker and builder", scenes: ["goals", "builder", "end"], features: ["goal picker"] };
    const r = checkDistinct(rewordedHook, [existing]);
    assert.equal(r.ok, false, "a reworded hook for the same idea is still the same hook");
    assert.ok(r.conflicts[0].reasons.some((x) => x.includes("hook")));
  });

  test("a genuinely different angle for another role passes", () => {
    const channels = toEntry(PLANNED.find((p) => p.slug === "sendfable" && p.position === 2)!);
    const templates = toEntry(PLANNED.find((p) => p.slug === "sendfable" && p.position === 3)!);
    assert.equal(checkDistinct(channels, [existing]).ok, true);
    assert.equal(checkDistinct(templates, [existing, channels]).ok, true);
    assert.equal(checkDistinct(channels, [existing, { ...templates, status: "planned" }]).ok, true);
  });

  test("a role that is already taken cannot be filled twice, and a superseded video frees its angle", () => {
    const second: AngleEntry = { ...toEntry(PLANNED.find((p) => p.slug === "sendfable" && p.position === 2)!), role: "A" };
    assert.ok(checkDistinct(second, [existing]).conflicts[0].reasons.includes("fills a role that is already taken"));
    const retired = { ...existing, status: "superseded" as const };
    assert.equal(consumes(retired), false);
    assert.equal(checkDistinct(toEntry(REJECTED_CANDIDATES[0]), [retired]).ok, true, "only a consumed angle blocks");
  });

  test("the whole plan is internally distinct: every product has three different roles, hooks and purposes, and no proposal repeats a sibling", () => {
    for (const p of PLAN_PRODUCTS) {
      const mine = PLANNED.filter((x) => x.slug === p.slug).map(toEntry);
      const roles = new Set(mine.map((e) => e.role));
      assert.equal(roles.size, mine.length, `${p.slug}: roles must differ`);
      for (const e of mine) {
        const others = mine.filter((o) => o.id !== e.id);
        assert.ok(checkDistinct(e, others.map((o) => ({ ...o, status: "planned" as const }))).ok, `${p.slug}: ${e.title} repeats a sibling`);
        assert.ok(hasVerifiedProductUrl(e, p.host), `${p.slug}: the call to action must be a link on ${p.host}`);
      }
    }
  });

  test("YouTube links are tagged video/product/angle/id; other platforms keep the social medium", () => {
    const u = new URL(withUtm("https://sendfable.com/signup", { platform: "youtube", campaign: "sendfable", family: "sendfable-channels", publicationId: "11111111-2222-3333-4444-555555555555" }));
    assert.equal(u.searchParams.get("utm_source"), "youtube");
    assert.equal(u.searchParams.get("utm_medium"), "video");
    assert.equal(u.searchParams.get("utm_campaign"), "sendfable");
    assert.equal(u.searchParams.get("utm_content"), "sendfable_channels");
    assert.match(u.searchParams.get("utm_id") ?? "", /^ms_/);
    assert.equal(new URL(withUtm("https://sendfable.com/signup", { platform: "facebook", campaign: null, family: null, publicationId: "11111111-2222-3333-4444-555555555555" })).searchParams.get("utm_medium"), "social");
  });
});
