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
      </div>
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Execution model</h2>
        <ul className="mt-3 space-y-2 text-sm text-zinc-700">
          <li>Content queue supports AI-generated articles, location pages, and local-intent variants.</li>
          <li>Publishing jobs support manual approval mode now, with adapter hooks for CMS integrations.</li>
          <li>Authority queue tracks contextual backlink workflows with quality-first status states.</li>
          <li>AI visibility checks and operator tasks provide recurring autopilot monitoring surfaces.</li>
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
