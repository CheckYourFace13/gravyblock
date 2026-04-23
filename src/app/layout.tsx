import type { Metadata, Viewport } from "next";
import { DM_Sans, Outfit } from "next/font/google";
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
  title: {
    default: "GravyBlock — Autopilot growth for local and multi-location businesses",
    template: "%s — GravyBlock",
  },
  description:
    "Autopilot growth for local businesses, multi-location brands, service-area operators, and online businesses building local trust — scans, execution queues, publishing workflows, and recurring visibility monitoring.",
  openGraph: {
    title: "GravyBlock",
    description: "AI-powered local growth autopilot for local, multi-location, and locally-positioned online businesses.",
    url: siteUrl,
    siteName: "GravyBlock",
    locale: "en_US",
    type: "website",
    // Images: use `src/app/opengraph-image.png` (Next serves it automatically). Do not set broken `/brand/*` URLs here.
  },
  twitter: {
    card: "summary_large_image",
    title: "GravyBlock",
    description: "AI-powered local growth autopilot for local, multi-location, and locally-positioned online businesses.",
    // Images: use `src/app/twitter-image.png` via file convention — avoids conflicting metadata.
  },
  // Icons: use `src/app/icon.png`, `favicon.ico`, and `apple-icon.png` (App Router file convention). No `icons` key — explicit `/brand/*` paths were 404ing on Hostinger because those files are not in /public.
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} h-full antialiased`}>
      <body className="min-h-dvh bg-zinc-50 text-zinc-900">{children}</body>
    </html>
  );
}
