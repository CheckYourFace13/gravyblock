import { randomBytes } from "node:crypto";
import { notFoundResponse, studioApiAuthorized } from "@/lib/marketing-studio/http";
import { authorizeUrl, facebookOAuthConfigured, makeState } from "@/lib/marketing-studio/publishing/oauth-facebook";

export const dynamic = "force-dynamic";

/**
 * Operator-only. Sends the browser to Facebook's own authorization page for ONE product. No credentials pass through GravyBlock:
 * the operator signs in and approves the permissions on facebook.com itself.
 */
export async function GET(req: Request) {
  if (!(await studioApiAuthorized())) return notFoundResponse();
  if (!facebookOAuthConfigured()) return new Response("Facebook connection is not set up yet (the Studio Meta app is not configured).", { status: 503 });
  const url = new URL(req.url);
  const productId = url.searchParams.get("productId") ?? "";
  const handle = url.searchParams.get("handle");
  if (!/^[0-9a-f-]{36}$/i.test(productId)) return notFoundResponse();
  if (handle && !/^[A-Za-z0-9._-]{3,80}$/.test(handle)) return new Response("Invalid page handle", { status: 400 });
  const nonce = randomBytes(16).toString("hex");
  const res = new Response(null, { status: 302, headers: { location: authorizeUrl(makeState(productId, handle || null, nonce)), "cache-control": "private, no-store" } });
  res.headers.append("set-cookie", `ms_fb_nonce=${nonce}; Path=/api/admin/marketing-studio/connect/facebook; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
  return res;
}
