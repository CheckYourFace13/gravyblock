import { desc, eq } from "drizzle-orm";
import { getDb, competitorSnapshots, businesses } from "@/lib/db";

type CompetitorRow = {
  id: string;
  competitorName: string;
  rating: string | null;
  reviewCount: number | null;
  estimatedPosition: number | null;
  query: string;
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
    })
    .from(competitorSnapshots)
    .where(eq(competitorSnapshots.businessId, businessId))
    .orderBy(desc(competitorSnapshots.createdAt))
    .limit(20);

  // Dedupe by name, keep lowest (best) position seen
  const seen = new Map<string, CompetitorRow>();
  for (const row of rows) {
    const existing = seen.get(row.competitorName);
    if (!existing || (row.estimatedPosition ?? 99) < (existing.estimatedPosition ?? 99)) {
      seen.set(row.competitorName, row);
    }
  }

  return [...seen.values()]
    .sort((a, b) => (a.estimatedPosition ?? 99) - (b.estimatedPosition ?? 99))
    .slice(0, 8);
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

export async function CompetitorPanel({ businessId }: { businessId: string }) {
  const [competitors, biz] = await Promise.all([
    getTopCompetitors(businessId),
    getBusinessMetrics(businessId),
  ]);

  if (competitors.length === 0) return null;

  const bizRating = biz?.rating ? parseFloat(biz.rating) : null;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-900">Competitor comparison</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Nearby competitors from your last scan. Rankings are estimated from public Places data.
      </p>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <th className="pb-2 pr-4">Business</th>
              <th className="pb-2 pr-4">Rating</th>
              <th className="pb-2 pr-4">Reviews</th>
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
                  <td className="py-2.5 pr-4 text-zinc-700">{c.reviewCount ?? "—"}</td>
                  <td className="py-2.5 text-zinc-500">
                    {c.estimatedPosition ? `#${c.estimatedPosition}` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-zinc-400">
        Positions and ratings are estimated from the most recent scan. Run a new scan to refresh.
      </p>

      {/* Review gap callout */}
      {(() => {
        const maxCompetitorReviews = Math.max(0, ...competitors.map((c) => c.reviewCount ?? 0));
        const ourReviews = biz?.reviewCount ?? 0;
        const leader = competitors.find(
          (c) => (c.reviewCount ?? 0) === maxCompetitorReviews && (c.reviewCount ?? 0) > ourReviews
        );
        if (!leader) {
          return ourReviews > 0 ? (
            <div className="mt-3 rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-800">
              <span className="font-semibold">You lead on reviews</span> among nearby competitors. Keep collecting to stay ahead.
            </div>
          ) : null;
        }
        const gap = maxCompetitorReviews - ourReviews;
        return (
          <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <span className="font-semibold">Review gap:</span> {leader.competitorName} has {maxCompetitorReviews.toLocaleString()} reviews vs. your {ourReviews.toLocaleString()}.{" "}
            <span className="font-semibold">Get {gap.toLocaleString()} more review{gap !== 1 ? "s" : ""}</span> to take the lead. Share your review gating link after each visit.
          </div>
        );
      })()}
    </section>
  );
}
