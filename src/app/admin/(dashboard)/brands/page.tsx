import Link from "next/link";
import { listBrandsOverview } from "@/lib/autopilot/repository";

export const dynamic = "force-dynamic";

export default async function AdminBrandsPage() {
  const brands = await listBrandsOverview();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Brands</h1>
        <p className="mt-2 text-sm text-zinc-600">Multi-location and portfolio brand records for autopilot orchestration.</p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-zinc-100 text-sm">
          <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3">Brand</th>
              <th className="px-4 py-3">Business model</th>
              <th className="px-4 py-3">Locations</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {brands.map((brand) => (
              <tr key={brand.id}>
                <td className="px-4 py-3 font-medium text-zinc-900">{brand.name}</td>
                <td className="px-4 py-3 text-zinc-700">{brand.businessModel}</td>
                <td className="px-4 py-3 text-zinc-700">{brand.locationCount}</td>
                <td className="px-4 py-3 text-zinc-500">{new Date(brand.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/admin/brands/${brand.id}`} className="font-semibold text-red-700 hover:text-red-800">
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {!brands.length ? (
              <tr>
                <td className="px-4 py-6 text-zinc-500" colSpan={5}>
                  No brand records yet. They populate as organization/portfolio onboarding is added.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
