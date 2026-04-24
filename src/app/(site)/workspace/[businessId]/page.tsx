import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutopilotRoadmap } from "@/components/autopilot-roadmap";
import { getAutopilotWorkspace } from "@/lib/autopilot/repository";
import type { RoadmapLane } from "@/lib/growth/roadmap";
import { getWorkspaceBundle } from "@/lib/report/repository";
import { normalizePlanTierFromDb, planFeatures, type PlanTier } from "@/lib/plans";
import { requireBusinessAccess } from "@/lib/auth/customer-guards";
import { CheckoutButton, PortalButton } from "./billing-buttons";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ plan?: string }>;
};

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
  const rawPlan = query.plan?.toLowerCase() ?? "";
  const selectedPlan = rawPlan === "pro" ? "pro" : rawPlan === "base" || rawPlan === "entry" ? "base" : null;
  const billingStatus = bundle.business.subscriptionStatus ?? "none";
  const hasBillingCustomer = Boolean(bundle.business.stripeCustomerId);

  return (
    <div className="mx-auto max-w-6xl space-y-12 px-4 py-14 sm:px-6">
      <header className="flex flex-col gap-6 border-b border-zinc-200 pb-10 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-800">Growth workspace</p>
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-900">{bundle.business.name}</h1>
          <p className="max-w-2xl text-sm text-zinc-600">
            Command center for scan history, visibility snapshots, prioritized work, and (on Pro) automation queues and
            jobs that run on a schedule inside the product.
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
              {features.monthlyPrice > 0 ? `($${features.launchPrice.toFixed(2)}/mo launch)` : ""}
            </span>
            <span className="rounded-full bg-zinc-100 px-3 py-1">Refresh cadence: {features.refreshCadenceLabel}</span>
            {selectedPlan ? (
              <span className="rounded-full bg-red-100 px-3 py-1 text-red-950">
                Selected plan: {selectedPlan === "base" ? "Base" : "Pro"}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {tier !== "base" ? (
              <CheckoutButton
                businessId={businessId}
                plan="base"
                requireProUpsell
                label={selectedPlan === "base" ? "Continue to Base checkout" : "Turn on Base"}
                className={
                  selectedPlan === "base"
                    ? "rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
                    : "rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:border-zinc-400"
                }
              />
            ) : null}
            {tier !== "pro" ? (
              <CheckoutButton
                businessId={businessId}
                plan="pro"
                label={selectedPlan === "pro" ? "Continue to Pro checkout" : "Turn on Pro"}
                className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500"
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
            <span className="font-semibold">Base unlocks recurring automation.</span> Free includes scan history and core
            report storage. Base adds monthly refresh and summary cycles. Pro adds a faster cadence plus automation queues. See{" "}
            <Link href="/#plans" className="font-semibold underline">
              Free vs Base vs Pro
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
          </div>
          {hasBillingCustomer ? (
            <PortalButton
              businessId={businessId}
              label="Manage billing"
              className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:border-zinc-400"
            />
          ) : null}
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {tier !== "base" ? (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-sm font-semibold text-zinc-900">Base</p>
              <p className="text-xs text-zinc-600">$29.99/month, launch price $19.99/month.</p>
              <div className="mt-3">
                <CheckoutButton
                  businessId={businessId}
                  plan="base"
                  requireProUpsell
                  label={selectedPlan === "base" ? "Continue to Base checkout" : tier === "free" ? "Turn on Base" : "Switch to Base"}
                  className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
                />
              </div>
            </div>
          ) : null}
          {tier !== "pro" ? (
            <div className="rounded-xl border border-red-200 bg-red-50/50 p-4">
              <p className="text-sm font-semibold text-zinc-900">Pro</p>
              <p className="text-xs text-zinc-600">$59.99/month, launch price $39.99/month.</p>
              <div className="mt-3">
                <CheckoutButton
                  businessId={businessId}
                  plan="pro"
                  label={selectedPlan === "pro" ? "Continue to Pro checkout" : "Turn on Pro"}
                  className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500"
                />
              </div>
            </div>
          ) : null}
        </div>
        <p className="mt-4 text-xs text-zinc-500">
          Downgrades and cancellations are self-serve in Stripe Billing portal after your first successful subscription.
        </p>
      </section>

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
            <FeatureRow label="Monthly summary email scaffold" on={features.monthlySummaryEmail} />
            <FeatureRow label="Monthly content ideas" on={features.monthlyContentIdeas} />
            <FeatureRow label="Content queue + publishing history" on={features.contentQueue && features.publishingQueue} />
            <FeatureRow label="Citation/listing issue queue" on={features.citationQueue} />
            <FeatureRow label="Review/reputation task queue" on={features.reviewQueue} />
            <FeatureRow label="Multi-location readiness" on={features.multiLocationReady} />
            <FeatureRow label="Owner Google Business Profile API (OAuth)" on={features.gbpSync} />
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
          </div>
          <p className="text-xs text-zinc-400">
            Listing snapshots use public Places data. Owner-authenticated GBP APIs are not connected in this build.
          </p>
        </div>
      </section>

      <AutopilotRoadmap rows={roadmapRows} />

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Content queue</h2>
          <p className="mt-1 text-sm text-zinc-600">Scheduled and queued content assets across local + conversion intent.</p>
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
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-zinc-900">Publishing jobs</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {autopilot.publishingJobs.slice(0, 8).map((job) => (
              <li key={job.id} className="rounded-lg bg-zinc-50 px-3 py-2">
                <p className="font-medium text-zinc-900">{job.id}</p>
                <p className="text-xs uppercase text-zinc-500">{job.status}</p>
              </li>
            ))}
            {!autopilot.publishingJobs.length ? <li className="text-zinc-500">No publishing jobs yet.</li> : null}
          </ul>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-zinc-900">Published artifacts</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {autopilot.publishedContent.slice(0, 8).map((item) => (
              <li key={item.id} className="rounded-lg bg-zinc-50 px-3 py-2">
                <p className="font-medium text-zinc-900">{item.title}</p>
                <p className="text-xs uppercase text-zinc-500">
                  {item.channel} {item.publicUrl ? `· ${item.publicUrl}` : ""}
                </p>
              </li>
            ))}
            {!autopilot.publishedContent.length ? <li className="text-zinc-500">No published artifacts yet.</li> : null}
          </ul>
        </div>
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
          <ul className="mt-3 space-y-2 text-sm">
            {autopilot.backlinkQueue.slice(0, 8).map((item) => (
              <li key={item.id} className="rounded-lg bg-zinc-50 px-3 py-2">
                <p className="font-medium text-zinc-900">{item.sourceName}</p>
                <p className="text-xs uppercase text-zinc-500">
                  {item.status} · quality {item.qualityScore ?? "n/a"}
                </p>
              </li>
            ))}
            {!autopilot.backlinkQueue.length ? <li className="text-zinc-500">No authority opportunities queued.</li> : null}
          </ul>
        </div>
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
