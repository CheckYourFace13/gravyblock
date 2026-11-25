/**
 * Embeddable-widget proposals for a house site's own development agent. GravyBlock never edits a house site: this reads the site's public sitemap,
 * finds useful tools and directories it already has (weather, checklists, calculators, venue or marina directories), and records ONE brief per kind
 * describing what a voluntary, useful embed could be and who might use it. The proposal always requires a visible, honest credit and no hidden or
 * keyword-stuffed links. The result is judged later on verified placements and referral visits, never assumed.
 */
import { eq } from "drizzle-orm";
import { businesses, getDb } from "@/lib/db";
import { safeFetchText } from "@/lib/net/safe-fetch";
import { recordOpportunity } from "./queue";

export type WidgetKind = "live_conditions" | "checklist_or_calculator" | "directory_listing_card";

const RULES: Array<{ kind: WidgetKind; test: RegExp; idea: string; audience: string }> = [
  {
    kind: "live_conditions",
    test: /\/(weather|conditions|forecast|tides?)(\/|$)/i,
    idea: "A compact live-conditions card (current reading plus a link to the full page) that another site can embed with one snippet.",
    audience: "local clubs, marinas, harbor and park-district pages, and event organisers whose visitors need the same conditions before they go",
  },
  {
    kind: "checklist_or_calculator",
    test: /\/(tools?|calculators?|checklists?|planner)\/[^/]+/i,
    idea: "A print-friendly or embeddable version of an existing tool or checklist, with a plain visible credit line and link to the tool page.",
    audience: "clubs, instructors, safety courses and local publications that currently link to generic checklists",
  },
  {
    kind: "directory_listing_card",
    test: /\/(places|marinas|boat-launches|launches|venues|listings|directory)\/[^/]+/i,
    idea: "A shareable listing card or badge each listed owner can place on their own site ('Listed on <site>'), plus a one-line share link, so owners who want to share their listing can do it themselves.",
    audience: "the listed owners themselves (voluntary sharing, never an unsolicited request) and local guides that reference those places",
  },
];

export function classifyWidgetKinds(urls: string[]): Array<{ kind: WidgetKind; idea: string; audience: string; pages: number; examples: string[] }> {
  const out: Array<{ kind: WidgetKind; idea: string; audience: string; pages: number; examples: string[] }> = [];
  for (const rule of RULES) {
    const hits = urls.filter((u) => {
      try {
        return rule.test.test(new URL(u).pathname);
      } catch {
        return false;
      }
    });
    // the weather rule matches the section page itself, the others need pages inside a section
    const exact = rule.kind === "live_conditions" ? urls.filter((u) => /\/(weather|conditions|forecast|tides?)\/?$/i.test(u)) : [];
    const pages = rule.kind === "live_conditions" ? exact.length : hits.length;
    if (pages >= (rule.kind === "directory_listing_card" ? 5 : 1)) out.push({ kind: rule.kind, idea: rule.idea, audience: rule.audience, pages, examples: (rule.kind === "live_conditions" ? exact : hits).slice(0, 3) });
  }
  return out;
}

async function sitemapUrls(origin: string): Promise<string[]> {
  const root = await safeFetchText(`${origin}/sitemap.xml`, { timeoutMs: 9000 });
  if (!root.ok || root.status >= 400) return [];
  const locs = (xml: string) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]!.replace(/&amp;/g, "&"));
  let urls = locs(root.body);
  if (/<sitemapindex/i.test(root.body)) {
    const all: string[] = [];
    for (const child of urls.slice(0, 4)) {
      const c = await safeFetchText(child, { timeoutMs: 9000 });
      if (c.ok && c.status < 400) all.push(...locs(c.body));
    }
    urls = all;
  }
  return urls;
}

export async function discoverEmbedBriefs(businessId: string): Promise<{ recorded: number; kinds: string[] }> {
  const db = getDb();
  if (!db) return { recorded: 0, kinds: [] };
  const [biz] = await db.select({ website: businesses.website, name: businesses.name }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!biz?.website) return { recorded: 0, kinds: [] };
  const origin = new URL(/^https?:\/\//i.test(biz.website) ? biz.website : `https://${biz.website}`).origin;
  const urls = await sitemapUrls(origin).catch(() => []);
  const kinds = classifyWidgetKinds(urls);
  let recorded = 0;
  for (const k of kinds) {
    const r = await recordOpportunity({
      businessId,
      opportunityType: "content_gap",
      subtype: "embeddable_widget_brief",
      engine: "embed_briefs",
      evidence: {
        kind: k.kind,
        proposal: k.idea,
        whoMightUseIt: k.audience,
        existingPages: k.pages,
        examples: k.examples,
        rules: "Credit must be visible and honest. No hidden links, no keyword-stuffed anchor text, no required link in exchange for use. Link attributes are the embedding site's choice.",
        measuredBy: "verified placements found on other sites' pages and referral visits where measurable; never assumed from the proposal",
      },
      valueClass: "growth",
      expectedImpact: 45,
      confidence: 30,
      cost: 4,
      risk: 2,
      requiredCapability: "website_write",
      autoEligible: false,
      ttlDays: 90,
      dedupeKey: `embed_brief:${businessId}:${k.kind}`,
    });
    if (r.recorded) recorded++;
  }
  return { recorded, kinds: kinds.map((k) => k.kind) };
}
