export type WebflowConfig = {
  siteId: string;
  collectionId: string;
  apiToken: string;
};

export type WebflowPublishResult =
  | { ok: true; itemId: string; slug: string }
  | { ok: false; error: string };

export async function publishToWebflow(
  config: WebflowConfig,
  post: { title: string; content: string; slug?: string },
): Promise<WebflowPublishResult> {
  const slug = post.slug ?? post.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  try {
    const res = await fetch(
      `https://api.webflow.com/v2/collections/${config.collectionId}/items`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiToken}`,
          "Content-Type": "application/json",
          "accept-version": "2.0.0",
        },
        body: JSON.stringify({
          isArchived: false,
          isDraft: false,
          fieldData: {
            name: post.title,
            slug,
            "post-body": post.content,
          },
        }),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `Webflow API ${res.status}: ${text.slice(0, 200)}` };
    }

    const data = (await res.json()) as { id: string; fieldData?: { slug?: string } };
    return { ok: true, itemId: data.id, slug: data.fieldData?.slug ?? slug };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Webflow publish failed" };
  }
}

export function extractWebflowConfig(config: unknown): WebflowConfig | null {
  if (typeof config !== "object" || !config) return null;
  const c = config as Record<string, unknown>;
  if (typeof c.siteId !== "string" || typeof c.collectionId !== "string" || typeof c.apiToken !== "string") return null;
  return { siteId: c.siteId, collectionId: c.collectionId, apiToken: c.apiToken };
}

export async function testWebflowConnection(
  config: WebflowConfig,
): Promise<{ ok: true; collectionName: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(`https://api.webflow.com/v2/collections/${config.collectionId}`, {
      headers: { Authorization: `Bearer ${config.apiToken}`, "accept-version": "2.0.0" },
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `Webflow API ${res.status}: ${text.slice(0, 200)}` };
    }
    const data = (await res.json()) as { displayName?: string };
    return { ok: true, collectionName: data.displayName ?? "Webflow collection" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Webflow connection test failed" };
  }
}
