export type WordPressConfig = {
  siteUrl: string;
  username: string;
  appPassword: string;
};

export type WordPressPublishResult =
  | { ok: true; postId: number; postUrl: string }
  | { ok: false; error: string };

export async function publishToWordPress(
  config: WordPressConfig,
  post: { title: string; content: string; status?: "publish" | "draft" },
): Promise<WordPressPublishResult> {
  const endpoint = `${config.siteUrl.replace(/\/$/, "")}/wp-json/wp/v2/posts`;
  const credentials = Buffer.from(`${config.username}:${config.appPassword}`).toString("base64");

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: post.title,
        content: post.content,
        status: post.status ?? "publish",
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `WordPress API ${res.status}: ${text.slice(0, 200)}` };
    }

    const data = (await res.json()) as { id: number; link: string };
    return { ok: true, postId: data.id, postUrl: data.link };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "WordPress publish failed",
    };
  }
}

export function extractWordPressConfig(config: unknown): WordPressConfig | null {
  if (typeof config !== "object" || !config) return null;
  const c = config as Record<string, unknown>;
  if (typeof c.siteUrl !== "string" || typeof c.username !== "string" || typeof c.appPassword !== "string") {
    return null;
  }
  return { siteUrl: c.siteUrl, username: c.username, appPassword: c.appPassword };
}
