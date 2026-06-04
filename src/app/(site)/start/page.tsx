import type { Metadata } from "next";
import { SignupForm } from "./signup-form";
import { normalizePromoCode } from "@/lib/stripe/promo-codes";
import { ANNUAL_SAVINGS } from "@/lib/stripe/server";

export const metadata: Metadata = {
  title: "Get started — GravyBlock",
  description: "Start your GravyBlock plan. First month free or 50% off with INTRO50.",
  robots: { index: false, follow: false }, // don't index the signup funnel
};

type Props = { searchParams: Promise<{ plan?: string; promo?: string; interval?: string }> };

const PLAN_INFO = {
  starter: {
    label: "Starter",
    monthly: 79.99,
    intro: 39.99,
    tagline: "Monthly visibility monitoring, citation audits, and a prioritized fix list.",
    bullets: ["Monthly visibility score", "Citation audit across 40+ directories", "AI search check", "Full workspace dashboard"],
    highlight: false,
  },
  growth: {
    label: "Scale",
    monthly: 149.99,
    intro: 74.99,
    tagline: "Full autopilot — content, GBP posts, review replies, and social running every week.",
    bullets: ["Weekly AI articles published to your site", "Auto Google Business Profile posts", "AI review replies", "Facebook + Instagram posting", "Review gating link"],
    highlight: true,
  },
  pro: {
    label: "Pro",
    monthly: 299.99,
    intro: 149.99,
    tagline: "Double the output, programmatic city pages, and competitor lead pipeline.",
    bullets: ["Everything in Scale, twice as often", "12 articles + 8 local pages/month", "Programmatic city pages", "Lead pipeline (competitor outreach)", "Up to 3 locations"],
    highlight: false,
  },
  agency: {
    label: "Agency",
    monthly: 499.99,
    intro: 249.99,
    tagline: "Daily output, multiple locations, and white-label ready.",
    bullets: ["Daily content generation", "Multi-location support", "Full feature set", "Priority support"],
    highlight: false,
  },
} as const;

type PlanKey = keyof typeof PLAN_INFO;

function normalizePlan(raw: string | null | undefined): PlanKey {
  const p = (raw ?? "").toLowerCase();
  if (p === "entry" || p === "base") return "starter";
  if (p in PLAN_INFO) return p as PlanKey;
  return "growth"; // default to Scale
}

export default async function StartPage({ searchParams }: Props) {
  const query = await searchParams;
  const plan = normalizePlan(query.plan);
  const info = PLAN_INFO[plan];
  const promoCode = normalizePromoCode(query.promo) ?? "INTRO50";
  const isAnnual = query.interval === "annual";
  const annualSavings = ANNUAL_SAVINGS[plan === "growth" ? "growth" : plan];
  const displayPrice = isAnnual ? annualSavings.monthlyEquiv : info.intro;
  const billingLabel = isAnnual ? `/mo billed annually` : `/mo · first month`;

  return (
    <div className="min-h-dvh bg-gradient-to-b from-zinc-50 to-white px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-lg">

        {/* Back link */}
        <a href="/pricing" className="mb-8 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800">
          ← Back to pricing
        </a>

        <div className="rounded-3xl border border-zinc-200 bg-white shadow-xl shadow-zinc-100 overflow-hidden">

          {/* Plan header */}
          <div className={`px-8 pt-8 pb-6 ${info.highlight ? "bg-gradient-to-br from-red-600 to-red-700" : "bg-zinc-900"}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-xs font-bold uppercase tracking-[0.2em] ${info.highlight ? "text-red-200" : "text-zinc-400"}`}>
                  GravyBlock {info.label}
                </p>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-4xl font-black text-white">${displayPrice}</span>
                  <span className={`text-sm ${info.highlight ? "text-red-200" : "text-zinc-400"}`}>{billingLabel}</span>
                </div>
                {!isAnnual && (
                  <p className={`mt-0.5 text-xs font-semibold ${info.highlight ? "text-red-200" : "text-zinc-500"}`}>
                    Then ${info.monthly}/mo · cancel anytime
                  </p>
                )}
              </div>
              <div className={`rounded-full px-3 py-1.5 text-xs font-bold ${info.highlight ? "bg-red-500/40 text-white" : "bg-zinc-700 text-zinc-300"}`}>
                {isAnnual ? "Annual · save 25%" : "50% off · code INTRO50"}
              </div>
            </div>

            <ul className="mt-5 space-y-1.5">
              {info.bullets.map((b) => (
                <li key={b} className={`flex items-center gap-2 text-sm ${info.highlight ? "text-red-100" : "text-zinc-300"}`}>
                  <span className={`text-xs font-bold ${info.highlight ? "text-red-300" : "text-zinc-500"}`}>✓</span>
                  {b}
                </li>
              ))}
            </ul>
          </div>

          {/* Form */}
          <div className="px-8 py-8">
            <h1 className="text-xl font-semibold text-zinc-900 mb-1">Create your account</h1>
            <p className="text-sm text-zinc-500 mb-6">{info.tagline}</p>

            <SignupForm plan={plan} promoCode={promoCode} isAnnual={isAnnual} />
          </div>
        </div>

        {/* Alternative */}
        <p className="mt-5 text-center text-sm text-zinc-500">
          Not sure yet?{" "}
          <a href="/scan" className="font-semibold text-zinc-700 hover:text-zinc-900 underline underline-offset-2">
            Run a free scan first
          </a>{" "}
          — no account needed.
        </p>

        {/* Trust signals */}
        <div className="mt-4 flex justify-center gap-x-6 text-xs text-zinc-400">
          <span>✓ No setup fees</span>
          <span>✓ Cancel anytime</span>
          <span>✓ 30-day money-back</span>
        </div>
      </div>
    </div>
  );
}
