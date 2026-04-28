import Link from "next/link";
import { normalizePlanTierFromDb, planFeatures } from "@/lib/plans";
import { listBusinessSummaries } from "@/lib/report/repository";

export const dynamic = "force-dynamic";

function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status || status === "none") return <span className="text-zinc-400">—</span>;
  const color =
    status === "active" || status === "trialing"
      ? "bg-green-100 text-green-800"
      : status === "past_due"
      ? "bg-yellow-100 text-yellow-800"
      : status === "past_due_downgraded" || status === "canceled"
      ? "bg-red-100 text-red-800"
      : "bg-zinc-100 text-zinc-600";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>
      {status}
    </span>
  );
}

function PlanBadge({ planTier }: { planTier: string | null | undefined }) {
  if (!planTier || planTier === "free") return <span className="text-zinc-400">free</span>;
  const color =
    planTier === "agency" || planTier === "managed"
      ? "bg-zinc-900 text-white"
      : planTier === "pro"
      ? "bg-red-700 text-white"
      : planTier === "growth"
      ? "bg-red-100 text-red-900"
      : "bg-zinc-100 text-zinc-700";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>
      {planTier}
    </span>
  );
}

export default async function AdminBusinessesPage() {
  const businesses = await listBusinessSummaries();
  const paidCount = businesses.filter((b) =>
    b.subscriptionStatus === "active" || b.subscriptionStatus === "trialing"
  ).length;
  const pastDueCount = businesses.filter((b) => b.subscriptionStatus === "past_due").length;
  const freeCount = businesses.filter((b) => !b.subscriptionStatus || b.subscriptionStatus === "none").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Businesses</h1>
        <p className="mt-2 text-sm text-zinc-600">
          All business profiles with billing status, plan, and workspace access.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Total</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">{businesses.length}</p>
        </div>
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-green-700">Active paid</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">{paidCount}</p>
        </div>
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-yellow-700">Past due</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">{pastDueCount}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Free / no billing</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">{freeCount}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-zinc-100 text-sm">
          <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Billing status</th>
              <th className="px-4 py-3">Billing email</th>
              <th className="px-4 py-3">Renews</th>
              <th className="px-4 py-3">Cadence</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {businesses.map((b) => {
              const tier = normalizePlanTierFromDb(b.planTier);
              const features = planFeatures(tier);
              return (
                <tr key={b.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3 font-medium text-zinc-900">
                    {b.name}
                    {b.vertical ? (
                      <span className="ml-2 text-xs text-zinc-400">{b.vertical}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <PlanBadge planTier={b.planTier} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={b.subscriptionStatus} />
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {b.billingEmail ? (
                      <a href={`mailto:${b.billingEmail}`} className="hover:underline">
                        {b.billingEmail}
                      </a>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-500">
                    {b.currentPeriodEnd
                      ? new Date(b.currentPeriodEnd).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-500">{features.refreshCadenceLabel}</td>
                  <td className="px-4 py-3 text-zinc-400 text-xs">
                    {new Date(b.updatedAt).toLocaleDateString()}
                  </td>
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
                <td className="px-4 py-6 text-zinc-500" colSpan={8}>
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
