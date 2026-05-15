/**
 * ─── Feature #4: Smart Internal Linking ──────────────────────────────────────
 * When publishing a new article, automatically find relevant previously
 * published content for this business and insert internal links.
 *
 * Zero API cost — pure text matching logic.
 */

import { and, eq, isNotNull, not } from "drizzle-orm";
import { getDb, publishedContent } from "@/lib/db";

type PublishedItem = {
  title: string;
  publicUrl: string;
};

/**
 * Extract 2-4 meaningful words from a title that could anchor a link.
 */
function extractAnchorWords(title: string): string[] {
  const stop = new Set([
    "a","an","the","and","or","but","in","on","at","to","for","of","with",
    "your","our","is","are","was","were","be","how","what","why","when","where",
    "this","that","these","those","can","will","we","you","it","its",
  ]);
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stop.has(w))
    .slice(0, 4);
}

/**
 * Check if a body already contains a link to avoid duplicating.
 */
function alreadyLinked(body: string, url: string): boolean {
  return body.includes(url);
}

/**
 * Insert markdown internal links into an article body.
 * Only links to related published articles — no duplication, max 3 links inserted.
 */
export async function addInternalLinks(params: {
  body: string;
  businessId: string;
  currentTitle: string;
  currentUrl?: string;
}): Promise<string> {
  const db = getDb();
  if (!db) return params.body;

  // Fetch other published articles for this business
  const published = await db
    .select({ title: publishedContent.title, publicUrl: publishedContent.publicUrl })
    .from(publishedContent)
    .where(
      and(
        eq(publishedContent.businessId, params.businessId),
        eq(publishedContent.status, "published"),
        isNotNull(publishedContent.publicUrl),
        ...(params.currentUrl ? [not(eq(publishedContent.publicUrl, params.currentUrl))] : []),
      ),
    )
    .limit(20);

  if (published.length === 0) return params.body;

  let body = params.body;
  let linksInserted = 0;
  const MAX_LINKS = 3;

  for (const item of published) {
    if (linksInserted >= MAX_LINKS) break;
    if (!item.publicUrl || alreadyLinked(body, item.publicUrl)) continue;

    const anchors = extractAnchorWords(item.title);
    if (anchors.length === 0) continue;

    // Try each anchor word to find a natural place in the body
    for (const anchor of anchors) {
      // Find the anchor word in a sentence (not already in a link)
      const pattern = new RegExp(`(?<!\\[)\\b(${anchor})\\b(?![^\\[]*\\])`, "i");
      if (pattern.test(body)) {
        body = body.replace(pattern, `[$1](${item.publicUrl})`);
        linksInserted++;
        break;
      }
    }
  }

  return body;
}
