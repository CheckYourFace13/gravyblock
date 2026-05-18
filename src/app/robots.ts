import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin/",
          "/workspace/",
          "/api/",
          "/setup/",
          "/login/verify",
          // WordPress paths — site is not WordPress, these never exist
          "/wp-admin/",
          "/wp-content/",
          "/wp-includes/",
          "/wp-json/",
          "/wp-login.php",
          "/wp-cron.php",
          "/wp-config.php",
          "/xmlrpc.php",
          "/get-installed",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
