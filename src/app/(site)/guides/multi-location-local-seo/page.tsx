import type { Metadata } from "next";
import Link from "next/link";
import { GuideShell } from "@/components/guide-shell";

export const metadata: Metadata = {
  alternates: { canonical: "/guides/multi-location-local-seo" },
  title: "Multi-location local SEO and how to build better location pages",
  description:
    "How businesses with more than one location keep listings, profiles and location pages accurate and genuinely different, without thin duplicate pages or doorway pages.",
};

export default function MultiLocationLocalSeoGuidePage() {
  return (
    <GuideShell
      title="Multi-location local SEO and better location pages"
      intro="When you add a location, search systems do not inherit your brand story. They read whatever each profile, listing and location page says, which is how multi-location businesses quietly lose map visibility as they grow."
      related={[
        { href: "/guides/service-area-business-visibility", label: "Service-area business visibility" },
        { href: "/guides/website-trust-signals", label: "Website trust signals and local conversion" },
        { href: "/guides/how-to-rank-higher-in-google-maps", label: "How to rank higher in Google Maps" },
        { href: "/industries", label: "Industry pages" },
      ]}
    >
      <h2>Treat each location as its own entity</h2>
      <p>
        Every real, staffed location with customers visiting needs its own Google Business Profile, its own page on your website and its own
        consistent set of listings. Each one should carry that location&apos;s real address, phone number, hours, services and photos. Do not
        create profiles for places where you have no staffed premises (virtual offices and mailbox addresses are against Google&apos;s
        guidelines and tend to be removed), and do not add a city name to the business name to rank for it.
      </p>

      <h2>What a good location page contains</h2>
      <p>
        A location page earns its place when it tells a visitor something only that location can. Thin pages that swap a town name into the
        same paragraph are what Google&apos;s spam policies call doorway pages, and they add risk rather than visibility. A useful page has:
      </p>
      <ul className="list-disc space-y-2 pl-6">
        <li>The exact address, a map or directions link, parking and access details, and the nearest cross streets or landmarks people use.</li>
        <li>That location&apos;s own hours, phone number and booking link, including holiday changes.</li>
        <li>The services actually offered there, since not every site offers everything, and the names or photos of the people who work there.</li>
        <li>Photos of the real premises and real work, not stock images.</li>
        <li>Reviews or testimonials from customers of that location, and answers to the questions that location&apos;s customers ask.</li>
        <li>Links to and from a store locator, and to the main brand pages, so the relationship between brand and location is clear.</li>
      </ul>
      <p>
        If a location genuinely has nothing different to say, a single clean entry in your locator may serve better than a near-empty page.
      </p>

      <h2>Consistency without copy-paste</h2>
      <p>
        Keep one master record for each location (name, address, phone, hours, categories, services, links) and publish from it, so the
        website, Google, Apple Maps, Bing and the directories all draw from the same facts. Decide centrally which things must be identical
        (legal name, brand promises, categories, calls to action) and which each location may tailor (offers, local proof, neighbourhood
        details). That keeps the brand coherent while letting every page say something true and specific.
      </p>

      <h2>Run it like operations, not a one-off project</h2>
      <ul className="list-disc space-y-2 pl-6">
        <li>Name an owner for each profile, with at least two people who have access, so a departure does not lock you out.</li>
        <li>Make location changes (new hours, a new phone number, a closure) part of the same checklist as any other operational change, with a deadline to update every source.</li>
        <li>Check for duplicate or unclaimed profiles for the same address, and for suggested edits from the public that changed your details.</li>
        <li>Review each location&apos;s reviews and respond. Local customers read the reviews for the place they are about to visit, not the brand average.</li>
      </ul>

      <h2>Measure per location</h2>
      <p>
        Track a short set of numbers for every location and compare them over months: how many people called, asked for directions or
        visited the website from the profile, how the website converts for that location&apos;s page, and the number and recency of reviews.
        Tag the links from each profile so analytics can separate locations. A location that falls behind its peers is usually missing a
        basic fix, such as wrong hours, an unanswered review backlog or a missing category.
      </p>

      <h2>How GravyBlock fits</h2>
      <p>
        Each GravyBlock subscription covers one business location, so start one per location. Its free scan shows how a location&apos;s
        listing and website line up today.{" "}
        <Link href="/scan" className="font-medium text-red-800 hover:underline">
          Start with a scan
        </Link>
        .
      </p>
    </GuideShell>
  );
}
