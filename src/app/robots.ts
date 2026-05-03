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
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
