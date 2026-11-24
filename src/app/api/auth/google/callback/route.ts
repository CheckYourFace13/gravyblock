import { NextRequest, NextResponse } from "next/server";
import {
  verifyOauthStateToken,
  exchangeCodeForTokens,
  upsertGoogleConnection,
  getGoogleEmail,
} from "@/lib/integrations/google-oauth";
import { fanOutHouseGoogleConnection, isHouseAccount } from "@/lib/integrations/house-google";

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") || "http://localhost:3000";
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    const st = state ? verifyOauthStateToken(state) : null;
    if (st && (await isHouseAccount(st.businessId))) return NextResponse.redirect(`${siteUrl()}/admin/house?google=error&reason=${encodeURIComponent(error)}`);
    return NextResponse.redirect(`${siteUrl()}/app?google_error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${siteUrl()}/app?google_error=missing_params`);
  }

  const verified = verifyOauthStateToken(state);
  if (!verified) {
    return NextResponse.redirect(`${siteUrl()}/app?google_error=invalid_state`);
  }

  const { businessId } = verified;

  try {
    const tokens = await exchangeCodeForTokens(code);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    const googleEmail = await getGoogleEmail(tokens.access_token);

    await upsertGoogleConnection({
      businessId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? "",
      expiresAt,
      scopes: tokens.scope,
      googleEmail,
    });

    // House accounts only: reuse this one authorization for the other house accounts and match their Search Console properties. A customer is never fanned out.
    const fan = await fanOutHouseGoogleConnection(businessId).catch((e) => {
      console.error("[google-callback] house fan-out failed", e);
      return null;
    });
    if (fan) console.info("[google-callback] house Google fan-out", { copiedTo: fan.copiedTo, matched: fan.matched.length, missing: fan.notInGoogleAccount });

    // The operator returns to the admin House page, not a customer workspace.
    if (fan) {
      const missing = encodeURIComponent(fan.notInGoogleAccount.join(", ").slice(0, 400));
      return NextResponse.redirect(`${siteUrl()}/admin/house?google=connected&matched=${fan.matched.length}&missing=${missing}`);
    }
    return NextResponse.redirect(
      `${siteUrl()}/workspace/${businessId}?google_connected=1`,
    );
  } catch (err) {
    if (await isHouseAccount(businessId)) return NextResponse.redirect(`${siteUrl()}/admin/house?google=error&reason=token_exchange`);
    console.error("[google-callback] token exchange failed", err);
    return NextResponse.redirect(
      `${siteUrl()}/workspace/${businessId}?google_error=token_exchange`,
    );
  }
}
