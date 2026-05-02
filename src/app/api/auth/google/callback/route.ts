import { NextRequest, NextResponse } from "next/server";
import {
  verifyOauthStateToken,
  exchangeCodeForTokens,
  upsertGoogleConnection,
  getGoogleEmail,
} from "@/lib/integrations/google-oauth";

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") || "http://localhost:3000";
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
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

    return NextResponse.redirect(
      `${siteUrl()}/workspace/${businessId}?google_connected=1`,
    );
  } catch (err) {
    console.error("[google-callback] token exchange failed", err);
    return NextResponse.redirect(
      `${siteUrl()}/workspace/${businessId}?google_error=token_exchange`,
    );
  }
}
