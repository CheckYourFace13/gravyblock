import Link from "next/link";
import { isPlanTier, planFeatures } from "@/lib/plans";
import { listBusinessSummaries } from "@/lib/report/repository";

export const dynamic = "force-dynamic";

export default async function AdminBusinessesPage() {
  const businesses = await listBusinessSummaries();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Businesses</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Persistent business profiles with scan history, recommendations, and pipeline context.
        </p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-zinc-100 text-sm">
          <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Vertical</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Cadence</th>
              <th className="px-4 py-3">Website</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {businesses.map((b) => {
              const tier = isPlanTier(b.planTier) ? b.planTier : "free";
              const features = planFeatures(tier);
              return (
                <tr key={b.id}>
                  <td className="px-4 py-3 font-medium text-zinc-900">{b.name}</td>
                  <td className="px-4 py-3 text-zinc-700">{b.vertical ?? "—"}</td>
                  <td className="px-4 py-3 text-zinc-700">{b.planTier}</td>
                  <td className="px-4 py-3 text-zinc-700">{features.refreshCadenceLabel}</td>
                  <td className="px-4 py-3 text-zinc-700">{b.website ? <span className="truncate">{b.website}</span> : "—"}</td>
                  <td className="px-4 py-3 text-zinc-500">{new Date(b.updatedAt).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-3 text-xs font-semibold">
                      <Link href={`/workspace/${b.id}`} className="text-red-700 hover:text-red-800">
                        Workspace
                      </Link>
                      <Link href={`/admin/businesses/${b.id}`} className="text-zinc-700 hover:text-zinc-900">
                        Ops
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!businesses.length ? (
              <tr>
                <td className="px-4 py-6 text-zinc-500" colSpan={7}>
                  No businesses yet. Complete a scan from the marketing site.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
