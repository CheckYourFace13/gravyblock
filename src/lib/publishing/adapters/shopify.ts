export type ShopifyConfig = {
  shopDomain: string; // e.g. mystore.myshopify.com
  accessToken: string;
  authorId?: string;
};

export type ShopifyPublishResult =
  | { ok: true; articleId: number; handle: string; url: string }
  | { ok: false; error: string };

export async function publishToShopify(
  config: ShopifyConfig,
  post: { title: string; content: string; tags?: string[] },
): Promise<ShopifyPublishResult> {
  const domain = config.shopDomain.replace(/\/$/, "");

  try {
    // Get the default blog (first one) to post into
    const blogRes = await fetch(`https://${domain}/admin/api/2024-01/blogs.json`, {
      headers: { "X-Shopify-Access-Token": config.accessToken },
    });
    if (!blogRes.ok) return { ok: false, error: `Shopify blog fetch failed: ${blogRes.status}` };
    const blogData = (await blogRes.json()) as { blogs?: Array<{ id: number }> };
    const blogId = blogData.blogs?.[0]?.id;
    if (!blogId) return { ok: false, error: "No Shopify blog found. Create a blog in your Shopify admin first." };

    const res = await fetch(`https://${domain}/admin/api/2024-01/blogs/${blogId}/articles.json`, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": config.accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        article: {
          title: post.title,
          body_html: post.content,
          published: true,
          tags: post.tags?.join(", ") ?? "",
          ...(config.authorId ? { author: config.authorId } : {}),
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `Shopify API ${res.status}: ${text.slice(0, 200)}` };
    }

    const data = (await res.json()) as { article?: { id: number; handle: string; url?: string } };
    const article = data.article;
    if (!article) return { ok: false, error: "Shopify returned no article data" };

    return {
      ok: true,
      articleId: article.id,
      handle: article.handle,
      url: `https://${domain}/blogs/${blogId}/${article.handle}`,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Shopify publish failed" };
  }
}

export function extractShopifyConfig(config: unknown): ShopifyConfig | null {
  if (typeof config !== "object" || !config) return null;
  const c = config as Record<string, unknown>;
  if (typeof c.shopDomain !== "string" || typeof c.accessToken !== "string") return null;
  return { shopDomain: c.shopDomain, accessToken: c.accessToken, authorId: typeof c.authorId === "string" ? c.authorId : undefined };
}

export async function testShopifyConnection(
  config: ShopifyConfig,
): Promise<{ ok: true; blogTitle: string; blogId: number } | { ok: false; error: string }> {
  const domain = config.shopDomain.replace(/\/$/, "");
  try {
    const res = await fetch(`https://${domain}/admin/api/2024-01/blogs.json`, {
      headers: { "X-Shopify-Access-Token": config.accessToken },
    });
    if (!res.ok) return { ok: false, error: `Shopify API ${res.status}: access denied or bad token` };
    const data = (await res.json()) as { blogs?: Array<{ id: number; title: string }> };
    const blog = data.blogs?.[0];
    if (!blog) return { ok: false, error: "No blogs found. Create a blog in your Shopify admin first." };
    return { ok: true, blogTitle: blog.title, blogId: blog.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Shopify connection test failed" };
  }
}
