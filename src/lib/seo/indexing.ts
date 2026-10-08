import type { Metadata } from "next";

/**
 * Single indexing rule for programmatically generated pages.
 *
 * Why this exists: the /local-seo section generates one hub per city and one page per
 * city x industry pair. Those pages are substantially the same text with the city and
 * industry names substituted, so by default they must NOT be indexed or listed in the
 * XML sitemap. Both the page `robots` metadata and `sitemap.ts` read the functions
 * below, so a generated page can never be in the sitemap while noindexed (or the
 * reverse), and a newly generated page defaults to "not indexed".
 *
 * A page earns indexing only by being listed in one of the allowlists below, which
 * requires that the page carries meaningful content that is unique to that city (or
 * city + industry) and verifiable, beyond swapping place and industry names. Do not add
 * a page here because it can target a keyword.
 */

/** City hub slugs (e.g. "austin-tx") whose hub page has unique, verifiable local content. */
export const INDEXABLE_CITY_HUBS: ReadonlySet<string> = new Set<string>([]);

/** "city-slug/industry-slug" pairs whose page has unique, verifiable local content. */
export const INDEXABLE_CITY_INDUSTRY_PAGES: ReadonlySet<string> = new Set<string>([]);

export function isCityHubIndexable(citySlug: string): boolean {
  return INDEXABLE_CITY_HUBS.has(citySlug);
}

export function isCityIndustryIndexable(citySlug: string, industrySlug: string): boolean {
  return INDEXABLE_CITY_INDUSTRY_PAGES.has(`${citySlug}/${industrySlug}`);
}

/** The /local-seo directory only lists generated pages, so it follows its children. */
export function isLocalDirectoryIndexable(): boolean {
  return INDEXABLE_CITY_HUBS.size > 0 || INDEXABLE_CITY_INDUSTRY_PAGES.size > 0;
}

/** Robots metadata for a generated page: non-indexable pages keep passing link signals. */
export function robotsFor(indexable: boolean): NonNullable<Metadata["robots"]> {
  return indexable ? { index: true, follow: true } : { index: false, follow: true };
}
