import Link from "next/link";
import { listReportSummaries } from "@/lib/report/repository";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  const reports = await listReportSummaries();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Reports</h1>
        <p className="mt-2 text-sm text-zinc-600">Latest readiness scans with quick score context.</p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-zinc-100 text-sm">
          <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3">Business</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Opportunity</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {reports.map((r) => (
              <tr key={r.publicId}>
                <td className="px-4 py-3 font-medium text-zinc-900">{r.businessName}</td>
                <td className="px-4 py-3 text-zinc-700">{r.score}</td>
                <td className="px-4 py-3 text-zinc-700">{r.opportunityLevel}</td>
                <td className="px-4 py-3 text-zinc-500">{new Date(r.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/admin/reports/${r.publicId}`} className="font-semibold text-red-700 hover:text-red-800">
                    Open
                  </Link>
                </td>
              </tr>
            ))}
            {!reports.length ? (
              <tr>
                <td className="px-4 py-6 text-zinc-500" colSpan={5}>
                  No reports yet. Run a scan from the marketing site.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
