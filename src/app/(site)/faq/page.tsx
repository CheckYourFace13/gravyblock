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
        a: "GravyBlock is an automated local SEO platform for small and local businesses. It publishes AI-written content to your website, posts to Reddit, sends backlink outreach emails, monitors your reviews, tracks your Google rankings, and audits your Google Business Profile. All on autopilot, every week.",
      },
      {
        q: "How does the free scan work?",
        a: "Enter your business name and location and we'll generate a visibility score in about 60 seconds. You'll see how your Google Business Profile, reviews, citations, and AI search presence stack up against competitors. No credit card required.",
      },
      {
        q: "Do I need to install anything?",
        a: "No. GravyBlock is fully web-based. For content publishing we connect to your website via an API key or direct CMS integration. We walk you through it during onboarding in a few clicks.",
      },
      {
        q: "How long before I see results?",
        a: "Most customers see their GBP visibility score improve within the first 30 days from acting on the fix queue. Content and backlink effects typically compound over 60–90 days as Google re-crawls your site.",
      },
    ],
  },
  {
    section: "Plans and pricing",
    items: [
      {
        q: "What's the difference between Starter, Scale, and Pro?",
        a: "Starter monitors your visibility and gives you a prioritized fix list each month. Scale adds full automation: weekly AI articles published, Reddit posts, backlink outreach, and social auto-posting. Pro doubles the volume and adds programmatic city pages and a competitor lead pipeline.",
      },
      {
        q: "What is the INTRO50 discount?",
        a: "INTRO50 is our launch promo code that gives you 50% off your first month. Starter drops to $39.99, Scale to $74.99, and Pro to $149.99. Apply the code at checkout. It's valid on all paid plans.",
      },
      {
        q: "Is there a free plan?",
        a: "Yes. The free tier gives you a full visibility score, a prioritized fix list, and one-time competitor snapshot. No credit card needed. To get the automations running (publishing, Reddit, outreach), you'll need a paid plan.",
      },
      {
        q: "Can I change plans later?",
        a: "Absolutely. You can upgrade, downgrade, or cancel at any time from your dashboard. Upgrades take effect immediately; downgrades apply at the next billing cycle.",
      },
      {
        q: "Does the Pro plan support multiple locations?",
        a: "Yes. Pro includes up to 3 locations under one subscription. Additional locations can be added for a per-location fee. Enterprise and white-label pricing is available, contact us.",
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
        a: "Our AI writes every article using your business info, target keywords, and brand voice settings. You can review drafts before they go live or let them publish automatically. Your call.",
      },
      {
        q: "Will the content hurt my site if Google detects it's AI?",
        a: "Google's quality guidelines focus on helpfulness, not authorship. Our content is locally relevant, genuinely useful, and follows Google's E-E-A-T guidelines. We add location-specific details, real stats, and your business context to make each piece substantive.",
      },
      {
        q: "What does 'backlink outreach' mean?",
        a: "Each month GravyBlock finds relevant local websites, blogs, and directories and sends personalized emails on your behalf asking for a link mention. You see every email sent in your dashboard. Scale includes 8 outreach emails/month; Pro includes 16.",
      },
      {
        q: "How does Reddit posting work?",
        a: "GravyBlock submits helpful, non-promotional posts to your city's subreddit (e.g. r/Austin) and relevant industry subreddits. Posts follow Reddit's community rules. No spam. The goal is brand awareness and referral traffic, not self-promotion.",
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
        a: "GravyBlock monitors your Google reviews in real time. When a new review arrives, you get an alert and an AI-drafted reply ready to copy and paste. Negative reviews are flagged so you can reach out privately before they go public.",
      },
      {
        q: "Does GravyBlock fake reviews?",
        a: "No. Never. Fake reviews violate Google's terms of service and can get your Business Profile suspended. GravyBlock helps you collect more genuine reviews from real customers through a gating link that routes happy customers to Google and unhappy ones to a private feedback form.",
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
            <Link href="/scan?plan=growth" className="rounded-full bg-red-600 px-7 py-3 text-sm font-bold text-white hover:bg-red-500">
              Start Scale — $74.99/mo
            </Link>
          </div>
          <p className="text-xs text-zinc-600">Code INTRO50 = 50% off month one · Cancel anytime</p>
        </div>
      </section>
    </div>
  );
}
