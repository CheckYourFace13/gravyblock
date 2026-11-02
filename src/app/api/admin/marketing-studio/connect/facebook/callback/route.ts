import { cookies } from "next/headers";
import { notFoundResponse, redirectTo, studioApiAuthorized } from "@/lib/marketing-studio/http";
import { completeFacebookOAuth, facebookOAuthConfigured, readState } from "@/lib/marketing-studio/publishing/oauth-facebook";
import { INTERNAL_SCOPE } from "@/lib/marketing-studio/scope";

export const dynamic = "force-dynamic";

/** Facebook sends the browser back here with a one-time code. Requires the operator session AND the signed, unexpired state. */
export async function GET(req: Request) {
  if (!(await studioApiAuthorized())) return notFoundResponse();
  if (!facebookOAuthConfigured()) return notFoundResponse();
  const url = new URL(req.url);
  const jar = await cookies();
  const nonce = jar.get("ms_fb_nonce")?.value ?? "";
  const state = readState(url.searchParams.get("state") ?? "", nonce);
  const back = (productId: string | null, msg: string) => redirectTo(productId ? `/admin/marketing-studio/products/${productId}?connect=${encodeURIComponent(msg.slice(0, 200))}` : `/admin/marketing-studio?connect=${encodeURIComponent(msg.slice(0, 200))}`);
  if (!state) return back(null, "The authorization link expired or was not started here. Nothing was connected.");
  if (url.searchParams.get("error")) return back(state.productId, "Facebook authorization was cancelled. Nothing was connected.");
  const code = url.searchParams.get("code");
  if (!code) return back(state.productId, "Facebook did not return an authorization code. Nothing was connected.");
  try {
    const out = await completeFacebookOAuth(INTERNAL_SCOPE, "admin", { productId: state.productId, code, expectedHandle: state.handle }, { fetch });
    const res = back(state.productId, `Connected Facebook Page: ${out.pageName}`);
    res.headers.append("set-cookie", "ms_fb_nonce=; Path=/api/admin/marketing-studio/connect/facebook; Max-Age=0");
    return res;
  } catch (e) {
    return back(state.productId, e instanceof Error ? e.message : "Connection failed. Nothing was connected.");
  }
}
