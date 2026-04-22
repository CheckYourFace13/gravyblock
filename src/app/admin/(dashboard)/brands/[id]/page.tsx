import Link from "next/link";
import { notFound } from "next/navigation";
import { getBrandBundle } from "@/lib/autopilot/repository";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function AdminBrandDetailPage({ params }: Props) {
  const { id } = await params;
  const bundle = await getBrandBundle(id);
  if (!bundle) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-700">Brand profile</p>
          <h1 className="text-3xl font-semibold text-zinc-900">{bundle.brand.name}</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Model: <span className="font-semibold text-zinc-900">{bundle.brand.businessModel}</span>
          </p>
        </div>
        <Link href="/admin/brands" className="text-sm font-semibold text-zinc-600 hover:text-zinc-900">
          ← All brands
        </Link>
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Linked locations</h2>
        <p className="mt-1 text-sm text-zinc-600">Locations connected to this shared brand profile.</p>
        <table className="mt-4 min-w-full divide-y divide-zinc-100 text-sm">
          <thead className="text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="py-2">Location</th>
              <th className="py-2">Type</th>
              <th className="py-2">City</th>
              <th className="py-2">Place ID</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {bundle.locations.map((location) => (
              <tr key={location.id}>
                <td className="py-2 font-medium text-zinc-900">{location.name}</td>
                <td className="py-2 text-zinc-700">{location.locationType}</td>
                <td className="py-2 text-zinc-700">{location.city ?? "—"}</td>
                <td className="py-2 text-zinc-500">{location.placeId ?? "—"}</td>
              </tr>
            ))}
            {!bundle.locations.length ? (
              <tr>
                <td className="py-4 text-zinc-500" colSpan={4}>
                  No locations linked yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
