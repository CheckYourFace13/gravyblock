import Link from "next/link";
import { getAutopilotOpsSummary, listBrandsOverview, listLocationsOverview } from "@/lib/autopilot/repository";
import { listBusinessSummaries, listLeads, listReportSummaries } from "@/lib/report/repository";

export const dynamic = "force-dynamic";

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
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Operations overview</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Track scans and inbound interest. Configure Postgres for durable storage — memory mode resets on restart when
          DATABASE_URL is unset.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Businesses" value={String(businesses.length)} />
        <StatCard label="Brands" value={String(brands.length)} />
        <StatCard label="Locations" value={String(locations.length)} />
        <StatCard label="Reports generated" value={String(reports.length)} />
        <StatCard label="Leads captured" value={String(leads.length)} />
        <StatCard label="Queued tasks" value={String(autopilot.queuedTasks)} />
        <StatCard
          label="Avg. latest score"
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
      <p className="text-sm text-zinc-600">
        <Link href="/admin/businesses" className="font-semibold text-red-700 hover:text-red-800">
          Browse businesses →
        </Link>
      </p>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900">Recent reports</h2>
            <Link href="/admin/reports" className="text-sm font-semibold text-red-700 hover:text-red-800">
              View all
            </Link>
          </div>
          <ul className="mt-4 divide-y divide-zinc-100">
            {reports.slice(0, 5).map((r) => (
              <li key={r.publicId} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-medium text-zinc-900">{r.businessName}</p>
                  <p className="text-xs text-zinc-500">{new Date(r.createdAt).toLocaleString()}</p>
                  {r.businessId ? (
                    <Link href={`/workspace/${r.businessId}`} className="text-xs font-semibold text-red-700 hover:underline">
                      Workspace
                    </Link>
                  ) : null}
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
            {leads.slice(0, 5).map((lead) => (
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
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-zinc-900">{value}</p>
    </div>
  );
}
