import { type NextRequest, NextResponse } from "next/server";
import { completeMagicLogin } from "@/lib/auth/customer-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const result = await completeMagicLogin(token);
  if (!result) {
    return NextResponse.redirect(new URL("/login?error=expired", request.url));
  }

  if (result.redirectTo && result.redirectTo !== "/app") {
    return NextResponse.redirect(new URL(result.redirectTo, request.url));
  }
  if (result.businesses.length === 1) {
    return NextResponse.redirect(new URL(`/workspace/${result.businesses[0].id}`, request.url));
  }
  return NextResponse.redirect(new URL("/app", request.url));
}
