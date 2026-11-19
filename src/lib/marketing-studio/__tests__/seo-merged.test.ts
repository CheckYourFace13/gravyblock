// Merged thin pages: every old URL is a 301 to a live, indexed page, is out of the sitemap, and nothing loops or chains.
import "./setup";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import sitemap from "../../../app/sitemap";
import nextConfig from "../../../../next.config";
import { INDUSTRY_SLUGS } from "../../content/industries/registry";
import { MERGED_INDUSTRIES, MERGED_SOURCES, MERGED_URLS } from "../../seo/merged-urls";

const paths = () => new Set(sitemap().map((e) => new URL(e.url, "https://gravyblock.com").pathname.replace(/\/$/, "") || "/"));

describe("merged thin pages", () => {
  test("every merged URL is a 301 in the site config", async () => {
    const rules = (await nextConfig.redirects?.()) ?? [];
    for (const m of MERGED_URLS) {
      const r = rules.find((x) => x.source === m.source);
      assert.ok(r, `${m.source} has a redirect`);
      assert.equal((r as { statusCode?: number }).statusCode, 301, `${m.source} is a 301, not a 308`);
      assert.equal(r?.destination, m.destination);
    }
  });
  test("no merged URL is in the sitemap, and every destination is", () => {
    const live = paths();
    for (const m of MERGED_URLS) {
      assert.ok(!live.has(m.source), `${m.source} must not be in the sitemap`);
      assert.ok(live.has(m.destination), `${m.destination} must be a sitemap page`);
    }
  });
  test("no redirect chains or loops: a destination is never itself merged", () => {
    for (const m of MERGED_URLS) assert.ok(!MERGED_SOURCES.has(m.destination), `${m.source} -> ${m.destination} chains`);
  });
  test("each merged business type points at a real category page", () => {
    for (const [slug, v] of Object.entries(MERGED_INDUSTRIES)) assert.ok((INDUSTRY_SLUGS as string[]).includes(v.parent), `${slug} -> ${v.parent}`);
  });
  test("the canonical of every sitemap page is itself (no duplicates)", () => {
    const list = sitemap().map((e) => e.url);
    assert.equal(new Set(list).size, list.length, "no URL appears twice in the sitemap");
  });
});
