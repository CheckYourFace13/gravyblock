import Link from "next/link";
import { getAutopilotOpsSummary, listBrandsOverview, listLocationsOverview } from "@/lib/autopilot/repository";
import { listBusinessSummaries, listLeads, listReportSummaries } from "@/lib/report/repository";

export const dynamic = "force-dynamic";

const panels: { href: string; title: string; description: string }[] = [
  { href: "/admin/leads", title: "Leads", description: "Inbound contacts, pipeline, and sources." },
  { href: "/admin/businesses", title: "Businesses", description: "Scanned entities — open a row for social signals, rankings, and workspace." },
  { href: "/admin/brands", title: "Brands", description: "Brand rollups for multi-location accounts." },
  { href: "/admin/locations", title: "Locations", description: "Physical and service-area locations tied to brands." },
  { href: "/admin/reports", title: "Reports", description: "Public report links and scores across scans." },
  { href: "/admin/autopilot", title: "Autopilot", description: "Queues, jobs, and operator-facing automation status." },
];

export default async function AdminHomePage() {
  const [reports, leads, businesses, brands, locations, autopilot] = await Promise.all([
    listReportSummaries(),
    listLeads(),
    listBusinessSummaries(),
    listBrandsOverview(),
    listLocationsOverview(),
    getAutopilotOpsSummary(),
  ]);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Dashboard</h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600">
          Live snapshot of what GravyBlock has stored. Use the sidebar (or menu on small screens) to jump anywhere.
          Social discovery and per-scan detail live under each business.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {panels.map((p) => (
          <Link
            key={p.href}
            href={p.href}
            className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-red-200 hover:shadow-md"
          >
            <p className="text-sm font-semibold text-red-800">{p.title}</p>
            <p className="mt-2 text-sm text-zinc-600">{p.description}</p>
            <p className="mt-3 text-xs font-semibold text-zinc-900">Open →</p>
          </Link>
        ))}
      </div>

      <div>
        <h2 className="text-lg font-semibold text-zinc-900">At a glance</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Businesses" value={String(businesses.length)} />
          <StatCard label="Brands" value={String(brands.length)} />
          <StatCard label="Locations" value={String(locations.length)} />
          <StatCard label="Reports" value={String(reports.length)} />
          <StatCard label="Leads" value={String(leads.length)} />
          <StatCard label="Autopilot · queued tasks" value={String(autopilot.queuedTasks)} />
          <StatCard label="Autopilot · pending jobs" value={String(autopilot.queuedJobs)} />
          <StatCard label="Autopilot · publishing queue" value={String(autopilot.queuedPublishing)} />
          <StatCard label="Autopilot · entry monthly jobs" value={String(autopilot.entryRecurringPending)} />
          <StatCard label="Autopilot · pro recurring jobs" value={String(autopilot.proRecurringPending)} />
          <StatCard label="Autopilot · citation ops" value={String(autopilot.queuedCitationOps)} />
          <StatCard
            label="Avg. score (latest 10 reports)"
            value={
              reports.length
                ? String(
                    Math.round(
                      reports.slice(0, 10).reduce((sum, r) => sum + r.score, 0) / Math.min(reports.length, 10),
                    ),
                  )
                : "—"
            }
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900">Recent reports</h2>
            <Link href="/admin/reports" className="text-sm font-semibold text-red-700 hover:text-red-800">
              View all
            </Link>
          </div>
          <ul className="mt-4 divide-y divide-zinc-100">
            {reports.slice(0, 6).map((r) => (
              <li key={r.publicId} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-medium text-zinc-900">{r.businessName}</p>
                  <p className="text-xs text-zinc-500">{new Date(r.createdAt).toLocaleString()}</p>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs">
                    <Link href={`/report/${r.publicId}`} className="font-semibold text-red-700 hover:underline">
                      Public report
                    </Link>
                    {r.businessId ? (
                      <Link href={`/workspace/${r.businessId}`} className="font-semibold text-zinc-600 hover:underline">
                        Workspace
                      </Link>
                    ) : null}
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-zinc-900">{r.score}</p>
                  <p className="text-xs uppercase text-zinc-500">{r.opportunityLevel}</p>
                </div>
              </li>
            ))}
            {!reports.length ? <li className="py-6 text-sm text-zinc-500">No reports yet.</li> : null}
          </ul>
        </section>
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900">Recent leads</h2>
            <Link href="/admin/leads" className="text-sm font-semibold text-red-700 hover:text-red-800">
              View all
            </Link>
          </div>
          <ul className="mt-4 divide-y divide-zinc-100">
            {leads.slice(0, 6).map((lead) => (
              <li key={lead.id} className="py-3 text-sm">
                <p className="font-medium text-zinc-900">{lead.name}</p>
                <p className="text-xs text-zinc-500">{lead.email}</p>
              </li>
            ))}
            {!leads.length ? <li className="py-6 text-sm text-zinc-500">No leads yet.</li> : null}
          </ul>
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-900">{value}</p>
    </div>
  );
}
