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
    "GravyBlock automates local SEO for small businesses. Publish website content written from your own site's facts, post weekly to your Google Business Profile, reply to Google reviews, run personalized local outreach, and check AI search visibility. Start with a free business scan.",
  openGraph: {
    title: "GravyBlock: Local SEO Autopilot",
    description: "Automated local SEO for small businesses. Website content, Google Business Profile posts, review replies, local outreach, and AI search checks.",
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
        "GravyBlock automates local SEO for small businesses. Publish website content written from your own site's facts, post weekly to your Google Business Profile, reply to Google reviews, run personalized local outreach, and check AI search visibility.",
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: "USD",
        lowPrice: "59.99",
        highPrice: "299.99",
        offerCount: "3",
      },
      featureList: [
        "Website articles and service pages published to a connected WordPress, Webflow or Shopify site",
        "Weekly Google Business Profile posts and photos",
        "Automatic replies to Google reviews",
        "Automatic review requests to real completed customers, once a booking or invoicing system is connected",
        "Facebook and Instagram posting from your own content",
        "Personalized outreach to relevant local organizations; a link is counted only once verified live",
        "Citation consistency checks and drift alerts",
        "Local map ranking checks",
        "AI search visibility checks",
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
