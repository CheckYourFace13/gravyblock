import { cookies } from "next/headers";
import { notFoundResponse, redirectTo, redirectWithCookie, studioApiAuthorized } from "@/lib/marketing-studio/http";
import { completeYoutubeOAuth, readYoutubeState, youtubeOAuthConfigured } from "@/lib/marketing-studio/publishing/oauth-youtube";
import { INTERNAL_SCOPE } from "@/lib/marketing-studio/scope";

export const dynamic = "force-dynamic";

/** Google sends the browser back here with a one-time code. Requires the operator session AND the signed, unexpired state. */
export async function GET(req: Request) {
  if (!(await studioApiAuthorized())) return notFoundResponse();
  if (!youtubeOAuthConfigured()) return notFoundResponse();
  const url = new URL(req.url);
  const jar = await cookies();
  const nonce = jar.get("ms_yt_nonce")?.value ?? "";
  const state = readYoutubeState(url.searchParams.get("state") ?? "", nonce);
  const back = (productId: string | null, msg: string) => redirectTo(productId ? `/admin/marketing-studio/products/${productId}?connect=${encodeURIComponent(msg.slice(0, 240))}` : `/admin/marketing-studio?connect=${encodeURIComponent(msg.slice(0, 240))}`);
  if (!state) return back(null, "The authorization link expired or was not started here. Nothing was connected.");
  if (url.searchParams.get("error")) return back(state.productId, "YouTube authorization was cancelled. Nothing was connected.");
  const code = url.searchParams.get("code");
  if (!code) return back(state.productId, "Google did not return an authorization code. Nothing was connected.");
  try {
    const out = await completeYoutubeOAuth(INTERNAL_SCOPE, "admin", { productId: state.productId, code, expectedChannel: state.expected }, { fetch });
    const msg = `Connected YouTube channel: ${out.channelTitle}${out.channelHandle ? ` (${out.channelHandle})` : ""}, channel id ${out.channelId}`;
    return redirectWithCookie(`/admin/marketing-studio/products/${state.productId}?connect=${encodeURIComponent(msg.slice(0, 240))}`, "ms_yt_nonce=; Path=/api/admin/marketing-studio/connect/youtube; Max-Age=0");
  } catch (e) {
    return back(state.productId, e instanceof Error ? e.message : "Connection failed. Nothing was connected.");
  }
}
