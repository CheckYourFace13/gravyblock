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
    images: [
      {
        url: "/brand/og.png",
        width: 1024,
        height: 1024,
        alt: "GravyBlock logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "GravyBlock",
    description: "AI-powered local growth autopilot for local, multi-location, and locally-positioned online businesses.",
    images: ["/brand/og.png"],
  },
  icons: {
    icon: [
      { url: "/brand/favicon.png", type: "image/png" },
      { url: "/brand/logo.png", type: "image/png" },
    ],
    apple: [{ url: "/brand/favicon.png", type: "image/png" }],
  },
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
