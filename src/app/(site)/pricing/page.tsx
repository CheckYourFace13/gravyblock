import { applySelfManagedMetadata } from "@/lib/site-publish/self-managed";
import type { Metadata } from "next";
import Link from "next/link";
import { publicBullets } from "@/lib/capabilities";
import { OFFER } from "@/lib/offer";
import { FunnelBeacon } from "@/components/funnel-beacon";

const baseMetadata: Metadata = {
  title: "Local SEO Pricing",
  description: "GravyBlock is $29.99 a month or $299 a year, with a 14-day free trial: one plan that finds what is hurting your local visibility and does the eligible work automatically. Cancel anytime, 30-day money-back guarantee after your first payment.",
  alternates: { canonical: "/pricing" },
};

// Re-render at most every 5 minutes so an approved metadata override reaches the live page.
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  return applySelfManagedMetadata("/pricing", baseMetadata);
}

const START_HREF = "/start";

const faqs = [
  {
    q: "What do I get for $29.99 a month?",
    a: "GravyBlock learns your business from your own website and Google profile, decides what is worth doing, and does the eligible work automatically: website content, Google Business Profile posts, Google review replies, outreach to relevant local organizations, citation consistency checks and AI-search visibility checks. It verifies each action and reports only what it confirmed. Some work needs a one-time connection, such as your website or Google account.",
  },
  {
    q: "How does the 14-day free trial work?",
    a: "You start with 14 days free. Checkout asks for a card so the subscription can continue, but nothing is charged during the 14 days. If you cancel before the trial ends you pay nothing. If you stay, your first payment is $29.99 for a monthly plan or $299 for an annual plan, taken when the trial ends.",
  },
  {
    q: "What is the difference between the free trial and the money-back guarantee?",
    a: "They come one after the other and do not overlap. The 14-day trial is free, so there is nothing to refund during it: cancel and you are not charged. The 30-day money-back guarantee starts from your first payment, the one taken when the trial ends. If you are not satisfied in the 30 days after that payment, send a billing or refund request through the contact form and we will refund it.",
  },
  {
    q: "Should I choose monthly or annual?",
    a: "Monthly is $29.99 and you can stop at any time. Annual is $299 for the year, which works out to $24.92 a month and saves $60.88 compared with twelve monthly payments. Both have the same 14-day free trial and the same guarantee.",
  },
  {
    q: "Is there a contract? Can I cancel?",
    a: "No contract. Cancel anytime from the billing portal in your workspace. You keep access until the end of the period you have paid for.",
  },
  {
    q: "Is the free scan really free?",
    a: "Yes. No credit card and no account. You get your visibility score and what we found. The ongoing, automatic work is the paid subscription.",
  },
  {
    q: "What do I need to connect?",
    a: "Connect your WordPress, Webflow or Shopify website once so GravyBlock can publish content. Connect Google once for Business Profile posts and review replies, and a booking or invoicing system if you want automatic review requests. A missing connection pauses only the work that depends on it.",
  },
  {
    q: "Does it cover more than one location?",
    a: "Each subscription covers one business location. If you run several, start a subscription for each one.",
  },
];

const schema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Product",
      name: "GravyBlock",
      description: "Automated local SEO for small businesses: finds what is hurting your visibility and does the eligible work automatically.",
      brand: { "@type": "Brand", name: "GravyBlock" },
      offers: [
        {
          "@type": "Offer",
          name: "GravyBlock monthly (14-day free trial)",
          price: "29.99",
          priceCurrency: "USD",
          availability: "https://schema.org/InStock",
          url: "https://gravyblock.com/pricing",
          priceSpecification: { "@type": "UnitPriceSpecification", price: "29.99", priceCurrency: "USD", billingDuration: 1, unitCode: "MON" },
        },
        {
          "@type": "Offer",
          name: "GravyBlock annual (14-day free trial)",
          price: "299",
          priceCurrency: "USD",
          availability: "https://schema.org/InStock",
          url: "https://gravyblock.com/pricing",
          priceSpecification: { "@type": "UnitPriceSpecification", price: "299", priceCurrency: "USD", billingDuration: 1, unitCode: "ANN" },
        },
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
  ],
};

export default function PricingPage() {
  const included = publicBullets("growth");
  return (
    <div className="bg-white">
      <FunnelBeacon eventType="pricing_viewed" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />

      <section className="bg-gradient-to-b from-red-50 to-white px-4 pb-10 pt-14 text-center sm:px-6">
        <div className="mx-auto max-w-2xl space-y-4">
          <p className="text-xs font-bold uppercase tracking-widest text-red-700">One plan. No tiers to decode.</p>
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl">Try GravyBlock free for 14 days</h1>
          <p className="text-xl font-semibold text-zinc-800">Then $29.99/month, or $299/year</p>
          <p className="mx-auto max-w-xl text-lg text-zinc-600">
            You should not need to buy SEO software and then learn how to use it. GravyBlock figures out what is worth doing for your business and handles the
            eligible work automatically.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Link href="/scan" className="rounded-full bg-red-600 px-9 py-4 text-base font-bold text-white shadow-md hover:bg-red-500">
              Scan my business free →
            </Link>
            <Link href={START_HREF} className="rounded-full border border-zinc-300 bg-white px-8 py-4 text-base font-semibold text-zinc-800 hover:border-zinc-400">
              {OFFER.cta}
            </Link>
          </div>
          <p className="text-xs font-medium text-zinc-600">{OFFER.risk} · No setup fee</p>
        </div>
      </section>

      <section className="px-4 pb-4 sm:px-6">
        <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-2">
          <div className="rounded-3xl border-2 border-zinc-200 bg-white p-6">
            <p className="text-sm font-semibold text-zinc-600">Monthly</p>
            <p className="mt-1 text-3xl font-black text-zinc-900">$29.99<span className="text-base font-medium text-zinc-500">/month</span></p>
            <p className="mt-1 text-sm text-zinc-600">Stop at any time.</p>
            <Link href={START_HREF} className="mt-4 block rounded-full bg-red-600 px-6 py-3 text-center text-sm font-bold text-white hover:bg-red-500">{OFFER.cta}</Link>
          </div>
          <div className="relative rounded-3xl border-2 border-red-300 bg-red-50/40 p-6">
            <span className="absolute -top-3 right-5 rounded-full bg-emerald-600 px-3 py-0.5 text-xs font-bold text-white">Save $60.88</span>
            <p className="text-sm font-semibold text-zinc-600">Annual</p>
            <p className="mt-1 text-3xl font-black text-zinc-900">$299<span className="text-base font-medium text-zinc-500">/year</span></p>
            <p className="mt-1 text-sm text-zinc-600">About $24.92 a month, paid once a year.</p>
            <Link href={`${START_HREF}?interval=annual`} className="mt-4 block rounded-full bg-red-600 px-6 py-3 text-center text-sm font-bold text-white hover:bg-red-500">{OFFER.cta}</Link>
          </div>
        </div>
        <p className="mx-auto mt-4 max-w-3xl text-center text-xs text-zinc-600">
          Both start with 14 days free: your card is needed at checkout but nothing is charged for 14 days, and you pay nothing if you cancel before it ends. The 30-day money-back guarantee starts from your first payment, after the trial.
        </p>
      </section>

      <section className="px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-3xl rounded-3xl border-2 border-red-200 bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-semibold text-zinc-900">What GravyBlock does for you</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Everything below is included. <Link href="/features" className="underline">See what is automatic, what needs a connection, and what is not offered.</Link>
          </p>
          <ul className="mt-5 grid gap-2 text-sm text-zinc-700 sm:grid-cols-2">
            {included.map((b) => (
              <li key={b} className="flex gap-2">
                <span className="font-bold text-emerald-600">✓</span>
                {b}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="px-4 pb-10 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-xl font-semibold text-zinc-900">How it compares</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-zinc-200 text-sm">
              <thead>
                <tr className="bg-zinc-50 text-left text-zinc-700">
                  <th className="px-4 py-3 font-semibold">Option</th>
                  <th className="px-4 py-3 font-semibold">Cost</th>
                  <th className="px-4 py-3 font-semibold">Who does the work</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border-t border-zinc-100 px-4 py-3 font-medium text-zinc-800">Do it yourself</td>
                  <td className="border-t border-zinc-100 px-4 py-3 text-zinc-600">Your time</td>
                  <td className="border-t border-zinc-100 px-4 py-3 text-zinc-600">You</td>
                </tr>
                <tr>
                  <td className="border-t border-zinc-100 px-4 py-3 font-medium text-zinc-800">SEO software</td>
                  <td className="border-t border-zinc-100 px-4 py-3 text-zinc-600">Varies by tool and plan</td>
                  <td className="border-t border-zinc-100 px-4 py-3 text-zinc-600">Usually you or an agency; some tools now automate parts</td>
                </tr>
                <tr>
                  <td className="border-t border-zinc-100 px-4 py-3 font-medium text-zinc-800">Local SEO agency</td>
                  <td className="border-t border-zinc-100 px-4 py-3 text-zinc-600">Varies widely; usually a monthly retainer</td>
                  <td className="border-t border-zinc-100 px-4 py-3 text-zinc-600">A person or team, including custom strategy</td>
                </tr>
                <tr className="bg-red-50/60">
                  <td className="border-t border-red-100 px-4 py-3 font-bold text-zinc-900">GravyBlock</td>
                  <td className="border-t border-red-100 px-4 py-3 font-bold text-emerald-700">14 days free, then $29.99 per month or $299 per year</td>
                  <td className="border-t border-red-100 px-4 py-3 font-medium text-zinc-800">GravyBlock, automatically, for the work on the features page</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            Other providers change plans often, so check each one. See <Link href="/compare" className="underline">our comparisons</Link>.
          </p>
        </div>
      </section>

      <section className="px-4 pb-14 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-xl font-semibold text-zinc-900">Common questions</h2>
          <div className="mt-4 space-y-4">
            {faqs.map((f) => (
              <div key={f.q} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
                <p className="font-semibold text-zinc-900">{f.q}</p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-zinc-200 bg-zinc-900 px-4 py-14 text-center sm:px-6">
        <div className="mx-auto max-w-xl space-y-4">
          <h2 className="text-2xl font-bold text-white">See what GravyBlock would do for your business</h2>
          <p className="text-sm text-zinc-400">A free scan takes about a minute. No credit card.</p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Link href="/scan" className="rounded-full bg-red-600 px-8 py-3.5 text-base font-bold text-white hover:bg-red-500">
              Scan my business free →
            </Link>
            <Link href={START_HREF} className="rounded-full bg-white px-7 py-3.5 text-base font-semibold text-zinc-900 hover:bg-zinc-100">
              {OFFER.cta}
            </Link>
          </div>
          <p className="text-xs text-zinc-400">{OFFER.risk}</p>
        </div>
      </section>
    </div>
  );
}
