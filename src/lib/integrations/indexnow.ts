/**
 * IndexNow — notifies Bing, Yandex, Naver, and Seznam of new/changed URLs.
 * Free protocol. NOTE: Google does NOT participate in IndexNow, but Bing powers
 * ChatGPT search, so this directly helps AI-search (GEO) visibility.
 *
 * Ownership is proven by hosting a key file at https://<host>/<key>.txt whose
 * contents equal the key. For gravyblock.com that file lives in /public.
 */

// Public key for gravyblock.com — hosted at /public/<this>.txt. Not a secret.
export const GRAVYBLOCK_INDEXNOW_KEY = "b7e2a4c9f1d84536ae0c7b9d2f6e1a83";

type PingParams = {
  host: string;            // e.g. "gravyblock.com"
  key: string;             // the IndexNow key for that host
  urls: string[];          // absolute URLs on that host
  keyLocation?: string;    // optional explicit key file URL
};

/**
 * Submit a batch of URLs to IndexNow. Returns true on accept (200/202).
 * Silently no-ops on empty input. Never throws — indexing is best-effort.
 */
export async function pingIndexNow(params: PingParams): Promise<boolean> {
  const { host, key, urls, keyLocation } = params;
  if (!urls.length) return false;

  // IndexNow accepts up to 10,000 URLs per request.
  const urlList = urls.slice(0, 10000);

  try {
    const res = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host,
        key,
        ...(keyLocation ? { keyLocation } : {}),
        urlList,
      }),
      signal: AbortSignal.timeout(8000),
    });
    // 200 = accepted, 202 = accepted/pending. Both are success.
    if (res.status === 200 || res.status === 202) return true;
    const body = await res.text().catch(() => "");
    console.warn("[indexnow] non-success", { host, status: res.status, body: body.slice(0, 160) });
    return false;
  } catch (err) {
    console.warn("[indexnow] ping failed", { host, error: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

/** Convenience: ping IndexNow for gravyblock.com's own URLs. */
export async function pingIndexNowForGravyblock(urls: string[]): Promise<boolean> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com";
  const host = new URL(siteUrl).host;
  return pingIndexNow({
    host,
    key: GRAVYBLOCK_INDEXNOW_KEY,
    keyLocation: `${siteUrl.replace(/\/$/, "")}/${GRAVYBLOCK_INDEXNOW_KEY}.txt`,
    urls,
  });
}
