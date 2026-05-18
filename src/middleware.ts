import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// WordPress paths left over from the old Hostinger WordPress install.
// Return 410 Gone so Google removes them from the index instead of
// re-crawling them forever as 404s.
const WP_GONE_PREFIXES = [
  "/wp-admin",
  "/wp-content",
  "/wp-includes",
  "/wp-json",
];

const WP_GONE_EXACT = new Set([
  "/wp-login.php",
  "/wp-cron.php",
  "/wp-config.php",
  "/wp-signup.php",
  "/wp-trackback.php",
  "/wp-activate.php",
  "/wp-comments-post.php",
  "/xmlrpc.php",
  "/get-installed",
]);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isWp =
    WP_GONE_EXACT.has(pathname) ||
    WP_GONE_PREFIXES.some((prefix) => pathname.startsWith(prefix + "/") || pathname === prefix);

  if (isWp) {
    return new NextResponse("Gone", { status: 410 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/wp-admin/:path*",
    "/wp-content/:path*",
    "/wp-includes/:path*",
    "/wp-json/:path*",
    "/wp-login.php",
    "/wp-cron.php",
    "/wp-config.php",
    "/wp-signup.php",
    "/wp-trackback.php",
    "/wp-activate.php",
    "/wp-comments-post.php",
    "/xmlrpc.php",
    "/get-installed",
  ],
};
