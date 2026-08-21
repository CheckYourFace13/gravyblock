import type { Metadata } from "next";
import Link from "next/link";
import { getWorkspaceBundle } from "@/lib/report/repository";
import { getAutopilotWorkspace } from "@/lib/autopilot/repository";
import { getAiVisibilityStats } from "@/lib/ai-visibility/llm-probes";
import { getGeoAuditScore } from "@/lib/audit/geo-audit";
import { getSiteTechAudit } from "@/lib/audit/tech-audit";
import { computeAeoScore } from "@/lib/scoring/aeo-score";
import { computeEntityScore } from "@/lib/scoring/entity-score";
import { ScoresOverviewSection } from "@/app/(site)/workspace/[businessId]/scores-overview-section";
import { CompetitorPanel } from "@/app/(site)/workspace/[businessId]/competitor-panel";
import { IssueTrackerPanel } from "@/app/(site)/workspace/[businessId]/issue-tracker-panel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "A real GravyBlock report — sample local growth scan | GravyBlock",
  description:
    "An actual GravyBlock account, live scores and all — not a mockup. See exactly what a business gets: visibility scores, findings, and what runs automatically.",
  alternates: { canonical: "https://gravyblock.com/examples/sample-local-growth-report" },
};

// Boating Chicago — a real business the GravyBlock founder personally owns and
// runs on the same automation paying customers get (same one shown on /proof).
// Using a real, currently-live account instead of a mockup so nothing here is
// invented — see the honest gaps called out inline where this specific
// business doesn't have a data point yet (e.g. no ranking checks recorded).
const SAMPLE_BUSINESS_ID = "9cb1c401-34d8-4f52-8dc9-b6a1e3aedecf";

export default async function SampleLocalGrowthReportPage() {
  const bundle = await getWorkspaceBundle(SAMPLE_BUSINESS_ID);
  if (!bundle) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <p className="text-zinc-600">Sample report is temporarily unavailable.</p>
      </div>
    );
  }

  const autopilot = await getAutopilotWorkspace(SAMPLE_BUSINESS_ID).catch(() => null);
  const aiVisibility = await getAiVisibilityStats(SAMPLE_BUSINESS_ID).catch(() => ({ total: 0, mentioned: 0, byEngine: {} as Record<string, unknown>, recentChecks: [] }));
  const geoAudit = await getGeoAuditScore(SAMPLE_BUSINESS_ID).catch(() => null);
  const techAudit = await getSiteTechAudit(SAMPLE_BUSINESS_ID).catch(() => null);

  const techItems = techAudit?.items ?? [];
  const techPass = (key: string) => techItems.find((i) => i.key === key)?.status === "pass";
  const publishedContentCount = autopilot?.publishedContent.filter((p) => p.status === "published").length ?? 0;
  const latestReviewCount = bundle.placeProfiles[0]?.reviewCount ?? 0;

  const aeoResult = computeAeoScore({
    websiteAudit: bundle.business.website
      ? {
          score: techAudit?.score ?? 0,
          findings: [],
          signals: {
            hasTitle: techPass("no-title"),
            hasMetaDescription: techPass("no-meta-description"),
            hasH1: techPass("no-h1"),
            hasViewport: techPass("no-viewport"),
            hasStructuredData: techPass("no-structured-data"),
            hasClickToCall: techPass("no-tel"),
            locationClarity: techPass("no-location"),
            hoursClarity: techPass("no-hours"),
            ctaClarity: techPass("no-cta"),
            speedHook: "not_tested" as const,
          },
        }
      : null,
    publishedContentCount,
    hasSchemaMarkup: publishedContentCount > 0,
    reviewCount: latestReviewCount,
  });

  const citationMismatches = autopilot?.citationIssues.filter((c) => c.mismatchNote !== null).length ?? 0;
  const citationTotal = autopilot?.citationIssues.length ?? 0;
  const aiMentionRate = aiVisibility.total > 0 ? aiVisibility.mentioned / aiVisibility.total : 0;

  const entityResult = computeEntityScore({
    citationMismatches,
    citationTotal,
    socialProfilesFound: bundle.socialProfiles.length,
    hasWebsite: Boolean(bundle.business.website),
    hasPhone: Boolean(bundle.business.phone),
    hasAddress: Boolean(bundle.business.address),
    aiMentionRate,
  });

  const latestSnapshot = bundle.snapshots[0] ?? null;
  const previousSnapshot = bundle.snapshots[1] ?? null;
  const scoreDelta =
    latestSnapshot && previousSnapshot ? latestSnapshot.overallScore - previousSnapshot.overallScore : null;

  const openRecs = bundle.recommendations.filter((r) => r.status !== "done");
  const fixNow = openRecs.filter((r) => r.lane === "FIX_NOW");
  const improveNext = openRecs.filter((r) => r.lane === "IMPROVE_NEXT");
  const ongoing = openRecs.filter((r) => r.lane === "ONGOING_MONITORING");

  const totalFindings = openRecs.length;

  return (
    <div className="bg-white">
      {/* Header */}
      <section className="bg-gradient-to-b from-red-50 to-white px-4 pt-12 pb-8 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-800">A real GravyBlock report</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
            {bundle.business.name}
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            {bundle.business.vertical ?? "Local business"} · Automation running since account creation · Snapshot as of{" "}
            {new Date(bundle.business.updatedAt).toLocaleDateString()}
          </p>
          <div className="mt-4 max-w-2xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            This is not a mockup. It&apos;s a real GravyBlock account — the same one shown on{" "}
            <Link href="/proof" className="font-semibold underline">
              /proof
            </Link>
            , owned and operated by the founder, running the exact automation paying customers get. Some sections below
            are honestly empty where this specific business hasn&apos;t generated that data point yet (e.g. no
            competitor ranking checks have run for it) — we show that plainly instead of filling it in.
          </div>
          {latestSnapshot ? (
            <div className="mt-6 flex flex-wrap items-end gap-6">
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">Overall visibility</p>
                <p className="text-6xl font-bold text-zinc-900">{latestSnapshot.overallScore}</p>
              </div>
              <div className="pb-2">
                <p className="text-sm font-semibold text-zinc-700 uppercase">{latestSnapshot.opportunityLevel} opportunity</p>
                {scoreDelta !== null ? (
                  <p className={`text-sm font-semibold ${scoreDelta >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                    {scoreDelta >= 0 ? "+" : ""}
                    {scoreDelta} vs previous check
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {/* Scorecard — real component, real computed scores */}
      <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <h2 className="text-lg font-semibold text-zinc-900 mb-1">Scorecard</h2>
        <p className="text-sm text-zinc-500 mb-5">
          The exact same four scores and &quot;how to improve&quot; panel every GravyBlock customer sees in their own
          workspace.
        </p>
        <ScoresOverviewSection
          seoScore={latestSnapshot?.overallScore ?? null}
          geoScore={geoAudit?.overallScore ?? null}
          geoGrade={geoAudit?.grade ?? null}
          aeoScore={aeoResult.score}
          aeoGrade={aeoResult.grade}
          entityScore={entityResult.score}
          entityGrade={entityResult.grade}
          scoreDelta={scoreDelta}
          hasContentPublishing={publishedContentCount > 0}
          publishedCount={publishedContentCount}
          probesRun={aiVisibility.total}
        />
      </section>

      {/* Top findings */}
      <section className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <h2 className="text-lg font-semibold text-zinc-900 mb-1">
          Top opportunities ({totalFindings} open)
        </h2>
        <p className="text-sm text-zinc-500 mb-5">
          Real, currently-open recommendations for this account — these are the ones that need the owner (see
          &quot;What happens automatically vs. what needs you&quot; below for what GravyBlock is already doing on its own).
        </p>
        <div className="space-y-5">
          {fixNow.length > 0 ? (
            <FindingGroup title="Fix now" tone="red" items={fixNow} />
          ) : null}
          {improveNext.length > 0 ? (
            <FindingGroup title="Improve next" tone="amber" items={improveNext} />
          ) : null}
          {ongoing.length > 0 ? (
            <FindingGroup title="Ongoing monitoring" tone="zinc" items={ongoing} />
          ) : null}
          {totalFindings === 0 ? <p className="text-sm text-zinc-400">No open findings right now.</p> : null}
        </div>
      </section>

      {/* Competitors — real component, honest empty state if no data */}
      <section className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <h2 className="text-lg font-semibold text-zinc-900 mb-1">Competitive picture</h2>
        <p className="text-sm text-zinc-500 mb-5">
          Real nearby competitor tracking — populated once a scan captures local competitor data for this account.
        </p>
        <CompetitorPanel businessId={SAMPLE_BUSINESS_ID} />
      </section>

      {/* Citations — real component */}
      <section className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <h2 className="text-lg font-semibold text-zinc-900 mb-1">Citations &amp; listing consistency</h2>
        <p className="text-sm text-zinc-500 mb-5">
          Real, currently-tracked citation checks — GravyBlock monitors and flags mismatches, it does not fabricate a
          count to look more active than it is.
        </p>
        <IssueTrackerPanel businessId={SAMPLE_BUSINESS_ID} />
      </section>

      {/* AI visibility */}
      <section className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <h2 className="text-lg font-semibold text-zinc-900 mb-1">AI visibility (GEO)</h2>
        <p className="text-sm text-zinc-500 mb-3">
          Live probes against ChatGPT, Perplexity, and Gemini — asking each one real questions a customer might, and
          checking whether this business gets mentioned.
        </p>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          {aiVisibility.total > 0 ? (
            <p className="text-sm text-zinc-700">
              <span className="font-semibold text-zinc-900">{aiVisibility.mentioned} of {aiVisibility.total}</span> real
              probes returned a mention of this business across the engines tested.
            </p>
          ) : (
            <p className="text-sm text-amber-800">
              No probes have run for this account yet — monthly probes are scheduled automatically and results appear
              here once the first cycle completes. We don&apos;t show a fabricated result in the meantime.
            </p>
          )}
        </div>
      </section>

      {/* Automation preview */}
      <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <div className="rounded-2xl border-2 border-red-200 bg-red-50/50 p-6">
          <h2 className="text-lg font-semibold text-zinc-900 mb-2">What happens automatically vs. what needs you</h2>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-sm font-semibold text-red-800 mb-2">GravyBlock handles this automatically</p>
              <ul className="space-y-1.5 text-sm text-zinc-700">
                <li>✓ Weekly visibility score refresh and history</li>
                <li>✓ Articles written and published to the site ({publishedContentCount} published so far)</li>
                <li>✓ Schema markup injected into every published article</li>
                <li>✓ Monthly AI-visibility probes across ChatGPT, Perplexity, and Gemini</li>
                <li>✓ Citation monitoring and mismatch flagging</li>
                <li>✓ Backlink outreach attempts to real, discovered contacts (never guessed addresses)</li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-800 mb-2">Still needs the owner</p>
              <ul className="space-y-1.5 text-sm text-zinc-700">
                <li>○ Connecting Google Search Console for verified ranking data</li>
                <li>○ Connecting Google Business Profile for posts/photos/Q&amp;A automation</li>
                <li>○ Creating missing social profiles (GravyBlock posts to existing ones, doesn&apos;t create new ones)</li>
                <li>○ Structural website fixes flagged above (e.g. adding a click-to-call link)</li>
                <li>○ Responding personally to reviews GravyBlock drafts replies for</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-4xl px-4 pb-16 sm:px-6 text-center">
        <h2 className="text-2xl font-semibold text-zinc-900">See your own business&apos;s real numbers</h2>
        <p className="mt-2 text-zinc-600">Free, 60 seconds, no credit card. Same scan, same real scoring.</p>
        <Link
          href="/scan"
          className="mt-5 inline-block rounded-full bg-red-600 px-8 py-3.5 text-sm font-semibold text-white hover:bg-red-500 shadow-sm"
        >
          Run your free scan →
        </Link>
      </section>
    </div>
  );
}

function FindingGroup({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "red" | "amber" | "zinc";
  items: Array<{ id: string; title: string; detail: string; category: string }>;
}) {
  const toneClasses = {
    red: "border-red-200 bg-red-50",
    amber: "border-amber-200 bg-amber-50",
    zinc: "border-zinc-200 bg-zinc-50",
  }[tone];
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">{title}</p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className={`rounded-xl border ${toneClasses} p-4`}>
            <p className="text-sm font-semibold text-zinc-900">{item.title}</p>
            <p className="mt-1 text-sm text-zinc-600">{item.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
