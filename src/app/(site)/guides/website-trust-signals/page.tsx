import type { Metadata } from "next";
import Link from "next/link";
import { GuideShell } from "@/components/guide-shell";

export const metadata: Metadata = {
  alternates: { canonical: "/guides/website-trust-signals" },
  title: "Website trust signals and local conversion: what local visitors check before they call",
  description:
    "The checks a local visitor makes in the first seconds on your site, from HTTPS and click-to-call to reviews, policies and near-me intent, and how to fix each one without gimmicks.",
};

export default function WebsiteTrustSignalsGuidePage() {
  return (
    <GuideShell
      title="Website trust signals and local conversion"
      intro="Maps and search get you considered. Your website decides whether the visitor calls, books or leaves. Most local visitors arrive on a phone, in a hurry and a little skeptical, so trust is mostly the absence of surprises."
      related={[
        { href: "/guides/how-to-rank-higher-in-google-maps", label: "How to rank higher in Google Maps" },
        { href: "/guides/how-to-get-more-google-reviews", label: "How to get more Google reviews" },
        { href: "/guides/service-area-business-visibility", label: "Service-area business visibility" },
        { href: "/guides/ai-search-local-businesses", label: "AI search for local businesses" },
      ]}
    >
      <h2>Show who you are in the first screen</h2>
      <p>
        A visitor who tapped a result for a nearby business wants proof it is the right one: the business name, what you do, where you
        work, a phone number and today&apos;s hours. Put these where they are visible without scrolling on a phone, and make sure they are
        the same words and digits shown on your Google Business Profile. A phone number or address that differs between your site and your
        listing is the quickest way to make a careful visitor stop and check somewhere else.
      </p>
      <p>
        Make the phone number a real tap-to-call link (a <code>tel:</code> link), and show an address or service area in plain text, not only
        inside an image. If you serve an area rather than a storefront, say which cities or counties you cover.
      </p>

      <h2>Get the technical basics right</h2>
      <p>These are small, boring and still the most common failures on small-business sites:</p>
      <ul className="list-disc space-y-2 pl-6">
        <li>The whole site loads over HTTPS with no mixed-content warnings, so the browser never shows a security warning.</li>
        <li>Pages load quickly on a mid-range phone on mobile data. Google treats a Largest Contentful Paint of 2.5 seconds or less as good, so test your own homepage on a phone rather than only on a desktop.</li>
        <li>Buttons and links are large enough to tap without zooming, and text is readable without pinching.</li>
        <li>Forms work and say what happens next. A visitor who submits a form and sees nothing assumes it failed.</li>
        <li>The site has no stray <code>noindex</code> tags on pages you want found, and no broken pages on the path to contacting you.</li>
      </ul>

      <h2>Keep structured data and visible text in agreement</h2>
      <p>
        LocalBusiness markup (name, address, phone, opening hours, the services you offer) helps search systems and assistants read your
        page, but only when it matches what a person reads. If the markup says you close at 5 and the page says 6, you have published two
        versions of the truth, and automated systems will hedge or choose the wrong one. Update the markup and the visible text together,
        and treat the visible text as the source of truth.
      </p>

      <h2>Make proof easy to scan</h2>
      <p>
        People look for evidence from other customers before a stranger. Real reviews, quoted with the reviewer&apos;s permission or linked
        to the profile they were left on, carry far more weight than adjectives about yourself. Show photos of your actual work, team and
        premises instead of stock images. For regulated or high-stakes work, put licences, insurance and warranty terms where they are easy
        to find rather than buried in a footer.
      </p>
      <p>
        Reviews are also a product surface: respond to them, fix the problems that keep appearing in them, and let new customers see the
        themes you want to be known for. Fresh, specific reviews persuade better than a large number of vague ones. Never publish fake
        reviews or write reviews for your own business. They break platform rules and, in the United States, consumer protection rules.
      </p>

      <h2>Reduce decision anxiety</h2>
      <p>
        Most hesitation is a question the page did not answer. For a restaurant it is the menu, parking and whether you take walk-ins. For a
        service business it is pricing ranges, how quickly you respond, what happens on the first visit, and the cancellation or refund
        rules. Put the answers in predictable places and use plain language. A short section titled for what happens after the visitor
        contacts you often does more for conversion than another round of rewriting the headline.
      </p>

      <h2>Serve the near-me visitor</h2>
      <p>
        Searches such as &ldquo;near me&rdquo; and &ldquo;open now&rdquo; carry immediate intent. The visitor often wants to call, get
        directions or book within a minute. For them:
      </p>
      <ul className="list-disc space-y-2 pl-6">
        <li>Show whether you are open now, or at least today&apos;s hours, near the top.</li>
        <li>Offer a one-tap call and a one-tap directions link.</li>
        <li>Say clearly what area you serve, and mention parking, access or arrival details if they matter.</li>
        <li>Choose one primary action per page (call, book or get directions) and design the first mobile screen around it. Extra competing buttons dilute action without adding clarity.</li>
      </ul>

      <h2>Avoid tactics that cost trust</h2>
      <p>
        Fake countdown timers, invented scarcity, claims you cannot support, hidden fees and pop-ups that cover the content on a phone all
        make a visitor suspicious. If a claim needs a footnote to be true, say the true version instead.
      </p>

      <h2>A ten-minute check you can do today</h2>
      <ol className="list-decimal space-y-2 pl-6">
        <li>Open your homepage on your phone using mobile data, not Wi-Fi. How long until you can read it?</li>
        <li>Tap your phone number. Does it dial?</li>
        <li>Compare your name, address, phone and hours on the page with your Google Business Profile, letter for letter.</li>
        <li>Submit your own contact form. Do you get a clear confirmation, and does the message arrive?</li>
        <li>Find your cancellation, refund or booking terms as a stranger would. Could you find them in under 30 seconds?</li>
      </ol>
      <p>
        GravyBlock&apos;s free scan fetches your homepage and checks many of these signals, including whether your contact path and basic
        technical checks are in place, and shows what to fix first.{" "}
        <Link href="/scan" className="font-medium text-red-800 hover:underline">
          Run the free scan
        </Link>
        .
      </p>
    </GuideShell>
  );
}
