import { type NextRequest, NextResponse } from "next/server";
import { completeMagicLogin } from "@/lib/auth/customer-auth";

export const dynamic = "force-dynamic";

function siteBase() {
  // Always use the public site URL for redirects — request.url may be
  // localhost:3000 when running behind an nginx reverse proxy.
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim();
  const base = siteBase();

  if (!token) {
    return NextResponse.redirect(`${base}/login`);
  }

  const result = await completeMagicLogin(token);
  if (!result) {
    return NextResponse.redirect(`${base}/login?error=expired`);
  }

  if (result.redirectTo && result.redirectTo !== "/app") {
    return NextResponse.redirect(`${base}${result.redirectTo}`);
  }
  if (result.businesses.length === 1) {
    return NextResponse.redirect(`${base}/workspace/${result.businesses[0].id}`);
  }
  return NextResponse.redirect(`${base}/app`);
}
