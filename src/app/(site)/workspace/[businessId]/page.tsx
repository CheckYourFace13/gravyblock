import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutopilotRoadmap } from "@/components/autopilot-roadmap";
import { getAutopilotWorkspace } from "@/lib/autopilot/repository";
import type { RoadmapLane } from "@/lib/growth/roadmap";
import { getWorkspaceBundle } from "@/lib/report/repository";
import { normalizePlanTierFromDb, planFeatures, type PlanTier } from "@/lib/plans";
import { requireBusinessAccess } from "@/lib/auth/customer-guards";
import { getBusinessActivity, type ActivityItem } from "@/lib/workspace/activity-feed";
import { CheckoutButton, PortalButton } from "./billing-buttons";
import { LocationsSection } from "./locations-section";
import { getLocationsForBusiness } from "./location-actions";
import { ContentApprovalSection } from "./content-approval-section";
import { getQueuedDrafts } from "./content-approval-actions";
import { getReferralStats, referralUrlForBusiness } from "@/lib/referrals/referral-tracker";
import { getBusinessReviews } from "@/lib/reviews/review-fetcher";
import { ReviewsSection } from "./reviews-section";
import { CompetitorPanel } from "./competitor-panel";
import { IntegrationsSection } from "./integrations-section";
import { getPublishingTargets } from "./integrations-actions";
import { getAiVisibilityStats } from "@/lib/ai-visibility/llm-probes";
import { getGoogleConnection } from "@/lib/integrations/google-oauth";
import { GoogleIntegrationsSection } from "./google-integrations-section";
import { BusinessProfileSection } from "./business-profile-section";
import { getBusinessProfile } from "./business-profile-actions";
import { getGeoAuditScore } from "@/lib/audit/geo-audit";
import { getSiteTechAudit } from "@/lib/audit/tech-audit";
import { getDb, keywordRankings } from "@/lib/db";
import { desc as descOp, eq as eqOp } from "drizzle-orm";
import { SocialCredentialsSection } from "./social-credentials-section";
import { getSocialCredentials } from "./social-credentials-actions";
import { TopicClusterSection } from "./topic-cluster-section";
import { ReviewGatingSection } from "./review-gating-section";
import { getReviewGatingData } from "./review-gating-actions";
import { SchemaGeneratorSection } from "./schema-generator-section";
import { ReferralSection } from "./referral-section";
import { AiCitationSection } from "./ai-citation-section";
import { FaqBuilderSection } from "./faq-builder-section";
import { ScoresOverviewSection } from "./scores-overview-section";
import { computeAeoScore } from "@/lib/scoring/aeo-score";
import { computeEntityScore } from "@/lib/scoring/entity-score";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ plan?: string; promo?: string; google_connected?: string; google_error?: string }>;
};

import { normalizePromoCode } from "@/lib/stripe/promo-codes";
const normalizePromoCodeIntent = normalizePromoCode;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await params;
  return {
    title: "Workspace — GravyBlock",
    description: "Customer workspace for visibility, reports, and automation status.",
  };
}

export default async function WorkspacePage({ params, searchParams }: Props) {
  const { businessId } = await params;
  await requireBusinessAccess(businessId, `/workspace/${businessId}`);
  const query = await searchParams;
  const bundle = await getWorkspaceBundle(businessId);
  if (!bundle) notFound();
  const autopilot = await getAutopilotWorkspace(businessId).catch((err) => {
    console.error("[workspace] autopilot load failed", err);
    return {
      contentQueue: [] as Awaited<ReturnType<typeof getAutopilotWorkspace>>["contentQueue"],
      backlinkQueue: [] as Awaited<ReturnType<typeof getAutopilotWorkspace>>["backlinkQueue"],
      aiVisibilityChecks: [] as Awaited<ReturnType<typeof getAutopilotWorkspace>>["aiVisibilityChecks"],
      operatorTasks: [] as Awaited<ReturnType<typeof getAutopilotWorkspace>>["operatorTasks"],
      automationJobs: [] as Awaited<ReturnType<typeof getAutopilotWorkspace>>["automationJobs"],
      upcomingJobs: [] as Awaited<ReturnType<typeof getAutopilotWorkspace>>["upcomingJobs"],
      publishingJobs: [] as Awaited<ReturnType<typeof getAutopilotWorkspace>>["publishingJobs"],
      publishedContent: [] as Awaited<ReturnType<typeof getAutopilotWorkspace>>["publishedContent"],
      citationIssues: [] as Awaited<ReturnType<typeof getAutopilotWorkspace>>["citationIssues"],
    };
  });

  const tier: PlanTier = normalizePlanTierFromDb(bundle.business.planTier);
  const features = planFeatures(tier);

  const activity = await getBusinessActivity(businessId, 30).catch(() => [] as ActivityItem[]);
  const initialLocations = features.multiLocationReady
    ? await getLocationsForBusiness(businessId).catch(() => [])
    : [];

  const queuedDrafts = features.contentDraftsPerMonth > 0
    ? await getQueuedDrafts(businessId).catch(() => [])
    : [];

  const googleConn = await getGoogleConnection(businessId).catch(() => null);
  const businessProfile = await getBusinessProfile(businessId).catch(() => null);

  const [referralStats, referralUrl, reviews, publishingTargets, aiVisibility] = await Promise.all([
    getReferralStats(businessId).catch(() => ({ clicks: 0, scans: 0, paid: 0 })),
    Promise.resolve(referralUrlForBusiness(businessId)),
    features.reviewManagement
      ? getBusinessReviews(businessId, 15).catch(() => [])
      : Promise.resolve([]),
    features.contentDraftsPerMonth > 0
      ? getPublishingTargets(businessId).catch(() => [])
      : Promise.resolve([]),
    getAiVisibilityStats(businessId).catch(() => ({ total: 0, mentioned: 0, byEngine: {}, recentChecks: [] })),
  ]);

  // Feature #1: keyword rankings from GSC
  const topKeywords = await (async () => {
    try {
      const db = getDb();
      if (!db) return [];
      return await db
        .select()
        .from(keywordRankings)
        .where(eqOp(keywordRankings.businessId, businessId))
        .orderBy(descOp(keywordRankings.createdAt))
        .limit(15);
    } catch { return []; }
  })();

  // Feature #8: GEO audit score (uses existing probe data — zero API cost)
  const geoAudit = await getGeoAuditScore(businessId).catch(() => null);

  // Feature #10: site tech audit (uses existing crawl/audit_findings data — zero API cost)
  const techAudit = await getSiteTechAudit(businessId).catch(() => null);

  // Feature #9: social credentials for FB/IG section
  const socialCredentials = await getSocialCredentials(businessId).catch(() => null);

  // ─── Compute 4-score panel ────────────────────────────────────────────────
  // Derive website audit signals from techAudit items (zero extra API cost)
  const techItems = techAudit?.items ?? [];
  const techPass = (key: string) => techItems.find((i) => i.key === key)?.status === "pass";

  const syntheticWebsiteAudit = bundle.business.website
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
    : null;

  const publishedContentCount = autopilot.publishedContent.filter(
    (p) => p.status === "published",
  ).length;
  const latestReviewCount = bundle.placeProfiles[0]?.reviewCount ?? 0;

  const aeoResult = computeAeoScore({
    websiteAudit: syntheticWebsiteAudit,
    publishedContentCount,
    // techPass returns true when there is NO problem found — meaning structured data IS present
    hasSchemaMarkup: techPass("no-structured-data"),
    reviewCount: latestReviewCount,
  });

  const citationMismatches = autopilot.citationIssues.filter(
    (c) => c.mismatchNote !== null,
  ).length;
  const aiMentionRate =
    aiVisibility.total > 0 ? aiVisibility.mentioned / aiVisibility.total : 0;

  const entityResult = computeEntityScore({
    citationMismatches,
    citationTotal: autopilot.citationIssues.length,
    socialProfilesFound: bundle.socialProfiles.length,
    hasWebsite: Boolean(bundle.business.website),
    hasPhone: Boolean(bundle.business.phone),
    hasAddress: Boolean(bundle.business.address),
    aiMentionRate,
  });

  const geoScore =
    aiVisibility.total > 0
      ? Math.round((aiVisibility.mentioned / aiVisibility.total) * 100)
      : null;
  const geoGrade = geoAudit?.grade ?? null;

  // Review gating data (shareable link + private feedback)
  const reviewGatingData = features.reviewManagement
    ? await getReviewGatingData(businessId).catch(() => null)
    : null;

  const roadmapRows = bundle.recommendations.map((r) => ({
    lane: r.lane as RoadmapLane,
    category: r.category,
    title: r.title,
    detail: r.detail,
    impact: r.impact as "high" | "medium" | "low",
  }));

  const latest = bundle.snapshots[0];
  const previous = bundle.snapshots[1];
  const delta =
    latest && previous ? latest.overallScore - previous.overallScore : latest && !previous ? null : null;
  const latestAutomation = autopilot.automationJobs[0];
  const upcomingAutomation = autopilot.upcomingJobs[0];
  const localPageQueue = autopilot.contentQueue.filter((item) => item.kind === "location_page");
  const reviewTasks = autopilot.operatorTasks.filter(
    (task) => task.queue === "review_ops" || task.queue === "reputation_ops" || task.queue === "local_trust_ops",
  );
  const outreachTasks = autopilot.operatorTasks.filter((task) => task.queue === "outreach_ops");
  const gbpTasks = autopilot.operatorTasks.filter((task) => task.queue === "gbp_ops");
  const directoryTasks = autopilot.operatorTasks.filter((task) => task.queue === "citation_ops");
  const latestRunSummary =
    latestAutomation && latestAutomation.payload && typeof latestAutomation.payload === "object" && "runSummary" in latestAutomation.payload
      ? ((latestAutomation.payload as { runSummary?: Record<string, unknown> }).runSummary ?? null)
      : null;
  const latestDetectedChanges =
    latestRunSummary && Array.isArray(latestRunSummary.detectedChanges)
      ? (latestRunSummary.detectedChanges as string[])
      : [];
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const isThisMonth = (value: string) => new Date(value).getTime() >= monthStart.getTime();
  const contentIdeasThisMonth = autopilot.contentQueue.filter((item) => isThisMonth(item.createdAt)).length;
  const localPagesThisMonth = localPageQueue.filter((item) => isThisMonth(item.createdAt)).length;
  const draftsThisMonth = autopilot.publishedContent.filter(
    (item) => item.channel === "internal_draft" && isThisMonth(item.createdAt),
  ).length;
  const publishingQueuedThisMonth = autopilot.publishingJobs.filter(
    (job) => job.status === "pending" && isThisMonth(job.createdAt),
  ).length;
  const citationQueuedThisMonth = autopilot.citationIssues.filter((item) => isThisMonth(item.createdAt)).length;
  const reviewQueuedThisMonth = reviewTasks.filter((item) => isThisMonth(item.createdAt)).length;
  const backlinkQueuedThisMonth = autopilot.backlinkQueue.filter((item) => isThisMonth(item.createdAt)).length;
  const aiChecksThisMonth = autopilot.aiVisibilityChecks.filter((item) => isThisMonth(item.createdAt)).length;
  const rawPlan = query.plan?.toLowerCase() ?? "";
  const selectedPlan = (["starter", "growth", "pro", "agency"].includes(rawPlan)
    ? rawPlan
    : rawPlan === "base" || rawPlan === "entry" ? "starter" : null) as "starter" | "growth" | "pro" | "agency" | null;
  const promoCode = normalizePromoCodeIntent(query.promo);
  const billingStatus = bundle.business.subscriptionStatus ?? "none";
  const hasBillingCustomer = Boolean(bundle.business.stripeCustomerId);

  // Determine how many action items need attention
  const pendingGbpTasks = gbpTasks.filter((t) => t.status !== "completed");
  const pendingDirectoryTasks = directoryTasks.filter((t) => t.status !== "completed");
  const hasActionItems =
    pendingGbpTasks.length > 0 ||
    pendingDirectoryTasks.length > 0 ||
    queuedDrafts.length > 0 ||
    !businessProfile?.config;

  return (
    <div className="mx-auto max-w-6xl space-y-12 px-4 py-14 sm:px-6">

      {/* ─── Header ──────────────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-6 border-b border-zinc-200 pb-10 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-800">Your workspace</p>
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-900">{bundle.business.name}</h1>
          <p className="max-w-2xl text-sm text-zinc-600">
            Snapshot, tasks, content, reviews, and history, all in one place.
          </p>
          <div className="flex flex-wrap gap-2 text-xs font-medium text-zinc-600">
            {bundle.business.website ? (
              <a className="rounded-full bg-zinc-100 border border-zinc-300 px-3 py-1 hover:bg-zinc-200" href={bundle.business.website}>
                Website
              </a>
            ) : null}
            {bundle.business.googleMapsUri ? (
              <a className="rounded-full bg-zinc-100 border border-zinc-300 px-3 py-1 hover:bg-zinc-200" href={bundle.business.googleMapsUri}>
                Maps
              </a>
            ) : null}
            <span className="rounded-full bg-red-100 px-3 py-1 text-red-950">
              Plan: {features.label}{" "}
              {features.monthlyPrice > 0 ? `($${features.introPrice}/mo introductory)` : ""}
            </span>
            <span className="rounded-full bg-zinc-100 border border-zinc-300 px-3 py-1">Refresh: {features.refreshCadenceLabel}</span>
            {selectedPlan ? (
              <span className="rounded-full bg-red-100 px-3 py-1 text-red-950">
                Selected: {selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1)}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {tier !== "starter" && tier !== "growth" && tier !== "pro" && tier !== "agency" ? (
              <CheckoutButton
                businessId={businessId}
                plan="starter"
                requireGrowthUpsell
                label={selectedPlan === "starter" ? "Continue to Starter checkout" : "Start Starter"}
                promoCode={promoCode}
                className={
                  selectedPlan === "starter"
                    ? "rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
                    : "rounded-full bg-zinc-100 border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-200"
                }
              />
            ) : null}
            {tier !== "growth" && tier !== "pro" && tier !== "agency" ? (
              <CheckoutButton
                businessId={businessId}
                plan="growth"
                label={selectedPlan === "growth" ? "Continue to Scale checkout" : "Start Scale"}
                promoCode={promoCode}
                className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500"
              />
            ) : null}
            {tier !== "pro" && tier !== "agency" ? (
              <CheckoutButton
                businessId={businessId}
                plan="pro"
                label={selectedPlan === "pro" ? "Continue to Pro checkout" : "Start Pro"}
                promoCode={promoCode}
                className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
              />
            ) : null}
            {hasBillingCustomer ? (
              <PortalButton
                businessId={businessId}
                label="Manage billing"
                className="rounded-full bg-zinc-100 border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-200"
              />
            ) : null}
          </div>
        </div>
        <div className="flex flex-col gap-3 lg:min-w-[520px]">
          <ScoresOverviewSection
            seoScore={latest?.overallScore ?? null}
            geoScore={geoScore}
            geoGrade={geoGrade}
            aeoScore={aeoResult.score}
            aeoGrade={aeoResult.grade}
            entityScore={entityResult.score}
            entityGrade={entityResult.grade}
            scoreDelta={delta ?? null}
            hasContentPublishing={features.contentDraftsPerMonth > 0}
            publishedCount={publishedContentCount}
            probesRun={aiVisibility.total}
          />
          {tier === "agency" ? (
            <a
              href={`/workspace/${businessId}/report-print`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-zinc-900 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-zinc-800"
            >
              Export PDF report
            </a>
          ) : null}
        </div>
      </header>

      {/* ─── Free tier upsell ─────────────────────────────────────────────────── */}
      {!features.recurringRefresh ? (
        <div className="rounded-2xl border border-red-200 bg-red-50/60 px-5 py-5 text-sm text-zinc-900">
          <p>
            <span className="font-semibold">Starter unlocks recurring automation.</span> Free includes your scan history and core report.
            Starter adds monthly refreshes and content ideas. Scale adds full publishing, content drafts, and weekly sequences. See{" "}
            <Link href="/#plans" className="font-semibold underline">
              all plans
            </Link>
            .
          </p>
        </div>
      ) : null}

      {/* ─── FIRST-RUN ONBOARDING ─────────────────────────────────────────────── */}
      {!businessProfile?.config ? (
        <section className="rounded-2xl border border-red-200 bg-gradient-to-br from-red-50 to-white p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="shrink-0 rounded-full bg-red-100 p-2.5">
              <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold text-zinc-900">Let&apos;s get you set up — 3 quick steps</h2>
              <p className="mt-1 text-sm text-zinc-600">Complete these once and GravyBlock runs on autopilot from there.</p>
              <ol className="mt-4 space-y-3">
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[11px] font-bold text-white">1</span>
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">Complete your business profile</p>
                    <p className="text-xs text-zinc-500 mt-0.5">Your services, target city, and brand voice — used by every piece of content we generate.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className={`mt-0.5 shrink-0 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white ${googleConn ? "bg-green-600" : "bg-zinc-400"}`}>
                    {googleConn ? "✓" : "2"}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">
                      {googleConn ? "Google Search Console connected ✓" : "Connect Google Search Console"}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {googleConn ? "Keyword ranking data is flowing in." : "Unlocks keyword rankings and GSC data for your dashboard."}
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className={`mt-0.5 shrink-0 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white ${features.contentDraftsPerMonth > 0 ? "bg-zinc-900" : "bg-zinc-300"}`}>
                    {features.contentDraftsPerMonth > 0 ? "3" : "3"}
                  </span>
                  <div>
                    <p className={`text-sm font-semibold ${features.contentDraftsPerMonth > 0 ? "text-zinc-900" : "text-zinc-400"}`}>
                      {features.contentDraftsPerMonth > 0 ? "Approve your first article" : "Approve your first article (Scale plan)"}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {features.contentDraftsPerMonth > 0
                        ? "Your first AI-written SEO article should appear in the action items below within 24 hours."
                        : <>Upgrade to Scale to unlock weekly article publishing. <a href="/pricing" className="text-red-600 underline">See pricing →</a></>}
                    </p>
                  </div>
                </li>
              </ol>
            </div>
          </div>
        </section>
      ) : null}

      {/* ─── ACTION ITEMS ─────────────────────────────────────────────────────── */}
      {hasActionItems ? (
        <section className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-zinc-900">Action items</h2>
            <p className="mt-1 text-sm text-zinc-500">Things that need your attention right now.</p>
          </div>

          {/* Business profile — needed for content generation */}
          <BusinessProfileSection
            businessId={businessId}
            businessName={bundle.business.name}
            initialConfig={businessProfile?.config ?? null}
            discoveredSocials={businessProfile?.discoveredSocials ?? []}
            businessAddress={businessProfile?.business.address ?? null}
          />

          {/* Content drafts to approve */}
          {features.contentDraftsPerMonth > 0 && queuedDrafts.length > 0 ? (
            <ContentApprovalSection businessId={businessId} initialDrafts={queuedDrafts} />
          ) : null}

          {/* GBP tasks */}
          {pendingGbpTasks.length > 0 ? (
            <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-5 shadow-sm">
              <h3 className="text-base font-semibold text-zinc-900">Google Business Profile: paste these in</h3>
              <p className="mt-1 text-sm text-zinc-600">
                Go to{" "}
                <a href="https://business.google.com" className="text-red-800 underline" target="_blank" rel="noreferrer">
                  business.google.com
                </a>{" "}
                and paste each item below. Takes about 5 minutes total.
              </p>
              <ul className="mt-4 space-y-4">
                {pendingGbpTasks.map((task) => (
                  <li key={task.id} className="rounded-xl border border-blue-100 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold text-zinc-900">{task.title}</p>
                      <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
                        {task.status}
                      </span>
                    </div>
                    {task.detail ? (
                      <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 text-xs text-zinc-700 font-sans leading-relaxed">
                        {task.detail}
                      </pre>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Free directory listings */}
          {pendingDirectoryTasks.length > 0 ? (
            <div className="rounded-2xl border border-green-100 bg-green-50/40 p-5 shadow-sm">
              <h3 className="text-base font-semibold text-zinc-900">Free directory listings: claim your spots</h3>
              <p className="mt-1 text-sm text-zinc-600">
                Each directory below sends trust signals and backlinks to Google. About 5 minutes each.
              </p>
              <ul className="mt-4 space-y-4">
                {pendingDirectoryTasks.map((task) => (
                  <li key={task.id} className="rounded-xl border border-green-100 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold text-zinc-900">{task.title}</p>
                      <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
                        {task.status}
                      </span>
                    </div>
                    {task.detail ? (
                      <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 text-xs text-zinc-700 font-sans leading-relaxed">
                        {task.detail}
                      </pre>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* ─── Snapshot: score history + automation status ──────────────────────── */}
      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="text-lg font-semibold text-zinc-900">Visibility history</h2>
          <p className="text-sm text-zinc-500">Each bar is a snapshot from a scan or scheduled refresh.</p>
          <div className="mt-6 flex h-40 items-end gap-2">
            {[...bundle.snapshots].reverse().map((s) => (
              <div key={s.id} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className="w-full rounded-t-lg bg-gradient-to-t from-red-600 to-red-400"
                  style={{ height: `${Math.max(12, (s.overallScore / 100) * 120)}px` }}
                  title={`${s.overallScore} on ${new Date(s.createdAt).toLocaleDateString()}`}
                />
                <span className="text-[10px] text-zinc-500">{new Date(s.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
              </div>
            ))}
            {!bundle.snapshots.length ? <p className="text-sm text-zinc-500">No snapshots yet.</p> : null}
          </div>
        </div>
        <div className="space-y-4 rounded-2xl border border-zinc-200 bg-zinc-900 p-5 text-white shadow-sm">
          <h2 className="text-lg font-semibold">What&apos;s running</h2>
          <ul className="space-y-3 text-sm text-zinc-200">
            <FeatureRow label="Recurring visibility refreshes" on={features.recurringRefresh} />
            <FeatureRow label="Monthly summary email" on={features.monthlySummaryEmail} />
            <FeatureRow label={`Content ideas (${features.contentIdeasPerMonth}/mo)`} on={features.contentIdeasPerMonth > 0} />
            <FeatureRow label="AI content drafts + publishing" on={features.contentDraftsPerMonth > 0} />
            <FeatureRow label="Reddit auto-posting + backlink outreach" on={features.redditPosting} />
            <FeatureRow label="Multi-step outreach sequences" on={features.multiStepOutreach} />
            <FeatureRow label="Review monitoring + AI replies" on={features.reviewManagement} />
            <FeatureRow label="Programmatic SEO pages" on={features.programmaticSEO} />
            <FeatureRow label="Multi-location support" on={features.multiLocationReady} />
          </ul>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs">
            <p className="font-semibold text-zinc-100">
              Latest run: {latestAutomation ? `${latestAutomation.type} · ${latestAutomation.status}` : "none yet"}
            </p>
            <p className="mt-1 text-zinc-300">
              Next:{" "}
              {upcomingAutomation?.runAfter
                ? `${upcomingAutomation.type} at ${new Date(upcomingAutomation.runAfter).toLocaleString()}`
                : "no pending recurring jobs"}
            </p>
            {latestRunSummary ? (
              <p className="mt-2 text-zinc-300">
                {[
                  `${Number(latestRunSummary.contentIdeas ?? 0)} ideas`,
                  `${Number(latestRunSummary.draftsGenerated ?? 0)} drafts`,
                  `${Number(latestRunSummary.publishingJobsQueued ?? 0)} publishing jobs`,
                  `${Number(latestRunSummary.outreachDraftsGenerated ?? 0)} outreach drafts`,
                ].join(" · ")}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {/* ─── KPI snapshot ────────────────────────────────────────────────────── */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Content ideas" value={String(contentIdeasThisMonth)} note="queued this month" />
        <KpiCard label="Drafts generated" value={String(draftsThisMonth)} note="ready for review" />
        <KpiCard label="Queued for publishing" value={String(publishingQueuedThisMonth)} note="this month" />
        <KpiCard label="AI checks" value={String(aiChecksThisMonth)} note="completed this month" />
        <KpiCard label="Citation tasks" value={String(citationQueuedThisMonth)} note="listing cleanup" />
        <KpiCard label="Review tasks" value={String(reviewQueuedThisMonth)} note="reputation work" />
        <KpiCard label="Outreach drafted" value={String(outreachTasks.filter((item) => isThisMonth(item.createdAt)).length)} note="this month" />
        <KpiCard label="Backlink opportunities" value={String(backlinkQueuedThisMonth)} note="identified this month" />
        <KpiCard label="Local pages queued" value={String(localPagesThisMonth)} note="service-area pages" />
      </section>

      {/* ─── Reviews ─────────────────────────────────────────────────────────── */}
      {features.reviewManagement ? (
        <ReviewsSection reviews={reviews.map((r) => ({
          id: r.id,
          authorName: r.authorName,
          rating: r.rating,
          text: r.text,
          publishTime: r.publishTime,
          suggestedReply: r.suggestedReply,
          status: r.status,
        }))} />
      ) : null}

      {/* ─── Review gating ───────────────────────────────────────────────────── */}
      {reviewGatingData ? (
        <ReviewGatingSection businessId={businessId} initialData={reviewGatingData} />
      ) : null}

      {/* ─── Feature #8: GEO audit — AI search visibility ───────────────────── */}
      {geoAudit ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          {/* Header + score */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">GEO: AI search visibility</h2>
              <p className="mt-1 text-sm text-zinc-500">
                How often ChatGPT, Perplexity, and Copilot mention your business when people ask relevant questions.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className={`rounded-2xl px-5 py-3 text-center ${geoAudit.grade === "A" ? "bg-green-100" : geoAudit.grade === "B" ? "bg-blue-100" : geoAudit.grade === "C" ? "bg-yellow-100" : "bg-red-100"}`}>
                <p className={`text-4xl font-bold ${geoAudit.grade === "A" ? "text-green-800" : geoAudit.grade === "B" ? "text-blue-800" : geoAudit.grade === "C" ? "text-yellow-800" : "text-red-800"}`}>
                  {geoAudit.grade}
                </p>
                <p className="text-xs font-semibold text-zinc-600 mt-0.5">GEO grade</p>
              </div>
              <div className="rounded-2xl border border-zinc-100 bg-zinc-50 px-5 py-3 text-center">
                <p className="text-4xl font-bold text-zinc-900">{geoAudit.overallScore}</p>
                <p className="text-xs font-semibold text-zinc-500 mt-0.5">/ 100</p>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 text-center">
              <p className="text-2xl font-semibold text-zinc-900">{geoAudit.totalMentions}</p>
              <p className="text-xs text-zinc-500 mt-0.5">times mentioned</p>
            </div>
            <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 text-center">
              <p className="text-2xl font-semibold text-zinc-900">{geoAudit.totalProbes}</p>
              <p className="text-xs text-zinc-500 mt-0.5">AI probes run</p>
            </div>
            <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 text-center">
              <p className="text-2xl font-semibold text-zinc-900">{geoAudit.mentionRate}%</p>
              <p className="text-xs text-zinc-500 mt-0.5">mention rate</p>
            </div>
          </div>

          {/* Per-engine breakdown */}
          {geoAudit.byEngine.length > 0 && (
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {geoAudit.byEngine.map((e) => (
                <div key={e.engine} className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 capitalize">{e.engine}</p>
                  <p className="mt-1 text-sm font-semibold text-zinc-800">{e.mentionRate}% mention rate</p>
                  <p className="text-xs text-zinc-500">{e.mentions}/{e.probes} probes · {e.sentiment}</p>
                </div>
              ))}
            </div>
          )}

          {/* ── SCORE = 0: Full explanation + action plan ── */}
          {geoAudit.overallScore === 0 ? (
            <div className="mt-5 space-y-4">
              {/* Why */}
              <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-4">
                <p className="text-sm font-semibold text-red-900 mb-1">Why your score is 0</p>
                <p className="text-sm text-red-800 leading-relaxed">
                  GravyBlock ran {geoAudit.totalProbes} AI probe{geoAudit.totalProbes !== 1 ? "s" : ""} this month asking ChatGPT, Perplexity, and Copilot
                  questions about your business category. You weren&apos;t mentioned yet — this is
                  normal for new profiles. <strong>AI assistants typically start citing a business after
                  60–90 days of consistent, well-structured content.</strong>
                </p>
                {/* Show actual probe questions that were asked */}
                {(aiVisibility.recentChecks?.length ?? 0) > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-red-800 mb-1.5">Questions that were asked:</p>
                    <ul className="space-y-1">
                      {(aiVisibility.recentChecks ?? []).slice(0, 3).map((c, i) => (
                        <li key={i} className="text-xs text-red-700 flex items-start gap-1.5">
                          <span className="capitalize font-medium shrink-0">{c.engine}:</span>
                          <span className="italic">&ldquo;{c.prompt}&rdquo;</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* What GravyBlock is doing automatically */}
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-4">
                <p className="text-sm font-semibold text-emerald-900 mb-2">✓ What GravyBlock is already doing for you</p>
                <ul className="space-y-1.5">
                  {[
                    "Publishing articles in direct-answer format — the style AI engines prefer to cite",
                    "Injecting LocalBusiness + Article schema markup into every article published",
                    "Running monthly AI probes to track exactly when you first get mentioned",
                    "Generating directory listing copy to build citation footprint AI engines index",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-emerald-800">
                      <span className="shrink-0 mt-0.5 text-emerald-600">✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Priority action checklist */}
              {(() => {
                const checks = [
                  {
                    priority: "high",
                    label: "Publish 4+ articles",
                    done: publishedContentCount >= 4,
                    status: publishedContentCount >= 4
                      ? `${publishedContentCount} published ✓`
                      : `${publishedContentCount} published — GravyBlock is writing more each week`,
                    why: "AI assistants won't cite a business with thin content. 4+ articles is the practical floor.",
                  },
                  {
                    priority: "high",
                    label: "Add schema markup to your website",
                    done: techPass("no-structured-data"),
                    status: techPass("no-structured-data")
                      ? "Schema detected on your website ✓"
                      : "Not detected — use the Schema Generator below to get the code",
                    why: "JSON-LD schema tells AI crawlers exactly what your business does, in machine-readable format.",
                  },
                  {
                    priority: "medium",
                    label: "Reach 20+ Google reviews",
                    done: latestReviewCount >= 20,
                    status: latestReviewCount >= 20
                      ? `${latestReviewCount} reviews ✓`
                      : `${latestReviewCount} reviews so far — GravyBlock sends review requests weekly`,
                    why: "AI assistants use review volume as a trust signal when deciding what to recommend.",
                  },
                  {
                    priority: "medium",
                    label: "Get listed in 5+ directories",
                    done: autopilot.citationIssues.length >= 5,
                    status: autopilot.citationIssues.length >= 5
                      ? "5+ citations found ✓"
                      : "GravyBlock is generating your directory profile copy — check Action Items below",
                    why: "Citations on Yelp, BBB, Apple Maps, and industry directories are indexed by Perplexity directly.",
                  },
                ];
                const doneCount = checks.filter((c) => c.done).length;
                return (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-semibold text-amber-900">Your GEO improvement plan</p>
                      <span className="text-xs font-semibold text-amber-700 bg-amber-100 rounded-full px-2.5 py-0.5">
                        {doneCount}/{checks.length} complete
                      </span>
                    </div>
                    <ul className="space-y-3">
                      {checks.map((c) => (
                        <li key={c.label} className="flex items-start gap-2.5">
                          <span className={`mt-0.5 shrink-0 text-base leading-none ${c.done ? "text-green-600" : c.priority === "high" ? "text-red-500" : "text-amber-500"}`}>
                            {c.done ? "✓" : c.priority === "high" ? "●" : "○"}
                          </span>
                          <div className="min-w-0">
                            <p className={`text-sm font-medium ${c.done ? "text-zinc-400 line-through" : "text-zinc-800"}`}>
                              {c.label}
                            </p>
                            <p className="text-xs text-zinc-500 mt-0.5">{c.status}</p>
                            {!c.done && (
                              <p className="text-xs text-zinc-400 mt-0.5 italic">{c.why}</p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-xs text-amber-700 border-t border-amber-200 pt-3">
                      ⏱ Next probe runs in ~{Math.max(1, 30 - (geoAudit.totalProbes > 0 ? 0 : 30))} days. AI mentions typically begin appearing 60–90 days after consistent content publication.
                    </p>
                  </div>
                );
              })()}
            </div>
          ) : geoAudit.overallScore < 60 ? (
            // Partial score — simpler checklist
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
              <p className="text-sm font-semibold text-amber-900 mb-1">{geoAudit.topRecommendation}</p>
              <ul className="mt-3 space-y-2">
                {[
                  { label: "4+ articles published", done: publishedContentCount >= 4, note: `${publishedContentCount} so far` },
                  { label: "Schema markup on website", done: techPass("no-structured-data"), note: "Use Schema Generator below" },
                  { label: "20+ Google reviews", done: latestReviewCount >= 20, note: `${latestReviewCount} so far` },
                  { label: "5+ directory citations", done: autopilot.citationIssues.length >= 5, note: "Check Action Items below" },
                ].map((c) => (
                  <li key={c.label} className="flex items-start gap-2 text-sm">
                    <span className={`shrink-0 ${c.done ? "text-green-600" : "text-amber-500"}`}>{c.done ? "✓" : "○"}</span>
                    <span className={c.done ? "text-zinc-400 line-through" : "text-zinc-800"}>{c.label}</span>
                    {!c.done && <span className="text-zinc-400 text-xs ml-auto shrink-0">{c.note}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            // Good score — just show recommendation
            <div className="mt-4 rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3">
              <p className="text-sm text-zinc-700">{geoAudit.topRecommendation}</p>
            </div>
          )}

          {/* Recent mentions (shown when score > 0) */}
          {geoAudit.recentMentions.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">Recent AI mentions</p>
              <ul className="space-y-2">
                {geoAudit.recentMentions.map((m, i) => (
                  <li key={i} className="rounded-lg bg-zinc-50 border border-zinc-100 px-3 py-2 text-xs">
                    <span className="font-semibold text-zinc-900 capitalize">{m.engine}</span>
                    <span className="text-zinc-500 mx-1.5">·</span>
                    <span className="text-zinc-600 italic">&ldquo;{m.prompt}&rdquo;</span>
                    <span className="ml-2 text-zinc-400">{m.date}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-4 text-xs text-zinc-400">GEO score = 60% mention rate + 40% avg confidence. Probes run monthly via ChatGPT + Perplexity.</p>
        </section>
      ) : aiVisibility.total > 0 ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">AI search visibility</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Does your business come up when people ask AI assistants for local recommendations?
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4 text-center">
              <p className="text-2xl font-semibold text-zinc-900">{aiVisibility.mentioned}</p>
              <p className="text-xs text-zinc-500 mt-0.5">times mentioned</p>
            </div>
            <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4 text-center">
              <p className="text-2xl font-semibold text-zinc-900">{aiVisibility.total}</p>
              <p className="text-xs text-zinc-500 mt-0.5">probes run</p>
            </div>
            <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4 text-center">
              <p className="text-2xl font-semibold text-zinc-900">
                {aiVisibility.total > 0 ? Math.round((aiVisibility.mentioned / aiVisibility.total) * 100) : 0}%
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">mention rate</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-zinc-400">Probes run monthly.</p>
        </section>
      ) : null}

      {/* ─── Feature #1: Keyword rankings from Google Search Console ────────── */}
      {topKeywords.length > 0 ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">Keyword rankings</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Your top Google Search Console keywords, synced automatically from your connected account.
              </p>
            </div>
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">
              GSC live
            </span>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 border-b border-zinc-100">
                  <th className="pb-2 pr-4">Keyword</th>
                  <th className="pb-2 pr-4 text-right">Position</th>
                  <th className="pb-2 pr-4 text-right">Clicks</th>
                  <th className="pb-2 pr-4 text-right">Impressions</th>
                  <th className="pb-2 text-right">CTR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {topKeywords.slice(0, 10).map((kw) => (
                  <tr key={kw.id} className="hover:bg-zinc-50">
                    <td className="py-2.5 pr-4 font-medium text-zinc-900">{kw.keyword}</td>
                    <td className="py-2.5 pr-4 text-right">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        Number(kw.position) <= 3 ? "bg-green-100 text-green-800" :
                        Number(kw.position) <= 10 ? "bg-blue-100 text-blue-800" :
                        "bg-zinc-100 text-zinc-600"
                      }`}>
                        #{kw.position ? Math.round(Number(kw.position)) : "—"}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-right text-zinc-700">{kw.clicks ?? 0}</td>
                    <td className="py-2.5 pr-4 text-right text-zinc-500">{kw.impressions ?? 0}</td>
                    <td className="py-2.5 text-right text-zinc-500">
                      {kw.ctr ? `${Math.round(Number(kw.ctr) * 100)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-zinc-400">Synced daily · last 28 days · connected via Google OAuth</p>
        </section>
      ) : googleConn?.searchConsoleProperty ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Keyword rankings</h2>
          <p className="mt-2 text-sm text-zinc-500">
            Google Search Console is connected. Rankings will appear here after the first nightly sync.
          </p>
        </section>
      ) : null}

      {/* ─── Feature #10: Site tech audit ───────────────────────────────────── */}
      {techAudit ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">Site tech audit</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Technical SEO checks from your last scan. These directly affect how Google and AI assistants index your site.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className={`rounded-2xl px-5 py-3 text-center ${techAudit.grade === "A" ? "bg-green-100" : techAudit.grade === "B" ? "bg-blue-100" : techAudit.grade === "C" ? "bg-yellow-100" : "bg-red-100"}`}>
                <p className={`text-3xl font-bold ${techAudit.grade === "A" ? "text-green-800" : techAudit.grade === "B" ? "text-blue-800" : techAudit.grade === "C" ? "text-yellow-800" : "text-red-800"}`}>
                  {techAudit.grade}
                </p>
                <p className="text-xs font-semibold text-zinc-500 mt-0.5">{techAudit.score}/100</p>
              </div>
            </div>
          </div>
          <ul className="mt-5 divide-y divide-zinc-100">
            {techAudit.items.map((item) => (
              <li key={item.key} className="flex items-start gap-3 py-3">
                <span className={`mt-0.5 shrink-0 text-sm ${item.status === "pass" ? "text-green-600" : item.status === "warn" ? "text-yellow-600" : "text-red-600"}`}>
                  {item.status === "pass" ? "✓" : item.status === "warn" ? "⚠" : "✗"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold ${item.status === "pass" ? "text-zinc-700" : "text-zinc-900"}`}>
                    {item.label}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">{item.detail}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${item.status === "pass" ? "bg-green-100 text-green-700" : item.status === "warn" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>
                  {item.status}
                </span>
              </li>
            ))}
          </ul>
          {techAudit.website ? (
            <p className="mt-3 text-xs text-zinc-400">Auditing <span className="font-medium">{techAudit.website}</span> · run a new scan to refresh results</p>
          ) : (
            <p className="mt-3 text-xs text-zinc-400">Add a website to your Google listing to unlock full tech checks.</p>
          )}
        </section>
      ) : null}

      {/* ─── Feature #7: Content calendar ────────────────────────────────────── */}
      {autopilot.contentQueue.length > 0 ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Content calendar</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Everything queued and scheduled. Autopilot works through this list on your plan cadence.
          </p>
          <div className="mt-5 space-y-6">
            {(() => {
              // Group content by week
              const grouped = new Map<string, typeof autopilot.contentQueue>();
              for (const item of autopilot.contentQueue.slice(0, 20)) {
                const d = new Date(item.createdAt);
                const weekStart = new Date(d);
                weekStart.setDate(d.getDate() - d.getDay());
                const key = weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" });
                if (!grouped.has(key)) grouped.set(key, []);
                grouped.get(key)!.push(item);
              }
              return Array.from(grouped.entries()).map(([week, items]) => (
                <div key={week}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">
                    Week of {week}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((item) => (
                      <div key={item.id} className={`rounded-xl border px-3 py-3 text-sm ${
                        item.status === "published" ? "border-green-100 bg-green-50" :
                        item.status === "ready" ? "border-blue-100 bg-blue-50" :
                        item.kind === "reddit_post" ? "border-orange-100 bg-orange-50" :
                        item.kind === "facebook_post" || item.kind === "instagram_caption" ? "border-purple-100 bg-purple-50" :
                        "border-zinc-100 bg-zinc-50"
                      }`}>
                        <p className="font-medium text-zinc-900 truncate">{item.title}</p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <span className="text-xs uppercase text-zinc-500">
                            {item.kind.replace(/_/g, " ")}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            item.status === "published" ? "bg-green-100 text-green-800" :
                            item.status === "ready" ? "bg-blue-100 text-blue-800" :
                            "bg-zinc-100 text-zinc-600"
                          }`}>
                            {item.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ));
            })()}
          </div>
        </section>
      ) : null}

      {/* ─── Feature #6: Topic cluster map ───────────────────────────────────── */}
      <TopicClusterSection businessId={businessId} />

      {/* ─── Roadmap ─────────────────────────────────────────────────────────── */}
      <AutopilotRoadmap rows={roadmapRows} />

      {/* ─── Content queue ───────────────────────────────────────────────────── */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Content queue</h2>
          <p className="mt-1 text-sm text-zinc-500">Staged for publishing. Autopilot works through these on your plan cadence.</p>
          {autopilot.contentQueue.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {autopilot.contentQueue.slice(0, 10).map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-4 rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-zinc-900">{item.title}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {item.kind.replace(/_/g, " ")} · queued {new Date(item.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-zinc-100 border border-zinc-200 px-2.5 py-1 text-xs font-semibold text-zinc-600">{item.status}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-zinc-500">Empty. Autopilot will fill it on the next scheduled run.</p>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Citation + listing issues</h2>
          <p className="mt-1 text-sm text-zinc-500">Listing mismatches and citation integrity checks.</p>
          <ul className="mt-4 space-y-2 text-sm">
            {autopilot.citationIssues.slice(0, 8).map((item) => (
              <li key={item.id} className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
                <p className="font-semibold text-zinc-900">{item.sourceName}</p>
                <p className="text-xs uppercase tracking-wide text-zinc-500">{item.status}</p>
                {item.mismatchNote ? <p className="text-xs text-zinc-600">{item.mismatchNote}</p> : null}
              </li>
            ))}
            {!autopilot.citationIssues.length ? <li className="text-zinc-500">No citation issues queued.</li> : null}
          </ul>
        </div>
      </section>

      {/* ─── Authority + backlink queue ──────────────────────────────────────── */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-zinc-900">Backlink opportunities</h3>
          <p className="mt-1 text-xs text-zinc-500">Identified and queued. These are opportunities, not links already placed.</p>
          <ul className="mt-3 space-y-2 text-sm">
            {autopilot.backlinkQueue.slice(0, 8).map((item) => (
              <li key={item.id} className="rounded-lg bg-zinc-50 px-3 py-2">
                <p className="font-medium text-zinc-900">{item.sourceName}</p>
                <p className="text-xs uppercase text-zinc-500">
                  {item.status} · quality {item.qualityScore ?? "n/a"}
                </p>
                {item.targetUrl ? (
                  <a className="text-xs text-red-800 underline" href={item.targetUrl} target="_blank" rel="noreferrer">
                    {item.targetUrl}
                  </a>
                ) : null}
              </li>
            ))}
            {!autopilot.backlinkQueue.length ? <li className="text-zinc-500">No opportunities queued yet.</li> : null}
          </ul>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-zinc-900">Outreach drafts</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {outreachTasks.slice(0, 8).map((task) => (
              <li key={task.id} className="rounded-lg bg-zinc-50 px-3 py-2">
                <p className="font-medium text-zinc-900">{task.title}</p>
                <p className="text-xs uppercase text-zinc-500">{task.status}</p>
                {task.detail ? (
                  <pre className="mt-2 whitespace-pre-wrap text-xs text-zinc-600 font-sans">{task.detail}</pre>
                ) : null}
              </li>
            ))}
            {!outreachTasks.length ? <li className="text-zinc-500">No outreach drafts yet.</li> : null}
          </ul>
        </div>
      </section>

      {/* ─── Local pages + AI probes ─────────────────────────────────────────── */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-zinc-900">Local page queue</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {localPageQueue.slice(0, 8).map((item) => (
              <li key={item.id} className="rounded-lg bg-zinc-50 px-3 py-2">
                <p className="font-medium text-zinc-900">{item.title}</p>
                <p className="text-xs uppercase text-zinc-500">{item.kind} · {item.status}</p>
              </li>
            ))}
            {!localPageQueue.length ? <li className="text-zinc-500">No local pages queued yet.</li> : null}
          </ul>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-zinc-900">Review + local trust tasks</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {reviewTasks.slice(0, 6).map((task) => (
              <li key={task.id} className="rounded-lg bg-zinc-50 px-3 py-2">
                <p className="font-medium text-zinc-900">{task.title}</p>
                <p className="text-xs uppercase text-zinc-500">{task.queue} · {task.status}</p>
              </li>
            ))}
            {!reviewTasks.length ? <li className="text-zinc-500">No review tasks queued.</li> : null}
          </ul>
        </div>
      </section>

      {/* ─── Competitor panel ────────────────────────────────────────────────── */}
      <CompetitorPanel businessId={businessId} />

      {/* ─── Integrations ────────────────────────────────────────────────────── */}
      {features.contentDraftsPerMonth > 0 ? (
        <IntegrationsSection
          businessId={businessId}
          initialTargets={publishingTargets.map((t) => ({
            id: t.id,
            label: t.label,
            adapter: t.adapter,
            active: t.active,
          }))}
        />
      ) : null}

      {/* ─── Google integrations ─────────────────────────────────────────────── */}
      <GoogleIntegrationsSection
        businessId={businessId}
        connected={Boolean(googleConn)}
        googleEmail={googleConn?.googleEmail ?? null}
        searchConsoleProperty={googleConn?.searchConsoleProperty ?? null}
        gbpLocationName={googleConn?.gbpLocationName ?? null}
        errorParam={query.google_error ?? null}
        successParam={Boolean(query.google_connected)}
      />

      {/* ─── Feature #9: Facebook + Instagram credentials ───────────────────── */}
      {features.redditPosting ? (
        <SocialCredentialsSection
          businessId={businessId}
          initial={socialCredentials}
        />
      ) : null}

      {/* ─── Multi-location ──────────────────────────────────────────────────── */}
      {features.multiLocationReady ? (
        <LocationsSection
          businessId={businessId}
          initialLocations={initialLocations}
          maxLocations={features.clientSeats}
          planLabel={features.label}
        />
      ) : null}

      {/* ─── Schema Markup Generator ─────────────────────────────────────────── */}
      {(() => {
        // Some fields exist on MemBusiness but not the DB-path business object.
        // We read them safely with optional chaining and fall back to placeProfiles.
        const biz = bundle.business as typeof bundle.business & {
          primaryCategory?: string | null;
          rating?: string | null;
          reviewCount?: number | null;
          latitude?: number | null;
          longitude?: number | null;
        };
        const latestPlace = bundle.placeProfiles?.[0];
        return (
          <>
            <SchemaGeneratorSection
              business={{
                name: biz.name,
                address: biz.address,
                phone: biz.phone,
                website: biz.website,
                primaryCategory: biz.primaryCategory ?? latestPlace?.primaryType ?? null,
                vertical: biz.vertical,
                rating: biz.rating ?? (latestPlace?.rating != null ? String(latestPlace.rating) : null),
                reviewCount: biz.reviewCount ?? latestPlace?.reviewCount ?? null,
                latitude: biz.latitude ?? null,
                longitude: biz.longitude ?? null,
                googleMapsUri: biz.googleMapsUri ?? latestPlace?.mapsUri ?? null,
              }}
            />
            <FaqBuilderSection
              business={{
                name: biz.name,
                vertical: biz.vertical,
                primaryCategory: biz.primaryCategory ?? latestPlace?.primaryType ?? null,
              }}
            />
          </>
        );
      })()}

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* HISTORY — everything completed, with dates                            */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      <div className="border-t border-zinc-200 pt-8">
        <h2 className="text-xl font-semibold text-zinc-900">History</h2>
        <p className="mt-1 text-sm text-zinc-500">Everything completed, with dates.</p>
      </div>

      {/* Activity feed */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-semibold text-zinc-900">Autopilot activity: last 30 days</h3>
        <ul className="mt-4 divide-y divide-zinc-100">
          {activity.map((item) => {
            const iconMap: Record<ActivityItem["type"], string> = {
              content_published: "Published",
              snapshot_taken: "Snapshot",
              task_created: "Task",
              task_completed: "Done",
              outreach_sent: "Outreach",
              content_queued: "Queued",
            };
            const colorMap: Record<ActivityItem["type"], string> = {
              content_published: "bg-green-100 text-green-800",
              snapshot_taken: "bg-blue-100 text-blue-800",
              task_created: "bg-zinc-100 text-zinc-700",
              task_completed: "bg-green-100 text-green-800",
              outreach_sent: "bg-orange-100 text-orange-800",
              content_queued: "bg-yellow-100 text-yellow-800",
            };
            return (
              <li key={item.id} className="flex items-start gap-3 py-3 text-sm">
                <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${colorMap[item.type]}`}>
                  {iconMap[item.type]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-zinc-900">{item.label}</p>
                  {item.detail ? <p className="text-xs text-zinc-500">{item.detail}</p> : null}
                </div>
                <time className="shrink-0 text-xs text-zinc-400">
                  {item.createdAt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </time>
              </li>
            );
          })}
          {!activity.length ? (
            <li className="py-4 text-sm text-zinc-500">
              No autopilot activity yet. Actions will appear here once automation runs.
            </li>
          ) : null}
        </ul>
      </section>

      {/* Published content */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-semibold text-zinc-900">Published content</h3>
        <p className="mt-1 text-sm text-zinc-500">Articles, posts, and drafts GravyBlock has written for you.</p>
        {autopilot.publishedContent.length > 0 ? (
          <ul className="mt-4 space-y-3">
            {autopilot.publishedContent.slice(0, 12).map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-4 rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-zinc-900">{item.title}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {item.channel.replace(/_/g, " ")} · {item.status} · {new Date(item.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </div>
                {item.publicUrl ? (
                  <a
                    className="shrink-0 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-700 hover:border-zinc-300"
                    href={item.publicUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View live
                  </a>
                ) : (
                  <span className="shrink-0 rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-800">Draft</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-4 rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-500">
            Nothing published yet.{" "}
            {features.contentDraftsPerMonth > 0
              ? "Articles and posts will appear here once autopilot runs."
              : "Upgrade to Scale or higher to unlock automated content publishing."}
          </div>
        )}
      </section>

      {/* Completed automation jobs */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-semibold text-zinc-900">Completed automation runs</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {autopilot.automationJobs
            .filter((job) => job.status === "completed")
            .slice(0, 10)
            .map((job) => (
              <li key={job.id} className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2">
                <p className="font-medium text-zinc-900">{job.type}</p>
                <p className="text-xs text-zinc-500">
                  {new Date(job.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </p>
              </li>
            ))}
          {!autopilot.automationJobs.filter((job) => job.status === "completed").length ? (
            <li className="text-zinc-500">No completed runs yet.</li>
          ) : null}
        </ul>
      </section>

      {/* Scan & report history */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-zinc-900">Scan history</h3>
            <Link href="/scan" className="text-xs font-semibold text-red-800 hover:text-red-900">
              New scan
            </Link>
          </div>
          <ul className="mt-4 divide-y divide-zinc-100">
            {bundle.reports.map((r) => (
              <li key={r.publicId} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <Link href={`/report/${r.publicId}`} className="font-semibold text-zinc-900 hover:underline">
                    View report
                  </Link>
                  <p className="text-xs text-zinc-500">
                    {new Date(r.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-zinc-900">{r.score}</p>
                  <p className="text-xs uppercase text-zinc-500">{r.opportunityLevel}</p>
                </div>
              </li>
            ))}
            {!bundle.reports.length ? <li className="py-4 text-sm text-zinc-500">No reports yet.</li> : null}
          </ul>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-zinc-900">Content ideas</h3>
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{bundle.content.length} total</span>
          </div>
          <ul className="mt-4 space-y-3">
            {bundle.content.map((c) => (
              <li key={c.id} className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-3 text-sm text-zinc-700">
                <p className="text-xs font-semibold uppercase tracking-wide text-red-800">{c.angle}</p>
                <p className="font-semibold text-zinc-900">{c.title}</p>
                <p className="mt-1 text-zinc-600">{c.body}</p>
              </li>
            ))}
            {!bundle.content.length ? <li className="text-sm text-zinc-500">No ideas yet. Run a scan to generate some.</li> : null}
          </ul>
        </div>
      </section>

      {/* Changes detected */}
      {latestDetectedChanges.length > 0 ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-zinc-900">Changes detected in latest refresh</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {latestDetectedChanges.map((change) => (
              <li key={change} className="rounded-lg bg-zinc-50 px-3 py-2 text-zinc-700">
                {change}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* AI Citation Monitor */}
      <AiCitationSection
        stats={aiVisibility}
        businessId={businessId}
        businessName={bundle.business.name}
        canRunCheck={tier !== "free"}
      />

      {/* ─── Billing ─────────────────────────────────────────────────────────── */}
      <section id="billing" className="rounded-2xl border-2 border-red-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Billing and plan</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Plan: <span className="font-semibold text-zinc-900">{features.label}</span> · status:{" "}
              <span className="font-semibold text-zinc-900">{billingStatus}</span>
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {bundle.business.billingEmail ?? "Billing email not captured"}
              {bundle.business.currentPeriodEnd
                ? ` · renews ${new Date(bundle.business.currentPeriodEnd).toLocaleDateString()}`
                : ""}
            </p>
            <p className="mt-1 text-xs text-zinc-500">Use code <strong>INTRO50</strong> at checkout for 50% off your first month.</p>
            {promoCode ? <p className="mt-1 text-xs font-medium text-zinc-700">Promo ready: {promoCode}</p> : null}
          </div>
          {hasBillingCustomer ? (
            <PortalButton
              businessId={businessId}
              label="Manage billing"
              className="rounded-full bg-zinc-100 border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-200"
            />
          ) : null}
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {tier !== "starter" && tier !== "growth" && tier !== "pro" && tier !== "agency" ? (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-sm font-semibold text-zinc-900">Starter</p>
              <p className="text-xs text-zinc-600">$79.99/mo · intro $39.99/mo with INTRO50</p>
              <div className="mt-3">
                <CheckoutButton
                  businessId={businessId}
                  plan="starter"
                  requireGrowthUpsell
                  label={selectedPlan === "starter" ? "Continue to Starter checkout" : "Start Starter"}
                  promoCode={promoCode}
                  className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
                />
              </div>
            </div>
          ) : null}
          {tier !== "growth" && tier !== "pro" && tier !== "agency" ? (
            <div className="rounded-xl border border-red-200 bg-red-50/50 p-4">
              <p className="text-sm font-semibold text-zinc-900">Scale</p>
              <p className="text-xs text-zinc-600">$149.99/mo · intro $74.99/mo with INTRO50</p>
              <div className="mt-3">
                <CheckoutButton
                  businessId={businessId}
                  plan="growth"
                  label={selectedPlan === "growth" ? "Continue to Scale checkout" : "Start Scale"}
                  promoCode={promoCode}
                  className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500"
                />
              </div>
            </div>
          ) : null}
          {tier !== "pro" && tier !== "agency" ? (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-sm font-semibold text-zinc-900">Pro</p>
              <p className="text-xs text-zinc-600">$299.99/mo · intro $149.99/mo with INTRO50</p>
              <div className="mt-3">
                <CheckoutButton
                  businessId={businessId}
                  plan="pro"
                  label={selectedPlan === "pro" ? "Continue to Pro checkout" : "Start Pro"}
                  promoCode={promoCode}
                  className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
                />
              </div>
            </div>
          ) : null}
          {tier !== "agency" ? (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-sm font-semibold text-zinc-900">Agency</p>
              <p className="text-xs text-zinc-600">$499.99/mo · intro $249.99/mo with INTRO50</p>
              <div className="mt-3">
                <CheckoutButton
                  businessId={businessId}
                  plan="agency"
                  label={selectedPlan === "agency" ? "Continue to Agency checkout" : "Start Agency"}
                  promoCode={promoCode}
                  className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
                />
              </div>
            </div>
          ) : null}
        </div>
        <p className="mt-4 text-xs text-zinc-500">
          Downgrades and cancellations are self-serve via the Stripe billing portal.
        </p>
      </section>

      {/* ─── Referral ────────────────────────────────────────────────────────── */}
      <ReferralSection
        referralUrl={referralUrl}
        clicks={referralStats.clicks}
        scans={referralStats.scans}
        paid={referralStats.paid}
      />

    </div>
  );
}

function FeatureRow({ label, on }: { label: string; on: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className={on ? "text-red-300" : "text-zinc-500"}>{on ? "On" : "Locked"}</span>
    </li>
  );
}

function KpiCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-zinc-900">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{note}</p>
    </div>
  );
}
