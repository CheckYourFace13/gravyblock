import type { Metadata } from "next";
import Link from "next/link";
import { CAPABILITY_BY_ID, type Capability } from "@/lib/capabilities";

export const metadata: Metadata = {
  title: "Features: What GravyBlock Does Automatically",
  description:
    "Every GravyBlock capability, sorted honestly: what runs automatically, what runs after a one-time connection, what only monitors and alerts, and what GravyBlock does not do.",
  alternates: { canonical: "/features" },
};

type Kind = "automatic" | "after_connection" | "monitoring" | "unsupported";

const KIND_LABEL: Record<Kind, { label: string; className: string }> = {
  automatic: { label: "Automatic", className: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  after_connection: { label: "Automatic after one-time connection", className: "bg-red-50 text-red-800 border-red-200" },
  monitoring: { label: "Monitoring and alerts only", className: "bg-sky-50 text-sky-800 border-sky-200" },
  unsupported: { label: "Not offered", className: "bg-zinc-100 text-zinc-600 border-zinc-200" },
};

/** Capabilities that watch and report rather than act. Everything else that is built acts. */
const MONITORING_ONLY = new Set(["review_monitoring", "listing_watchdog", "site_watchdog", "citations", "ai_visibility"]);

function kindFor(c: Capability): Kind {
  if (c.status === "not_implemented") return "unsupported";
  if (MONITORING_ONLY.has(c.id)) return "monitoring";
  return c.oneTime ? "after_connection" : "automatic";
}

function planText(c: Capability): string {
  const names = c.plans.map((p) => (p === "growth" ? "Scale" : p === "pro" ? "Pro" : "Starter"));
  if (names.length === 3) return "All plans";
  return names.length ? `${names.join(" and ")}` : "";
}

/** Owner-language notes for things that are NOT offered, so nobody assumes parity with other tools. */
const UNSUPPORTED_NOTES: Record<string, string> = {
  existing_page_optimization: "GravyBlock does not rewrite your existing pages based on Search Console data.",
  gbp_profile_edits: "GravyBlock does not change your Google profile's hours, services or categories for you. It alerts you if Google changes them.",
  competitor_monitoring: "Competitors are compared when you run a scan. GravyBlock does not watch them continuously.",
  reddit_posting: "GravyBlock does not post to Reddit, forums or community sites.",
};

const sections: { title: string; intro: string; ids: string[] }[] = [
  {
    title: "Website and SEO",
    intro: "Content and technical upkeep on your own website.",
    ids: ["website_content", "sitemap_submission", "site_watchdog", "existing_page_optimization"],
  },
  {
    title: "Google presence",
    intro: "Keeping your Google Business Profile active and accurate.",
    ids: ["gbp_posts", "gbp_photos", "listing_watchdog", "gbp_profile_edits"],
  },
  {
    title: "Reviews",
    intro: "Watching, answering and earning reviews.",
    ids: ["review_monitoring", "review_replies", "review_requests"],
  },
  {
    title: "Authority and backlinks",
    intro: "Earning links from relevant local sites, honestly.",
    ids: ["authority_outreach"],
  },
  {
    title: "Citations",
    intro: "Consistency of your business details across the web.",
    ids: ["citations"],
  },
  {
    title: "AI search visibility",
    intro: "Whether AI assistants mention your business.",
    ids: ["ai_visibility"],
  },
  {
    title: "Social",
    intro: "Posting from your own content and real reviews.",
    ids: ["social_posting", "reddit_posting"],
  },
  {
    title: "Measurement and proof",
    intro: "Checking what is happening and only reporting what was verified.",
    ids: ["rank_tracking", "competitor_monitoring"],
  },
];

function CapabilityRow({ id }: { id: string }) {
  const c = CAPABILITY_BY_ID[id];
  if (!c) return null;
  const kind = kindFor(c);
  const badge = KIND_LABEL[kind];
  const plans = planText(c);
  return (
    <li className="rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-zinc-900">{c.label}</h3>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}>{badge.label}</span>
        {plans && <span className="text-xs text-zinc-500">{plans}</span>}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600">
        {kind === "unsupported" ? UNSUPPORTED_NOTES[c.id] ?? "Not offered." : c.publicLine}
      </p>
      {c.oneTime && kind !== "unsupported" && (
        <p className="mt-2 text-xs text-zinc-500">
          <span className="font-semibold text-zinc-700">One-time connection:</span> {c.oneTime}.
        </p>
      )}
      {c.limits && kind !== "unsupported" && (
        <p className="mt-1 text-xs text-zinc-500">
          <span className="font-semibold text-zinc-700">Limits:</span> {c.limits}
        </p>
      )}
    </li>
  );
}

export default function FeaturesPage() {
  return (
    <div>
      <section className="border-b border-zinc-200 bg-gradient-to-b from-red-50 via-white to-white">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-800">Features</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
            What GravyBlock does, and what it does not
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-zinc-600">
            GravyBlock decides what is worth doing for your business and does the eligible work for you. This page sorts
            every capability honestly, so you know what to expect before you pay. For the big picture, see{" "}
            <Link href="/how-it-works" className="underline">
              how it works
            </Link>
            .
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
              <span key={k} className={`rounded-full border px-3 py-1 text-xs font-semibold ${KIND_LABEL[k].className}`}>
                {KIND_LABEL[k].label}
              </span>
            ))}
          </div>
          <p className="mt-4 text-sm text-zinc-600">
            <span className="font-semibold text-zinc-800">Connect once. GravyBlock takes it from there.</span> A missing
            connection pauses only the work that depends on it.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-4xl space-y-12 px-4 py-14 sm:px-6">
        {sections.map((s) => (
          <section key={s.title}>
            <h2 className="text-2xl font-semibold text-zinc-900">{s.title}</h2>
            <p className="mt-1 text-sm text-zinc-500">{s.intro}</p>
            <ul className="mt-4 space-y-3">
              {s.ids.map((id) => (
                <CapabilityRow key={id} id={id} />
              ))}
            </ul>
          </section>
        ))}

        <section className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6 text-sm text-zinc-700">
          <h2 className="text-lg font-semibold text-zinc-900">Good to know</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>Capabilities depend on your plan. See the plan comparison on the pricing page.</li>
            <li>GravyBlock never guarantees rankings, links, traffic or a timeline.</li>
            <li>
              It reports work only after checking that it happened. See{" "}
              <Link href="/proof" className="underline">
                verified work on businesses we operate ourselves
              </Link>
              .
            </li>
            <li>
              GravyBlock is not a replacement for a custom strategy or creative campaign. See{" "}
              <Link href="/compare/gravyblock-vs-local-seo-agencies" className="underline">
                GravyBlock vs local SEO agencies
              </Link>
              .
            </li>
          </ul>
        </section>

        <section className="rounded-2xl border border-red-200 bg-red-50/60 p-8 text-center">
          <h2 className="text-2xl font-semibold text-zinc-900">See what it would do for your business</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-600">
            Run the free scan to get your visibility score and see which of these GravyBlock would do for you. No credit
            card. Scale is $74.99/mo, locked while subscribed.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link
              href="/scan"
              className="inline-flex items-center justify-center rounded-full bg-red-600 px-8 py-3 text-sm font-semibold text-white hover:bg-red-500"
            >
              Get my free visibility score →
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center rounded-full border border-zinc-300 bg-white px-8 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              See pricing
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
