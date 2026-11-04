// Pure tests (no database): the pilot creative set must be four genuinely different angles per product, grounded in verified facts only.
import "./setup";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildConceptSpecs } from "../creative/copy";
import { sourceFor } from "../creative/context";
import { overlaps } from "../creative/qa";
import { NEUTRAL_PATTERNS } from "../creative/templates";
import { pickRepresentatives, type ReviewCreative } from "../review";
import { buildStoryboard } from "../video/queue";
import { storyboardSeconds, validateStoryboard } from "../video/types";

type Fact = Parameters<typeof buildConceptSpecs>[0][number];
let n = 0;
let clock = 1_700_000_000_000;
const fact = (factKey: string, factValue: string, over: Partial<Fact> = {}): Fact => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, productId: "p", factKey, factValue, sourceKind: "public_page", sourceUrl: null, contentHash: String(n),
  status: "current", verifiedBy: "t", verifiedAt: new Date(), expiresAt: null, createdAt: new Date((clock += 1000)), ...over,
});
/** listFacts returns facts by key and then NEWEST first; tests feed them that way. */
const asListed = (facts: Fact[]) => [...facts].sort((a, b) => a.factKey.localeCompare(b.factKey) || b.createdAt.getTime() - a.createdAt.getTime());

const NOODLE: Fact[] = [
  fact("product_name", "RentalNoodle"),
  fact("tagline", "Manage every rental from one simple place."),
  fact("description", "Keep your properties, tenants, leases, rent, maintenance, inspections, documents, and finances connected in one landlord-friendly platform."),
  fact("feature", "Properties & tenants: One record per rental, with address, tenant, lease terms, and history."),
  fact("feature", "Lease execution: Build or upload a lease, invite signers, and keep completed documents with the property."),
  fact("feature", "Maintenance: Tenant requests with photos, status updates, and a history."),
  fact("feature", "Finances: Income and expense tracking, summaries, and Schedule E preparation exports."),
  fact("plan", "Free: $0/mo, 1 property, basics"),
  fact("plan", "Landlord Pro: $12/mo, Up to 5 properties"),
  fact("plan", "Portfolio: $29/mo, Up to 25 properties"),
  fact("pricing_note", "Start free. Upgrade when you need more properties or tools."),
  fact("cta", "Start Managing Free"),
  fact("cta_url", "https://rentalnoodle.com/sign-up"),
];
const SHOTS = [
  { id: "shot-home", name: "rentalnoodle-home-top.png" },
  { id: "shot-core", name: "rentalnoodle-core-property-management.png" },
  { id: "shot-pricing", name: "rentalnoodle-pricing.png" },
];

const ZAP: Fact[] = [
  fact("product_name", "ScribbleZap"),
  fact("tagline", "Trace the edge, cut, and claim the territory."),
  fact("description", "ScribbleZap is a mobile puzzle game published by iScream Studio. Players cut across a board and keep filling until the page is theirs."),
  fact("release_status", "Coming Soon"),
  fact("platform", "Google Play and the Apple App Store"),
  fact("how_it_plays", "Tap and hold to cut across the board."),
  fact("how_it_plays", "Release before reaching the edge to retract the cut."),
  fact("how_it_plays", "Claim the safe side, which is the side without the enemy, and keep filling the page."),
  fact("feature", "Draw and fill: A draw-and-fill puzzle game. Trace the edge, cut, and claim the territory."),
  fact("feature", "Hand-made stages: Campaign stages that each introduce one new ball, hazard, tool, obstacle, or rule."),
  fact("feature", "Daily Challenge: A new challenge each local day, with streaks and an optional share feature."),
  fact("feature", "Endless Run: A mode with upgrades for longer sessions."),
  fact("cta", "View game"),
  fact("cta_url", "https://iscreamstudio.com/games/scribblezap/"),
];

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

describe("pilot concept sets are four different angles", () => {
  for (const [label, facts, shots] of [["SaaS with screenshots", NOODLE, SHOTS], ["game with no screenshots", ZAP, []]] as const) {
    test(`${label}: four families, four headlines, every text grounded`, () => {
      const specs = buildConceptSpecs(asListed([...facts]), { hasScreenshot: shots.length > 0, screenshots: [...shots] });
      assert.equal(specs.length, 4);
      assert.equal(new Set(specs.map((s) => s.family)).size, 4, specs.map((s) => s.family).join());
      assert.equal(new Set(specs.map((s) => key(s.headline))).size, 4, specs.map((s) => s.headline).join(" | "));
      for (const s of specs) {
        for (const text of [s.headline, s.subhead, ...((s.payload as { steps?: Array<{ text: string }> }).steps ?? []).map((x) => x.text)].filter((x): x is string => Boolean(x))) {
          const src = sourceFor(text, facts[0].factValue, facts, s.factIds);
          assert.ok(src.kind !== "fact" || src.factId !== "unmatched", `not grounded: ${text}`);
        }
      }
    });
  }

  test("a screenshot is attached only when it matches the concept, and never twice", () => {
    const specs = buildConceptSpecs(asListed(NOODLE), { hasScreenshot: true, screenshots: SHOTS });
    const showcase = specs.find((s) => s.family === "screenshot_showcase")!;
    assert.equal(showcase.headline, "Properties & tenants");
    assert.equal((showcase.payload as { shotAssetId?: string }).shotAssetId, "shot-core");
    const ids = specs.map((s) => (s.payload as { shotAssetId?: string }).shotAssetId).filter(Boolean);
    assert.equal(new Set(ids).size, ids.length, "a screenshot was reused");
    for (const s of specs.filter((x) => x.family === "feature_highlight")) assert.ok((s.payload as { noShot?: boolean }).noShot || (s.payload as { shotAssetId?: string }).shotAssetId, "feature must either match a shot or be text-led");
    // The product name matches every file name, so it must not count as a match.
    const generic = buildConceptSpecs(asListed(NOODLE.map((f) => (f.factKey === "feature" ? { ...f, factValue: f.factValue.replace(/^[^:]+/, "RentalNoodle thing") } : f))), { hasScreenshot: true, screenshots: SHOTS });
    const feat = generic.find((s) => s.family === "feature_highlight");
    assert.ok(!feat || (feat.payload as { noShot?: boolean }).noShot, "matched a picture on the product name alone");
  });

  test("the comparison shows the free plan first, whatever order the facts arrive in", () => {
    const specs = buildConceptSpecs(asListed(NOODLE), { hasScreenshot: false });
    const cmp = specs.find((s) => s.family === "comparison")!;
    const cols = (cmp.payload as { columns: Array<{ label: string }> }).columns;
    assert.deepEqual(cols.map((c) => c.label), ["Free", "Landlord Pro"]);
  });

  test("how-it-plays steps keep the order of the page and sit under a neutral headline", () => {
    const specs = buildConceptSpecs(asListed(ZAP), { hasScreenshot: false });
    const tip = specs.find((s) => s.family === "educational_tip")!;
    assert.equal(tip.headline, "How ScribbleZap plays");
    assert.ok(NEUTRAL_PATTERNS.some((p) => p.replace("{product}", "ScribbleZap") === tip.headline));
    const steps = (tip.payload as { steps: Array<{ text: string }> }).steps.map((s) => s.text);
    assert.deepEqual(steps, ["Tap and hold to cut across the board.", "Release before reaching the edge to retract the cut.", "Claim the safe side, which is the side without the enemy, and keep filling the page."]);
  });

  test("the Coming Soon teaser names the platforms instead of repeating the tagline, and a restating feature is skipped", () => {
    const specs = buildConceptSpecs(asListed(ZAP), { hasScreenshot: false, limit: 12 });
    const a = specs.find((s) => s.family === "announcement")!;
    assert.equal((a.payload as { badge: string }).badge, "Coming Soon");
    assert.equal(a.subhead, "Google Play and the Apple App Store");
    assert.ok(!specs.some((s) => s.headline === "Draw and fill"), "a feature that restates the tagline became a concept");
  });

  test("no release status means no Coming Soon badge", () => {
    const specs = buildConceptSpecs(asListed(ZAP.filter((f) => f.factKey !== "release_status")), { hasScreenshot: false, limit: 12 });
    assert.ok(!specs.some((s) => s.family === "announcement"));
    assert.ok(!JSON.stringify(specs).includes("Coming Soon"));
  });
});

describe("video storyboards for the pilots", () => {
  const ctx = (facts: Fact[], shots: number) =>
    ({ facts, productName: facts[0].factValue, screenshotAssets: Array.from({ length: shots }, (_, i) => ({ id: `0000000${i}-1111-4111-8111-111111111111` })), logoAsset: { id: "99999999-1111-4111-8111-111111111111" } }) as never;

  test("an icon-only product shows the icon once and never repeats a headline", () => {
    const sb = buildStoryboard(ctx(asListed(ZAP), 0), 30);
    assert.deepEqual(validateStoryboard(sb), []);
    assert.ok(Math.abs(storyboardSeconds(sb) - 30) < 0.15);
    assert.equal(sb.scenes.filter((s) => s.type === "image").length, 1);
    const heads = sb.scenes.filter((s) => s.type === "card").map((s) => key((s as { headline: string }).headline));
    assert.equal(new Set(heads).size, heads.length, "a headline repeats within the video");
    const cards = sb.scenes.filter((s) => s.type === "card").map((s) => (s as { headline: string }).headline);
    assert.ok(cards.includes("Tap and hold to cut across the board."), "mechanics lead for an icon-only product");
  });

  test("the end card never repeats the opening headline", () => {
    for (const [facts, shots] of [[NOODLE, 3], [ZAP, 0]] as const) {
      const sb = buildStoryboard(ctx(asListed([...facts]), shots), 30);
      const first = (sb.scenes[0] as { headline: string }).headline;
      const last = (sb.scenes.at(-1) as { headline: string }).headline;
      assert.notEqual(key(first), key(last));
    }
    // A product with no pricing note and no spare fact falls back to a neutral line, not the tagline again.
    const bare = [fact("product_name", "Bare"), fact("tagline", "Just a tagline."), fact("cta", "Go"), fact("cta_url", "https://bare.example/")];
    const sb = buildStoryboard(ctx(bare, 1), 15);
    assert.equal((sb.scenes.at(-1) as { headline: string }).headline, "Meet Bare");
  });
});

describe("review picks and overlap geometry", () => {
  const cr = (over: Partial<ReviewCreative>): ReviewCreative => ({
    creativeId: Math.random().toString(16).slice(2), assetId: "a", conceptId: "c", family: "product_benefit", campaign: null, headline: "H", subhead: null, caption: "C", ctaText: null, ctaUrl: null,
    sizeKey: "square", width: 1080, height: 1080, aspect: "1:1", status: "ready_for_review", qa: { passed: true, checks: 1, failed: [] }, facts: [], ...over,
  });
  test("representatives never repeat a headline even across families", () => {
    const picked = pickRepresentatives([
      cr({ conceptId: "a", family: "product_benefit", headline: "Same words." }),
      cr({ conceptId: "b", family: "screenshot_showcase", headline: "Same words" }),
      cr({ conceptId: "c", family: "feature_highlight", headline: "Another angle" }),
    ]);
    assert.deepEqual(picked.map((p) => p.conceptId), ["a", "c"]);
  });
  test("touching boxes do not overlap, intersecting ones do", () => {
    assert.equal(overlaps({ x: 0, y: 0, w: 100, h: 100 }, { x: 100, y: 0, w: 50, h: 100 }), false);
    assert.equal(overlaps({ x: 0, y: 0, w: 100, h: 100 }, { x: 98, y: 98, w: 50, h: 50 }), false);
    assert.equal(overlaps({ x: 0, y: 0, w: 100, h: 100 }, { x: 60, y: 60, w: 100, h: 100 }), true);
  });
});
