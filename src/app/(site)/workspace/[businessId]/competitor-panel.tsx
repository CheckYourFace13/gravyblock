import { desc, eq, lt } from "drizzle-orm";
import { getDb, competitorSnapshots, businesses } from "@/lib/db";

type CompetitorRow = {
  id: string;
  competitorName: string;
  rating: string | null;
  reviewCount: number | null;
  estimatedPosition: number | null;
  query: string;
  createdAt: Date;
};

async function getTopCompetitors(businessId: string): Promise<CompetitorRow[]> {
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: competitorSnapshots.id,
      competitorName: competitorSnapshots.competitorName,
      rating: competitorSnapshots.rating,
      reviewCount: competitorSnapshots.reviewCount,
      estimatedPosition: competitorSnapshots.estimatedPosition,
      query: competitorSnapshots.query,
      createdAt: competitorSnapshots.createdAt,
    })
    .from(competitorSnapshots)
    .where(eq(competitorSnapshots.businessId, businessId))
    .orderBy(desc(competitorSnapshots.createdAt))
    .limit(50);

  // Dedupe by name, keep most recent
  const seen = new Map<string, CompetitorRow>();
  for (const row of rows) {
    if (!seen.has(row.competitorName)) {
      seen.set(row.competitorName, row);
    }
  }

  return [...seen.values()]
    .sort((a, b) => (a.estimatedPosition ?? 99) - (b.estimatedPosition ?? 99))
    .slice(0, 8);
}

async function getPreviousSnapshots(
  businessId: string,
  cutoffDate: Date,
): Promise<Map<string, { reviewCount: number | null; rating: string | null }>> {
  const db = getDb();
  if (!db) return new Map();

  // Get snapshots older than cutoffDate (i.e. from ~30 days ago or more)
  const rows = await db
    .select({
      competitorName: competitorSnapshots.competitorName,
      reviewCount: competitorSnapshots.reviewCount,
      rating: competitorSnapshots.rating,
      createdAt: competitorSnapshots.createdAt,
    })
    .from(competitorSnapshots)
    .where(eq(competitorSnapshots.businessId, businessId))
    .orderBy(desc(competitorSnapshots.createdAt))
    .limit(200);

  // Find the oldest snapshot that is at least 20 days before the newest one
  const newestDate = rows[0]?.createdAt ?? new Date();
  const threshold = new Date(newestDate);
  threshold.setDate(threshold.getDate() - 20);

  const older = rows.filter((r) => r.createdAt <= threshold);

  // Keep earliest per competitor name from the older set
  const map = new Map<string, { reviewCount: number | null; rating: string | null }>();
  for (const row of [...older].reverse()) {
    map.set(row.competitorName, { reviewCount: row.reviewCount, rating: row.rating });
  }
  return map;
}

async function getBusinessMetrics(businessId: string) {
  const db = getDb();
  if (!db) return null;
  const [biz] = await db
    .select({ rating: businesses.rating, reviewCount: businesses.reviewCount, name: businesses.name })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);
  return biz ?? null;
}

function RatingBar({ rating, max = 5 }: { rating: number; max?: number }) {
  const pct = Math.max(0, Math.min(100, (rating / max) * 100));
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-zinc-100">
        <div className="h-1.5 rounded-full bg-yellow-400" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right text-xs font-semibold text-zinc-700">{rating.toFixed(1)}</span>
    </div>
  );
}

function DeltaBadge({ current, previous }: { current: number | null; previous: number | null | undefined }) {
  if (current == null || previous == null || previous === undefined) return null;
  const delta = current - previous;
  if (delta === 0) return null;
  const positive = delta > 0;
  return (
    <span className={`ml-1 text-[10px] font-semibold ${positive ? "text-red-600" : "text-green-600"}`}>
      {positive ? `+${delta}` : `${delta}`}
    </span>
  );
}

export async function CompetitorPanel({ businessId }: { businessId: string }) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 20);

  const [competitors, biz, previousMap] = await Promise.all([
    getTopCompetitors(businessId),
    getBusinessMetrics(businessId),
    getPreviousSnapshots(businessId, cutoff),
  ]);

  if (competitors.length === 0) return null;

  const bizRating = biz?.rating ? parseFloat(biz.rating) : null;
  const hasDeltaData = previousMap.size > 0;

  // Find how stale the data is
  const latestDate = competitors[0]?.createdAt;
  const daysSinceScan = latestDate
    ? Math.floor((Date.now() - latestDate.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Competitor comparison</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Nearby competitors from your scans.
            {hasDeltaData ? " Deltas show change since last scan." : ""}
          </p>
        </div>
        {daysSinceScan !== null ? (
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
            daysSinceScan > 30
              ? "bg-amber-100 text-amber-800"
              : "bg-zinc-100 text-zinc-600"
          }`}>
            {daysSinceScan === 0 ? "Updated today" : `Updated ${daysSinceScan}d ago`}
          </span>
        ) : null}
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <th className="pb-2 pr-4">Business</th>
              <th className="pb-2 pr-4">Rating</th>
              <th className="pb-2 pr-4">Reviews{hasDeltaData ? " (Δ)" : ""}</th>
              <th className="pb-2">Est. position</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {biz ? (
              <tr className="bg-red-50/50">
                <td className="py-2.5 pr-4 font-semibold text-zinc-900">
                  <span className="mr-1.5 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-800 uppercase tracking-wide">You</span>
                  {biz.name}
                </td>
                <td className="py-2.5 pr-4">
                  {bizRating ? <RatingBar rating={bizRating} /> : <span className="text-zinc-400">—</span>}
                </td>
                <td className="py-2.5 pr-4 font-medium text-zinc-900">{biz.reviewCount ?? "—"}</td>
                <td className="py-2.5 text-zinc-500">—</td>
              </tr>
            ) : null}
            {competitors.map((c) => {
              const cRating = c.rating ? parseFloat(c.rating) : null;
              const aheadOfUs = bizRating && cRating && cRating > bizRating;
              const prev = previousMap.get(c.competitorName);

              return (
                <tr key={c.id} className="hover:bg-zinc-50">
                  <td className="py-2.5 pr-4 font-medium text-zinc-800">{c.competitorName}</td>
                  <td className="py-2.5 pr-4">
                    {cRating ? (
                      <div className="flex items-center gap-2">
                        <RatingBar rating={cRating} />
                        {aheadOfUs ? (
                          <span className="text-[10px] font-semibold text-red-600">↑ higher</span>
                        ) : bizRating && cRating && cRating < bizRating ? (
                          <span className="text-[10px] font-semibold text-green-600">↓ lower</span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-4 text-zinc-700">
                    <span>{c.reviewCount ?? "—"}</span>
                    {c.reviewCount != null ? (
                      <DeltaBadge current={c.reviewCount} previous={prev?.reviewCount} />
                    ) : null}
                  </td>
                  <td className="py-2.5 text-zinc-500">
                    {c.estimatedPosition ? `#${c.estimatedPosition}` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {daysSinceScan !== null && daysSinceScan > 30 ? (
        <p className="mt-3 text-xs text-amber-700 font-medium">
          Data is {daysSinceScan} days old. Run a new scan to refresh competitor rankings.
        </p>
      ) : (
        <p className="mt-3 text-xs text-zinc-400">
          Positions estimated from scan data. Run a new scan to refresh.
        </p>
      )}

      {/* Review gap / lead callout */}
      {(() => {
        const maxCompetitorReviews = Math.max(0, ...competitors.map((c) => c.reviewCount ?? 0));
        const ourReviews = biz?.reviewCount ?? 0;
        const leader = competitors.find(
          (c) => (c.reviewCount ?? 0) === maxCompetitorReviews && (c.reviewCount ?? 0) > ourReviews,
        );

        // Delta insight: find fastest-growing competitor
        const fastestGrowing = competitors
          .map((c) => {
            const prev = previousMap.get(c.competitorName);
            if (c.reviewCount == null || prev?.reviewCount == null) return null;
            return { name: c.competitorName, gained: c.reviewCount - prev.reviewCount };
          })
          .filter((x): x is { name: string; gained: number } => x !== null && x.gained > 0)
          .sort((a, b) => b.gained - a.gained)[0];

        return (
          <div className="mt-3 space-y-2">
            {fastestGrowing ? (
              <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">
                <span className="font-semibold">{fastestGrowing.name}</span> picked up{" "}
                <span className="font-semibold">+{fastestGrowing.gained} review{fastestGrowing.gained !== 1 ? "s" : ""}</span>{" "}
                since your last scan. Keep your review request cadence up.
              </div>
            ) : null}
            {leader ? (
              <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <span className="font-semibold">Review gap:</span> {leader.competitorName} has{" "}
                {maxCompetitorReviews.toLocaleString()} reviews vs. your {ourReviews.toLocaleString()}.{" "}
                <span className="font-semibold">
                  {(maxCompetitorReviews - ourReviews).toLocaleString()} more review{maxCompetitorReviews - ourReviews !== 1 ? "s" : ""}
                </span>{" "}
                to take the lead.
              </div>
            ) : ourReviews > 0 ? (
              <div className="rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-800">
                <span className="font-semibold">You lead on reviews</span> among nearby competitors. Keep collecting to stay ahead.
              </div>
            ) : null}
          </div>
        );
      })()}
    </section>
  );
}
