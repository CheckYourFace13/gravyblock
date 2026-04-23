import { getAutopilotOpsSummary } from "@/lib/autopilot/repository";

export const dynamic = "force-dynamic";

export default async function AdminAutopilotPage() {
  const summary = await getAutopilotOpsSummary();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Autopilot operations</h1>
        <p className="mt-2 text-sm text-zinc-600">Execution queues for content, publishing, authority, and recurring automation work.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Businesses tracked" value={String(summary.businessesTracked)} />
        <Stat label="Queued tasks" value={String(summary.queuedTasks)} />
        <Stat label="Queued jobs" value={String(summary.queuedJobs)} />
        <Stat label="Queued publishing" value={String(summary.queuedPublishing)} />
        <Stat label="Entry monthly jobs pending" value={String(summary.entryRecurringPending)} />
        <Stat label="Pro recurring jobs pending" value={String(summary.proRecurringPending)} />
        <Stat label="Citation ops queued" value={String(summary.queuedCitationOps)} />
        <Stat label="Review/local trust queued" value={String(summary.queuedReviewOps)} />
        <Stat label="Local page queue items" value={String(summary.queuedLocalPageContent)} />
      </div>
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Execution model</h2>
        <ul className="mt-3 space-y-2 text-sm text-zinc-700">
          <li>Entry runs monthly recurring refresh jobs; Pro runs a tighter recurring cadence.</li>
          <li>Every recurring cycle can add AI visibility summary checks and queue new tasks.</li>
          <li>Content queue and local-page queue are persisted; publishing jobs track execution state.</li>
          <li>Citation, review, and trust tasks are surfaced from operator task queues.</li>
        </ul>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-zinc-900">{value}</p>
    </div>
  );
}
