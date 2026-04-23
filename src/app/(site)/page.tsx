import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "GravyBlock — Autopilot growth for local and multi-location businesses",
  description:
    "Get your score free, unlock the full report by email, then choose Entry or Pro to keep visibility monitored and improved automatically — product-led local growth software. No sales-call gate.",
};

export default function HomePage() {
  return (
    <div>
      <section className="border-b border-zinc-200 bg-gradient-to-b from-red-50 via-white to-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-16 sm:px-6 lg:flex-row lg:items-center lg:py-20">
          <div className="flex-1 space-y-6">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-800">Local growth autopilot</p>
            <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
              Run your local growth engine on autopilot — from scan to queue to monitoring.
            </h1>
            <p className="max-w-xl text-lg text-zinc-600">
              Win local discovery, trust, and conversion without drowning in tools. Built for{" "}
              <span className="font-medium text-zinc-800">local businesses of every kind</span> — storefront,
              multi-location, service-area, and online-first brands that still have to prove “real” locally. Start with a
              free automated scan, view score and verdict instantly, unlock the full report by email, then use your
              workspace to track scores, recommendations, and (on Entry or Pro) recurring visibility and automation.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/scan"
                className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800"
              >
                Get your score free
              </Link>
              <Link
                href="/scan"
                className="inline-flex items-center justify-center rounded-full bg-red-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-red-500"
              >
                Start Entry
              </Link>
              <Link
                href="/scan"
                className="inline-flex items-center justify-center rounded-full bg-red-700 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-red-600"
              >
                Start Pro
              </Link>
              <Link
                href="#plans"
                className="inline-flex items-center justify-center rounded-full border border-zinc-300 bg-white px-6 py-3 text-sm font-semibold text-zinc-900 shadow-sm transition hover:border-zinc-400"
              >
                Compare Free, Entry, and Pro
              </Link>
            </div>
            <dl className="grid gap-4 sm:grid-cols-3">
              {[
                {
                  k: "Always-on roadmap",
                  v: "Fix now, improve next, and grow lanes — prioritized so you ship the highest-impact work first.",
                },
                {
                  k: "Business-model aware",
                  v: "Single-location, multi-location, service-area, and online-first patterns shape the scan and report.",
                },
                {
                  k: "Progress you can graph",
                  v: "Snapshots over time in your workspace so you can see scores move as fixes land and automation runs.",
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
                Every scan ends with owner-friendly clarity — what is costing you opportunities, what to fix first, and
                how the product keeps that work in a workspace you can return to without starting over.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-zinc-700">
                <li className="flex gap-2">
                  <span className="mt-1 h-2 w-2 rounded-full bg-red-500" />
                  Surfaces Maps + organic + on-site conversion gaps in one automated pass.
                </li>
                <li className="flex gap-2">
                  <span className="mt-1 h-2 w-2 rounded-full bg-red-500" />
                  Full report sent to your inbox after a quick unlock step — see score and top findings first on the
                  report page.
                </li>
                <li className="flex gap-2">
                  <span className="mt-1 h-2 w-2 rounded-full bg-red-500" />
                  Product-led automation: monitor, queue, and track improvements over time — not a demo-led agency flow.
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
              body: "Stale listing fields, weak categories, and thin site copy mean assistants and maps quietly recommend someone else.",
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
                body: "Pick your business on Google Places. We pull public listing + site signals and score visibility + conversion readiness.",
              },
              {
                step: "02",
                title: "Roadmap",
                body: "Get Fix now / Improve next / Grow lanes plus prioritized recommendations you can execute or queue.",
              },
              {
                step: "03",
                title: "Workspace",
                body: "Track snapshots, content ideas, authority queues, and scan history in one operator dashboard.",
              },
              {
                step: "04",
                title: "Autopilot",
                body: "On Pro, run recurring visibility refresh jobs, content queues, internal publishing output, and synthetic AI visibility checks — on a schedule you control in software.",
              },
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
            tracks that shift and helps you tighten facts and structure so humans and systems agree on who you are — and
            Pro adds scheduled, synthetic visibility probes so you can monitor that story over time (directional, not a
            guarantee of rank).
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

      <section id="guides" className="border-y border-zinc-200 bg-white py-16">
        <div className="mx-auto max-w-6xl space-y-8 px-4 sm:px-6">
          <div className="max-w-2xl space-y-3">
            <h2 className="text-3xl font-semibold text-zinc-900">Guides: local growth without the fluff</h2>
            <p className="text-zinc-600">
              Practical, indexable explainers on multi-location SEO, service-area visibility, AI search, trust signals,
              and conversion — linked to what the product actually measures.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { href: "/guides/multi-location-local-seo", title: "Multi-location local SEO", body: "Structure, consistency, and measurement across locations." },
              { href: "/guides/service-area-business-visibility", title: "Service-area business visibility", body: "Radius markets, SAB patterns, and clarity for maps + site." },
              { href: "/guides/ai-search-local-businesses", title: "AI search for local businesses", body: "Facts, entities, and how assistants summarize you." },
              { href: "/guides/social-proof-and-local-conversion", title: "Social proof & local conversion", body: "Reviews, policies, and paths that close the visit." },
              { href: "/guides/website-trust-signals", title: "Website trust signals", body: "Security, schema, contact clarity, and mobile friction." },
              { href: "/guides", title: "All guides", body: "Browse the full list and cross-links." },
            ].map((g) => (
              <Link
                key={g.href}
                href={g.href}
                className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-5 shadow-sm transition hover:border-red-200 hover:bg-white"
              >
                <h3 className="text-lg font-semibold text-zinc-900">{g.title}</h3>
                <p className="mt-2 text-sm text-zinc-600">{g.body}</p>
                <p className="mt-4 text-sm font-semibold text-red-800">Read →</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section id="plans" className="border-t border-zinc-200 bg-zinc-50 py-16">
        <div className="mx-auto max-w-6xl space-y-8 px-4 sm:px-6">
          <div className="max-w-2xl space-y-3">
            <h2 className="text-3xl font-semibold text-zinc-900">Free, Entry, and Pro</h2>
            <p className="text-zinc-600">
              Launch pricing shows regular monthly price plus the current discounted launch rate. The free tier includes
              score, verdict, and top findings on the report page; unlock sends the full report by email and reveals every
              section in your session. Entry and Pro add recurring automation in the product — no ranking guarantees and
              no sales-call gate.
            </p>
            <p className="text-sm text-zinc-500">
              For billing or access, use Support in the footer — the product is built to run as automated software first.
            </p>
            <p className="text-xs text-zinc-500">
              Checkout runs from your business workspace after your free scan creates context for this location.
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <article className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-800">Free</p>
              <p className="mt-2 text-3xl font-semibold text-zinc-900">$0</p>
              <p className="mt-1 text-sm text-zinc-500">
                Get your score free; unlock the full report by email after a quick name + email step.
              </p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-zinc-600">
                {[
                  "Score, verdict, and top 3 findings visible on the report first",
                  "Rest of report locked until name + email unlock (lead capture)",
                  "Full report emailed after unlock; same session shows the full report",
                  "Public listing + website + social discovery in the full report",
                  "Limited workspace access and saved report history where supported",
                ].map((b) => (
                  <li key={b} className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                    {b}
                  </li>
                ))}
              </ul>
              <Link
                href="/scan"
                className="mt-6 inline-flex justify-center rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
              >
                Run free scan
              </Link>
            </article>
            <article className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-800">Entry</p>
              <div className="mt-2">
                <p className="text-lg text-zinc-500 line-through">$29.99/month</p>
                <p className="text-3xl font-semibold text-zinc-900">$19.99/month</p>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Launch special</p>
              </div>
              <p className="mt-1 text-sm text-zinc-500">Monthly automation layer for steady checks and summaries.</p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-zinc-600">
                {[
                  "Monthly visibility refresh with score/history update",
                  "Monthly Google listing, website, and social re-check",
                  "Monthly AI visibility summary and 3–5 prioritized actions",
                  "Monthly content ideas plus monthly summary email",
                  "Workspace trend and history access",
                ].map((b) => (
                  <li key={b} className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                    {b}
                  </li>
                ))}
              </ul>
              <Link
                href="/scan"
                className="mt-6 inline-flex justify-center rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:border-zinc-400"
              >
                Start Entry
              </Link>
            </article>
            <article className="flex flex-col rounded-2xl border border-red-200 bg-white p-6 shadow-md ring-1 ring-red-100">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-800">Pro</p>
              <div className="mt-2">
                <p className="text-lg text-zinc-500 line-through">$59.99/month</p>
                <p className="text-3xl font-semibold text-zinc-900">$39.99/month</p>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Launch special</p>
              </div>
              <p className="mt-1 text-sm text-zinc-500">The fullest available automation layer in this build.</p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-zinc-600">
                {[
                  "Everything in Entry, with more frequent recurring refreshes",
                  "Content queue + publishing queue/history in workspace",
                  "Autopilot workspace with AI visibility checks",
                  "Local page/service-area content generation queue",
                  "Citation/listing issue queue + review/reputation task queue",
                  "Multi-location support where current schema/workspace supports it",
                ].map((b) => (
                  <li key={b} className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                    {b}
                  </li>
                ))}
              </ul>
              <Link
                href="/scan"
                className="mt-6 inline-flex justify-center rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500"
              >
                Start Pro
              </Link>
            </article>
          </div>
          <p className="text-center text-xs text-zinc-500">
            Start Entry or Start Pro from the same scan flow, then turn on autopilot in your workspace for this business.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
        <h2 className="text-3xl font-semibold text-zinc-900">Turn on your engine</h2>
        <p className="mx-auto mt-3 max-w-2xl text-zinc-600">
          Run the scan in a few minutes, open your workspace, and keep monitoring and improvement inside the product. For
          billing or access questions, use Support in the footer.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/scan" className="rounded-full bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-500">
            Get your score free
          </Link>
          <Link
            href="/#guides"
            className="rounded-full border border-zinc-300 bg-white px-6 py-3 text-sm font-semibold text-zinc-900 hover:border-zinc-400"
          >
            Read guides
          </Link>
        </div>
      </section>
    </div>
  );
}
