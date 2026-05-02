/**
 * Reddit API client — Resource Owner Password Credentials (ROPC) flow.
 *
 * Uses a single GravyBlock Reddit "script" app.
 * Required env vars:
 *   REDDIT_CLIENT_ID      — from reddit.com/prefs/apps (script app)
 *   REDDIT_CLIENT_SECRET  — from same app
 *   REDDIT_USERNAME       — the Reddit account that posts
 *   REDDIT_PASSWORD       — password for that account
 *
 * Reddit API docs: https://www.reddit.com/dev/api/
 * Rate limit: 100 requests / 10 min per OAuth token.
 */

const USER_AGENT = "GravyBlock/1.0 (automated local visibility content; contact support@gravyblock.com)";

type RedditTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

type RedditSubmitResponse = {
  json: {
    errors: string[][];
    data?: {
      url?: string;
      id?: string;
      name?: string;
    };
  };
};

let _cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const username = process.env.REDDIT_USERNAME;
  const password = process.env.REDDIT_PASSWORD;

  if (!clientId || !clientSecret || !username || !password) return null;

  // Return cached token if still valid (with 60s buffer)
  if (_cachedToken && _cachedToken.expiresAt > Date.now() + 60_000) {
    return _cachedToken.token;
  }

  try {
    const res = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
      },
      body: new URLSearchParams({
        grant_type: "password",
        username,
        password,
      }),
    });

    if (!res.ok) {
      console.error("[reddit] token request failed", { status: res.status });
      return null;
    }

    const json = (await res.json()) as RedditTokenResponse;
    if (!json.access_token) return null;

    _cachedToken = {
      token: json.access_token,
      expiresAt: Date.now() + json.expires_in * 1000,
    };

    return json.access_token;
  } catch (err) {
    console.error("[reddit] token fetch error", { error: String(err) });
    return null;
  }
}

export type RedditPostResult =
  | { ok: true; postUrl: string; postId: string }
  | { ok: false; error: string; skipped?: boolean };

/**
 * Submit a self (text) post to Reddit.
 * Returns the post URL on success.
 */
export async function submitRedditPost(params: {
  subreddit: string;
  title: string;
  text: string;
}): Promise<RedditPostResult> {
  const token = await getAccessToken();
  if (!token) {
    return { ok: false, error: "no_credentials", skipped: true };
  }

  // Trim post text — Reddit self posts max 40,000 chars
  const text = params.text.slice(0, 40_000);

  try {
    const res = await fetch("https://oauth.reddit.com/api/submit", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
      },
      body: new URLSearchParams({
        sr: params.subreddit,
        kind: "self",
        title: params.title,
        text,
        nsfw: "false",
        spoiler: "false",
        resubmit: "true",
        sendreplies: "false",
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[reddit] submit failed", { subreddit: params.subreddit, status: res.status, body });
      return { ok: false, error: `http_${res.status}` };
    }

    const json = (await res.json()) as RedditSubmitResponse;

    if (json.json.errors && json.json.errors.length > 0) {
      const errMsg = json.json.errors.map((e) => e.join(":")).join(", ");
      console.error("[reddit] submit api error", { subreddit: params.subreddit, errors: json.json.errors });
      return { ok: false, error: errMsg };
    }

    const postUrl = json.json.data?.url ?? `https://reddit.com/r/${params.subreddit}`;
    const postId = json.json.data?.id ?? json.json.data?.name ?? "";

    return { ok: true, postUrl, postId };
  } catch (err) {
    console.error("[reddit] submit fetch error", { subreddit: params.subreddit, error: String(err) });
    return { ok: false, error: String(err) };
  }
}

/**
 * Check if Reddit credentials are configured.
 */
export function redditConfigured(): boolean {
  return Boolean(
    process.env.REDDIT_CLIENT_ID &&
    process.env.REDDIT_CLIENT_SECRET &&
    process.env.REDDIT_USERNAME &&
    process.env.REDDIT_PASSWORD,
  );
}

// ─── Subreddit selection ─────────────────────────────────────────────────────
// Maps industry vertical / category to subreddits that allow helpful community posts.
// City subreddits are tried first for local businesses.

const INDUSTRY_SUBREDDIT_MAP: Record<string, string> = {
  restaurant: "food",
  bar: "food",
  cafe: "coffee",
  coffee: "coffee",
  food: "food",
  hotel: "travel",
  gym: "Fitness",
  fitness: "Fitness",
  yoga: "yoga",
  salon: "Hair",
  beauty: "beauty",
  spa: "beauty",
  dentist: "Dentistry",
  dental: "Dentistry",
  doctor: "medicine",
  medical: "medicine",
  clinic: "medicine",
  legal: "legaladvice",
  lawyer: "legaladvice",
  attorney: "legaladvice",
  law: "legaladvice",
  financial: "personalfinance",
  finance: "personalfinance",
  insurance: "Insurance",
  accounting: "Accounting",
  real_estate: "RealEstate",
  realty: "RealEstate",
  mortgage: "RealEstate",
  plumber: "HomeImprovement",
  plumbing: "HomeImprovement",
  electrician: "HomeImprovement",
  hvac: "HomeImprovement",
  roofing: "HomeImprovement",
  home_services: "HomeImprovement",
  contractor: "HomeImprovement",
  construction: "HomeImprovement",
  landscaping: "landscaping",
  auto: "MechanicAdvice",
  automotive: "MechanicAdvice",
  mechanic: "MechanicAdvice",
  pet: "pets",
  veterinary: "AskVet",
  photography: "photography",
  marketing: "marketing",
  tech: "technology",
  software: "SaaS",
};

/**
 * Select the most appropriate subreddit for a business.
 * Prefers city-level subreddits for local businesses; falls back to industry.
 */
export function selectSubreddit(params: {
  city: string | null;
  vertical: string | null;
  primaryCategory: string | null;
  focusArea?: "local" | "regional" | "national" | "online";
}): string {
  const isLocal = !params.focusArea || params.focusArea === "local" || params.focusArea === "regional";

  // Normalise city name to simple lowercase slug
  if (isLocal && params.city) {
    const citySlug = params.city
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    if (citySlug.length >= 3) {
      return citySlug; // e.g., "austin", "portland", "losangeles"
    }
  }

  // Fallback: industry-based subreddit
  const haystack = [params.vertical, params.primaryCategory]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  for (const [keyword, subreddit] of Object.entries(INDUSTRY_SUBREDDIT_MAP)) {
    if (haystack.includes(keyword)) return subreddit;
  }

  return "smallbusiness"; // safe universal fallback
}
