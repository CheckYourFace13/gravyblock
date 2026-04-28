/**
 * WordPress REST API adapter for auto-publishing content.
 * Requires the business owner to set up an Application Password in their WP admin.
 *
 * Config stored in publishingTargets.config JSONB:
 *   { siteUrl: "https://example.com", username: "admin", appPassword: "xxxx xxxx xxxx" }
 */

export type WordPressConfig = {
  siteUrl: string;
  username: string;
  appPassword: string;
};

export type WordPressPublishResult =
  | { ok: true; postId: number; postUrl: string }
  | { ok: false; error: string };

function markdownToHtml(markdown: string): string {
  // Basic markdown → HTML: headings, bold, paragraphs, line breaks
  return markdown
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(?!<[h|p])(.+)$/gm, "<p>$1</p>")
    .replace(/<p><\/p>/g, "")
    .trim();
}

export async function publishToWordPress(params: {
  config: WordPressConfig;
  title: string;
  body: string;
  status?: "publish" | "draft";
  categories?: number[];
  tags?: string[];
}): Promise<WordPressPublishResult> {
  const { config, title, body, status = "publish" } = params;

  const siteUrl = config.siteUrl.replace(/\/$/, "");
  const endpoint = `${siteUrl}/wp-json/wp/v2/posts`;

  // WordPress Application Passwords use basic auth: username:app-password
  const credentials = Buffer.from(`${config.username}:${config.appPassword}`).toString("base64");

  const htmlContent = markdownToHtml(body);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Basic ${credentials}`,
      },
      body: JSON.stringify({
        title,
        content: htmlContent,
        status,
        comment_status: "open",
        ping_status: "closed",
      }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string; code?: string };
      return { ok: false, error: err.message ?? `WordPress API returned ${res.status}` };
    }

    const post = (await res.json()) as { id: number; link: string };
    return { ok: true, postId: post.id, postUrl: post.link };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "WordPress publish failed" };
  }
}

export async function testWordPressConnection(config: WordPressConfig): Promise<{ ok: boolean; error?: string; siteName?: string }> {
  const siteUrl = config.siteUrl.replace(/\/$/, "");
  const credentials = Buffer.from(`${config.username}:${config.appPassword}`).toString("base64");

  try {
    const res = await fetch(`${siteUrl}/wp-json/wp/v2/users/me`, {
      headers: { authorization: `Basic ${credentials}` },
      cache: "no-store",
    });

    if (res.status === 401) return { ok: false, error: "Invalid credentials. Check username and application password." };
    if (res.status === 404) return { ok: false, error: "WordPress REST API not found. Make sure the site uses WordPress and REST API is enabled." };
    if (!res.ok) return { ok: false, error: `Connection failed (${res.status})` };

    const siteRes = await fetch(`${siteUrl}/wp-json`, { cache: "no-store" });
    const siteData = (await siteRes.json().catch(() => ({}))) as { name?: string };

    return { ok: true, siteName: siteData.name };
  } catch {
    return { ok: false, error: "Could not reach the WordPress site. Check the URL." };
  }
}
