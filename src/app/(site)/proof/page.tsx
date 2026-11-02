import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { getPublicProof } from "@/lib/proof/ledger";
import { getPublishedCaseStudies } from "@/lib/proof/sales";
import { getShowcaseBusinesses, type ProofActivity } from "@/lib/proof/get-showcase-businesses";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Proof: what GravyBlock has verified and measured",
  description:
    "Verified activity and measured outcomes from businesses we operate ourselves, kept in three separate levels: verified actions, measured search results, and business results. Only confirmed work is shown, and zeros are shown as zeros.",
  alternates: { canonical: "/proof" },
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Turn stored enum-like labels ("online_brand") into readable text. */
const readable = (v: string) => {
  const t = v.replace(/_/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

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
  const [showcased, ledger, caseStudies] = await Promise.all([getShowcaseBusinesses(), getPublicProof({ limit: 12 }), getPublishedCaseStudies(6)]);

  // Three distinct levels, never blended. Level 1 counts externally verified actions that exist today; levels 2 and 3 count
  // only ledger rows that carry a measured before and after. Website edits to house sites were withdrawn and are not counted.
  const level2 = ledger.filter((p) => p.proofLevel === 2).length;
  const level3 = ledger.filter((p) => p.proofLevel >= 3).length;
  const liveLinks = showcased.reduce((n, b) => n + (b.activity.authority?.liveLinks.length ?? 0), 0);
  const pitches = showcased.reduce((n, b) => n + (b.activity.authority?.outreachSent ?? 0), 0);
  const verifiedActions = showcased.reduce((n, b) => {
    const a = b.activity;
    return n + (a.listingChecks?.checked ?? 0) + a.gbpPosts + a.gbpPhotos + a.socialPosts + a.reviewReplies + (a.authority?.liveLinks.length ?? 0);
  }, ledger.filter((p) => p.proofLevel === 1).length);

  return (
    <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-800">Proof, not promises</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
        What GravyBlock has verified, and what it has measured.
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-zinc-600">
        These are businesses operated by GravyBlock&apos;s owner, running the same automation customers get. The numbers are
        pulled live from the database that powers customer workspaces. They are kept in three separate levels, and an empty
        level is shown as zero.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Level 1: verified action</p>
          <p className="mt-2 text-3xl font-semibold text-zinc-900">{verifiedActions}</p>
          <p className="mt-1 text-xs text-zinc-600">
            Work confirmed at an external destination, such as listing checks, Google and social posts, review replies, or links
            found live on other sites. It shows the work happened, not that results followed.
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-sky-700">Level 2: search or visibility result</p>
          <p className="mt-2 text-3xl font-semibold text-zinc-900">{level2}</p>
          <p className="mt-1 text-xs text-zinc-600">
            A measured before and after in impressions, clicks, position, map-pack rank or AI mentions.
            {level2 === 0 ? " None recorded yet." : ""}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Level 3: business result</p>
          <p className="mt-2 text-3xl font-semibold text-zinc-900">{level3}</p>
          <p className="mt-1 text-xs text-zinc-600">
            A measured before and after in leads, calls, bookings, sign-ups or revenue.
            {level3 === 0 ? " None recorded yet." : ""}
          </p>
        </div>
      </div>

      <p className="mt-4 max-w-3xl rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
        Authority outreach so far: {pitches} {pitches === 1 ? "pitch" : "pitches"} sent and {liveLinks} {liveLinks === 1 ? "link" : "links"}{" "}
        verified live on other sites. These businesses&apos; own websites are read-only for GravyBlock: it observes and measures them
        but does not edit them, and earlier on-site edits were withdrawn and are not counted anywhere on this page. The visibility
        number on each card is GravyBlock&apos;s own score, not a measure of traffic or revenue.
      </p>

      {showcased.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-zinc-200 bg-zinc-50 p-8 text-center">
          <p className="text-sm text-zinc-600">
            We&apos;re assembling this page right now. Live business data appears here as each business is connected. In
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
                    {[b.vertical ? readable(b.vertical) : null, b.city].filter(Boolean).join(" · ") || "Local business"}
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
          <h2 className="text-xl font-semibold text-zinc-900">Verified before and after</h2>
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
                <div className="flex items-center gap-2">
                  <p className="font-medium text-zinc-900">{p.businessName}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${p.proofLevel >= 3 ? "bg-emerald-100 text-emerald-800" : p.proofLevel === 2 ? "bg-sky-100 text-sky-800" : "bg-zinc-100 text-zinc-600"}`}>
                    {p.proofLevel >= 3 ? "Business result" : p.proofLevel === 2 ? "Search/visibility result" : "Verified work (not an outcome)"}
                  </span>
                </div>
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
        <p className="mt-1 text-sm text-zinc-600">
          Start with the free scan: your visibility score and what GravyBlock would do about each finding. About a minute, no
          credit card.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <Link
            href="/scan"
            className="inline-block rounded-full bg-red-600 px-7 py-3 text-sm font-semibold text-white hover:bg-red-500"
          >
            Get my free visibility score →
          </Link>
          <Link
            href="/how-it-works"
            className="inline-block rounded-full border border-zinc-300 bg-white px-7 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            How it works
          </Link>
        </div>
      </div>
    </div>
  );
}
