import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { getPublicProof } from "@/lib/proof/ledger";
import { getPublishedCaseStudies } from "@/lib/proof/sales";
import { getShowcaseBusinesses, type ProofActivity } from "@/lib/proof/get-showcase-businesses";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Proof: we run GravyBlock on our own businesses | GravyBlock",
  description:
    "Verified activity from businesses we operate ourselves on the same automation paying customers get. Only work confirmed to have happened is shown, not testimonials and not queued or drafted work.",
  alternates: { canonical: "https://gravyblock.com/proof" },
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function ProofActivityList({ activity }: { activity: ProofActivity }) {
  const rows: Array<{ label: string; detail?: ReactNode }> = [];

  if (activity.pagesLiveCount > 0) {
    rows.push({
      label: `${activity.pagesLiveCount} ${plural(activity.pagesLiveCount, "page", "pages")} published to the business's own website and confirmed live`,
      detail: (
        <ul className="mt-1 space-y-1">
          {activity.pagesLive.map((p) => (
            <li key={p.publicUrl} className="truncate">
              <a href={p.publicUrl} className="text-red-800 underline underline-offset-2" target="_blank" rel="noopener">
                {p.title}
              </a>
            </li>
          ))}
        </ul>
      ),
    });
  }
  if (activity.gbpPosts > 0) rows.push({ label: `${activity.gbpPosts} Google Business Profile ${plural(activity.gbpPosts, "post", "posts")} published (Google returned a post id)` });
  if (activity.gbpPhotos > 0) rows.push({ label: `${activity.gbpPhotos} ${plural(activity.gbpPhotos, "photo", "photos")} added to the Google profile` });
  if (activity.socialPosts > 0) rows.push({ label: `${activity.socialPosts} Facebook/Instagram ${plural(activity.socialPosts, "post", "posts")} published` });
  if (activity.reviewReplies > 0) rows.push({ label: `${activity.reviewReplies} Google review ${plural(activity.reviewReplies, "reply", "replies")} posted` });
  if (activity.listingChecks) {
    rows.push({
      label: `${activity.listingChecks.checked} listing consistency ${plural(activity.listingChecks.checked, "check", "checks")}, ${activity.listingChecks.drift} ${plural(activity.listingChecks.drift, "mismatch", "mismatches")} found`,
    });
  }
  if (activity.authority) {
    const n = activity.authority.liveLinks.length;
    rows.push({
      label: `${activity.authority.outreachSent} outreach ${plural(activity.authority.outreachSent, "pitch", "pitches")} sent, ${n} live ${plural(n, "link", "links")} verified on other sites`,
    });
  }
  if (activity.siteChecks) {
    rows.push({
      label: `Website last checked ${new Date(activity.siteChecks.lastCheckedAt).toLocaleDateString()}: ${activity.siteChecks.healthy ? "healthy" : "issue found"}`,
    });
  }

  if (rows.length === 0) {
    return (
      <p className="mt-4 text-sm text-zinc-500">
        No externally verified work to show yet. This page only lists work GravyBlock has confirmed happened (pages live on the
        customer&apos;s own site, posts Google accepted, links found on other sites), never anything queued or drafted.
      </p>
    );
  }
  return (
    <ul className="mt-4 space-y-2 text-sm text-zinc-700">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="font-medium text-zinc-900">{r.label}</span>
          {r.detail}
        </li>
      ))}
    </ul>
  );
}

export default async function ProofPage() {
  const showcased = await getShowcaseBusinesses();
  const ledger = await getPublicProof({ limit: 12 });
  const caseStudies = await getPublishedCaseStudies(6);

  return (
    <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-800">Proof, not promises</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
        We run GravyBlock on our own businesses.
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-zinc-600">
        These are real businesses operated by GravyBlock&apos;s founder, running the same automation paying customers get.
        The numbers below are pulled live from the same database that powers customer workspaces, and a category appears
        only when there is external evidence for it.
      </p>

      {showcased.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-zinc-200 bg-zinc-50 p-8 text-center">
          <p className="text-sm text-zinc-600">
            We&apos;re assembling this page right now. Live business data appears here as each house business is connected. In
            the meantime, the{" "}
            <Link href="/examples/sample-local-growth-report" className="font-semibold text-red-800 underline">
              sample report
            </Link>{" "}
            shows what the automation produces.
          </p>
        </div>
      ) : (
        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {showcased.map((b) => (
            <article key={b.id} className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-zinc-900">{b.name}</h2>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {[b.vertical, b.city].filter(Boolean).join(" · ") || "Local business"}
                  </p>
                </div>
                {b.score !== null ? (
                  <div className="shrink-0 rounded-2xl bg-zinc-50 border border-zinc-200 px-4 py-2 text-center">
                    <p className="text-2xl font-bold text-zinc-900">{b.score}</p>
                    <p className="text-[10px] uppercase tracking-wide text-zinc-500">visibility</p>
                    {b.scoreDelta !== null && b.scoreDelta !== 0 ? (
                      <p className={`text-[11px] font-semibold ${b.scoreDelta > 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {b.scoreDelta > 0 ? "+" : ""}
                        {b.scoreDelta} vs last check
                      </p>
                    ) : b.baselineJustEstablished ? (
                      <p className="text-[11px] font-medium text-zinc-400">Baseline established</p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <ProofActivityList activity={b.activity} />
            </article>
          ))}
        </div>
      )}

      {caseStudies.length > 0 ? (
        <section className="mt-12">
          <h2 className="text-xl font-semibold text-zinc-900">Case studies</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {caseStudies.map((c) => (
              <article key={c.title} className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-700">
                <h3 className="font-semibold text-zinc-900">{c.title}</h3>
                <p className="mt-2"><span className="font-medium">Before:</span> {c.before.metric} {c.before.value}</p>
                <p><span className="font-medium">Action:</span> {c.action}</p>
                <p><span className="font-medium">After:</span> {c.after.metric} {c.after.value}</p>
                <p className="mt-2 text-xs text-zinc-500">Verified {c.verifiedAt.slice(0, 10)}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {ledger.length > 0 ? (
        <section className="mt-12">
          <h2 className="text-xl font-semibold text-zinc-900">Verified results log</h2>
          <p className="mt-1 text-sm text-zinc-600">Each entry was checked at its external destination before it was recorded.</p>
          <ul className="mt-4 space-y-3">
            {ledger.map((p) => (
              <li key={p.id} className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
                <p className="font-medium text-zinc-900">{p.businessName}</p>
                <p className="mt-1">{p.summary}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  Verified {p.verifiedAt.toISOString().slice(0, 10)}
                  {p.metricName && p.metricBefore != null && p.metricAfter != null ? ` · ${p.metricName}: ${p.metricBefore} to ${p.metricAfter}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-12 rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="font-semibold text-zinc-900">Want the same thing running for your business?</p>
        <p className="mt-1 text-sm text-zinc-600">Start with the free 60-second scan. No account, no credit card.</p>
        <Link
          href="/scan"
          className="mt-4 inline-block rounded-full bg-red-600 px-7 py-3 text-sm font-semibold text-white hover:bg-red-500"
        >
          Get my free visibility score →
        </Link>
      </div>
    </div>
  );
}
