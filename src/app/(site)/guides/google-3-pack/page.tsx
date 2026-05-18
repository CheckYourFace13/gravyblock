import type { Metadata } from "next";
import Link from "next/link";
import { GuideShell } from "@/components/guide-shell";

export const metadata: Metadata = {
  title: "What is the Google 3-Pack? Local Map Pack Explained | GravyBlock",
  description:
    "The Google 3-Pack (or map pack) shows the top 3 local businesses in search results. Learn what it is, why it matters, and how to rank in it — with a free scan.",
  alternates: { canonical: "/guides/google-3-pack" },
  openGraph: {
    title: "What is the Google 3-Pack? Local Map Pack Explained",
    description: "The 3-Pack shows the top 3 local businesses for any service search. Here's how to get in it.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is the Google 3-Pack?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The Google 3-Pack (also called the Local Pack or Map Pack) is the set of three local business listings that appears at the top of Google search results when someone searches for a local service — like 'plumber near me' or 'best pizza in Austin'. It includes a map, star ratings, business hours, and a link to call.",
      },
    },
    {
      "@type": "Question",
      name: "How do I rank in the Google 3-Pack?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "To rank in the Google 3-Pack, you need: (1) a complete and verified Google Business Profile, (2) consistent NAP (name, address, phone) citations across the web, (3) recent and positive Google reviews, (4) relevant local content on your website, and (5) proximity to the searcher. Tools like GravyBlock automate most of this work.",
      },
    },
    {
      "@type": "Question",
      name: "What is the difference between the 3-Pack and organic search results?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The Google 3-Pack is powered by Google Business Profile and local signals (reviews, proximity, citations). Organic results are driven by website SEO (content, backlinks, technical factors). Businesses can appear in both simultaneously. The 3-Pack appears above organic results and captures the majority of local search clicks.",
      },
    },
  ],
};

export default function Google3PackGuidePage() {
  return (
    <>
      <GuideShell
        title="What is the Google 3-Pack (and how do you get in it)?"
        intro="When someone searches 'plumber near me' or 'best dentist in Chicago,' the first thing they see isn't ads or blog posts — it's a map with three businesses on it. That's the Google 3-Pack, and getting into it is the single highest-leverage move in local SEO."
        related={[
          { href: "/guides/how-to-rank-higher-in-google-maps", label: "How to rank higher in Google Maps" },
          { href: "/guides/ai-search-local-businesses", label: "AI search visibility for local businesses" },
          { href: "/guides/multi-location-local-seo", label: "Multi-location local SEO" },
          { href: "/scan", label: "Run a free visibility scan" },
        ]}
      >
        <h2>What is the Google 3-Pack?</h2>
        <p>
          The <strong>Google 3-Pack</strong> — also called the <strong>Local Pack</strong>, <strong>Map Pack</strong>,
          or <strong>Google Local Pack</strong> — is the box that appears at the top of Google search results for
          local queries. It shows three business listings, each with:
        </p>
        <ul>
          <li>Business name and category</li>
          <li>Star rating and review count</li>
          <li>Address and distance from the searcher</li>
          <li>Phone number (click-to-call on mobile)</li>
          <li>Link to the full Google Business Profile</li>
          <li>A mini-map showing the business location</li>
        </ul>
        <p>
          Studies consistently show that the 3-Pack captures 44–56% of all clicks on a local search results
          page. Businesses outside the top 3 — including those ranked #4 and below — receive a tiny fraction
          of that traffic.
        </p>

        <h2>Why does Google show only 3 results?</h2>
        <p>
          Google limits the pack to three results because that's what fits cleanly on mobile screens
          (where over 60% of local searches happen) without requiring the user to scroll. A "More places"
          link expands to a full Local Finder view, but very few users click it. Position 1, 2, or 3 in
          the 3-Pack is effectively the entire game for local visibility.
        </p>

        <h2>How does Google decide who gets in the 3-Pack?</h2>
        <p>
          Google's algorithm for the 3-Pack weighs three main factors:
        </p>
        <h3>1. Relevance</h3>
        <p>
          Does your Google Business Profile (GBP) category, description, and services match what the searcher
          is looking for? A plumber with a complete profile listing "emergency pipe repair," "water heater
          installation," and "drain cleaning" as services will outrank one whose profile just says "Plumbing."
        </p>
        <h3>2. Proximity</h3>
        <p>
          How close is your business to the searcher (or the location they typed)? You can't move your
          business, but you can make sure your address is consistent everywhere and that you have a service
          area set correctly in your GBP.
        </p>
        <h3>3. Prominence</h3>
        <p>
          How well-known and trusted is your business on the web? This is where local SEO work pays off:
        </p>
        <ul>
          <li>Number and recency of Google reviews</li>
          <li>Average star rating</li>
          <li>Citations (consistent name/address/phone across directories)</li>
          <li>Links from local websites and news</li>
          <li>Content on your own website mentioning your city and services</li>
        </ul>

        <h2>How to rank in the Google 3-Pack</h2>
        <p>
          There's no shortcut, but there is a repeatable playbook that works for almost every local business:
        </p>
        <h3>Step 1: Complete your Google Business Profile</h3>
        <p>
          Claim and verify your listing if you haven't. Then fill in every field: primary and secondary
          categories, all services you offer, business description (use your city and main services naturally),
          hours, photos (exterior, interior, team), and Q&amp;A. Incomplete profiles rank significantly lower.
        </p>
        <h3>Step 2: Build and clean up citations</h3>
        <p>
          Your business name, address, and phone (NAP) should match exactly across Google, Yelp, Apple Maps,
          Bing, Facebook, and 50+ local directories. Mismatches confuse Google's algorithm and hurt prominence.
          GravyBlock audits citations automatically and queues fixes.
        </p>
        <h3>Step 3: Grow your Google reviews</h3>
        <p>
          Ask every satisfied customer for a review — in person, by email, or by text. The recency of
          reviews matters as much as the volume. A business that gets 5 new reviews per month consistently
          will outrank a competitor with more total reviews but nothing recent.
        </p>
        <h3>Step 4: Publish local content on your website</h3>
        <p>
          Google uses your website as a relevance signal. Pages that mention your city, services, and
          neighborhood — naturally and helpfully — reinforce your local relevance. Weekly blog posts
          targeting "[service] in [city]" queries compound over time.
        </p>
        <h3>Step 5: Earn local links and mentions</h3>
        <p>
          Links from local news sites, community blogs, chamber of commerce directories, and industry
          associations build your prominence score. Even unlinked mentions of your business name and city
          on authoritative sites help.
        </p>

        <h2>The 3-Pack vs. organic results: do you need both?</h2>
        <p>
          Yes — and they reinforce each other. The 3-Pack is powered by your Google Business Profile.
          Organic results are powered by your website's SEO. Both help. A business appearing in the
          3-Pack <em>and</em> in the top 3 organic results for the same query dominates the page.
          The content you publish to rank organically also signals relevance to the 3-Pack algorithm.
        </p>

        <h2>How AI assistants are changing the 3-Pack</h2>
        <p>
          As of 2025–2026, ChatGPT, Perplexity, and Google's AI Overviews increasingly answer "best
          [service] near me" queries by recommending specific businesses. These AI answers pull from
          Google Business Profile data, local content, and review signals — the same signals that
          drive 3-Pack rankings. Optimizing for the 3-Pack and optimizing for AI recommendations are
          now almost the same task.
        </p>
        <p>
          GravyBlock tracks your AI search visibility alongside your Google Maps rankings so you can
          see both in one place.{" "}
          <Link href="/scan">Run a free scan</Link> to see where you stand today.
        </p>
      </GuideShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
