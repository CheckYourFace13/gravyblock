/**
 * ─── Feature #5: Article Header Images ───────────────────────────────────────
 * Unsplash API — free stock photos for article covers.
 *
 * Requires: UNSPLASH_ACCESS_KEY (free at unsplash.com/developers)
 * Rate limit: 50 requests/hour on free tier.
 * Docs: https://unsplash.com/documentation
 */

const UNSPLASH_BASE = "https://api.unsplash.com";

export type UnsplashPhoto = {
  url: string;           // Full-size image URL
  thumbUrl: string;      // 400px thumb
  credit: string;        // "Photo by {name} on Unsplash"
  creditUrl: string;     // Link to photographer profile
  altDescription: string | null;
};

/**
 * Fetch a relevant stock photo for an article.
 * Falls back to a generic local-business photo if query returns nothing.
 */
export async function getArticlePhoto(keyword: string): Promise<UnsplashPhoto | null> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return null;

  const query = encodeURIComponent(keyword.slice(0, 100));
  const url = `${UNSPLASH_BASE}/photos/random?query=${query}&orientation=landscape&content_filter=high`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Client-ID ${key}` },
      cache: "no-store",
    });

    if (res.status === 403) {
      console.warn("[unsplash] rate limit reached");
      return null;
    }
    if (!res.ok) return null;

    const json = (await res.json()) as {
      urls?: { regular?: string; thumb?: string };
      user?: { name?: string; links?: { html?: string } };
      alt_description?: string | null;
    };

    const regular = json.urls?.regular;
    if (!regular) return null;

    const name = json.user?.name ?? "Unsplash";
    const profileUrl = json.user?.links?.html ?? "https://unsplash.com";

    return {
      url: regular,
      thumbUrl: json.urls?.thumb ?? regular,
      credit: `Photo by ${name} on Unsplash`,
      creditUrl: `${profileUrl}?utm_source=gravyblock&utm_medium=referral`,
      altDescription: json.alt_description ?? null,
    };
  } catch (err) {
    console.error("[unsplash] fetch error", { error: String(err) });
    return null;
  }
}
