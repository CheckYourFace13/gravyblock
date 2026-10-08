"use client";
import type { PromoCode } from "@/lib/stripe/promo-codes";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AutopilotRoadmap } from "@/components/autopilot-roadmap";
import { ReportUnlockCard } from "@/components/report-unlock-card";
import { ScaleOffer, StickyScaleBar } from "@/components/scale-cta";
import { buildRoadmapRows } from "@/lib/growth/roadmap";
import { describeAutopilotAction } from "@/lib/growth/autopilot-actions";
import type { DataSourceAttribution, ReportPayload } from "@/lib/report/types";

function scoreTone(score: number) {
  if (score >= 78) return "text-zinc-900";
  if (score >= 62) return "text-red-700";
  return "text-red-800";
}

function opportunityBadge(level: ReportPayload["opportunityLevel"]) {
  if (level === "high") return { label: "High opportunity", className: "bg-red-100 text-red-900" };
  if (level === "medium") return { label: "Medium opportunity", className: "bg-zinc-100 text-zinc-800" };
  return { label: "Polish & scale", className: "bg-zinc-900 text-white" };
}

function sourceLabel(source: string) {
  switch (source) {
    case "google_places":
      return "Google Places";
    case "google_search_console":
      return "Google Search Console";
    case "site_crawl":
      return "Website crawl";
    case "estimated_local_rank":
      return "Estimated local rank";
    case "google_business_profile":
      return "Google Business Profile";
    case "social_public_discovery":
      return "Social link discovery";
    default:
      return source.replaceAll("_", " ");
  }
}

function sourceModeLine(source: DataSourceAttribution) {
  if (source.source === "social_public_discovery") {
    return `Public-page observation · ${source.used ? "used in this report" : "not used"}`;
  }
  return `${source.mode === "verified" ? "Verified signal" : "Estimated signal"} · ${source.used ? "used in this report" : "not used"}`;
}

export function ReportView({
  payload,
  publicId,
  businessId,
  initiallyUnlocked,
  unlockToken,
  selectedPlan,
  promoCode,
}: {
  payload: ReportPayload;
  publicId: string;
  businessId?: string;
  initiallyUnlocked: boolean;
  unlockToken?: string | null;
  selectedPlan?: "starter" | "growth" | "pro" | "agency" | null;
  promoCode?: PromoCode | null;
}) {
  const [unlocked, setUnlocked] = useState(initiallyUnlocked);
  const badge = opportunityBadge(payload.opportunityLevel);
  const roadmapRows = buildRoadmapRows(payload);
  const topFindings = useMemo(() => payload.prioritizedFixes.slice(0, 3), [payload.prioritizedFixes]);
  const freeEvidence = useMemo(() => {
    const entries: Array<{ label: string; value: string }> = [];
    if (payload.googlePresence?.category) entries.push({ label: "Google category", value: payload.googlePresence.category });
    if (payload.googlePresence?.reviewCount != null)
      entries.push({ label: "Review count", value: String(payload.googlePresence.reviewCount) });
    entries.push({
      label: "Website conversion score",
      value: String(payload.websiteConversionHealth.score),
    });
    if (payload.socialPresence) {
      entries.push({
        label: "Social profiles found",
        value: String(payload.socialPresence.profiles.length),
      });
      entries.push({
        label: "Social coverage score",
        value: String(payload.socialPresence.score),
      });
    }
    const firstRank = payload.localRankingSignals?.checks[0];
    if (firstRank) {
      entries.push({
        label: `Estimated local rank (${firstRank.query})`,
        value: firstRank.estimatedPosition ? `#${firstRank.estimatedPosition}` : "not in sampled results",
      });
    }
    entries.push({
      label: "AI-answer clarity signal",
      value: payload.searchVisibility.verified ? "Verified search metrics linked" : "Estimated from scan data",
    });
    return entries.slice(0, 6);
  }, [payload]);
  const chosenPlan = (["starter", "growth", "pro", "agency"] as string[]).includes(selectedPlan ?? "") ? selectedPlan : null;
  const promoQuery = promoCode ? `promo=${encodeURIComponent(promoCode)}` : "";
  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-12 pb-28 sm:px-6 md:pb-12">
      <div className="flex flex-col gap-6 rounded-3xl border border-zinc-200 bg-gradient-to-br from-white via-white to-red-50 p-8 shadow-sm sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-700">{payload.brand} report</p>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">{payload.summary.title}</h1>
          <p className="max-w-2xl text-lg text-zinc-600">{payload.summary.verdict}</p>
          <div className="flex flex-wrap gap-3 text-sm text-zinc-600">
            {payload.business.address ? <span>{payload.business.address}</span> : null}
            {payload.business.phone ? <span>{payload.business.phone}</span> : null}
            {payload.business.website ? (
              <a className="font-medium text-zinc-900 underline" href={payload.business.website}>
                Website
              </a>
            ) : null}
            {payload.business.googleMapsUri ? (
              <a className="font-medium text-zinc-900 underline" href={payload.business.googleMapsUri}>
                Google Maps
              </a>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-zinc-200 bg-white/80 px-6 py-5 shadow-inner">
          <span className={`text-5xl font-semibold ${scoreTone(payload.summary.score)}`}>{payload.summary.score}</span>
          <p className="text-sm font-medium text-zinc-700">Overall readiness score</p>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badge.className}`}>{badge.label}</span>
          <p className="text-xs text-zinc-500">Generated {new Date(payload.generatedAt).toLocaleString()}</p>
        </div>
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">What we found</h2>
        <p className="mt-1 text-sm text-zinc-600">Your biggest opportunities, and what GravyBlock will do about each one.</p>
        <ol className="mt-4 space-y-3">
          {topFindings.map((fix, idx) => {
            const action = describeAutopilotAction(roadmapRows.find((r) => r.title === fix.title && r.category !== "priority")?.category ?? "priority");
            return (
              <li key={fix.id} className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-4">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-bold text-white">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">We found</p>
                    <p className="font-semibold text-zinc-900">{fix.title}</p>
                    <p className="mt-1 text-sm text-zinc-600">{fix.detail}</p>
                    <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-red-700">GravyBlock will</p>
                    <p className="text-sm text-zinc-800">{action.whatWeDo}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <ScaleOffer publicId={publicId} businessId={businessId} unlockToken={unlockToken} placement="top" />

      {unlocked ? (
        <>
          <AutopilotRoadmap rows={roadmapRows} />

          <ScaleOffer publicId={publicId} businessId={businessId} unlockToken={unlockToken} placement="mid" heading="Ready for GravyBlock to handle this?" />

          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-900">Data sources used</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Verified listing data, on-page crawl, observational social links, and modeled local rank.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {payload.sourceAttribution.map((source) => (
                <div key={source.source} className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 text-sm">
                  <p className="font-semibold text-zinc-900">{sourceLabel(source.source)}</p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">{sourceModeLine(source)}</p>
                  <p className="mt-1 text-xs text-zinc-600">{source.note}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-zinc-900">Business snapshot</h2>
              <p className="mt-1 text-sm text-zinc-600">Core identity fields from the live Google listing.</p>
              <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <Metric k="Website (from Google)" v={payload.business.website} />
                {payload.googlePresence ? (
                  <>
                    <Metric k="Google place ID" v={payload.googlePresence.placeId} />
                    <Metric k="Category" v={payload.googlePresence.category} />
                    <Metric k="Rating" v={payload.googlePresence.rating?.toString()} />
                    <Metric k="Review count" v={payload.googlePresence.reviewCount?.toString()} />
                    <Metric k="Open now" v={typeof payload.googlePresence.openNow === "boolean" ? String(payload.googlePresence.openNow) : undefined} />
                    <Metric k="Match confidence" v={`${payload.googlePresence.confidence}%`} />
                  </>
                ) : (
                  <Metric k="Mode" v="Website scan (no Google listing)" />
                )}
              </dl>
            </article>
            <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-zinc-900">Google presence</h2>
              <p className="mt-1 text-sm text-zinc-600">Public Maps-oriented fields from Google Places.</p>
              {payload.googlePresence ? (
                <div className="mt-4 space-y-2 text-sm text-zinc-700">
                  <p>
                    <span className="font-semibold text-zinc-900">Address:</span> {payload.googlePresence.address ?? "n/a"}
                  </p>
                  <p>
                    <span className="font-semibold text-zinc-900">Status:</span> {payload.googlePresence.businessStatus ?? "n/a"}
                  </p>
                  {payload.googlePresence.mapsUri ? (
                    <a href={payload.googlePresence.mapsUri} className="font-semibold text-zinc-900 underline">
                      Open Google Maps profile
                    </a>
                  ) : null}
                </div>
              ) : (
                <p className="mt-4 text-sm text-zinc-500">Not applicable. This business was scanned by website URL rather than a Google listing.</p>
              )}
            </article>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-zinc-900">Website conversion health</h2>
              <p className="mt-1 text-sm text-zinc-600">Homepage fetch for on-page trust and conversion signals.</p>
              <p className={`mt-3 text-3xl font-semibold ${scoreTone(payload.websiteConversionHealth.score)}`}>
                {payload.websiteConversionHealth.score}
              </p>
              <ul className="mt-3 space-y-2 text-sm text-zinc-700">
                {payload.websiteConversionHealth.findings.slice(0, 6).map((f) => (
                  <li key={f.key} className="rounded-lg bg-zinc-50 px-3 py-2">
                    <span className="font-semibold text-zinc-900">{f.title}</span>
                    <span className="text-zinc-600">: {f.detail}</span>
                  </li>
                ))}
              </ul>
            </article>
            <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-zinc-900">Search visibility</h2>
              <p className="mt-1 text-sm text-zinc-600">
                {payload.searchVisibility.verified
                  ? "Verified Search Console metrics (owner token)."
                  : "Estimated from sampled local queries. Owner Search Console was not linked on this public scan."}
              </p>
              {payload.searchVisibility.aggregate ? (
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <Metric k="Clicks" v={String(payload.searchVisibility.aggregate.clicks)} />
                  <Metric k="Impressions" v={String(payload.searchVisibility.aggregate.impressions)} />
                  <Metric k="CTR" v={`${(payload.searchVisibility.aggregate.ctr * 100).toFixed(2)}%`} />
                  <Metric k="Avg position" v={String(payload.searchVisibility.aggregate.averagePosition)} />
                </div>
              ) : (
                <p className="mt-3 text-sm text-zinc-600">{payload.searchVisibility.note}</p>
              )}
            </article>
          </section>

          {payload.localRankingSignals ? (
            <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-zinc-900">Local ranking signals</h2>
              <ul className="mt-4 grid gap-3 md:grid-cols-2">
                {payload.localRankingSignals.checks.map((check) => (
                  <li key={check.query} className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 text-sm">
                    <p className="font-semibold text-zinc-900">{check.query}</p>
                    <p className="mt-1 text-zinc-600">
                      Estimated position: {check.estimatedPosition ?? "not in sampled results"} · confidence {check.confidence}%
                    </p>
                    <p className="text-xs text-zinc-500">Map-pack presence: {check.inMapPack ? "yes" : "no"}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {payload.socialPresence ? (
            <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-zinc-900">Social presence</h2>
                  <p className="mt-1 max-w-3xl text-sm text-zinc-600">{payload.socialPresence.methodology}</p>
                </div>
                <p className={`text-3xl font-semibold ${scoreTone(payload.socialPresence.score)}`}>{payload.socialPresence.score}</p>
              </div>
              {payload.socialPresence.profiles.length ? (
                <ul className="mt-4 grid gap-3 md:grid-cols-2">
                  {payload.socialPresence.profiles.map((p) => (
                    <li key={`${p.platform}-${p.url}`} className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 text-sm">
                      <p className="font-semibold capitalize text-zinc-900">{p.platform}</p>
                      <a className="mt-1 block truncate text-zinc-800 underline" href={p.url} target="_blank" rel="noreferrer">
                        {p.url}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-zinc-600">No social URLs were extracted from the fetched homepage.</p>
              )}
            </section>
          ) : null}

          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-900">Everything found, ranked by impact</h2>
            <p className="mt-1 text-sm text-zinc-600">The full list behind the roadmap above — what GravyBlock would act on, in priority order.</p>
            <ol className="mt-4 space-y-3">
              {payload.prioritizedFixes.map((fix, idx) => (
                <li key={fix.id} className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-4">
                  <p className="font-semibold text-zinc-900">
                    {idx + 1}. {fix.title}
                  </p>
                  <p className="mt-1 text-sm text-zinc-600">{fix.detail}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-zinc-900">Section breakdown</h2>
              <p className="text-sm text-zinc-600">Detailed findings and fixes across all scored categories.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {payload.sections.map((section) => (
                <article key={section.key} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-base font-semibold text-zinc-900">{section.title}</h3>
                    <span className={`text-2xl font-semibold ${scoreTone(section.score)}`}>{section.score}</span>
                  </div>
                  <p className="mt-2 text-sm text-zinc-600">{section.summary}</p>
                </article>
              ))}
            </div>
          </section>
          <ScaleOffer publicId={publicId} businessId={businessId} unlockToken={unlockToken} placement="bottom" heading="Have GravyBlock work on this" />
        </>
      ) : (
        <section className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-white/70 to-white backdrop-blur-[2px]" />
          <div className="space-y-3 opacity-60">
            <div className="h-7 w-56 rounded bg-zinc-100" />
            <div className="h-4 w-full rounded bg-zinc-100" />
            <div className="h-4 w-4/5 rounded bg-zinc-100" />
            <div className="h-40 rounded-2xl bg-zinc-100" />
          </div>
          <div className="relative mt-8">
            <ReportUnlockCard
              publicId={publicId}
              onUnlocked={() => setUnlocked(true)}
              selectedPlan={chosenPlan}
              businessId={businessId}
              promoCode={promoCode}
            />
          </div>
        </section>
      )}

      <StickyScaleBar publicId={publicId} businessId={businessId} unlockToken={unlockToken} />
    </div>
  );
}

function Metric({ k, v }: { k: string; v?: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{k}</dt>
      <dd className="text-zinc-900">{v && v.trim() ? v : "n/a"}</dd>
    </div>
  );
}
