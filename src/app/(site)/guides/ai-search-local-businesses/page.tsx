import type { Metadata } from "next";
import Link from "next/link";
import { GuideShell } from "@/components/guide-shell";

export const metadata: Metadata = {
  alternates: { canonical: "/guides/ai-search-local-businesses" },
  title: "How to show up in AI search as a local business",
  description:
    "How AI assistants and AI summaries decide which local businesses to mention, and the practical steps that improve your chances without promising any ranking.",
};

export default function AiSearchLocalBusinessesGuidePage() {
  return (
    <GuideShell
      title="How to show up in AI search as a local business"
      intro="AI assistants and AI summaries recommend local businesses by reconciling what they can find about you across the web. They cannot be gamed with a trick, but they respond well to facts that are consistent, easy to verify and easy to quote."
      related={[
        { href: "/guides/website-trust-signals", label: "Website trust signals and local conversion" },
        { href: "/guides/how-to-get-more-google-reviews", label: "How to get more Google reviews" },
        { href: "/guides/multi-location-local-seo", label: "Multi-location local SEO" },
        { href: "/tools/ai-visibility-test", label: "Free AI visibility test" },
      ]}
    >
      <h2>What these systems are really doing</h2>
      <p>
        When someone asks an assistant for a nearby plumber, dentist or restaurant, the answer is assembled from sources the system can read
        and trust: your website, your Google Business Profile, listings and directories, review sites, news or community mentions and, for
        some systems, live search results. Where those sources agree, the assistant can state your details with confidence. Where they
        disagree on your hours, services or address, it tends to hedge (&ldquo;check with the business&rdquo;) or recommend someone whose
        facts are cleaner. Nobody outside these systems can promise you a particular placement, so treat everything below as improving your
        odds, not as a formula.
      </p>

      <h2>Make the facts boring and identical everywhere</h2>
      <p>
        Use the same business name, address, phone number, categories and service descriptions on your site, your Google profile and every
        major listing. Do not rotate clever taglines in place of plain service names: stable, literal wording (&ldquo;emergency furnace
        repair&rdquo;, &ldquo;pediatric dentistry&rdquo;) is what gets matched to what people ask. When something changes, such as a new
        phone number or moved premises, update every source in the same week.
      </p>

      <h2>Answer the obvious questions on your own site</h2>
      <p>
        Assistants quote pages that answer questions directly. Publish short, plain answers to what customers actually ask you: what you
        charge or how you price, what areas you serve, what insurance or payment you accept, how to book, how long jobs take, and what your
        cancellation policy is. Give each topic a clear heading, put the answer in the first sentence, and avoid hiding it in a PDF or an
        image. A well-written FAQ section on a service page is more useful to a machine and a person than a long page of general claims.
      </p>

      <h2>Add structured data that matches the page</h2>
      <p>
        LocalBusiness schema (name, address, phone, hours, service area, the services offered) and FAQ markup on questions that are really
        shown on the page make it easier for systems to read you correctly. The rule is the same as for trust: the markup must say what the
        visible page says. Markup that contradicts the text creates the very inconsistency you are trying to remove.
      </p>

      <h2>Earn corroboration from other places</h2>
      <p>
        An assistant is more comfortable recommending a business that other independent sources confirm. That means genuine reviews on
        Google and on the sites relevant to your trade, accurate listings on the major directories, and real mentions from local
        organisations, suppliers, chambers of commerce and community sites. A small number of accurate, relevant sources is better than
        dozens of low-quality directory entries. Never buy reviews or build links through schemes. They break platform rules and can do
        lasting harm.
      </p>

      <h2>Check how assistants describe you, and keep a record</h2>
      <p>
        Once a month, ask a few assistants questions your customers would ask, with neutral wording and your town in the question, for
        example &ldquo;who is a good emergency plumber in [town]?&rdquo; or &ldquo;what are the opening hours of [your business]?&rdquo;.
        Note whether you are mentioned and whether the details are correct, and keep the answers in a simple log. Wrong details point you
        straight at the source that needs fixing. Answers vary from one run to the next, so look for trends over months rather than reacting
        to a single response.
      </p>

      <h2>What not to expect</h2>
      <p>
        No agency or tool can guarantee that an assistant will recommend you, and the way these systems choose sources changes over time.
        What you can control is whether your facts are consistent, your answers are easy to find, your reviews are real and recent, and
        your site is trustworthy. Those are also the things that help people who find you the traditional way.
      </p>
      <p>
        GravyBlock checks monthly whether AI assistants mention your business and records the result so you can watch the trend, and its
        free scan shows how your listing and site line up today.{" "}
        <Link href="/scan" className="font-medium text-red-800 hover:underline">
          Run the free scan
        </Link>
        .
      </p>
    </GuideShell>
  );
}
