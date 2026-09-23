import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "FAQ — GravyBlock",
  description:
    "Answers to the most common questions about GravyBlock: how it works, what's included in each plan, billing, cancellation, and more.",
};

const faqs = [
  {
    section: "Getting started",
    items: [
      {
        q: "What is GravyBlock?",
        a: "GravyBlock is an automated local SEO platform for small and local businesses. It writes articles and service pages from your own website's facts and publishes them to your connected website, posts weekly to your Google Business Profile, replies to your Google reviews, sends personalized outreach to relevant local organizations, and tracks your Google rankings. It decides what will help and does it automatically, after a one-time setup.",
      },
      {
        q: "How does the free scan work?",
        a: "Enter your business name and location and we'll generate a visibility score in about 60 seconds. You'll see how your Google Business Profile, reviews, citations, and AI search presence stack up against competitors. No credit card required.",
      },
      {
        q: "Do I need to install anything?",
        a: "No. GravyBlock is fully web-based. For content publishing you connect your WordPress, Webflow or Shopify website once, and to post to Google and Facebook you authorize those accounts once. We walk you through it during onboarding in a few clicks.",
      },
      {
        q: "How long before I see results?",
        a: "We don't publish a customer results statistic we can't back with real data. What we can tell you: your visibility score refreshes weekly so you can watch it move as fixes go out, and content and link work generally takes 60–90 days to show up in rankings as Google re-crawls your site — that's how local SEO works generally, not a GravyBlock-specific guarantee.",
      },
    ],
  },
  {
    section: "Plans and pricing",
    items: [
      {
        q: "What's the difference between Starter, Scale, and Pro?",
        a: "Starter monitors your visibility each month: a prioritized fix list, citation consistency checks, review alerts, and AI search checks. Scale adds the automatic work: articles and service pages published to your connected website, Google Business Profile posts, automatic Google review replies and requests, Facebook and Instagram posting, and personalized local outreach. Pro increases the volume.",
      },
      {
        q: "What is the INTRO50 discount?",
        a: "INTRO50 gives you 50% off your first month on Starter ($29.99) or Pro ($149.99) — after that, billing reverts to the regular price. Scale works differently: code GROWTH50 gives you 50% off every month for as long as your subscription stays active — $74.99/mo, not just the first one. Apply the relevant code at checkout.",
      },
      {
        q: "Is there a free plan?",
        a: "Yes. The free tier gives you a full visibility score, a prioritized fix list, and one-time competitor snapshot. No credit card needed. To get GravyBlock actually publishing, posting and reaching out for you, you'll need a paid plan.",
      },
      {
        q: "Can I change plans later?",
        a: "Absolutely. You can upgrade, downgrade, or cancel at any time from your dashboard. Upgrades take effect immediately; downgrades apply at the next billing cycle.",
      },
      {
        q: "Does the Pro plan support multiple locations?",
        a: "Not yet. Each GravyBlock subscription covers one business and one location. If you run several locations, you can start a separate subscription for each one. For custom or white-label setups, contact us.",
      },
    ],
  },
  {
    section: "Billing and cancellation",
    items: [
      {
        q: "Is there a contract or commitment?",
        a: "No contracts. GravyBlock is month-to-month. Cancel any time from your dashboard and you won't be charged again.",
      },
      {
        q: "What is your refund policy?",
        a: "All paid plans include a 30-day money-back guarantee. If you're not happy in the first 30 days, email support@gravyblock.com and we'll refund you in full. No questions.",
      },
      {
        q: "What payment methods do you accept?",
        a: "We accept all major credit and debit cards (Visa, Mastercard, Amex, Discover) via Stripe. We do not store card details. Stripe handles all payment processing.",
      },
      {
        q: "Will I be charged if I cancel?",
        a: "No. Cancel before your next renewal date and you won't be charged. You keep access through the end of the period you paid for.",
      },
    ],
  },
  {
    section: "Content and automation",
    items: [
      {
        q: "Who writes the content GravyBlock publishes?",
        a: "Our AI writes articles and service pages using facts taken from your own website, so nothing is written about details your site does not state. They are published to your connected WordPress, Webflow or Shopify site and checked to confirm the page is live.",
      },
      {
        q: "Will the content hurt my site if Google detects it's AI?",
        a: "Google's quality guidelines focus on helpfulness, not authorship. Our content is locally relevant, genuinely useful, and follows Google's E-E-A-T guidelines. We add location-specific details, real stats, and your business context to make each piece substantive.",
      },
      {
        q: "What does 'local outreach' mean?",
        a: "GravyBlock finds relevant local organizations, pitches one useful page from your website to a real published contact, follows up once, and only counts a link once it is verified live on their site. Links are never guaranteed, and replies go to you. Scale includes up to 8 outreach attempts per month; Pro includes up to 16.",
      },
      {
        q: "What is the AI search check?",
        a: "We prompt ChatGPT, Perplexity, and Gemini with queries like 'best [service] in [city]' and check whether your business is mentioned. This tracks your visibility in AI-generated answers, a growing share of how people find local businesses.",
      },
    ],
  },
  {
    section: "Reviews and reputation",
    items: [
      {
        q: "How does the review inbox work?",
        a: "GravyBlock monitors your Google, Yelp and TripAdvisor reviews and alerts you when a new one arrives. On Scale and Pro, replies to Google reviews are posted automatically once your Google account is connected. Yelp and TripAdvisor do not allow replies through their API, so those replies are drafted for you to paste. Negative reviews are flagged.",
      },
      {
        q: "Does GravyBlock fake reviews?",
        a: "No. Never. Fake reviews violate Google's terms of service and can get your Business Profile suspended. Once you connect your booking or invoicing system, GravyBlock automatically emails every real completed customer the same neutral request to leave a Google review — no picking who gets asked, no sending anything yourself. All reviews stay genuine, public, and unselected by you.",
      },
    ],
  },
];

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.flatMap((section) =>
    section.items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    }))
  ),
};

export default function FaqPage() {
  return (
    <div className="bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <section className="border-b border-zinc-100 bg-zinc-50 px-4 py-12 sm:px-6 text-center">
        <div className="mx-auto max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-widest text-red-700 mb-2">Help center</p>
          <h1 className="text-3xl font-bold text-zinc-900 sm:text-4xl">Frequently asked questions</h1>
          <p className="mt-3 text-zinc-500">
            Can't find your answer?{" "}
            <Link href="/support" className="font-semibold text-red-600 hover:underline">
              Contact support →
            </Link>
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6 space-y-12">
        {faqs.map((section) => (
          <div key={section.section}>
            <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-5">{section.section}</h2>
            <div className="space-y-5">
              {section.items.map((item) => (
                <div key={item.q} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
                  <p className="font-semibold text-zinc-900">{item.q}</p>
                  <p className="mt-2 text-sm text-zinc-600 leading-relaxed">{item.a}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="border-t border-zinc-200 bg-zinc-900 px-4 py-14 sm:px-6 text-center">
        <div className="mx-auto max-w-xl space-y-4">
          <h2 className="text-2xl font-bold text-white">Ready to let it run itself?</h2>
          <p className="text-zinc-400 text-sm">Free visibility score in 60 seconds. No credit card required.</p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Link href="/scan" className="rounded-full bg-white px-7 py-3 text-sm font-bold text-zinc-900 hover:bg-zinc-100">
              Get my free score
            </Link>
            <Link href="/start?plan=growth&promo=GROWTH50" className="rounded-full bg-red-600 px-7 py-3 text-sm font-bold text-white hover:bg-red-500">
              Start Scale — $74.99/mo
            </Link>
          </div>
          <p className="text-xs text-zinc-600">$74.99/mo locked while subscribed · Cancel anytime</p>
        </div>
      </section>
    </div>
  );
}
