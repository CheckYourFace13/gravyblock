import Link from "next/link";
import { AutopilotRoadmap } from "@/components/autopilot-roadmap";
import { LeadCaptureCard } from "@/components/lead-capture-card";
import { buildRoadmapRows } from "@/lib/growth/roadmap";
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
}: {
  payload: ReportPayload;
  publicId: string;
  businessId?: string;
}) {
  const badge = opportunityBadge(payload.opportunityLevel);
  const roadmapRows = buildRoadmapRows(payload);

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-12 sm:px-6">
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
          {businessId ? (
            <Link
              href={`/workspace/${businessId}`}
              className="inline-flex w-full items-center justify-center rounded-full border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-900 hover:border-zinc-400"
            >
              Open growth workspace
            </Link>
          ) : null}
        </div>
      </div>

      <AutopilotRoadmap rows={roadmapRows} />

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Data sources used</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Verified listing data, on-page crawl, observational social links, and modeled local rank — labeled so you know
          what is authoritative vs directional.
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
            <Metric k="Google place ID" v={payload.googlePresence.placeId} />
            <Metric k="Category" v={payload.googlePresence.category} />
            <Metric k="Rating" v={payload.googlePresence.rating?.toString()} />
            <Metric k="Review count" v={payload.googlePresence.reviewCount?.toString()} />
            <Metric k="Open now" v={typeof payload.googlePresence.openNow === "boolean" ? String(payload.googlePresence.openNow) : undefined} />
            <Metric k="Match confidence" v={`${payload.googlePresence.confidence}%`} />
          </dl>
        </article>
        <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Google presence</h2>
          <p className="mt-1 text-sm text-zinc-600">Public Maps-oriented fields from Google Places.</p>
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
                <span className="text-zinc-600"> — {f.detail}</span>
              </li>
            ))}
          </ul>
        </article>
        <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Search visibility</h2>
          <p className="mt-1 text-sm text-zinc-600">
            {payload.searchVisibility.verified
              ? "Verified Search Console metrics (owner token)."
              : "Estimated from sampled local queries — owner Search Console was not linked on this public scan."}
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
          {payload.searchVisibility.topQueries.length ? (
            <ul className="mt-4 space-y-2 text-sm text-zinc-700">
              {payload.searchVisibility.topQueries.slice(0, 5).map((q) => (
                <li key={q.query} className="rounded-lg bg-zinc-50 px-3 py-2">
                  <span className="font-semibold text-zinc-900">{q.query}</span>
                  <span className="text-zinc-600"> · {q.impressions} imp · pos {q.position}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </article>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Local ranking signals</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Per-query map-style estimates — read together with Search visibility (one shared story, expanded by query).
        </p>
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {payload.localRankingSignals.checks.map((check) => (
            <li key={check.query} className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 text-sm">
              <p className="font-semibold text-zinc-900">{check.query}</p>
              <p className="mt-1 text-zinc-600">
                Estimated position: {check.estimatedPosition ?? "not in sampled results"} · confidence {check.confidence}%
              </p>
              <p className="text-xs text-zinc-500">
                Map-pack presence: {check.inMapPack ? "yes" : "no"} · source: estimated_local_rank
              </p>
            </li>
          ))}
        </ul>
      </section>

      {payload.socialPresence ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">Social presence</h2>
              <p className="mt-1 max-w-3xl text-sm text-zinc-600">{payload.socialPresence.methodology}</p>
            </div>
            <p className={`text-3xl font-semibold ${scoreTone(payload.socialPresence.score)}`}>
              {payload.socialPresence.score}
            </p>
          </div>
          <p className="mt-3 text-sm text-zinc-700">{payload.socialPresence.signalsNote}</p>
          {payload.socialPresence.crawlNotes ? (
            <p className="mt-2 text-xs text-amber-800">Homepage fetch note: {payload.socialPresence.crawlNotes}</p>
          ) : null}
          {payload.socialPresence.profiles.length ? (
            <ul className="mt-4 grid gap-3 md:grid-cols-2">
              {payload.socialPresence.profiles.map((p) => (
                <li key={`${p.platform}-${p.url}`} className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 text-sm">
                  <p className="font-semibold capitalize text-zinc-900">{p.platform}</p>
                  <a className="mt-1 block truncate text-zinc-800 underline" href={p.url} target="_blank" rel="noreferrer">
                    {p.url}
                  </a>
                  <p className="mt-2 text-xs text-zinc-600">
                    Source:                     {p.discoverySource.replaceAll("_", " ")} · confidence {p.confidence}% · activity hint:{" "}
                    {p.activityHint.replaceAll("_", " ")}
                    {p.handle ? ` · handle: ${p.handle.startsWith("@") ? p.handle : `@${p.handle}`}` : null}
                  </p>
                  {p.notes ? <p className="mt-1 text-xs text-zinc-500">{p.notes}</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-zinc-600">No social URLs were extracted from the fetched homepage.</p>
          )}
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="text-lg font-semibold text-zinc-900">Highest-impact fixes</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Deduplicated priorities — each item appears once even when it influenced multiple sections above.
          </p>
          <ol className="mt-4 space-y-4">
            {payload.prioritizedFixes.map((fix, idx) => (
              <li key={fix.id} className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-4">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900 text-xs font-bold text-white">
                    {idx + 1}
                  </span>
                  <div>
                    <p className="font-semibold text-zinc-900">{fix.title}</p>
                    <p className="mt-1 text-sm text-zinc-600">{fix.detail}</p>
                    <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-red-700">
                      Impact: {fix.impact}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <LeadCaptureCard
          publicId={publicId}
          businessId={businessId}
          website={payload.business.website}
          placeId={payload.business.placeId}
        />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900">Section breakdown</h2>
          <p className="text-sm text-zinc-600">
            Each category blends what humans respond to with what search and maps systems tend to reward.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {payload.sections.map((section) => (
            <article key={section.key} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-zinc-900">{section.title}</h3>
                <span className={`text-2xl font-semibold ${scoreTone(section.score)}`}>{section.score}</span>
              </div>
              <p className="mt-2 text-sm text-zinc-600">{section.summary}</p>
              {section.issues.length ? (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Findings</p>
                  <ul className="space-y-2 text-sm text-zinc-700">
                    {section.issues.map((issue) => (
                      <li key={issue.id} className="rounded-lg bg-zinc-50 px-3 py-2">
                        <span className="font-semibold text-zinc-900">{issue.title}</span>
                        <span className="text-zinc-600"> — {issue.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {section.fixes.length ? (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Recommended fixes</p>
                  <ul className="space-y-2 text-sm text-zinc-700">
                    {section.fixes.map((fix) => (
                      <li key={fix.id} className="rounded-lg border border-dashed border-red-200 bg-red-50/60 px-3 py-2">
                        <span className="font-semibold text-zinc-900">{fix.title}</span>
                        <span className="text-zinc-600"> — {fix.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>
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
