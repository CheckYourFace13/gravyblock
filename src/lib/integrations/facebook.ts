/**
 * ─── Feature #9: Facebook & Instagram Auto-Posting ───────────────────────────
 * Facebook Graph API — post to a Facebook Page and its linked Instagram account.
 *
 * Requires per-business config fields:
 *   businessConfigs.facebookPageId     — the Page ID (not username)
 *   businessConfigs.facebookAccessToken — long-lived Page access token
 *   businessConfigs.instagramAccountId  — Instagram Business Account ID (linked to the Page)
 *
 * To get a long-lived Page access token:
 *   1. Create a Facebook App at developers.facebook.com
 *   2. Add "Pages" and "Instagram" permissions
 *   3. Generate a user token, then exchange for long-lived Page token
 *   Docs: https://developers.facebook.com/docs/pages/access-tokens
 *
 * Graph API version: v19.0
 */

const GRAPH = "https://graph.facebook.com/v19.0";

type FBPostResult = { ok: true; postId: string } | { ok: false; error: string; skipped?: boolean };

/**
 * Post a text update to a Facebook Page.
 */
export async function postToFacebookPage(params: {
  pageId: string;
  accessToken: string;
  message: string;
  link?: string; // Optional URL to attach
}): Promise<FBPostResult> {
  try {
    const body = new URLSearchParams({
      message: params.message,
      access_token: params.accessToken,
    });
    if (params.link) body.set("link", params.link);

    const res = await fetch(`${GRAPH}/${params.pageId}/feed`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    const json = (await res.json()) as { id?: string; error?: { message?: string } };

    if (!res.ok || json.error) {
      const msg = json.error?.message ?? `http_${res.status}`;
      console.error("[facebook] page post failed", { pageId: params.pageId, error: msg });
      return { ok: false, error: msg };
    }

    return { ok: true, postId: json.id ?? "" };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * Post a photo caption to Instagram via the Graph API.
 * Requires an imageUrl (publicly accessible) for Instagram media posts.
 * For caption-only posts we use a text-only approach via the linked Facebook Page.
 */
export async function postToInstagram(params: {
  igAccountId: string;
  accessToken: string;
  caption: string;
  imageUrl?: string;
}): Promise<FBPostResult> {
  try {
    // Step 1: Create a media container
    const mediaBody = new URLSearchParams({
      caption: params.caption,
      access_token: params.accessToken,
    });

    if (params.imageUrl) {
      mediaBody.set("image_url", params.imageUrl);
      mediaBody.set("media_type", "IMAGE");
    } else {
      // Instagram requires media — if no image, skip
      return { ok: false, error: "instagram_requires_image", skipped: true };
    }

    const createRes = await fetch(`${GRAPH}/${params.igAccountId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: mediaBody,
    });

    const createJson = (await createRes.json()) as { id?: string; error?: { message?: string } };
    if (!createRes.ok || createJson.error) {
      return { ok: false, error: createJson.error?.message ?? `http_${createRes.status}` };
    }

    const containerId = createJson.id;
    if (!containerId) return { ok: false, error: "no_container_id" };

    // Step 2: Publish the container
    const publishRes = await fetch(`${GRAPH}/${params.igAccountId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        creation_id: containerId,
        access_token: params.accessToken,
      }),
    });

    const publishJson = (await publishRes.json()) as { id?: string; error?: { message?: string } };
    if (!publishRes.ok || publishJson.error) {
      return { ok: false, error: publishJson.error?.message ?? `http_${publishRes.status}` };
    }

    return { ok: true, postId: publishJson.id ?? containerId };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
