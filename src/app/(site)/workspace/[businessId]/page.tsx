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

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ plan?: string; promo?: string }>;
};

function normalizePromoCodeIntent(raw?: string): "ILoveYouFree" | "ILikeYou50" | null {
  if (!raw) return null;
  const value = raw.trim();
  if (value === "ILoveYouFree" || value === "ILikeYou50") return value;
  return null;
}

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

  return (
    <div className="mx-auto max-w-6xl space-y-12 px-4 py-14 sm:px-6">
      <header className="flex flex-col gap-6 border-b border-zinc-200 pb-10 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-800">Growth workspace</p>
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-900">{bundle.business.name}</h1>
          <p className="max-w-2xl text-sm text-zinc-600">
            Command center for scan history, visibility snapshots, prioritized work, and (on Growth+) automation queues,
            content publishing, Reddit outreach, and jobs that run on a schedule.
          </p>
          <div className="flex flex-wrap gap-2 text-xs font-medium text-zinc-600">
            {bundle.business.website ? (
              <a className="rounded-full bg-zinc-100 px-3 py-1 hover:bg-zinc-200" href={bundle.business.website}>
                Website
              </a>
            ) : null}
            {bundle.business.googleMapsUri ? (
              <a className="rounded-full bg-zinc-100 px-3 py-1 hover:bg-zinc-200" href={bundle.business.googleMapsUri}>
                Maps
              </a>
            ) : null}
            <span className="rounded-full bg-red-100 px-3 py-1 text-red-950">
              Plan: {features.label}{" "}
              {features.monthlyPrice > 0 ? `($${features.introPrice}/mo introductory)` : ""}
            </span>
            <span className="rounded-full bg-zinc-100 px-3 py-1">Refresh cadence: {features.refreshCadenceLabel}</span>
            {selectedPlan ? (
              <span className="rounded-full bg-red-100 px-3 py-1 text-red-950">
                Selected plan: {selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1)}
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
                    : "rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:border-zinc-400"
                }
              />
            ) : null}
            {tier !== "growth" && tier !== "pro" && tier !== "agency" ? (
              <CheckoutButton
                businessId={businessId}
                plan="growth"
                label={selectedPlan === "growth" ? "Continue to Growth checkout" : "Start Growth"}
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
                className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:border-zinc-400"
              />
            ) : null}
          </div>
        </div>
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Latest visibility score</p>
          <p className="mt-2 text-5xl font-semibold text-zinc-900">{latest?.overallScore ?? "—"}</p>
          {delta !== null && delta !== undefined ? (
            <p className={`mt-2 text-sm font-semibold ${delta >= 0 ? "text-zinc-900" : "text-red-700"}`}>
              {delta >= 0 ? "+" : ""}
              {delta} vs previous scan
            </p>
          ) : (
            <p className="mt-2 text-sm text-zinc-500">Run another scan to unlock trendlines.</p>
          )}
        </div>
      </header>

      {!features.recurringRefresh ? (
        <div className="rounded-2xl border border-red-200 bg-red-50/60 px-5 py-5 text-sm text-zinc-900">
          <p>
            <span className="font-semibold">Starter unlocks recurring automation.</span> Free includes scan history and core
            report storage. Starter adds monthly refresh and content ideas. Growth adds full publishing, Reddit outreach, and sequences. See{" "}
            <Link href="/#plans" className="font-semibold underline">
              all plans
            </Link>
            .
          </p>
        </div>
      ) : null}

      <section id="billing" className="rounded-2xl border-2 border-red-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Billing and plan</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Current plan <span className="font-semibold text-zinc-900">{features.label}</span> · subscription status{" "}
              <span className="font-semibold text-zinc-900">{billingStatus}</span>
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Billing email {bundle.business.billingEmail ?? "not captured yet"}
              {bundle.business.currentPeriodEnd
                ? ` · period end ${new Date(bundle.business.currentPeriodEnd).toLocaleDateString()}`
                : ""}
            </p>
            <p className="mt-1 text-xs font-medium text-zinc-600">
              Start with your business, then activate the plan. We&apos;ll connect this plan to this business.
            </p>
            <p className="mt-1 text-xs text-zinc-500">You can enter Stripe promotion codes during checkout.</p>
            {promoCode ? <p className="mt-1 text-xs font-medium text-zinc-700">Promo code ready: {promoCode}</p> : null}
          </div>
          {hasBillingCustomer ? (
            <PortalButton
              businessId={businessId}
              label="Manage billing"
              className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:border-zinc-400"
            />
          ) : null}
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {tier !== "starter" && tier !== "growth" && tier !== "pro" && tier !== "agency" ? (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-sm font-semibold text-zinc-900">Starter</p>
              <p className="text-xs text-zinc-600">$79.99/month · introductory: $39.99/month with code INTRO50</p>
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
              <p className="text-sm font-semibold text-zinc-900">Growth</p>
              <p className="text-xs text-zinc-600">$149.99/month · introductory: $74.99/month with code INTRO50</p>
              <div className="mt-3">
                <CheckoutButton
                  businessId={businessId}
                  plan="growth"
                  label={selectedPlan === "growth" ? "Continue to Growth checkout" : "Start Growth"}
                  promoCode={promoCode}
                  className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500"
                />
              </div>
            </div>
          ) : null}
          {tier !== "pro" && tier !== "agency" ? (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-sm font-semibold text-zinc-900">Pro</p>
              <p className="text-xs text-zinc-600">$299.99/month · introductory: $149.99/month with code INTRO50</p>
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
              <p className="text-xs text-zinc-600">$499.99/month · introductory: $249.99/month with code INTRO50</p>
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
          Downgrades and cancellations are self-serve in Stripe Billing portal after your first successful subscription.
        </p>
      </section>

      {features.multiLocationReady ? (
        <LocationsSection
          businessId={businessId}
          initialLocations={initialLocations}
          maxLocations={features.clientSeats}
          planLabel={features.label}
        />
      ) : null}

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="text-lg font-semibold text-zinc-900">Visibility history</h2>
          <p className="text-sm text-zinc-600">Each bar is a saved snapshot from a scan or future automated check.</p>
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
          <h2 className="text-lg font-semibold">Automation status</h2>
          <ul className="space-y-3 text-sm text-zinc-200">
            <FeatureRow label="Recurring visibility refreshes" on={features.recurringRefresh} />
            <FeatureRow label="Monthly summary email" on={features.monthlySummaryEmail} />
            <FeatureRow label={`Content ideas (${features.contentIdeasPerMonth}/mo)`} on={features.contentIdeasPerMonth > 0} />
            <FeatureRow label="AI content drafts + publishing" on={features.contentDraftsPerMonth > 0} />
            <FeatureRow label="Reddit + blog posting" on={features.redditPosting} />
            <FeatureRow label="Multi-step outreach sequences" on={features.multiStepOutreach} />
            <FeatureRow label="Review management" on={features.reviewManagement} />
            <FeatureRow label="Programmatic SEO pages" on={features.programmaticSEO} />
            <FeatureRow label="Multi-location support" on={features.multiLocationReady} />
            <FeatureRow label="Google Business Profile sync" on={features.gbpSync} />
          </ul>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs">
            <p className="font-semibold text-zinc-100">
              Latest run: {latestAutomation ? `${latestAutomation.type} · ${latestAutomation.status}` : "none yet"}
            </p>
            <p className="mt-1 text-zinc-300">
              Upcoming:{" "}
              {upcomingAutomation?.runAfter
                ? `${upcomingAutomation.type} at ${new Date(upcomingAutomation.runAfter).toLocaleString()}`
                : "no pending recurring jobs"}
            </p>
            {latestRunSummary ? (
              <p className="mt-2 text-zinc-300">
                Latest run output:{" "}
                {[
                  `${Number(latestRunSummary.contentIdeas ?? 0)} ideas`,
                  `${Number(latestRunSummary.draftsGenerated ?? 0)} drafts`,
                  `${Number(latestRunSummary.publishingJobsQueued ?? 0)} publishing jobs`,
                  `${Number(latestRunSummary.outreachDraftsGenerated ?? 0)} outreach drafts`,
                ].join(" · ")}
              </p>
            ) : null}
          </div>
          <p className="text-xs text-zinc-400">
            Listing snapshots use public Places data. Owner-authenticated GBP APIs are not connected in this build.
          </p>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Generated this month" value={String(contentIdeasThisMonth)} note="content ideas queued" />
        <KpiCard label="Drafts generated" value={String(draftsThisMonth)} note="internal drafts" />
        <KpiCard label="Queued for publishing" value={String(publishingQueuedThisMonth)} note="published where target supports it" />
        <KpiCard label="AI checks completed" value={String(aiChecksThisMonth)} note="this month" />
        <KpiCard label="Citation tasks queued" value={String(citationQueuedThisMonth)} note="listing cleanup work" />
        <KpiCard label="Review tasks queued" value={String(reviewQueuedThisMonth)} note="reputation work" />
        <KpiCard label="Outreach drafted" value={String(outreachTasks.filter((item) => isThisMonth(item.createdAt)).length)} note="this month" />
        <KpiCard label="Authority opportunities found" value={String(backlinkQueuedThisMonth)} note="queued opportunities" />
        <KpiCard label="Local page queue items" value={String(localPagesThisMonth)} note="service-area and local pages" />
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Recent autopilot activity</h2>
        <p className="mt-1 text-sm text-zinc-600">Everything GravyBlock did for you in the last 30 days.</p>
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
                  {item.createdAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </time>
              </li>
            );
          })}
          {!activity.length ? (
            <li className="py-4 text-sm text-zinc-500">
              No autopilot activity yet. Once automation runs, actions will appear here.
            </li>
          ) : null}
        </ul>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Changes detected on your site and public profile</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Refresh cycles re-check homepage, listing details, and public social footprint where supported.
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          {latestDetectedChanges.map((change) => (
            <li key={change} className="rounded-lg bg-zinc-50 px-3 py-2 text-zinc-700">
              {change}
            </li>
          ))}
          {!latestDetectedChanges.length ? (
            <li className="rounded-lg bg-zinc-50 px-3 py-2 text-zinc-600">
              No major changes detected in the latest refresh cycle.
            </li>
          ) : null}
        </ul>
      </section>

      <AutopilotRoadmap rows={roadmapRows} />

      {features.contentDraftsPerMonth > 0 ? (
        <ContentApprovalSection businessId={businessId} initialDrafts={queuedDrafts} />
      ) : null}

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

      <CompetitorPanel businessId={businessId} />

      {aiVisibility.total > 0 ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">AI search visibility</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Does your business appear when people ask AI assistants like Gemini or Llama for recommendations in your area?
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
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {Object.entries(aiVisibility.byEngine).map(([engine, stats]) => (
              <div key={engine} className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{engine}</p>
                <p className="mt-1 text-sm text-zinc-800">
                  {stats.mentioned}/{stats.total} probes — {stats.total > 0 ? Math.round((stats.mentioned / stats.total) * 100) : 0}%
                </p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-zinc-400">
            Probes run monthly. Results reflect whether AI models trained on public data mention your business for relevant local queries.
          </p>
        </section>
      ) : null}

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

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Content queue</h2>
          <p className="mt-1 text-sm text-zinc-600">All content items including queued, approved, and dismissed.</p>
          <ul className="mt-4 space-y-2 text-sm">
            {autopilot.contentQueue.slice(0, 8).map((item) => (
              <li key={item.id} className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
                <p className="font-semibold text-zinc-900">{item.title}</p>
                <p className="text-xs uppercase tracking-wide text-zinc-500">
                  {item.kind} · {item.status}
                </p>
              </li>
            ))}
            {!autopilot.contentQueue.length ? <li className="text-zinc-500">No queued content yet.</li> : null}
          </ul>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Citation + listing issue queue</h2>
          <p className="mt-1 text-sm text-zinc-600">Listing mismatches and citation integrity checks.</p>
          <ul className="mt-4 space-y-2 text-sm">
            {autopilot.citationIssues.slice(0, 8).map((item) => (
              <li key={item.id} className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
                <p className="font-semibold text-zinc-900">{item.sourceName}</p>
                <p className="text-xs uppercase tracking-wide text-zinc-500">
                  {item.status}
                </p>
                {item.mismatchNote ? <p className="text-xs text-zinc-600">{item.mismatchNote}</p> : null}
              </li>
            ))}
            {!autopilot.citationIssues.length ? <li className="text-zinc-500">No citation/listing issues queued.</li> : null}
          </ul>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-zinc-900">AI visibility probes</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {autopilot.aiVisibilityChecks.slice(0, 6).map((probe) => (
              <li key={probe.id} className="rounded-lg bg-zinc-50 px-3 py-2">
                <p className="font-medium text-zinc-900">{probe.prompt}</p>
                <p className="text-xs text-zinc-500">
                  mention {probe.mentionFound} · confidence {probe.confidence ?? "n/a"}
                </p>
              </li>
            ))}
            {!autopilot.aiVisibilityChecks.length ? <li className="text-zinc-500">No probes yet.</li> : null}
          </ul>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-zinc-900">Review and local trust tasks</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {reviewTasks.slice(0, 6).map((task) => (
              <li key={task.id} className="rounded-lg bg-zinc-50 px-3 py-2">
                <p className="font-medium text-zinc-900">{task.title}</p>
                <p className="text-xs uppercase text-zinc-500">
                  {task.queue} · {task.status}
                </p>
              </li>
            ))}
            {!reviewTasks.length ? <li className="text-zinc-500">No review/local trust tasks queued.</li> : null}
          </ul>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-zinc-900">Automation jobs</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {autopilot.automationJobs.slice(0, 6).map((job) => (
              <li key={job.id} className="rounded-lg bg-zinc-50 px-3 py-2">
                <p className="font-medium text-zinc-900">{job.type}</p>
                <p className="text-xs uppercase text-zinc-500">{job.status}</p>
              </li>
            ))}
            {!autopilot.automationJobs.length ? <li className="text-zinc-500">No automation jobs running yet.</li> : null}
          </ul>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-zinc-900">Outreach execution</h3>
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
            {!outreachTasks.length ? <li className="text-zinc-500">No outreach drafts generated yet.</li> : null}
          </ul>
        </div>
      </section>

      {gbpTasks.length > 0 ? (
        <section className="rounded-2xl border border-blue-100 bg-blue-50/40 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Google Business Profile — action items</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Copy these into your Google Business Profile at{" "}
            <a href="https://business.google.com" className="text-red-800 underline" target="_blank" rel="noreferrer">
              business.google.com
            </a>
            . Each task has the exact text ready to paste.
          </p>
          <ul className="mt-4 space-y-4">
            {gbpTasks.map((task) => (
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
        </section>
      ) : null}

      {directoryTasks.length > 0 ? (
        <section className="rounded-2xl border border-green-100 bg-green-50/40 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Free directory listings — claim your spots</h2>
          <p className="mt-1 text-sm text-zinc-600">
            These free directories send backlinks and trust signals to Google. Click each link and paste your business info — it takes about 5 minutes per directory.
          </p>
          <ul className="mt-4 space-y-4">
            {directoryTasks.map((task) => (
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
        </section>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-zinc-900">Publishing jobs</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {autopilot.publishingJobs.slice(0, 8).map((job) => (
              <li key={job.id} className="rounded-lg bg-zinc-50 px-3 py-2">
                <p className="font-medium text-zinc-900">{job.id}</p>
                <p className="text-xs uppercase text-zinc-500">{job.status}</p>
                {job.responseLog ? <p className="text-xs text-zinc-600">{job.responseLog}</p> : null}
              </li>
            ))}
            {!autopilot.publishingJobs.length ? <li className="text-zinc-500">No publishing jobs yet.</li> : null}
          </ul>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-zinc-900">Published artifacts</h3>
          <p className="mt-1 text-xs text-zinc-500">Includes internal drafts and published items in this workspace.</p>
          <ul className="mt-3 space-y-2 text-sm">
            {autopilot.publishedContent.slice(0, 8).map((item) => (
              <li key={item.id} className="rounded-lg bg-zinc-50 px-3 py-2">
                <p className="font-medium text-zinc-900">{item.title}</p>
                <p className="text-xs uppercase text-zinc-500">
                  {item.channel} · {item.status}
                </p>
                {item.publicUrl ? (
                  <a className="text-xs text-red-800 underline" href={item.publicUrl} target="_blank" rel="noreferrer">
                    {item.publicUrl}
                  </a>
                ) : null}
              </li>
            ))}
            {!autopilot.publishedContent.length ? <li className="text-zinc-500">No published artifacts yet.</li> : null}
          </ul>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-semibold text-zinc-900">Recent completed work log</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {autopilot.automationJobs
            .filter((job) => job.status === "completed")
            .slice(0, 10)
            .map((job) => (
              <li key={job.id} className="rounded-lg bg-zinc-50 px-3 py-2">
                <p className="font-medium text-zinc-900">{job.type}</p>
                <p className="text-xs text-zinc-500">
                  {new Date(job.createdAt).toLocaleString()} · refresh completed
                </p>
              </li>
            ))}
          {!autopilot.automationJobs.filter((job) => job.status === "completed").length ? (
            <li className="text-zinc-500">No completed automation cycles yet.</li>
          ) : null}
        </ul>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-zinc-900">Local page / service-area queue</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {localPageQueue.slice(0, 8).map((item) => (
              <li key={item.id} className="rounded-lg bg-zinc-50 px-3 py-2">
                <p className="font-medium text-zinc-900">{item.title}</p>
                <p className="text-xs uppercase text-zinc-500">
                  {item.kind} · {item.status}
                </p>
              </li>
            ))}
            {!localPageQueue.length ? <li className="text-zinc-500">No local page items queued yet.</li> : null}
          </ul>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-zinc-900">Authority queue</h3>
          <p className="mt-1 text-xs text-zinc-500">Opportunities found and queued. This does not mean links are already placed.</p>
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
            {!autopilot.backlinkQueue.length ? <li className="text-zinc-500">No authority opportunities queued.</li> : null}
          </ul>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Refer a business</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Share your referral link. When another business runs a scan using your link, you both get credit.
          Contact us to apply your referral credit toward your next billing cycle.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <code className="flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 font-mono break-all">
            {referralUrl}
          </code>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
          <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 text-center">
            <p className="text-2xl font-semibold text-zinc-900">{referralStats.clicks}</p>
            <p className="text-xs text-zinc-500">link clicks</p>
          </div>
          <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 text-center">
            <p className="text-2xl font-semibold text-zinc-900">{referralStats.scans}</p>
            <p className="text-xs text-zinc-500">scans run</p>
          </div>
          <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 text-center">
            <p className="text-2xl font-semibold text-zinc-900">{referralStats.paid}</p>
            <p className="text-xs text-zinc-500">converted to paid</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          Each paid referral earns you one free month. Reply to any GravyBlock email to claim credit.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900">Content opportunities</h2>
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{bundle.content.length} ideas</span>
          </div>
          <ul className="mt-4 space-y-3">
            {bundle.content.map((c) => (
              <li key={c.id} className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-3 text-sm text-zinc-700">
                <p className="text-xs font-semibold uppercase tracking-wide text-red-800">{c.angle}</p>
                <p className="font-semibold text-zinc-900">{c.title}</p>
                <p className="mt-1 text-zinc-600">{c.body}</p>
              </li>
            ))}
            {!bundle.content.length ? <li className="text-sm text-zinc-500">No ideas yet — run a scan.</li> : null}
          </ul>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900">Scan & report history</h2>
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
                  <p className="text-xs text-zinc-500">{new Date(r.createdAt).toLocaleString()}</p>
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
      </section>
    </div>
  );
}

function FeatureRow({ label, on }: { label: string; on: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className={on ? "text-red-300" : "text-zinc-500"}>{on ? "Included" : "Locked"}</span>
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
