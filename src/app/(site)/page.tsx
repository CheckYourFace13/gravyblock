import type { Metadata } from "next";
import Link from "next/link";
import { CtaLeadForm } from "@/components/cta-lead-form";

export const metadata: Metadata = {
  title: "GravyBlock — Autopilot growth for local and multi-location businesses",
  description:
    "GravyBlock helps local businesses, multi-location brands, service-area operators, and online-first companies improve discovery in Google, Maps, AI answers, and conversion funnels with ongoing autopilot execution.",
};

export default function HomePage() {
  return (
    <div>
      <section className="border-b border-zinc-200 bg-gradient-to-b from-red-50 via-white to-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-16 sm:px-6 lg:flex-row lg:items-center lg:py-20">
          <div className="flex-1 space-y-6">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-800">Local growth autopilot</p>
            <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
              Win local discovery, trust, and conversion — without drowning in tools.
            </h1>
            <p className="max-w-xl text-lg text-zinc-600">
              Built for <span className="font-medium text-zinc-800">local businesses of every kind</span> — storefront,
              multi-location, service-area, and online-first brands that still have to prove “real” locally. Start with a
              free scan, then move into roadmaps, execution queues, and monitoring that keeps Google, Maps, AI answers,
              and your site aligned.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/scan"
                className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800"
              >
                Run free visibility scan
              </Link>
              <Link
                href="#plans"
                className="inline-flex items-center justify-center rounded-full border border-zinc-300 bg-white px-6 py-3 text-sm font-semibold text-zinc-900 shadow-sm transition hover:border-zinc-400"
              >
                See plans
              </Link>
            </div>
            <dl className="grid gap-4 sm:grid-cols-3">
              {[
                {
                  k: "Always-on roadmap",
                  v: "Fix now, improve next, grow, and monitor — the same structure great operators use.",
                },
                {
                  k: "Business-model aware",
                  v: "Supports single-location, multi-location, service-area, and online-first localization workflows.",
                },
                {
                  k: "Visible progress",
                  v: "Snapshots over time so you can see scores move as fixes ship and demand returns.",
                },
              ].map((item) => (
                <div key={item.k} className="rounded-2xl border border-red-100 bg-white/80 p-4 shadow-sm">
                  <dt className="text-sm font-semibold text-zinc-900">{item.k}</dt>
                  <dd className="mt-2 text-sm text-zinc-600">{item.v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="flex-1">
            <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-xl shadow-red-100/60">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-700">Sample verdict tone</p>
              <p className="mt-4 text-2xl font-semibold leading-snug text-zinc-900">
                “Good foundation — a few key fixes will improve ‘near me’ conversion.”
              </p>
              <p className="mt-4 text-sm text-zinc-600">
                Every scan ends with owner-friendly clarity — what is costing you opportunities, what to fix first, and how
                GravyBlock can automate the follow-through.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-zinc-700">
                <li className="flex gap-2">
                  <span className="mt-1 h-2 w-2 rounded-full bg-red-500" />
                  Surfaces Maps + organic + on-site conversion gaps in one pass.
                </li>
                <li className="flex gap-2">
                  <span className="mt-1 h-2 w-2 rounded-full bg-red-500" />
                  Feeds a workspace with history, content ideas, and integration-ready hooks.
                </li>
                <li className="flex gap-2">
                  <span className="mt-1 h-2 w-2 rounded-full bg-red-500" />
                  Designed to convert into self-serve or managed autopilot without feeling salesy.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section id="fixes" className="mx-auto max-w-6xl space-y-8 px-4 py-16 sm:px-6">
        <div className="max-w-2xl space-y-3">
          <h2 className="text-3xl font-semibold text-zinc-900">What GravyBlock fixes</h2>
          <p className="text-zinc-600">
            Local and online-first brands lose revenue when discovery, trust, and conversion tell different stories. We align
            them so humans and algorithms agree you are the obvious choice.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[
            {
              title: "Invisible on Maps & AI answers",
              body: "Stale GBP data, weak categories, and thin site copy mean assistants and maps quietly recommend someone else.",
            },
            {
              title: "Traffic without conversion",
              body: "People find you but bounce because trust cues, buying paths, or local relevance signals are unclear.",
            },
            {
              title: "No repeatable content rhythm",
              body: "Specials, events, and neighborhood hooks never ship — so you look quiet compared with louder rivals.",
            },
            {
              title: "No single place to track progress",
              body: "Owners need a workspace that shows scores, tasks, and proof of improvement — not another inbox.",
            },
          ].map((card) => (
            <article key={card.title} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-zinc-900">{card.title}</h3>
              <p className="mt-2 text-sm text-zinc-600">{card.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="border-y border-zinc-200 bg-zinc-50">
        <div className="mx-auto max-w-6xl space-y-8 px-4 py-16 sm:px-6">
          <h2 className="text-3xl font-semibold text-zinc-900">How it works</h2>
          <ol className="grid gap-6 md:grid-cols-4">
              {[
              {
                step: "01",
                title: "Scan",
                body: "Pick your business on Google. We pull public listing + site signals and score visibility + conversion readiness.",
              },
              { step: "02", title: "Roadmap", body: "Get Fix now / Improve next / Grow lanes plus prioritized recommendations you can delegate." },
              { step: "03", title: "Workspace", body: "Track snapshots, content ideas, authority queues, and scan history in one operator dashboard." },
              { step: "04", title: "Autopilot", body: "Upgrade to Pro or managed growth for monitoring, integrations, and recurring content support." },
            ].map((s) => (
              <li key={s.step} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold text-red-700">{s.step}</p>
                <h3 className="mt-2 text-lg font-semibold text-zinc-900">{s.title}</h3>
                <p className="mt-2 text-sm text-zinc-600">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="ai-search" className="mx-auto max-w-6xl space-y-6 px-4 py-16 sm:px-6">
        <div className="max-w-3xl space-y-3">
          <h2 className="text-3xl font-semibold text-zinc-900">Why AI-assisted search matters for local operators</h2>
          <p className="text-zinc-600">
            People now ask assistants for “best plumber near me,” “who delivers here tonight,” or “reliable clinic in my
            area.” If your facts are scattered or outdated, summaries and maps quietly favor a competitor. GravyBlock
            tracks that shift and gives you clear language + structure so humans and systems agree on who you are.
          </p>
        </div>
      </section>

      <section id="score" className="bg-zinc-900 py-16 text-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="max-w-xl space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-300">Proof, not jargon</p>
            <h2 className="text-3xl font-semibold">Scores that owners understand in one glance</h2>
            <p className="text-sm text-zinc-300">
              Visibility, trust, clarity, conversion, listings, mobile, CTAs — weighted into a single readiness score
              with a verdict you can share with partners or investors.
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
            <p className="text-6xl font-semibold text-red-300">72</p>
            <p className="mt-2 text-sm text-zinc-300">Illustrative score — run your scan for the real number.</p>
            <Link
              href="/scan"
              className="mt-6 inline-flex rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-500"
            >
              Get my score
            </Link>
          </div>
        </div>
      </section>

      <section id="examples" className="mx-auto max-w-6xl space-y-6 px-4 py-16 sm:px-6">
        <div className="max-w-3xl space-y-2">
          <h2 className="text-3xl font-semibold text-zinc-900">Industry playbooks (examples)</h2>
          <p className="text-sm text-zinc-600">
            Hospitality pages below are <span className="font-medium text-zinc-800">sample verticals</span> — the same
            scan and workspace model applies to retail, services, clinics, and online brands building local trust.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              title: "Bars & nightlife",
              body: "Cover charges, late menus, ride-share arrivals, and vibe-forward copy that converts curious scrollers.",
              href: "/for-bars",
            },
            {
              title: "Restaurants",
              body: "Reservations, walk-ins, catering, dietary trust — all expressed clearly for maps-driven guests.",
              href: "/for-restaurants",
            },
            {
              title: "Breweries & taprooms",
              body: "Rotating taps, events, distribution, and tourism queries handled with one coherent story.",
              href: "/for-breweries",
            },
          ].map((card) => (
            <Link
              key={card.title}
              href={card.href}
              className="group rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-red-200 hover:shadow-md"
            >
              <h3 className="text-lg font-semibold text-zinc-900 group-hover:text-red-800">{card.title}</h3>
              <p className="mt-2 text-sm text-zinc-600">{card.body}</p>
              <p className="mt-4 text-sm font-semibold text-zinc-900">Explore →</p>
            </Link>
          ))}
        </div>
      </section>

      <section id="plans" className="border-t border-zinc-200 bg-zinc-50 py-16">
        <div className="mx-auto max-w-6xl space-y-8 px-4 sm:px-6">
          <div className="max-w-2xl space-y-3">
            <h2 className="text-3xl font-semibold text-zinc-900">Plans built for traction</h2>
            <p className="text-zinc-600">
              Start free, graduate when you want autopilot. Billing hooks land next — today the product is structured
              so engineering can flip tiers without rewrites.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                name: "Free scan",
                price: "$0",
                bullets: ["Visibility + conversion report", "Autopilot roadmap preview", "Growth workspace (history)"],
                cta: { href: "/scan", label: "Start scanning" },
              },
              {
                name: "Pro (self-serve)",
                price: "Coming soon",
                bullets: ["Recurring content ideas", "Automated monitoring hooks", "GBP + crawl integrations"],
                cta: { href: "/scan", label: "Join waitlist via scan" },
              },
              {
                name: "Managed growth",
                price: "Custom",
                bullets: ["Operator-led execution", "Weekly cadence + QA", "Revenue reporting tied to bookings or sales"],
                cta: { href: "/scan", label: "Talk with us after your scan" },
              },
            ].map((tier) => (
              <article key={tier.name} className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-red-800">{tier.name}</p>
                <p className="mt-2 text-3xl font-semibold text-zinc-900">{tier.price}</p>
                <ul className="mt-4 flex-1 space-y-2 text-sm text-zinc-600">
                  {tier.bullets.map((b) => (
                    <li key={b} className="flex gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-red-500" />
                      {b}
                    </li>
                  ))}
                </ul>
                <Link
                  href={tier.cta.href}
                  className="mt-6 inline-flex justify-center rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
                >
                  {tier.cta.label}
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
        <h2 className="text-3xl font-semibold text-zinc-900">Ready when you are</h2>
        <p className="mx-auto mt-3 max-w-2xl text-zinc-600">
          Run the scan in a few minutes. If you want hands-on help, the report is designed to make the next call
          productive — whether you DIY, delegate to staff, or bring in GravyBlock managed growth.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/scan" className="rounded-full bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-500">
            Start free scan
          </Link>
        </div>
        <div className="mt-10 grid gap-4 text-left lg:grid-cols-2">
          <CtaLeadForm
            source="contact_form"
            title="General contact"
            subtitle="Questions before scanning? Send a note and we will reply."
            buttonLabel="Send message"
          />
          <CtaLeadForm
            source="demo_request"
            title="Book a walkthrough"
            subtitle="Want a live review with your operator team? Request a demo."
            buttonLabel="Request demo"
          />
        </div>
      </section>
    </div>
  );
}
