import type { Metadata } from "next";
import Link from "next/link";
import { GuideShell } from "@/components/guide-shell";

export const metadata: Metadata = {
  title: "Local Citation Sites USA — Complete List for 2026 | GravyBlock",
  description:
    "The most important local citation sites in the USA for 2026. Build NAP consistency across Google, Yelp, Apple Maps, Bing, Facebook, and 50+ directories. Free citation audit.",
  alternates: { canonical: "/guides/local-citation-sites-usa" },
  openGraph: {
    title: "Local Citation Sites USA — Complete List for 2026",
    description: "Top US citation directories for local SEO. Get listed, stay consistent, rank higher.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Local Citation Sites USA — Complete List for 2026",
  description: "The most important local citation directories in the USA for local SEO. Covers general directories, industry-specific, and city-level sites.",
  url: "https://gravyblock.com/guides/local-citation-sites-usa",
};

const TIER_1 = [
  { name: "Google Business Profile", url: "https://business.google.com", note: "Most important citation. Powers the Google Map Pack." },
  { name: "Yelp", url: "https://biz.yelp.com", note: "High-authority. Critical for restaurants, service businesses, health." },
  { name: "Apple Maps", url: "https://mapsconnect.apple.com", note: "Default map on all Apple devices. Often overlooked." },
  { name: "Bing Places", url: "https://www.bingplaces.com", note: "Microsoft search. Feeds Cortana and Teams location data." },
  { name: "Facebook Business", url: "https://www.facebook.com/business", note: "High DA. Used by ChatGPT and local discovery platforms." },
  { name: "Better Business Bureau (BBB)", url: "https://www.bbb.org", note: "Trust signal. Strong for service businesses." },
  { name: "Foursquare", url: "https://business.foursquare.com", note: "Powers location data for many third-party apps." },
  { name: "Yellow Pages (YP.com)", url: "https://www.yellowpages.com", note: "Legacy directory still widely used for local data." },
  { name: "MapQuest", url: "https://www.mapquest.com", note: "Pulls from Foursquare. Good for data consistency." },
  { name: "Nextdoor", url: "https://nextdoor.com/pages", note: "Neighborhood-level. Very high trust for service businesses." },
];

const TIER_2 = [
  { name: "Angi (formerly Angie's List)", url: "https://www.angi.com", note: "Critical for contractors, plumbers, HVAC, cleaners." },
  { name: "HomeAdvisor", url: "https://www.homeadvisor.com", note: "Feeds Angi. Home services lead source." },
  { name: "Thumbtack", url: "https://www.thumbtack.com", note: "Service professionals across all categories." },
  { name: "Houzz", url: "https://www.houzz.com", note: "Home improvement and interior design businesses." },
  { name: "TripAdvisor", url: "https://www.tripadvisor.com", note: "Restaurants, hotels, tourist businesses." },
  { name: "OpenTable", url: "https://www.opentable.com", note: "Restaurants only. Google integrates OpenTable reservation links." },
  { name: "Healthgrades", url: "https://www.healthgrades.com", note: "Doctors, dentists, therapists, and medical practices." },
  { name: "Zocdoc", url: "https://www.zocdoc.com", note: "Medical professionals. Integrates with Google booking." },
  { name: "Avvo", url: "https://www.avvo.com", note: "Lawyers and legal professionals." },
  { name: "Lawyers.com", url: "https://www.lawyers.com", note: "Legal directory. Strong for attorney SEO." },
  { name: "Realtor.com", url: "https://www.realtor.com", note: "Real estate agents and brokers." },
  { name: "Zillow Pro", url: "https://www.zillow.com/agent-resources", note: "Real estate professionals." },
];

const TIER_3 = [
  { name: "Merchant Circle", url: "https://www.merchantcircle.com", note: "Local SMB directory. Good citation anchor." },
  { name: "City-Data", url: "https://www.city-data.com", note: "City-specific forums and business listings." },
  { name: "USADirectory.com", url: "https://www.usadirectory.com", note: "National directory with city filtering." },
  { name: "Manta", url: "https://www.manta.com", note: "SMB-focused. Good for service business citations." },
  { name: "DexKnows", url: "https://www.dexknows.com", note: "Regional directory. Feeds several third-party apps." },
  { name: "Superpages", url: "https://www.superpages.com", note: "Yellow Pages affiliate. Good for citation consistency." },
  { name: "CitySquares", url: "https://www.citysquares.com", note: "Local-first business directory." },
  { name: "Whitepages Business", url: "https://www.whitepages.com", note: "Strong trust signal for NAP consistency." },
  { name: "Alignable", url: "https://www.alignable.com", note: "B2B local networking. Good for service businesses." },
  { name: "Chamberofcommerce.com", url: "https://www.chamberofcommerce.com", note: "National chamber directory. Trust signal." },
];

export default function LocalCitationSitesUSAPage() {
  return (
    <>
      <GuideShell
        title="Local citation sites USA — complete list for 2026"
        intro="A local citation is any mention of your business name, address, and phone number (NAP) on another website. The more consistent and widespread your citations are, the more Google trusts your business data — and the higher you rank in the Google Map Pack."
        related={[
          { href: "/guides/google-3-pack", label: "What is the Google 3-Pack?" },
          { href: "/guides/how-to-rank-higher-in-google-maps", label: "How to rank higher in Google Maps" },
          { href: "/guides/multi-location-local-seo", label: "Multi-location local SEO" },
          { href: "/scan", label: "Free citation audit for your business" },
        ]}
      >
        <h2>What is a local citation?</h2>
        <p>
          A <strong>local citation</strong> is any place on the internet where your business name, address,
          and phone number (NAP) appears. Citations can be on general directories like Yelp, industry-specific
          sites like Healthgrades or Avvo, local chamber of commerce pages, or even news articles that
          mention your business.
        </p>
        <p>
          Google uses citation consistency as a trust signal. If your business appears with the same name,
          address, and phone number across 50+ authoritative sites, Google is more confident that your
          listing is legitimate — and ranks it higher in local search results and the Google 3-Pack.
        </p>

        <h2>Tier 1: Essential citation sites (do these first)</h2>
        <p>
          These are the highest-authority directories. Every US local business should be listed on all of them
          before building secondary citations.
        </p>
        <div className="not-prose mt-4 overflow-hidden rounded-2xl border border-zinc-200">
          {TIER_1.map((site, i) => (
            <div key={site.name} className={`flex items-start gap-4 p-4 ${i < TIER_1.length - 1 ? "border-b border-zinc-100" : ""}`}>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-zinc-900">
                  <a href={site.url} target="_blank" rel="noopener noreferrer" className="text-red-800 hover:underline">
                    {site.name}
                  </a>
                </p>
                <p className="mt-0.5 text-sm text-zinc-500">{site.note}</p>
              </div>
            </div>
          ))}
        </div>

        <h2>Tier 2: Industry-specific citation sites</h2>
        <p>
          After the essential tier, add the sites relevant to your industry. Google treats industry-specific
          citations as stronger relevance signals for those categories.
        </p>
        <div className="not-prose mt-4 overflow-hidden rounded-2xl border border-zinc-200">
          {TIER_2.map((site, i) => (
            <div key={site.name} className={`flex items-start gap-4 p-4 ${i < TIER_2.length - 1 ? "border-b border-zinc-100" : ""}`}>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-zinc-900">
                  <a href={site.url} target="_blank" rel="noopener noreferrer" className="text-red-800 hover:underline">
                    {site.name}
                  </a>
                </p>
                <p className="mt-0.5 text-sm text-zinc-500">{site.note}</p>
              </div>
            </div>
          ))}
        </div>

        <h2>Tier 3: Additional local directories</h2>
        <p>
          These sites add breadth to your citation footprint. Useful for competitive markets where Tier 1
          and 2 alone aren't enough to separate you from competitors.
        </p>
        <div className="not-prose mt-4 overflow-hidden rounded-2xl border border-zinc-200">
          {TIER_3.map((site, i) => (
            <div key={site.name} className={`flex items-start gap-4 p-4 ${i < TIER_3.length - 1 ? "border-b border-zinc-100" : ""}`}>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-zinc-900">
                  <a href={site.url} target="_blank" rel="noopener noreferrer" className="text-red-800 hover:underline">
                    {site.name}
                  </a>
                </p>
                <p className="mt-0.5 text-sm text-zinc-500">{site.note}</p>
              </div>
            </div>
          ))}
        </div>

        <h2>Citation consistency: the #1 mistake local businesses make</h2>
        <p>
          Building citations is only half the job. The other half is <strong>keeping them consistent</strong>.
          If your business is listed as "Joe's Plumbing LLC" on Google but "Joes Plumbing" on Yelp and
          "Joe's Plumbing" on Facebook — that inconsistency costs you ranking power.
        </p>
        <p>
          Common consistency problems:
        </p>
        <ul>
          <li>Old address from a previous location still live on 20+ directories</li>
          <li>Phone number changed but only updated on Google</li>
          <li>Franchise vs. independently-owned name inconsistencies</li>
          <li>Duplicate listings on the same platform (two Yelp pages for the same business)</li>
        </ul>
        <p>
          GravyBlock audits your citation footprint automatically and builds a fix queue when it finds
          mismatches or missing listings.{" "}
          <Link href="/scan">Run a free citation audit for your business →</Link>
        </p>

        <h2>How many citations do you need?</h2>
        <p>
          There's no magic number, but research from BrightLocal and Whitespark consistently shows that
          businesses in the Google 3-Pack have 50–80+ citations on average, while those ranking in positions
          4–10 have significantly fewer. For competitive industries (legal, medical, home services) in
          large cities, 100+ citations from quality sources is a baseline.
        </p>
        <p>
          More important than volume: <strong>quality and consistency</strong>. 30 consistent, high-authority
          citations outperform 200 citations with mismatched data across low-authority directories.
        </p>

        <h2>Automating citation building</h2>
        <p>
          Manually submitting to 50+ directories and keeping them updated is time-consuming. Tools
          automate this in different ways:
        </p>
        <ul>
          <li><strong>Yext / Uberall</strong> — sync your data to their publisher network. Works, but expensive ($199+/year) and stops syncing if you cancel.</li>
          <li><strong>BrightLocal / Whitespark</strong> — citation building services. Manual submission, $3–$7 per citation.</li>
          <li><strong>GravyBlock</strong> — audits citations automatically, queues fixes, and handles submission as part of the weekly automation cycle. Included in the Growth plan alongside content, reviews, and rank tracking.</li>
        </ul>
      </GuideShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
