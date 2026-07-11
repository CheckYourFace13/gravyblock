import type { Metadata, Viewport } from "next";
import { DM_Sans, Outfit } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const display = Outfit({
  variable: "--font-display",
  subsets: ["latin"],
});

const sans = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "GravyBlock",
  verification: {
    google: "Lv6BrfThu3YFT5SXXvzS5JaZ-w2-j_wt5h5tFm_JPWI",
  },
  title: {
    default: "GravyBlock: Local SEO Autopilot for Small Businesses",
    template: "%s | GravyBlock",
  },
  description:
    "GravyBlock automates local SEO for small businesses. Publish content, build backlinks, manage reviews, keep your Google Business Profile active, and monitor AI search visibility. Start with a free business scan.",
  openGraph: {
    title: "GravyBlock: Local SEO Autopilot",
    description: "Automated local SEO for small businesses. Content, reviews, backlinks, Google Business Profile posts, and AI search monitoring on autopilot.",
    url: siteUrl,
    siteName: "GravyBlock",
    locale: "en_US",
    type: "website",
    images: [{ url: "/brand/og.png", width: 1024, height: 1024, alt: "GravyBlock" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "GravyBlock",
    description: "AI-powered local growth autopilot for local, multi-location, and locally-positioned online businesses.",
    images: ["/brand/og.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/brand/favicon.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/brand/favicon.png", type: "image/png", sizes: "512x512" }],
    shortcut: ["/favicon.ico"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
};

const schemaOrg = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "GravyBlock",
      url: "https://gravyblock.com",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description:
        "GravyBlock automates local SEO for small businesses. Publish AI-written content, build backlinks, manage reviews, keep your Google Business Profile active, and monitor AI search visibility. All on autopilot.",
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: "USD",
        lowPrice: "0",
        highPrice: "299.99",
        offerCount: "4",
      },
      featureList: [
        "AI content writing and publishing",
        "Google Search Console rank tracking",
        "Google Business Profile posts, photos, and Q&A",
        "Facebook and Instagram auto-posting",
        "Backlink outreach automation",
        "Review monitoring and AI reply drafts",
        "Citation and listing audit",
        "GEO audit score for AI search visibility",
        "Site tech audit",
        "Brand voice configuration",
        "Topic cluster content strategy",
        "Content calendar",
      ],
      screenshot: "https://gravyblock.com/brand/og.png",
      author: {
        "@type": "Organization",
        name: "GravyBlock",
        url: "https://gravyblock.com",
      },
    },
    {
      "@type": "Organization",
      name: "GravyBlock",
      url: "https://gravyblock.com",
      logo: "https://gravyblock.com/brand/favicon.png",
      sameAs: [
        "https://twitter.com/gravyblock",
        "https://www.linkedin.com/company/gravyblock",
      ],
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: "support@gravyblock.com",
      },
    },
    {
      "@type": "WebSite",
      name: "GravyBlock",
      url: "https://gravyblock.com",
      potentialAction: {
        "@type": "SearchAction",
        target: "https://gravyblock.com/scan?q={search_term_string}",
        "query-input": "required name=search_term_string",
      },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} h-full antialiased`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaOrg) }}
        />
      </head>
      <body className="min-h-dvh bg-zinc-50 text-zinc-900">
        {children}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-6THEWE2M89"
          strategy="afterInteractive"
        />
        <Script id="ga4-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-6THEWE2M89');
          `}
        </Script>
      </body>
    </html>
  );
}
