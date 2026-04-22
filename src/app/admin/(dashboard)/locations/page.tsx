import { listLocationsOverview } from "@/lib/autopilot/repository";

export const dynamic = "force-dynamic";

export default async function AdminLocationsPage() {
  const locations = await listLocationsOverview();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Locations</h1>
        <p className="mt-2 text-sm text-zinc-600">Per-location records for chains, franchises, service areas, and local landing coverage.</p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-zinc-100 text-sm">
          <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {locations.map((location) => (
              <tr key={location.id}>
                <td className="px-4 py-3 font-medium text-zinc-900">{location.name}</td>
                <td className="px-4 py-3 text-zinc-700">{location.locationType}</td>
                <td className="px-4 py-3 text-zinc-500">{new Date(location.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {!locations.length ? (
              <tr>
                <td className="px-4 py-6 text-zinc-500" colSpan={3}>
                  No location records yet. Multi-location onboarding will populate this table.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
