import { NextRequest, NextResponse } from "next/server";
import { buildGoogleAuthUrl, isGoogleConfigured } from "@/lib/integrations/google-oauth";
import { canAccessBusiness } from "@/lib/auth/customer-auth";

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json({ error: "businessId required" }, { status: 400 });
  }

  const allowed = await canAccessBusiness(businessId);
  if (!allowed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  if (!isGoogleConfigured()) {
    return NextResponse.json({ error: "Google OAuth is not configured on this server." }, { status: 503 });
  }

  const authUrl = buildGoogleAuthUrl(businessId);
  return NextResponse.redirect(authUrl);
}
