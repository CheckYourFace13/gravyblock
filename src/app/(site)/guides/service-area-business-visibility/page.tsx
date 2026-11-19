import type { Metadata } from "next";
import Link from "next/link";
import { GuideShell } from "@/components/guide-shell";

export const metadata: Metadata = {
  alternates: { canonical: "/guides/service-area-business-visibility" },
  title: "Service-area business visibility: how to be found without a storefront",
  description:
    "How plumbers, electricians, mobile services and other service-area businesses set up Google Business Profile, service pages and proof so customers in their area can find and trust them.",
};

export default function ServiceAreaBusinessVisibilityGuidePage() {
  return (
    <GuideShell
      title="Service-area businesses: be found without faking a storefront"
      intro="Plumbers, electricians, HVAC crews, mobile clinics, cleaners and consultants go to the customer. The job is to make where you work and what you do clear to people and to search systems, not to stuff town names into every page."
      related={[
        { href: "/guides/multi-location-local-seo", label: "Multi-location local SEO" },
        { href: "/guides/website-trust-signals", label: "Website trust signals and local conversion" },
        { href: "/guides/how-to-get-more-google-reviews", label: "How to get more Google reviews" },
        { href: "/industries/home-services", label: "Local SEO for home services" },
      ]}
    >
      <h2>Set up your Google Business Profile as a service-area business</h2>
      <p>
        If customers do not visit you at an address, tell Google so: hide your address and list the areas you serve instead. Google lets you
        add a limited number of service areas, so choose the cities, counties or postcodes you actually reach, not an optimistic radius. Pick
        the primary category that matches your main service, add secondary categories for real additional services, and list those services
        in the profile. Never use a friend&apos;s address, a virtual office or a post box to appear in a town where you have no base. Those
        listings break Google&apos;s guidelines and are often suspended, which is far worse than not appearing there.
      </p>

      <h2>Make the geography obvious on your website</h2>
      <p>
        State the places you serve in plain text on your homepage and contact page, and name any areas you do not cover or cover only at
        extra cost. This saves you unqualified calls and gives assistants a consistent answer when someone asks whether you serve their
        town. If you subcontract or refer work outside your core area, say so.
      </p>
      <p>
        Create a page for each core service (for example boiler repair, drain cleaning, panel upgrades) that explains what the work involves,
        how you price it, how fast you can come out, and what the customer should expect. Create a page for an area only when you can say
        something real about work there, such as projects you have done, local rules or conditions that affect the job, or how quickly you
        reach it. Dozens of near-identical &ldquo;service in [town]&rdquo; pages add little and risk being treated as doorway pages.
      </p>

      <h2>Match your site and your profile</h2>
      <p>
        The services, emergency or after-hours policy, response times and pricing statements on your website should agree with your profile
        and every listing. When they disagree, assistants and search features either avoid giving details or recommend a competitor whose
        facts line up. Keep one master record of your name, phone, service areas, services and hours and update every source from it.
      </p>

      <h2>Build proof for high-stakes work</h2>
      <p>
        When someone is choosing a stranger to enter their home or fix something urgent, proof matters more than clever copy. Show licence
        numbers where your trade requires them, proof of insurance, warranty terms, and real photographs of finished jobs with the
        permission of the customer. Ask every customer for a review right after the work (see{" "}
        <Link href="/guides/how-to-get-more-google-reviews" className="font-medium text-red-800 hover:underline">
          how to get more Google reviews
        </Link>
        ), and ask them to mention the service and the area when they naturally would, without scripting what they say.
      </p>

      <h2>Be reachable at the moment of need</h2>
      <p>
        Many service searches are urgent. Put a tap-to-call number at the top of every page, answer or return calls quickly, switch on
        messaging only if you can reply promptly, and keep your opening hours exact, including after-hours availability. A missed call from
        a Business Profile usually goes to the next business on the list.
      </p>

      <h2>What to measure</h2>
      <p>
        Watch calls and message requests from your Business Profile, calls and form submissions from your website, the number and recency
        of your reviews, and whether your profile appears when you search your main service from inside your service area. Compare month to
        month, since results vary with season and weather in many trades.
      </p>
      <p>
        GravyBlock&apos;s scan checks your public listing signals and fetches your website and discovered social links to show where the
        gaps are.{" "}
        <Link href="/scan" className="font-medium text-red-800 hover:underline">
          Run a scan
        </Link>{" "}
        to see what to fix first.
      </p>
    </GuideShell>
  );
}
