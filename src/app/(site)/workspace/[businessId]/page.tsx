import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutopilotRoadmap } from "@/components/autopilot-roadmap";
import { CtaLeadForm } from "@/components/cta-lead-form";
import { getAutopilotWorkspace } from "@/lib/autopilot/repository";
import type { RoadmapLane } from "@/lib/growth/roadmap";
import { getWorkspaceBundle } from "@/lib/report/repository";
import { isPlanTier, planFeatures, type PlanTier } from "@/lib/plans";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ businessId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { businessId } = await params;
  const bundle = await getWorkspaceBundle(businessId);
  if (!bundle) return { title: "Workspace — GravyBlock" };
  return {
    title: `${bundle.business.name} — growth workspace`,
    description: "Track visibility, recommendations, content execution, authority growth, and automation queues for this business.",
  };
}

export default async function WorkspacePage({ params }: Props) {
  const { businessId } = await params;
  const bundle = await getWorkspaceBundle(businessId);
  if (!bundle) notFound();
  const autopilot = await getAutopilotWorkspace(businessId);

  const tier: PlanTier = isPlanTier(bundle.business.planTier) ? bundle.business.planTier : "free";
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

  return (
    <div className="mx-auto max-w-6xl space-y-12 px-4 py-14 sm:px-6">
      <header className="flex flex-col gap-6 border-b border-zinc-200 pb-10 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-800">Growth workspace</p>
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-900">{bundle.business.name}</h1>
          <p className="max-w-2xl text-sm text-zinc-600">
            This is your always-on command center: scan history, visibility snapshots, prioritized work, and the
            content angles GravyBlock will keep feeding as we wire up integrations.
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
            <span className="rounded-full bg-red-100 px-3 py-1 text-red-950">Plan: {tier}</span>
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

      {!features.contentIdeasQueue ? (
        <div className="grid gap-4 rounded-2xl border border-red-200 bg-red-50/60 px-5 py-5 text-sm text-zinc-900 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <span className="font-semibold">Pro unlocks content autopilot.</span> You already have the roadmap and scan
            history. Upgrade to generate rotating local posts, event pushes, and GBP-ready copy on a schedule - see{" "}
            <Link href="/#plans" className="font-semibold underline">
              plans
            </Link>
            .
          </div>
          <CtaLeadForm
            source="upgrade_request"
            title="Request upgrade"
            subtitle="Tell us where you need managed help first."
            buttonLabel="Send upgrade request"
            className="rounded-xl border border-red-200 bg-white p-4"
          />
        </div>
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
          <h2 className="text-lg font-semibold">Integration readiness</h2>
          <ul className="space-y-3 text-sm text-zinc-200">
            <FeatureRow label="Google Business Profile sync" on={features.gbpSync} />
            <FeatureRow label="Technical crawl monitoring" on={features.automatedMonitoring} />
            <FeatureRow label="AI visibility probes" on={features.automatedMonitoring} />
            <FeatureRow label="Search Console pull" on={features.automatedMonitoring} />
            <FeatureRow label="Managed playbooks" on={features.managedPlaybooks} />
          </ul>
          <p className="text-xs text-zinc-400">
            Interfaces are stubbed in code (`src/lib/integrations/contracts.ts`) — flip on when API keys and workers
            land.
          </p>
        </div>
      </section>

      <AutopilotRoadmap rows={roadmapRows} />

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Autopilot content queue</h2>
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
          <h2 className="text-lg font-semibold text-zinc-900">Backlink + authority queue</h2>
          <p className="mt-1 text-sm text-zinc-600">Contextual authority opportunities tracked for sustainable growth.</p>
          <ul className="mt-4 space-y-2 text-sm">
            {autopilot.backlinkQueue.slice(0, 8).map((item) => (
              <li key={item.id} className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
                <p className="font-semibold text-zinc-900">{item.sourceName}</p>
                <p className="text-xs uppercase tracking-wide text-zinc-500">
                  {item.status} · quality {item.qualityScore ?? "n/a"}
                </p>
              </li>
            ))}
            {!autopilot.backlinkQueue.length ? <li className="text-zinc-500">No authority opportunities queued.</li> : null}
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
          <h3 className="text-base font-semibold text-zinc-900">Operator tasks</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {autopilot.operatorTasks.slice(0, 6).map((task) => (
              <li key={task.id} className="rounded-lg bg-zinc-50 px-3 py-2">
                <p className="font-medium text-zinc-900">{task.title}</p>
                <p className="text-xs uppercase text-zinc-500">
                  {task.queue} · {task.status}
                </p>
              </li>
            ))}
            {!autopilot.operatorTasks.length ? <li className="text-zinc-500">No queued tasks.</li> : null}
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
