import { randomBytes } from "node:crypto";
import { notFoundResponse, studioApiAuthorized } from "@/lib/marketing-studio/http";
import { makeYoutubeState, youtubeAuthorizeUrl, youtubeOAuthConfigured } from "@/lib/marketing-studio/publishing/oauth-youtube";

export const dynamic = "force-dynamic";

/**
 * Operator-only. Sends the browser to Google's own authorization page for ONE product and ONE expected channel. No credentials pass through
 * GravyBlock: the operator signs in, chooses the channel and approves the permissions on google.com itself.
 */
export async function GET(req: Request) {
  if (!(await studioApiAuthorized())) return notFoundResponse();
  if (!youtubeOAuthConfigured()) return new Response("YouTube connection is not set up yet (the Studio Google OAuth client is not configured).", { status: 503 });
  const url = new URL(req.url);
  const productId = url.searchParams.get("productId") ?? "";
  const channel = (url.searchParams.get("channel") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(productId)) return notFoundResponse();
  if (!/^@?[A-Za-z0-9._ -]{3,100}$/.test(channel)) return new Response("Give the exact channel handle or name you are connecting (3 to 100 letters, numbers, spaces, dots, dashes).", { status: 400 });
  const nonce = randomBytes(16).toString("hex");
  const res = new Response(null, { status: 302, headers: { location: youtubeAuthorizeUrl(makeYoutubeState(productId, channel, nonce)), "cache-control": "private, no-store" } });
  res.headers.append("set-cookie", `ms_yt_nonce=${nonce}; Path=/api/admin/marketing-studio/connect/youtube; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
  return res;
}
