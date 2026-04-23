import Link from "next/link";
import { listLeads } from "@/lib/report/repository";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ source?: string; pipeline?: string; linked?: string }>;
};

export default async function AdminLeadsPage({ searchParams }: Props) {
  const filters = await searchParams;
  const source = filters.source ?? "all";
  const pipeline = filters.pipeline ?? "all";
  const linked = filters.linked ?? "all";
  const leads = await listLeads({
    source,
    pipelineStatus: pipeline,
    linked: linked as "all" | "linked" | "unlinked",
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Leads</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Inbound messages from scan, report, contact, support, and legacy upgrade/demo sources.
        </p>
      </div>
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <FilterChip href="/admin/leads" active={source === "all" && pipeline === "all" && linked === "all"}>
            All
          </FilterChip>
          <FilterChip href="/admin/leads?source=scan_form" active={source === "scan_form"}>
            Scan
          </FilterChip>
          <FilterChip href="/admin/leads?source=report_form" active={source === "report_form"}>
            Report
          </FilterChip>
          <FilterChip href="/admin/leads?source=contact_form" active={source === "contact_form"}>
            Contact
          </FilterChip>
          <FilterChip href="/admin/leads?source=support_inquiry" active={source === "support_inquiry"}>
            Support
          </FilterChip>
          <FilterChip href="/admin/leads?source=upgrade_request" active={source === "upgrade_request"}>
            Upgrade (legacy)
          </FilterChip>
          <FilterChip href="/admin/leads?source=demo_request" active={source === "demo_request"}>
            Demo (legacy)
          </FilterChip>
          <FilterChip href="/admin/leads?linked=linked" active={linked === "linked"}>
            Linked business
          </FilterChip>
          <FilterChip href="/admin/leads?linked=unlinked" active={linked === "unlinked"}>
            Unlinked
          </FilterChip>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-zinc-100 text-sm">
          <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Business</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Pipeline</th>
              <th className="px-4 py-3">Report</th>
              <th className="px-4 py-3">First seen</th>
              <th className="px-4 py-3">Last seen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {leads.map((lead) => (
              <tr key={lead.id}>
                <td className="px-4 py-3 font-medium text-zinc-900">{lead.name}</td>
                <td className="px-4 py-3 text-zinc-700">{lead.email}</td>
                <td className="px-4 py-3 text-zinc-700">{lead.phone ?? "—"}</td>
                <td className="px-4 py-3 text-zinc-700">
                  {lead.businessId ? (
                    <Link href={`/admin/businesses/${lead.businessId}`} className="font-semibold text-red-700 hover:underline">
                      View
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3 text-zinc-700">{lead.source}</td>
                <td className="px-4 py-3 text-zinc-700">{lead.pipelineStatus ?? "—"}</td>
                <td className="px-4 py-3 text-zinc-700">{lead.reportPublicId ?? "—"}</td>
                <td className="px-4 py-3 text-zinc-500">{new Date(lead.firstSeenAt ?? lead.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3 text-zinc-500">{new Date(lead.lastSeenAt ?? lead.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {!leads.length ? (
              <tr>
                <td className="px-4 py-6 text-zinc-500" colSpan={9}>
                  No leads for this filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilterChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 ${active ? "border-red-200 bg-red-50 text-red-800" : "border-zinc-200 text-zinc-700"}`}
    >
      {children}
    </Link>
  );
}
