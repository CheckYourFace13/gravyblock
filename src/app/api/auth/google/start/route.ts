import { NextRequest, NextResponse } from "next/server";
import { buildGoogleAuthUrl, isGoogleConfigured } from "@/lib/integrations/google-oauth";
import { canAccessBusiness } from "@/lib/auth/customer-auth";
import { isAdminSession } from "@/lib/auth/admin-session";
import { isHouseAccount } from "@/lib/integrations/house-google";

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json({ error: "businessId required" }, { status: 400 });
  }

  // A signed-in customer may connect their own business. The signed-in operator (admin session) may connect House Accounts only, never a customer's business.
  const allowed = (await canAccessBusiness(businessId)) || ((await isAdminSession()) && (await isHouseAccount(businessId)));
  if (!allowed) {
    // An operator who is simply not signed in gets sent to the admin sign-in instead of a bare JSON error.
    if ((await isHouseAccount(businessId)) && !(await isAdminSession())) {
      // Behind the reverse proxy the request origin is the internal address, so use the public site URL.
      const base = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(//$/, "") || "https://gravyblock.com";
      const login = new URL("/admin/login", base);
      login.searchParams.set("next", `/admin/house`);
      return NextResponse.redirect(login);
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  if (!isGoogleConfigured()) {
    return NextResponse.json({ error: "Google OAuth is not configured on this server." }, { status: 503 });
  }

  const authUrl = buildGoogleAuthUrl(businessId);
  return NextResponse.redirect(authUrl);
}
